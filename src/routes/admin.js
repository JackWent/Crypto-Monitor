import express from 'express';
import rateLimit from 'express-rate-limit';
import * as config from '../config.js';
import {
  isAdminAuthEnabled,
  hasValidAdminSession,
  isAdminPasswordValid,
  createAdminSession,
  getAdminSessionTokenFromRequest,
  clearAdminSessionCookie
} from '../adminAuth.js';
import { adminSessions } from '../state.js';

const router = express.Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' }
});

router.get('/api/admin/session', (req, res) => {
  const enabled = isAdminAuthEnabled();
  res.json({
    enabled,
    authenticated: enabled ? hasValidAdminSession(req) : true
  });
});

router.post('/api/admin/login', loginRateLimiter, (req, res) => {
  if (!isAdminAuthEnabled()) {
    return res.status(503).json({ error: 'Admin password is not configured. Set ADMIN_PASSWORD.' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (!isAdminPasswordValid(password)) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }

  createAdminSession(res);
  return res.status(200).json({
    message: 'Admin authenticated.',
    sessionExpiresInMs: config.ADMIN_SESSION_TTL_MS
  });
});

router.post('/api/admin/logout', (req, res) => {
  const token = getAdminSessionTokenFromRequest(req);
  if (token) {
    adminSessions.delete(token);
  }
  clearAdminSessionCookie(res);
  res.status(200).json({ message: 'Admin session cleared.' });
});

export default router;
