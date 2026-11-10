import cron from 'node-cron';
import { updateXmrRate } from './priceService.js';
import { updateMinerStats } from './minerStats.js';
import { isEmailConfigured, getAccessToken } from './email/graphClient.js';
import { sendDailyEmail } from './email/dailyEmail.js';
import { checkOfflineMinersAndAlert } from './email/offlineAlert.js';
import { isCronRegistered, setCronRegistered } from './state.js';

export function registerCronJobs() {
  if (isCronRegistered()) {
    return;
  }

  // XMR/USD update every 15 minutes.
  cron.schedule('*/15 * * * *', () => {
    updateXmrRate().catch((error) => {
      console.error('Scheduled XMR rate update failed:', error.message);
    });
  });

  // Hashrate history update every 5 minutes.
  cron.schedule('*/5 * * * *', updateMinerStats);

  // Miner offline/back-online alerts, checked on the same 5-minute cadence.
  if (isEmailConfigured()) {
    cron.schedule('*/5 * * * *', async () => {
      try {
        const accessToken = await getAccessToken();
        await checkOfflineMinersAndAlert(accessToken);
      } catch (error) {
        console.error('Error checking miner offline status:', error.message);
      }
    });
  } else {
    console.warn('Miner offline alerts disabled: missing email configuration in environment.');
  }

  // Daily email scheduled at 10:00 AM.
  if (isEmailConfigured()) {
    cron.schedule('00 10 * * *', async () => {
      try {
        const accessToken = await getAccessToken();
        await sendDailyEmail(accessToken);
      } catch (error) {
        console.error('Error sending scheduled daily email:', error);
      }
    });
  } else {
    console.warn('Scheduled daily email disabled: missing email configuration in environment.');
  }

  setCronRegistered(true);
}
