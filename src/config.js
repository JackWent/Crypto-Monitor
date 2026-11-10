import path from 'path';

export const PORT = process.env.PORT || 7050;
export const DATA_DIR = process.env.DATA_DIR || '/data';
export const LEGACY_SQLITE_FILE = path.join(DATA_DIR, 'dashboard.db');
export const XMR_HISTORY_FILE = path.join(DATA_DIR, 'xmr_history.json');
export const HASHRATE_HISTORY_FILE = path.join(DATA_DIR, 'hashrate_history.json');

const configuredRetentionDays = Number(process.env.DATA_RETENTION_DAYS || 365);
export const DATA_RETENTION_DAYS = Number.isFinite(configuredRetentionDays)
  ? Math.max(365, Math.floor(configuredRetentionDays))
  : 365;
export const DATA_RETENTION_MS = DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const MINER_STATS_CACHE_TTL_MS = Number(process.env.MINER_STATS_CACHE_TTL_MS || 10000);
export const HASHRATE_SAMPLE_MIN_INTERVAL_MS = Number(process.env.HASHRATE_SAMPLE_MIN_INTERVAL_MS || 30000);

export const XMR_WALLET_ADDRESS = (process.env.XMR_WALLET_ADDRESS || '').trim();

export const GRAPH_TENANT_ID = (process.env.GRAPH_TENANT_ID || '').trim();
export const GRAPH_CLIENT_ID = (process.env.GRAPH_CLIENT_ID || '').trim();
export const GRAPH_CLIENT_SECRET = (process.env.GRAPH_CLIENT_SECRET || '').trim();
export const GRAPH_SENDER_EMAIL = (process.env.GRAPH_SENDER_EMAIL || '').trim();
export const GRAPH_RECIPIENT_EMAILS = (process.env.GRAPH_RECIPIENT_EMAILS || '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);

export const DASHBOARD_PUBLIC_URL = (process.env.DASHBOARD_PUBLIC_URL || '').trim();
export const DASHBOARD_LOGO_URL = (process.env.DASHBOARD_LOGO_URL || '').trim();

// Miner offline alerting
const rawAlertRecipients = (process.env.ALERT_RECIPIENT_EMAILS || '')
  .split(',')
  .map((email) => email.trim())
  .filter(Boolean);
export const ALERT_RECIPIENT_EMAILS = rawAlertRecipients.length > 0 ? rawAlertRecipients : GRAPH_RECIPIENT_EMAILS;

const configuredOfflineAlertMinutes = Number(process.env.OFFLINE_ALERT_THRESHOLD_MINUTES || 10);
export const OFFLINE_ALERT_THRESHOLD_MS = (Number.isFinite(configuredOfflineAlertMinutes) && configuredOfflineAlertMinutes > 0
  ? configuredOfflineAlertMinutes
  : 10) * 60 * 1000;

export const POSTGRES_HOST = (process.env.POSTGRES_HOST || 'postgres').trim();
export const POSTGRES_PORT = Number(process.env.POSTGRES_PORT || 5432);
export const POSTGRES_DB = (process.env.POSTGRES_DB || 'crypto_dashboard').trim();
export const POSTGRES_USER = (process.env.POSTGRES_USER || 'crypto_dashboard').trim();
export const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || '';
export const POSTGRES_SSL = (process.env.POSTGRES_SSL || 'false').toLowerCase() === 'true';

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const ADMIN_SESSION_SECRET = (process.env.ADMIN_SESSION_SECRET || '').trim();
const configuredAdminSessionTtlMs = Number(process.env.ADMIN_SESSION_TTL_MS || 12 * 60 * 60 * 1000);
export const ADMIN_SESSION_TTL_MS = Number.isFinite(configuredAdminSessionTtlMs)
  ? Math.max(15 * 60 * 1000, Math.floor(configuredAdminSessionTtlMs))
  : 12 * 60 * 60 * 1000;
export const ADMIN_COOKIE_SECURE = (process.env.ADMIN_COOKIE_SECURE || 'false').toLowerCase() === 'true';
export const ADMIN_SESSION_COOKIE_NAME = 'admin_session';
