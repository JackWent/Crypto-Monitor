import fs from 'fs/promises';
import path from 'path';
import * as config from './config.js';
import { getDb, isDbReady } from './state.js';
import { pruneHistoricalData, hydrateCachesFromDb } from './db/metrics.js';

export function badRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function parseHistoryPayload(input, label) {
  let parsed = input;

  if (Buffer.isBuffer(parsed)) {
    parsed = parsed.toString('utf8');
  }

  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) {
      throw badRequestError(`${label} payload is empty.`);
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      throw badRequestError(`${label} is not valid JSON.`);
    }
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.history)) {
    return parsed.history;
  }

  throw badRequestError(`${label} must be a JSON array or an object with a "history" array.`);
}

// Import-by-path is scoped to the app's data directory only. Without this,
// a caller-supplied absolute/traversal path (e.g. "/etc/passwd" or
// "../../.env") would let requireAdmin-gated callers read arbitrary files
// off the container filesystem via fs.readFile.
function resolvePathWithinDataDir(filePath, label) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw badRequestError(`${label} must be a non-empty file path.`);
  }

  const dataDir = path.resolve(config.DATA_DIR);
  const resolved = path.resolve(dataDir, filePath);

  if (resolved !== dataDir && !resolved.startsWith(dataDir + path.sep)) {
    throw badRequestError(`${label} must be a path inside the data directory.`);
  }

  return resolved;
}

export async function loadHistoryFromPath(filePath, label) {
  const resolvedPath = resolvePathWithinDataDir(filePath, label);

  try {
    const fileContents = await fs.readFile(resolvedPath, 'utf8');
    return parseHistoryPayload(fileContents, label);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw badRequestError(`${label} file was not found at path: ${filePath}`);
    }
    if (error.statusCode) {
      throw error;
    }
    throw badRequestError(`Failed to read ${label} from path: ${filePath}`);
  }
}

export function normalizeHistoryEntries(entries, key) {
  const byTimestamp = new Map();
  let validCount = 0;
  let invalidCount = 0;

  for (const entry of entries) {
    const timestamp = Number(entry?.timestamp);
    const value = Number(entry?.[key]);

    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) {
      invalidCount += 1;
      continue;
    }

    validCount += 1;
    byTimestamp.set(timestamp, value);
  }

  const deduped = [...byTimestamp.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, value]) => ({ timestamp, value }));

  return {
    deduped,
    rawCount: entries.length,
    validCount,
    invalidCount,
    duplicateCount: Math.max(0, validCount - deduped.length)
  };
}

async function bulkInsertHistory(client, tableName, valueColumn, entries) {
  if (!entries.length) {
    return 0;
  }

  const timestamps = entries.map((entry) => entry.timestamp);
  const values = entries.map((entry) => entry.value);

  const result = await client.query(
    `
    INSERT INTO ${tableName} (timestamp_ms, ${valueColumn})
    SELECT src.timestamp_ms, src.metric_value
    FROM UNNEST($1::bigint[], $2::double precision[]) AS src(timestamp_ms, metric_value)
    ON CONFLICT (timestamp_ms) DO NOTHING
    `,
    [timestamps, values]
  );

  return result.rowCount || 0;
}

