import express from 'express';
import * as config from '../config.js';
import { isDbReady, getCachedXmrRate, getLastUpdated } from '../state.js';
import { isEmailConfigured } from '../email/graphClient.js';
import { getNotificationSettings } from '../notify/settings.js';

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  const lastUpdated = getLastUpdated();

  // Effective alert channels come from the saved settings (DB); fall back quietly if the DB
  // isn't ready so the health endpoint never fails on it.
  let minerAlertChannels = [];
  let discordConfigStatus = 'missing';
  try {
    const s = await getNotificationSettings();
    discordConfigStatus = s.discordConfigured ? 'configured' : 'missing';
    if (s.discordConfigured) minerAlertChannels.push('discord');
    if (s.emailEnabled && s.emailConfigured) minerAlertChannels.push('email');
  } catch {
    // leave defaults
  }

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
    discordConfigStatus,
    minerAlertChannels,
    xmrRateStatus: getCachedXmrRate() !== null ? 'available' : 'unavailable',
    lastRateUpdate: lastUpdated ? lastUpdated.toISOString() : null,
    version: '1.2.1'
  };

  res.status(200).json(healthStatus);
});

// Simple plain text health check endpoint (for basic monitoring)
router.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

export default router;
