import express from 'express';
import multer from 'multer';
import { requireAdmin } from '../adminAuth.js';
import { isDbReady } from '../state.js';
import {
  badRequestError,
  parseHistoryPayload,
  loadHistoryFromPath,
  importHistoryData,
  exportHistoryDataToJsonFiles,
  fetchHistoryForExportType,
  buildHistoryExportDocument,
  getHistoryExportFilename
} from '../history.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

// Export historical XMR/hashrate data from PostgreSQL into JSON backup files.
router.post('/api/export-history', requireAdmin, async (req, res) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: 'Database is not ready yet.' });
  }

  try {
    const result = await exportHistoryDataToJsonFiles();
    res.json({
      message: 'History export completed.',
      ...result
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Error exporting history:', error.message);
    res.status(500).json({ error: 'Failed to export history data.' });
  }
});

// Download a single full-history export JSON directly from PostgreSQL.
router.get('/api/export-history/:historyType/download', requireAdmin, async (req, res) => {
  if (!isDbReady()) {
    return res.status(503).json({ error: 'Database is not ready yet.' });
  }

  const historyType = String(req.params.historyType || '').toLowerCase();
  if (historyType !== 'xmr' && historyType !== 'hashrate') {
    return res.status(400).json({ error: 'Invalid historyType. Use "xmr" or "hashrate".' });
  }

  try {
    const exportedAt = new Date().toISOString();
    const history = await fetchHistoryForExportType(historyType);
    const payload = buildHistoryExportDocument(history, exportedAt);
    const filename = getHistoryExportFilename(historyType, exportedAt);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('Error creating history download export:', error.message);
    res.status(500).json({ error: 'Failed to generate export file.' });
  }
});

// Import historical XMR/hashrate data from JSON files or JSON payloads.
router.post(
  '/api/import-history',
  requireAdmin,
  upload.fields([
    { name: 'xmrHistoryFile', maxCount: 1 },
    { name: 'hashrateHistoryFile', maxCount: 1 }
  ]),
  async (req, res) => {
    if (!isDbReady()) {
      return res.status(503).json({ error: 'Database is not ready yet.' });
    }

    try {
      const xmrFile = req.files?.xmrHistoryFile?.[0];
      const hashrateFile = req.files?.hashrateHistoryFile?.[0];

      let xmrHistory = null;
      if (xmrFile) {
        xmrHistory = parseHistoryPayload(xmrFile.buffer, 'xmrHistoryFile');
      } else if (req.body?.xmrHistoryPath) {
        xmrHistory = await loadHistoryFromPath(req.body.xmrHistoryPath, 'xmrHistoryPath');
      } else if (req.body?.xmrHistory !== undefined) {
        xmrHistory = parseHistoryPayload(req.body.xmrHistory, 'xmrHistory');
      }

      let hashrateHistory = null;
      if (hashrateFile) {
        hashrateHistory = parseHistoryPayload(hashrateFile.buffer, 'hashrateHistoryFile');
      } else if (req.body?.hashrateHistoryPath) {
        hashrateHistory = await loadHistoryFromPath(req.body.hashrateHistoryPath, 'hashrateHistoryPath');
      } else if (req.body?.hashrateHistory !== undefined) {
        hashrateHistory = parseHistoryPayload(req.body.hashrateHistory, 'hashrateHistory');
      }

      if (!xmrHistory && !hashrateHistory) {
        throw badRequestError('No import data provided. Upload files or provide xmrHistory/hashrateHistory payloads or paths.');
      }

      const result = await importHistoryData({ xmrHistory, hashrateHistory });
      res.json({
        message: 'History import completed.',
        ...result
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error('Error importing history:', error.message);
      res.status(500).json({ error: 'Failed to import history data.' });
    }
  }
);

export default router;