export async function importHistoryData({ xmrHistory, hashrateHistory }) {
  if (!isDbReady()) {
    throw new Error('Database is not ready yet.');
  }

  const xmrNormalized = normalizeHistoryEntries(xmrHistory || [], 'rate');
  const hashrateNormalized = normalizeHistoryEntries(hashrateHistory || [], 'hashrate');

  const hasAnyValidInput = xmrNormalized.deduped.length > 0 || hashrateNormalized.deduped.length > 0;
  if (!hasAnyValidInput) {
    throw badRequestError('No valid records found to import.');
  }

  const db = getDb();
  const client = await db.connect();
  let xmrInserted = 0;
  let hashrateInserted = 0;
  try {
    await client.query('BEGIN');
    xmrInserted = await bulkInsertHistory(client, 'xmr_rate_history', 'rate', xmrNormalized.deduped);
    hashrateInserted = await bulkInsertHistory(client, 'hashrate_history', 'hashrate', hashrateNormalized.deduped);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await pruneHistoricalData(Date.now());
  await hydrateCachesFromDb();

  return {
    importedAt: new Date().toISOString(),
    xmr: {
      raw: xmrNormalized.rawCount,
      valid: xmrNormalized.validCount,
      invalid: xmrNormalized.invalidCount,
      deduped: xmrNormalized.deduped.length,
      inserted: xmrInserted,
      skippedExisting: xmrNormalized.deduped.length - xmrInserted,
      duplicatesInInput: xmrNormalized.duplicateCount
    },
    hashrate: {
      raw: hashrateNormalized.rawCount,
      valid: hashrateNormalized.validCount,
      invalid: hashrateNormalized.invalidCount,
      deduped: hashrateNormalized.deduped.length,
      inserted: hashrateInserted,
      skippedExisting: hashrateNormalized.deduped.length - hashrateInserted,
      duplicatesInInput: hashrateNormalized.duplicateCount
    }
  };
}

export async function fetchHistoryForExportType(historyType) {
  const db = getDb();

  if (historyType === 'xmr') {
    const result = await db.query('SELECT timestamp_ms, rate FROM xmr_rate_history ORDER BY timestamp_ms ASC');
    return result.rows.map((row) => ({
      timestamp: Number(row.timestamp_ms),
      rate: Number(row.rate)
    }));
  }

  if (historyType === 'hashrate') {
    const result = await db.query('SELECT timestamp_ms, hashrate FROM hashrate_history ORDER BY timestamp_ms ASC');
    return result.rows.map((row) => ({
      timestamp: Number(row.timestamp_ms),
      hashrate: Number(row.hashrate)
    }));
  }

  throw badRequestError('Invalid history type. Use "xmr" or "hashrate".');
}

export async function fetchAllHistoryForExport() {
  const [xmrHistory, hashrateHistory] = await Promise.all([
    fetchHistoryForExportType('xmr'),
    fetchHistoryForExportType('hashrate')
  ]);

  return { xmrHistory, hashrateHistory };
}

export function buildHistoryExportDocument(history, exportedAt) {
  return {
    exportedAt,
    source: 'postgresql',
    history
  };
}

export function getHistoryExportFilename(historyType, exportedAt) {
  const safeTimestamp = exportedAt.replace(/[:.]/g, '-');
  if (historyType === 'xmr') {
    return `xmr_history_${safeTimestamp}.json`;
  }
  return `hashrate_history_${safeTimestamp}.json`;
}

export async function exportHistoryDataToJsonFiles() {
  if (!isDbReady()) {
    throw new Error('Database is not ready yet.');
  }

  const exportedAt = new Date().toISOString();
  const { xmrHistory, hashrateHistory } = await fetchAllHistoryForExport();

  const xmrDocument = buildHistoryExportDocument(xmrHistory, exportedAt);
  const hashrateDocument = buildHistoryExportDocument(hashrateHistory, exportedAt);

  await Promise.all([
    fs.writeFile(config.XMR_HISTORY_FILE, JSON.stringify(xmrDocument, null, 2)),
    fs.writeFile(config.HASHRATE_HISTORY_FILE, JSON.stringify(hashrateDocument, null, 2))
  ]);

  return {
    exportedAt,
    xmr: {
      count: xmrHistory.length,
      filePath: config.XMR_HISTORY_FILE,
      downloadUrl: '/api/export-history/xmr/download'
    },
    hashrate: {
      count: hashrateHistory.length,
      filePath: config.HASHRATE_HISTORY_FILE,
      downloadUrl: '/api/export-history/hashrate/download'
    }
  };
}
