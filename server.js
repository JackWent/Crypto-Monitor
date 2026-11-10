import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

import * as config from './src/config.js';
import { warnIfEphemeralSecret } from './src/adminAuth.js';
import { isEmailConfigured, getMissingEmailConfigKeys } from './src/email/graphClient.js';
import { initializeDatabase } from './src/db/pool.js';
import { pruneHistoricalData, hydrateCachesFromDb } from './src/db/metrics.js';
import { migrateLegacySqliteToDbIfNeeded, migrateJsonHistoryToDbIfNeeded } from './src/db/legacyMigration.js';
import { updateXmrRate } from './src/priceService.js';
import { updateMinerStats } from './src/minerStats.js';
import { registerCronJobs } from './src/cron.js';

import statsRoutes from './src/routes/stats.js';
import adminRoutes from './src/routes/admin.js';
import historyRoutes from './src/routes/history.js';
import emailRoutes from './src/routes/email.js';
import healthRoutes from './src/routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Behind a reverse proxy (nginx-proxy-manager) in production, so rate
// limiting and other IP-based checks need the real client IP from
// X-Forwarded-For rather than the proxy's own address.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static('public'));

warnIfEphemeralSecret();

app.use(statsRoutes);
app.use(adminRoutes);
app.use(historyRoutes);
app.use(emailRoutes);
app.use(healthRoutes);

// Create the public directory if it doesn't exist
async function ensurePublicDirExists() {
  try {
    const publicDir = path.join(__dirname, 'public');
    await fs.mkdir(publicDir, { recursive: true });

    // Copy index.html to public directory if it doesn't exist
    const indexPath = path.join(publicDir, 'index.html');
    try {
      await fs.access(indexPath);
    } catch (error) {
      // File doesn't exist, copy it from the project root
      try {
        const sourceIndexPath = path.join(__dirname, 'index.html');
        const indexContent = await fs.readFile(sourceIndexPath, 'utf8');
        await fs.writeFile(indexPath, indexContent);
        console.log('Copied index.html to public directory');
      } catch (copyError) {
        console.error('Error copying index.html to public directory:', copyError);
      }
    }
  } catch (error) {
    console.error('Error ensuring public directory exists:', error);
  }
}

// Create data directory if it doesn't exist
async function ensureDataDirExists() {
  try {
    await fs.mkdir(config.DATA_DIR, { recursive: true });
    console.log(`Data directory created or verified at: ${config.DATA_DIR}`);

    // Ensure the data directory is writable by checking/creating a test file
    const testFilePath = path.join(config.DATA_DIR, '.write_test');
    try {
      await fs.writeFile(testFilePath, 'test', { flag: 'w' });
      await fs.unlink(testFilePath); // Remove test file after successful write
      console.log('Data directory is writable');
    } catch (writeError) {
      console.error(`WARNING: Data directory ${config.DATA_DIR} may not be writable:`, writeError.message);
      console.error('This could prevent saving historical data.');
    }
  } catch (error) {
    console.error(`Error creating/verifying data directory ${config.DATA_DIR}:`, error);
  }
}

async function initializePersistence() {
  await ensureDataDirExists();
  await initializeDatabase();
  await pruneHistoricalData(Date.now());
  await migrateLegacySqliteToDbIfNeeded();
  await migrateJsonHistoryToDbIfNeeded();
  await hydrateCachesFromDb();
}

async function runStartupTasks() {
  // Ensure public directory exists and contains index.html
  await ensurePublicDirExists();

  if (!config.POSTGRES_PASSWORD) {
    console.warn('POSTGRES_PASSWORD is empty. Check your .env/database settings.');
  }
  if (!config.XMR_WALLET_ADDRESS) {
    console.warn('XMR wallet is not configured. Set XMR_WALLET_ADDRESS in your environment.');
  }
  if (!isEmailConfigured()) {
    console.warn(`Email settings missing: ${getMissingEmailConfigKeys().join(', ')}`);
  }
  if (!config.DASHBOARD_LOGO_URL && !config.DASHBOARD_PUBLIC_URL) {
    console.warn('Email logo uses fallback URL. Set DASHBOARD_LOGO_URL or DASHBOARD_PUBLIC_URL for your own branded logo.');
  } else if (!config.DASHBOARD_LOGO_URL && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(config.DASHBOARD_PUBLIC_URL)) {
    console.warn('DASHBOARD_PUBLIC_URL points to localhost. Set DASHBOARD_LOGO_URL to a public HTTPS image for email logo rendering.');
  }

  // Initialize database persistence and migration
  await initializePersistence();

  // Start recurring jobs after persistence is ready.
  registerCronJobs();

  // Trigger the first updates on startup
  try {
    await updateXmrRate();
  } catch (error) {
    console.error('Initial XMR rate update failed:', error);
  }

  try {
    await updateMinerStats();
  } catch (error) {
    console.error('Initial miner stats update failed:', error);
  }
}

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  runStartupTasks().catch((error) => {
    console.error('Startup initialization failed:', error);
    process.exit(1);
  });
});
