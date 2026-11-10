import pg from 'pg';
import * as config from '../config.js';
import { setDb, setDbReady } from '../state.js';

const { Pool } = pg;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabaseReady(db, maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.warn(`PostgreSQL not ready (attempt ${attempt}/${maxAttempts}). Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}

async function enforceUniqueMetricTimestamps(db) {
  try {
    await db.query(`
      DELETE FROM xmr_rate_history older
      USING xmr_rate_history newer
      WHERE older.timestamp_ms = newer.timestamp_ms
        AND older.id < newer.id;

      DELETE FROM hashrate_history older
      USING hashrate_history newer
      WHERE older.timestamp_ms = newer.timestamp_ms
        AND older.id < newer.id;

      CREATE UNIQUE INDEX IF NOT EXISTS ux_xmr_rate_history_timestamp
        ON xmr_rate_history(timestamp_ms);

      CREATE UNIQUE INDEX IF NOT EXISTS ux_hashrate_history_timestamp
        ON hashrate_history(timestamp_ms);
    `);
  } catch (error) {
    console.error('Error enforcing unique metric timestamps:', error.message);
    throw error;
  }
}

// Creates the pool, waits for Postgres to accept connections, applies schema
// DDL, and marks state as ready. Historical-data pruning is intentionally
// triggered by the caller (server.js bootstrap) right after this resolves,
// to avoid a circular import between this module and db/metrics.js.
export async function initializeDatabase() {
  const db = new Pool({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    database: config.POSTGRES_DB,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    ssl: config.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined
  });

  await waitForDatabaseReady(db);

  await db.query(`
    CREATE TABLE IF NOT EXISTS xmr_rate_history (
      id BIGSERIAL PRIMARY KEY,
      timestamp_ms BIGINT NOT NULL,
      rate DOUBLE PRECISION NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_xmr_rate_history_timestamp
      ON xmr_rate_history(timestamp_ms);

    CREATE TABLE IF NOT EXISTS hashrate_history (
      id BIGSERIAL PRIMARY KEY,
      timestamp_ms BIGINT NOT NULL,
      hashrate DOUBLE PRECISION NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_hashrate_history_timestamp
      ON hashrate_history(timestamp_ms);

    CREATE TABLE IF NOT EXISTS miner_stats_snapshots (
      id BIGSERIAL PRIMARY KEY,
      timestamp_ms BIGINT NOT NULL,
      payload JSONB NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_miner_stats_snapshots_timestamp
      ON miner_stats_snapshots(timestamp_ms);

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);

  await enforceUniqueMetricTimestamps(db);

  setDb(db);
  setDbReady(true);
  console.log(`PostgreSQL initialized at ${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${config.POSTGRES_DB}`);
}
