import * as config from '../config.js';
import {
  getDb,
  isDbReady,
  setCachedXmrRate,
  setLastUpdated,
  setCachedMinerStats,
  setLastHashrateSampleAt,
  getLastHashrateSampleAt
} from '../state.js';

export async function pruneHistoricalData(nowMs) {
  if (!isDbReady()) {
    return;
  }

  const db = getDb();
  const cutoff = nowMs - config.DATA_RETENTION_MS;

  try {
    await Promise.all([
      db.query('DELETE FROM xmr_rate_history WHERE timestamp_ms < $1', [cutoff]),
      db.query('DELETE FROM hashrate_history WHERE timestamp_ms < $1', [cutoff]),
      db.query('DELETE FROM miner_stats_snapshots WHERE timestamp_ms < $1', [cutoff])
    ]);
  } catch (error) {
    console.error('Error pruning historical data:', error.message);
  }
}

export async function setAppState(key, value) {
  if (!isDbReady()) {
    return;
  }

  try {
    await getDb().query(
      `
      INSERT INTO app_state (key, value)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `,
      [key, JSON.stringify(value)]
    );
  } catch (error) {
    console.error(`Error storing app state for key "${key}":`, error.message);
  }
}

export async function getAppState(key) {
  if (!isDbReady()) {
    return null;
  }

  try {
    const result = await getDb().query('SELECT value FROM app_state WHERE key = $1', [key]);
    if (result.rows.length === 0) {
      return null;
    }

    const value = result.rows[0].value;
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value;
  } catch (error) {
    console.error(`Error reading app state for key "${key}":`, error.message);
    return null;
  }
}

export function getStartTimestampForPeriod(period) {
  const now = Date.now();
  if (period === '24h') {
    return now - (24 * 60 * 60 * 1000);
  }
  if (period === '7d') {
    return now - (7 * 24 * 60 * 60 * 1000);
  }
  if (period === '30d') {
    return now - (30 * 24 * 60 * 60 * 1000);
  }
  if (period === '90d') {
    return now - (90 * 24 * 60 * 60 * 1000);
  }
  if (period === '1y') {
    return now - (365 * 24 * 60 * 60 * 1000);
  }
  return null;
}

export function getHashrateBucketSizeMs(period) {
  if (period === '24h') {
    return null;
  }
  if (period === '7d') {
    return 5 * 60 * 1000;
  }
  if (period === '30d') {
    return 30 * 60 * 1000;
  }
  if (period === '90d') {
    return 2 * 60 * 60 * 1000;
  }
  if (period === '1y') {
    return 24 * 60 * 60 * 1000;
  }
  return null;
}

export async function saveXmrRateSample(rate, timestamp = Date.now()) {
  if (!isDbReady()) {
    return;
  }

  const db = getDb();
  await db.query(
    'INSERT INTO xmr_rate_history (timestamp_ms, rate) VALUES ($1, $2) ON CONFLICT (timestamp_ms) DO NOTHING',
    [timestamp, rate]
  );
  await db.query('DELETE FROM xmr_rate_history WHERE timestamp_ms < $1', [timestamp - config.DATA_RETENTION_MS]);
}

export async function saveHashrateSample(hashrate, timestamp = Date.now()) {
  if (!isDbReady()) {
    return;
  }

  const db = getDb();
  await db.query(
    'INSERT INTO hashrate_history (timestamp_ms, hashrate) VALUES ($1, $2) ON CONFLICT (timestamp_ms) DO NOTHING',
    [timestamp, hashrate]
  );
  await db.query('DELETE FROM hashrate_history WHERE timestamp_ms < $1', [timestamp - config.DATA_RETENTION_MS]);
}

export async function saveMinerStatsSnapshot(snapshot, timestamp = Date.now()) {
  if (!isDbReady()) {
    return;
  }

  const db = getDb();
  await db.query(
    'INSERT INTO miner_stats_snapshots (timestamp_ms, payload) VALUES ($1, $2::jsonb)',
    [timestamp, JSON.stringify(snapshot)]
  );
  await db.query('DELETE FROM miner_stats_snapshots WHERE timestamp_ms < $1', [timestamp - config.DATA_RETENTION_MS]);
}

export async function persistHashrateSampleFromStats(minerData, timestamp = Date.now(), options = {}) {
  const { force = false } = options;

  if (!minerData?.stats?.hashrate) {
    return false;
  }

  const hashrate = parseFloat(minerData.stats.hashrate);
  if (!Number.isFinite(hashrate) || hashrate <= 0) {
    return false;
  }

  const lastHashrateSampleAt = getLastHashrateSampleAt();
  if (!force && lastHashrateSampleAt && (timestamp - lastHashrateSampleAt) < config.HASHRATE_SAMPLE_MIN_INTERVAL_MS) {
    return false;
  }

  setLastHashrateSampleAt(timestamp);
  try {
    await saveHashrateSample(hashrate, timestamp);
    return true;
  } catch (error) {
    console.error('Failed to persist hashrate sample:', error.message);
    return false;
  }
}

export async function loadLatestMinerStatsSnapshot() {
  if (!isDbReady()) {
    return null;
  }

  const result = await getDb().query(
    'SELECT timestamp_ms, payload FROM miner_stats_snapshots ORDER BY timestamp_ms DESC LIMIT 1'
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    timestamp: Number(result.rows[0].timestamp_ms),
    data: result.rows[0].payload
  };
}

export async function hydrateCachesFromDb() {
  const db = getDb();
  const storedRate = await getAppState('cached_xmr_rate');
  if (storedRate && typeof storedRate.rate === 'number') {
    setCachedXmrRate(storedRate.rate);
    if (storedRate.lastUpdated) {
      setLastUpdated(new Date(storedRate.lastUpdated));
    }
  } else {
    const latestRateResult = await db.query(
      'SELECT timestamp_ms, rate FROM xmr_rate_history ORDER BY timestamp_ms DESC LIMIT 1'
    );
    if (latestRateResult.rows.length > 0) {
      setCachedXmrRate(latestRateResult.rows[0].rate);
      setLastUpdated(new Date(Number(latestRateResult.rows[0].timestamp_ms)));
    }
  }

  const latestMinerSnapshot = await loadLatestMinerStatsSnapshot();
  if (latestMinerSnapshot) {
    setCachedMinerStats(latestMinerSnapshot.data, latestMinerSnapshot.timestamp);
  }

  const latestHashrateResult = await db.query(
    'SELECT timestamp_ms FROM hashrate_history ORDER BY timestamp_ms DESC LIMIT 1'
  );
  if (latestHashrateResult.rows.length > 0) {
    setLastHashrateSampleAt(Number(latestHashrateResult.rows[0].timestamp_ms));
  }
}

export async function getMetricCounts() {
  const db = getDb();
  const [xmrCountResult, hashrateCountResult, snapshotCountResult] = await Promise.all([
    db.query('SELECT COUNT(*)::BIGINT AS count FROM xmr_rate_history'),
    db.query('SELECT COUNT(*)::BIGINT AS count FROM hashrate_history'),
    db.query('SELECT COUNT(*)::BIGINT AS count FROM miner_stats_snapshots')
  ]);

  return {
    xmrCount: Number(xmrCountResult.rows[0].count),
    hashrateCount: Number(hashrateCountResult.rows[0].count),
    snapshotCount: Number(snapshotCountResult.rows[0].count)
  };
}
