import express from 'express';
import * as config from '../config.js';
import { isDbReady, getCachedXmrRate, getLastUpdated } from '../state.js';
import { isEmailConfigured } from '../email/graphClient.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  const lastUpdated = getLastUpdated();
  const healthStatus = {
    status: 'OK',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    databaseStatus: isDbReady() ? 'connected' : 'uninitialized',
    databaseEngine: 'postgresql',
    dataRetentionDays: config.DATA_RETENTION_DAYS,
    hashrateSampleIntervalMs: config.HASHRATE_SAMPLE_MIN_INTERVAL_MS,
    walletConfigStatus: config.XMR_WALLET_ADDRESS ? 'configured' : 'missing',
    emailConfigStatus: isEmailConfigured() ? 'configured' : 'missing',
    xmrRateStatus: getCachedXmrRate() !== null ? 'available' : 'unavailable',
    lastRateUpdate: lastUpdated ? lastUpdated.toISOString() : null,
    version: '1.0.0'  // You can update this with your actual version
  };

  res.status(200).json(healthStatus);
});

// Simple plain text health check endpoint (for basic monitoring)
router.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

export default router;
