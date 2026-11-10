import { getMinerStats } from '../minerStats.js';
import { getCachedXmrRate } from '../state.js';
import { generateDailyEmailBody } from './template.js';
import { sendEmail } from './graphClient.js';

export async function sendDailyEmail(accessToken) {
  try {
    const minerStats = await getMinerStats({ forceRefresh: true });
    const xmrPrice = getCachedXmrRate() || 'N/A';
    const emailBody = generateDailyEmailBody(xmrPrice, minerStats);
    await sendEmail(accessToken, 'Daily XMR Update', emailBody);
    console.log('Daily email sent successfully.');
  } catch (error) {
    console.error('Error sending daily email:', error);
    throw error;
  }
}
