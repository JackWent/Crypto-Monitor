import fetch from 'node-fetch';
import * as config from './config.js';
import { getCachedMinerStats, getCachedMinerStatsAt, setCachedMinerStats } from './state.js';
import {
  persistHashrateSampleFromStats,
  saveMinerStatsSnapshot,
  loadLatestMinerStatsSnapshot
} from './db/metrics.js';

function cacheMinerStats(snapshot, timestamp = Date.now()) {
  setCachedMinerStats(snapshot, timestamp);
}

export async function getMinerStats(options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();

  if (!config.XMR_WALLET_ADDRESS) {
    throw new Error('XMR_WALLET_ADDRESS is not configured.');
  }

  const cachedMinerStats = getCachedMinerStats();
  const cachedMinerStatsAt = getCachedMinerStatsAt();

  if (!forceRefresh && cachedMinerStats && (now - cachedMinerStatsAt) < config.MINER_STATS_CACHE_TTL_MS) {
    await persistHashrateSampleFromStats(cachedMinerStats, now);
    return cachedMinerStats;
  }

  try {
    const statsUrl = `https://web.xmrpool.eu:8119/stats_address?address=${encodeURIComponent(config.XMR_WALLET_ADDRESS)}&longpoll=false`;
    const response = await fetch(statsUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch miner stats: ${response.statusText}`);
    }
    const data = await response.json();
    cacheMinerStats(data, now);
    await saveMinerStatsSnapshot(data, now);
    await persistHashrateSampleFromStats(data, now);
    return data;
  } catch (error) {
    console.error('Error fetching miner stats:', error.message);

    const latestCached = getCachedMinerStats();
    if (latestCached) {
      await persistHashrateSampleFromStats(latestCached, now);
      console.warn('Serving in-memory cached miner stats as fallback.');
      return latestCached;
    }

    const latestSnapshot = await loadLatestMinerStatsSnapshot();
    if (latestSnapshot) {
      cacheMinerStats(latestSnapshot.data, latestSnapshot.timestamp);
      await persistHashrateSampleFromStats(latestSnapshot.data, now);
      console.warn('Serving database-backed miner stats snapshot as fallback.');
      return latestSnapshot.data;
    }

    throw error;
  }
}

export async function updateMinerStats() {
  try {
    console.log('Updating miner stats...');
    const minerData = await getMinerStats({ forceRefresh: true });
    const persisted = await persistHashrateSampleFromStats(minerData, Date.now(), { force: true });

    if (persisted) {
      console.log(`Miner hashrate sample saved at ${new Date().toISOString()}`);
    } else {
      console.warn('No valid hashrate found in miner stats');
    }
  } catch (error) {
    console.error('Error updating miner stats:', error.message);
  }
}

// Classifies a worker's liveness from its last-share timestamp (pool API
// returns unix seconds). Purely additive/derived — does not change any
// existing field, only used to render status pills in the dashboard UI.
export function classifyWorkerStatus(lastShareUnixSeconds) {
  const lastShare = Number(lastShareUnixSeconds);
  if (!Number.isFinite(lastShare) || lastShare <= 0) {
    return 'offline';
  }

  const ageMs = Date.now() - (lastShare * 1000);
  if (ageMs < 5 * 60 * 1000) {
    return 'online';
  }
  if (ageMs < 30 * 60 * 1000) {
    return 'idle';
  }
  return 'offline';
}

export function attachWorkerStatus(minerData) {
  if (!minerData || !Array.isArray(minerData.perWorkerStats)) {
    return minerData;
  }

  return {
    ...minerData,
    perWorkerStats: minerData.perWorkerStats.map((worker) => ({
      ...worker,
      status: classifyWorkerStatus(worker.lastShare)
    }))
  };
}
