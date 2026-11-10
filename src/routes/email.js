import express from 'express';
import { requireAdmin } from '../adminAuth.js';
import { getAccessToken, sendEmail } from '../email/graphClient.js';
import { sendDailyEmail } from '../email/dailyEmail.js';
import { generateDailyEmailBody, generateMinerOfflineEmailBody, generateMinerBackOnlineEmailBody } from '../email/template.js';
import { getMinerStats } from '../minerStats.js';
import { getCachedXmrRate } from '../state.js';
import * as config from '../config.js';

const router = express.Router();

// Endpoint to manually send the daily email
router.get('/send-daily-email', requireAdmin, async (req, res) => {
  try {
    const accessToken = await getAccessToken();
    await sendDailyEmail(accessToken);
    res.status(200).send('Daily email sent successfully!');
  } catch (error) {
    console.error('Error sending daily email:', error);
    res.status(500).send(`Failed to send daily email: ${error.message}`);
  }
});

// Test endpoint for email with custom subject and content
router.get('/test-email', requireAdmin, async (req, res) => {
  try {
    // Get query parameters with defaults
    const subject = req.query.subject || 'Test Email';
    const content = req.query.content || '<h1>Test Email Content</h1><p>This is a test email from your XMR Mining Dashboard.</p>';

    console.log(`Sending test email with subject: "${subject}"`);

    const accessToken = await getAccessToken();

    await sendEmail(accessToken, subject, content);
    res.status(200).send(`Test email sent successfully with subject: "${subject}"`);
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).send(`Failed to send test email: ${error.message}`);
  }
});

// Also add a function to test the email with specific stats
router.get('/test-email-with-stats', requireAdmin, async (req, res) => {
  try {
    // Get custom XMR price or use the cached one
    const xmrPrice = req.query.xmrPrice ? parseFloat(req.query.xmrPrice) : getCachedXmrRate() || 0;

    // Try to get real stats, but have fallbacks
    let minerStats;
    try {
      minerStats = await getMinerStats();
    } catch (error) {
      console.warn('Using fallback stats for test email:', error.message);
      // Create fallback stats if real ones can't be fetched
      minerStats = {
        stats: {
          hashrate: req.query.hashrate || '1000 H/s',
          hashes: req.query.hashes || '1000000',
          balance: req.query.balance ? parseFloat(req.query.balance) * 1e12 : 0.00123 * 1e12,
          paid: req.query.paid ? parseFloat(req.query.paid) * 1e12 : 0.05 * 1e12,
          last_reward: req.query.lastReward ? parseFloat(req.query.lastReward) * 1e12 : 0.0001 * 1e12,
          expired: req.query.expired || '5'
        }
      };
    }

    // Generate email body with provided or fetched stats
    const emailBody = generateDailyEmailBody(xmrPrice, minerStats);

    // Get access token and send email
    const accessToken = await getAccessToken();

    await sendEmail(accessToken, 'Test: Daily XMR Update', emailBody);
    res.status(200).send('Test stats email sent successfully!');
  } catch (error) {
    console.error('Error sending test stats email:', error);
    res.status(500).send(`Failed to send test stats email: ${error.message}`);
  }
});

// Test endpoint for the miner-offline alert email (uses fake data unless overridden via query params)
router.get('/test-offline-alert', requireAdmin, async (req, res) => {
  try {
    const workerId = req.query.workerId || 'test-worker';
    const offlineMinutes = req.query.minutes ? parseFloat(req.query.minutes) : 15;
    const worker = {
      workerId,
      lastShare: Math.floor(Date.now() / 1000) - Math.round(offlineMinutes * 60),
    };

    const emailBody = generateMinerOfflineEmailBody(worker, offlineMinutes * 60 * 1000);
    const accessToken = await getAccessToken();
    await sendEmail(accessToken, `Test: Miner Offline: ${workerId}`, emailBody, config.ALERT_RECIPIENT_EMAILS);
    res.status(200).send(`Test offline alert sent for "${workerId}"!`);
  } catch (error) {
    console.error('Error sending test offline alert:', error);
    res.status(500).send(`Failed to send test offline alert: ${error.message}`);
  }
});

// Test endpoint for the miner-back-online alert email
router.get('/test-back-online-alert', requireAdmin, async (req, res) => {
  try {
    const workerId = req.query.workerId || 'test-worker';
    const worker = { workerId, lastShare: Math.floor(Date.now() / 1000) };

    const emailBody = generateMinerBackOnlineEmailBody(worker);
    const accessToken = await getAccessToken();
    await sendEmail(accessToken, `Test: Miner Back Online: ${workerId}`, emailBody, config.ALERT_RECIPIENT_EMAILS);
    res.status(200).send(`Test back-online alert sent for "${workerId}"!`);
  } catch (error) {
    console.error('Error sending test back-online alert:', error);
    res.status(500).send(`Failed to send test back-online alert: ${error.message}`);
  }
});

export default router;
