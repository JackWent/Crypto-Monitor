// Centralized mutable in-memory state shared across modules.
// Kept isolated in one module (rather than passed via circular imports)
// so db/pool.js, priceService.js, minerStats.js, and the route modules
// can all read/write the same cache without importing each other.

let db = null;
let dbReady = false;
let cachedXmrRate = null;
let lastUpdated = null;
let cachedMinerStats = null;
let cachedMinerStatsAt = 0;
let lastHashrateSampleAt = 0;
let cronJobsRegistered = false;
const offlineAlertedWorkers = new Map();
// Last pool record seen for each real worker, so a worker that drops out of the pool's list entirely
// (the pool stops listing workers that have been offline a while) can still be alerted on.
const knownWorkers = new Map();

export const adminSessions = new Map();

export function getDb() {
  return db;
}

export function setDb(pool) {
  db = pool;
}

export function isDbReady() {
  return dbReady;
}

export function setDbReady(value) {
  dbReady = value;
}

export function getCachedXmrRate() {
  return cachedXmrRate;
}

export function setCachedXmrRate(value) {
  cachedXmrRate = value;
}

export function getLastUpdated() {
  return lastUpdated;
}

export function setLastUpdated(value) {
  lastUpdated = value;
}

export function getCachedMinerStats() {
  return cachedMinerStats;
}

export function getCachedMinerStatsAt() {
  return cachedMinerStatsAt;
}

export function setCachedMinerStats(snapshot, timestamp) {
  cachedMinerStats = snapshot;
  cachedMinerStatsAt = timestamp;
}

export function getLastHashrateSampleAt() {
  return lastHashrateSampleAt;
}

export function setLastHashrateSampleAt(value) {
  lastHashrateSampleAt = value;
}

export function hasOfflineAlertBeenSent(workerId) {
  return offlineAlertedWorkers.has(workerId);
}

export function markOfflineAlertSent(workerId, at = Date.now()) {
  offlineAlertedWorkers.set(workerId, at);
}

export function clearOfflineAlert(workerId) {
  offlineAlertedWorkers.delete(workerId);
}

export function rememberWorker(worker) {
  knownWorkers.set(worker.workerId, worker);
}

export function forgetWorker(workerId) {
  knownWorkers.delete(workerId);
  offlineAlertedWorkers.delete(workerId);
}

export function getOfflineAlertedWorkers() {
  return offlineAlertedWorkers;
}

export function getKnownWorkers() {
  return knownWorkers;
}

export function isCronRegistered() {
  return cronJobsRegistered;
}

export function setCronRegistered(value) {
  cronJobsRegistered = value;
}
