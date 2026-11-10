import fs from 'fs/promises';
import { createRequire } from 'module';
import * as config from '../config.js';
import { getDb } from '../state.js';
import { getMetricCounts, pruneHistoricalData } from './metrics.js';

const require = createRequire(import.meta.url);

let LegacySqlite = null;
try {
  LegacySqlite = require('better-sqlite3');
} catch (error) {
  console.warn('better-sqlite3 not available. Legacy SQLite migration will be skipped.');
}

export async function migrateLegacySqliteToDbIfNeeded() {
  if (!LegacySqlite) {
    return;
  }

  const counts = await getMetricCounts();
  if (counts.xmrCount > 0 || counts.hashrateCount > 0 || counts.snapshotCount > 0) {
    return;
  }

  try {
    await fs.access(config.LEGACY_SQLITE_FILE);
  } catch {
    return;
  }

  let legacyDb = null;
  try {
    legacyDb = new LegacySqlite(config.LEGACY_SQLITE_FILE, { readonly: true, fileMustExist: true });
  } catch (error) {
    console.error('Could not open legacy SQLite file for migration:', error.message);
    return;
  }

  const tableExistsStmt = legacyDb.prepare('SELECT 1 AS found FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1');
  const tableExists = (name) => Boolean(tableExistsStmt.get('table', name));

  let xmrInserted = 0;
  let hashrateInserted = 0;
  let snapshotInserted = 0;
  let appStateInserted = 0;

  const db = getDb();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    if (tableExists('xmr_rate_history')) {
      const rows = legacyDb.prepare('SELECT timestamp, rate FROM xmr_rate_history ORDER BY timestamp ASC').all();
      for (const entry of rows) {
        const timestamp = Number(entry.timestamp);
        const rate = Number(entry.rate);
        if (Number.isFinite(timestamp) && Number.isFinite(rate)) {
          const insertResult = await client.query(
            'INSERT INTO xmr_rate_history (timestamp_ms, rate) VALUES ($1, $2) ON CONFLICT (timestamp_ms) DO NOTHING',
            [timestamp, rate]
          );
          xmrInserted += insertResult.rowCount || 0;
        }
      }
    }

    if (tableExists('hashrate_history')) {
      const rows = legacyDb.prepare('SELECT timestamp, hashrate FROM hashrate_history ORDER BY timestamp ASC').all();
      for (const entry of rows) {
        const timestamp = Number(entry.timestamp);
        const hashrate = Number(entry.hashrate);
        if (Number.isFinite(timestamp) && Number.isFinite(hashrate)) {
          const insertResult = await client.query(
            'INSERT INTO hashrate_history (timestamp_ms, hashrate) VALUES ($1, $2) ON CONFLICT (timestamp_ms) DO NOTHING',
            [timestamp, hashrate]
          );
          hashrateInserted += insertResult.rowCount || 0;
        }
      }
    }

    if (tableExists('miner_stats_snapshots')) {
      const rows = legacyDb.prepare('SELECT timestamp, payload FROM miner_stats_snapshots ORDER BY timestamp ASC').all();
      for (const entry of rows) {
        const timestamp = Number(entry.timestamp);
        if (!Number.isFinite(timestamp)) {
          continue;
        }

        let payload;
        try {
          payload = typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload;
        } catch {
          continue;
        }

        await client.query(
          'INSERT INTO miner_stats_snapshots (timestamp_ms, payload) VALUES ($1, $2::jsonb)',
          [timestamp, JSON.stringify(payload)]
        );
        snapshotInserted += 1;
      }
    }

    if (tableExists('app_state')) {
      const stateRow = legacyDb.prepare('SELECT value FROM app_state WHERE key = ? LIMIT 1').get('cached_xmr_rate');
      if (stateRow?.value) {
        let parsedValue = stateRow.value;
        if (typeof parsedValue === 'string') {
          try {
            parsedValue = JSON.parse(parsedValue);
          } catch {
            parsedValue = { value: stateRow.value };
          }
        }

        await client.query(
          `
          INSERT INTO app_state (key, value)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
          `,
          ['cached_xmr_rate', JSON.stringify(parsedValue)]
        );
        appStateInserted += 1;
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error migrating legacy SQLite data to PostgreSQL:', error.message);
    return;
  } finally {
    client.release();
    legacyDb.close();
  }

  if (xmrInserted || hashrateInserted || snapshotInserted || appStateInserted) {
    console.log(
      `Migrated legacy SQLite data to PostgreSQL: ${xmrInserted} XMR rates, ${hashrateInserted} hashrate points, ${snapshotInserted} miner snapshots, ${appStateInserted} app-state records.`
    );
  }
}

export async function migrateJsonHistoryToDbIfNeeded() {
  try {
    const counts = await getMetricCounts();
    const db = getDb();

    if (counts.xmrCount === 0) {
      try {
        const xmrData = await fs.readFile(config.XMR_HISTORY_FILE, 'utf8');
        const parsed = JSON.parse(xmrData);
        const rows = Array.isArray(parsed) ? parsed : [];
        const client = await db.connect();

        try {
          await client.query('BEGIN');
          let inserted = 0;
          for (const entry of rows) {
            const timestamp = Number(entry.timestamp);
            const rate = Number(entry.rate);
            if (Number.isFinite(timestamp) && Number.isFinite(rate)) {
              const insertResult = await client.query(
                'INSERT INTO xmr_rate_history (timestamp_ms, rate) VALUES ($1, $2) ON CONFLICT (timestamp_ms) DO NOTHING',
                [timestamp, rate]
              );
              inserted += insertResult.rowCount || 0;
            }
          }
          await client.query('COMMIT');
          console.log(`Migrated ${inserted} XMR history records from JSON to PostgreSQL.`);
        } catch (insertError) {
          await client.query('ROLLBACK');
          throw insertError;
        } finally {
          client.release();
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Error migrating XMR JSON history:', error.message);
        }
      }
    }

    if (counts.hashrateCount === 0) {
      try {
        const hashrateData = await fs.readFile(config.HASHRATE_HISTORY_FILE, 'utf8');
        const parsed = JSON.parse(hashrateData);
        const rows = Array.isArray(parsed) ? parsed : [];
        const client = await db.connect();

        try {
          await client.query('BEGIN');
          let inserted = 0;
          for (const entry of rows) {
            const timestamp = Number(entry.timestamp);
            const hashrate = Number(entry.hashrate);
            if (Number.isFinite(timestamp) && Number.isFinite(hashrate)) {
              const insertResult = await client.query(
                'INSERT INTO hashrate_history (timestamp_ms, hashrate) VALUES ($1, $2) ON CONFLICT (timestamp_ms) DO NOTHING',
                [timestamp, hashrate]
              );
              inserted += insertResult.rowCount || 0;
            }
          }
          await client.query('COMMIT');
          console.log(`Migrated ${inserted} hashrate records from JSON to PostgreSQL.`);
        } catch (insertError) {
          await client.query('ROLLBACK');
          throw insertError;
        } finally {
          client.release();
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Error migrating hashrate JSON history:', error.message);
        }
      }
    }

    await pruneHistoricalData(Date.now());
  } catch (error) {
    console.error('Error during JSON-to-PostgreSQL migration:', error.message);
  }
}
