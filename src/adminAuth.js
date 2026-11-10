import crypto from 'crypto';
import * as config from './config.js';
import { adminSessions } from './state.js';

const effectiveAdminSessionSecret = config.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export function isAdminAuthEnabled() {
  return config.ADMIN_PASSWORD.length > 0;
}

export function warnIfEphemeralSecret() {
  if (isAdminAuthEnabled() && !config.ADMIN_SESSION_SECRET) {
    console.warn(
      'ADMIN_SESSION_SECRET is not set. Using an ephemeral secret; admin sessions will reset after service restart.'
    );
  }
}

function clearExpiredAdminSessions(nowMs = Date.now()) {
  for (const [token, expiresAt] of adminSessions.entries()) {
    if (expiresAt <= nowMs) {
      adminSessions.delete(token);
    }
  }
}

function parseCookieHeader(cookieHeader) {
  const cookies = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return cookies;
  }

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

export function getAdminSessionTokenFromRequest(req) {
  const cookies = parseCookieHeader(req.headers?.cookie || '');
  return cookies[config.ADMIN_SESSION_COOKIE_NAME] || '';
}

export function setAdminSessionCookie(res, token, maxAgeSeconds) {
  const cookieParts = [
    `${config.ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ];

  if (config.ADMIN_COOKIE_SECURE) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

export function clearAdminSessionCookie(res) {
  const cookieParts = [
    `${config.ADMIN_SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ];

  if (config.ADMIN_COOKIE_SECURE) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function createAdminSessionToken() {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const signature = crypto
    .createHmac('sha256', effectiveAdminSessionSecret)
    .update(nonce)
    .digest('base64url');
  return `${nonce}.${signature}`;
}

export function createAdminSession(res) {
  clearExpiredAdminSessions();
  const token = createAdminSessionToken();
  const expiresAt = Date.now() + config.ADMIN_SESSION_TTL_MS;
  adminSessions.set(token, expiresAt);
  setAdminSessionCookie(res, token, config.ADMIN_SESSION_TTL_MS / 1000);
}

export function isAdminPasswordValid(inputPassword) {
  if (!isAdminAuthEnabled()) {
    return true;
  }

  if (typeof inputPassword !== 'string') {
    return false;
  }

  const expected = Buffer.from(config.ADMIN_PASSWORD, 'utf8');
  const provided = Buffer.from(inputPassword, 'utf8');

  if (expected.length !== provided.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

export function hasValidAdminSession(req) {
  if (!isAdminAuthEnabled()) {
    return true;
  }

  clearExpiredAdminSessions();
  const token = getAdminSessionTokenFromRequest(req);
  if (!token) {
    return false;
  }

  const expiresAt = adminSessions.get(token);
  if (!expiresAt) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }

  return true;
}

export function requireAdmin(req, res, next) {
  if (hasValidAdminSession(req)) {
    return next();
  }

  return res.status(401).json({ error: 'Admin authentication required.' });
}
