import express from 'express';
import { getDb, isDbReady, getCachedXmrRate, getLastUpdated } from '../state.js';
import { getStartTimestampForPeriod, getHashrateBucketSizeMs } from '../db/metrics.js';
import { getMinerStats, attachWorkerStatus } from '../minerStats.js';

const router = express.Router();

// Endpoint to fetch the cached XMR/USD rate
router.get('/api/xmr-usd-rate', (req, res) => {
  const cachedXmrRate = getCachedXmrRate();
  if (cachedXmrRate !== null) {
    res.json({ rate: cachedXmrRate, lastUpdated: getLastUpdated() });
  } else {
    res.status(503).json({ error: 'XMR/USD rate is not available. Please try again later.' });
  }
});

// Endpoint to fetch historical XMR/USD rates
router.get('/api/xmr-usd-history', async (req, res) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: 'Database is not ready yet.' });
  }

  const period = req.query.period || '24h';
  const startTimestamp = getStartTimestampForPeriod(period);

  if (startTimestamp === null) {
    return res.status(400).json({ error: 'Invalid period parameter. Use "24h", "7d", "30d", "90d", or "1y".' });
  }

  try {
    const result = await getDb().query(
      'SELECT timestamp_ms, rate FROM xmr_rate_history WHERE timestamp_ms >= $1 ORDER BY timestamp_ms ASC',
      [startTimestamp]
    );
    const history = result.rows.map((row) => ({
      timestamp: Number(row.timestamp_ms),
      rate: Number(row.rate)
    }));
    res.json({ history });
  } catch (error) {
    console.error('Error fetching XMR history from database:', error.message);
    res.status(500).json({ error: 'Failed to fetch XMR history' });
  }
});

// Endpoint to fetch miner stats
router.get('/api/miner-stats', async (req, res) => {
  try {
    const data = await getMinerStats();
    res.json(attachWorkerStatus(data));
  } catch (error) {
    console.error('Error fetching miner stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch miner stats' });
  }
});

// Endpoint to fetch historical hashrate
router.get('/api/hashrate-history', async (req, res) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: 'Database is not ready yet.' });
  }

  const period = req.query.period || '24h';
  const startTimestamp = getStartTimestampForPeriod(period);

  if (startTimestamp === null) {
    return res.status(400).json({ error: 'Invalid period parameter. Use "24h", "7d", "30d", "90d", or "1y".' });
  }

  try {
    const bucketSizeMs = getHashrateBucketSizeMs(period);
    const db = getDb();
    let result;

    if (bucketSizeMs) {
      result = await db.query(
        `
        SELECT
          ((timestamp_ms / $2)::BIGINT * $2) AS bucket_ms,
          AVG(hashrate) AS hashrate
        FROM hashrate_history
        WHERE timestamp_ms >= $1
        GROUP BY bucket_ms
        ORDER BY bucket_ms ASC
        `,
        [startTimestamp, bucketSizeMs]
      );
    } else {
      result = await db.query(
        'SELECT timestamp_ms, hashrate FROM hashrate_history WHERE timestamp_ms >= $1 ORDER BY timestamp_ms ASC',
        [startTimestamp]
      );
    }

    const history = result.rows.map((row) => ({
      timestamp: Number(row.bucket_ms ?? row.timestamp_ms),
      hashrate: Number(row.hashrate)
    }));
    res.json({ history });
  } catch (error) {
    console.error('Error fetching hashrate history from database:', error.message);
    res.status(500).json({ error: 'Failed to fetch hashrate history' });
  }
});

export default router;
