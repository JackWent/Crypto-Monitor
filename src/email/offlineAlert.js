import * as config from '../config.js';
import { getMinerStats } from '../minerStats.js';
import {
  hasOfflineAlertBeenSent, markOfflineAlertSent, clearOfflineAlert, rememberWorker, getKnownWorkers,
  forgetWorker, getOfflineAlertedWorkers, isDbReady
} from '../state.js';
import { getAppState, setAppState } from '../db/metrics.js';

// Which workers have been alerted on, and the last record seen for each, are kept in the database
// (app_state "offline_alert_state") so a restart or a reboot of the host doesn't send the same
// offline email again, and a worker that vanished while the app was down is still noticed.
const ALERT_STATE_KEY = 'offline_alert_state';
const FORGET_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // stop tracking a worker unseen for 30 days
let alertStateLoaded = false;

async function loadAlertState() {
  if (alertStateLoaded || !isDbReady()) return;
  const saved = await getAppState(ALERT_STATE_KEY);
  for (const [workerId, record] of Object.entries(saved?.known || {})) rememberWorker({ ...record, workerId });
  for (const [workerId, at] of Object.entries(saved?.alerted || {})) markOfflineAlertSent(workerId, at);
  alertStateLoaded = true;
  if (saved) console.log(`Offline alert state restored: ${Object.keys(saved.alerted || {}).length} alerted, ${Object.keys(saved.known || {}).length} known workers.`);
}

async function saveAlertState() {
  if (!alertStateLoaded) return; // never overwrite saved state we haven't read yet
  await setAppState(ALERT_STATE_KEY, {
    alerted: Object.fromEntries(getOfflineAlertedWorkers()),
    known: Object.fromEntries(getKnownWorkers())
  });
}
import { generateMinerOfflineEmailBody, generateMinerBackOnlineEmailBody } from './template.js';
import { sendEmail } from './graphClient.js';

// Runs on the same cadence as the hashrate poll. A worker only ever
// disappears from perWorkerStats on this pool API by dropping out of
// perWorkerStats entirely, but lastShare going stale is a reliable enough
// signal to fire on before that happens.
export async function checkOfflineMinersAndAlert(accessToken) {
  // If the database isn't reachable the check still runs (better a possible duplicate than a missed outage)
  await loadAlertState();
  const minerStats = await getMinerStats();
  if (!minerStats || !Array.isArray(minerStats.perWorkerStats)) {
    return;
  }

  const now = Date.now();
  const listed = new Set();

  for (const worker of minerStats.perWorkerStats) {
    // The pool API rolls any share submitted without a worker-id tag into a
    // synthetic "default" bucket with a lastShare that never updates. It has
    // no `expired` field, which real workers always carry (unlike
    // `hashrate`, which the pool itself stops reporting once a real worker
    // has been offline long enough — that's the exact case we need to catch,
    // so it can't be the filter). Skip only the synthetic bucket.
    if (worker.expired === undefined) {
      continue;
    }

    const workerId = worker.workerId || 'Unknown';
    listed.add(workerId);
    rememberWorker({ ...worker, workerId, seenAt: now });
    const lastShare = Number(worker.lastShare);
    const hasValidLastShare = Number.isFinite(lastShare) && lastShare > 0;
    const offlineDurationMs = hasValidLastShare ? now - (lastShare * 1000) : Infinity;
    await updateAlertState(accessToken, worker, workerId, offlineDurationMs > config.OFFLINE_ALERT_THRESHOLD_MS, offlineDurationMs);
  }

  // A worker that has dropped out of the pool's list altogether is offline too: alert on it using the
  // last record we saw. (Known workers only last while the app runs; after a restart a worker that is
  // already gone can't be noticed until it reappears.)
  for (const [workerId, lastSeen] of getKnownWorkers()) {
    if (listed.has(workerId)) continue;
    if (lastSeen.seenAt && now - lastSeen.seenAt > FORGET_AFTER_MS) {
      forgetWorker(workerId); // retired worker: already alerted on long ago, stop tracking it
      continue;
    }
    const lastShare = Number(lastSeen.lastShare);
    const offlineDurationMs = Number.isFinite(lastShare) && lastShare > 0 ? now - (lastShare * 1000) : Infinity;
    await updateAlertState(accessToken, lastSeen, workerId, true, offlineDurationMs);
  }

  await saveAlertState();
}

async function updateAlertState(accessToken, worker, workerId, isOffline, offlineDurationMs) {
  const alreadyAlerted = hasOfflineAlertBeenSent(workerId);

  if (isOffline && !alreadyAlerted) {
    try {
      const body = generateMinerOfflineEmailBody(worker, offlineDurationMs);
      await sendEmail(accessToken, `Miner Offline: ${workerId}`, body, config.ALERT_RECIPIENT_EMAILS);
      // Only marked once the email has actually gone, so a failed send is retried on the next check
      markOfflineAlertSent(workerId);
      console.log(`Offline alert sent for worker "${workerId}" (offline ${Math.floor(offlineDurationMs / 60000)}m).`);
    } catch (error) {
      console.error(`Failed to send offline alert for worker "${workerId}" (will retry):`, error.message);
    }
  } else if (!isOffline && alreadyAlerted) {
    try {
      const body = generateMinerBackOnlineEmailBody(worker);
      await sendEmail(accessToken, `Miner Back Online: ${workerId}`, body, config.ALERT_RECIPIENT_EMAILS);
      clearOfflineAlert(workerId);
      console.log(`Back-online alert sent for worker "${workerId}".`);
    } catch (error) {
      console.error(`Failed to send back-online alert for worker "${workerId}" (will retry):`, error.message);
    }
  }
}
