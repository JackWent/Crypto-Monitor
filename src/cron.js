import cron from 'node-cron';
import { updateXmrRate } from './priceService.js';
import { updateMinerStats } from './minerStats.js';
import { isEmailConfigured, getAccessToken } from './email/graphClient.js';
import { sendDailyEmail } from './email/dailyEmail.js';
import { checkOfflineMinersAndAlert } from './email/offlineAlert.js';
import { isDiscordConfigured } from './notify/discord.js';
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
  // Delivered to Discord when DISCORD_WEBHOOK_URL is set, otherwise email.
  if (isDiscordConfigured() || isEmailConfigured()) {
    console.log(`Miner offline/back-online alerts enabled → ${isDiscordConfigured() ? 'Discord' : 'email'}.`);
    cron.schedule('*/5 * * * *', async () => {
      try {
        // Only fetch a Graph token when email is the delivery channel. When Discord
        // is configured the token isn't needed, and fetching it would let an Entra
        // outage or an expired secret stop the Discord alerts for no reason.
        const accessToken = isDiscordConfigured() ? null : await getAccessToken();
        await checkOfflineMinersAndAlert(accessToken);
      } catch (error) {
        console.error('Error checking miner offline status:', error.message);
      }
    });
  } else {
    console.warn('Miner offline alerts disabled: set DISCORD_WEBHOOK_URL or the Graph email configuration.');
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
