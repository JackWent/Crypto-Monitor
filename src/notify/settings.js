import * as config from '../config.js';
import { getAppState, setAppState } from '../db/metrics.js';
import { isEmailConfigured } from '../email/graphClient.js';

// Runtime notification settings, persisted in app_state so they can be changed from the
// admin UI without an env change or a redeploy. Env vars act as the bootstrap defaults.
const KEY = 'notification_settings';

// Resolves the saved settings against the env defaults into the effective configuration.
// discordWebhookUrl is the live secret and must stay server-side (mask it before returning
// anything to a browser).
export async function getNotificationSettings() {
  const saved = (await getAppState(KEY)) || {};

  // Discord webhook: an absent key falls back to the env var; a stored value (including an
  // empty string, which means "Discord off") overrides it.
  let discordWebhookUrl;
  let discordWebhookSource;
  if (Object.prototype.hasOwnProperty.call(saved, 'discordWebhookUrl')) {
    const v = typeof saved.discordWebhookUrl === 'string' ? saved.discordWebhookUrl.trim() : '';
    discordWebhookUrl = v;
    discordWebhookSource = v ? 'database' : 'none';
  } else {
    discordWebhookUrl = config.DISCORD_WEBHOOK_URL;
    discordWebhookSource = config.DISCORD_WEBHOOK_URL ? 'env' : 'none';
  }
  const discordConfigured = Boolean(discordWebhookUrl);

  const emailConfigured = isEmailConfigured();
  // When nothing is saved, keep the pre-1.2 behaviour: email only if it's the sole channel.
  const emailEnabled = typeof saved.emailEnabled === 'boolean'
    ? saved.emailEnabled
    : (emailConfigured && !discordConfigured);

  return { emailEnabled, emailConfigured, discordWebhookUrl, discordConfigured, discordWebhookSource };
}

// Applies a partial update (emailEnabled and/or discordWebhookUrl) and returns the new
// effective settings. A discordWebhookUrl of '' clears the DB override (Discord off).
export async function updateNotificationSettings(patch) {
  const saved = (await getAppState(KEY)) || {};
  const next = { ...saved };
  if (typeof patch.emailEnabled === 'boolean') {
    next.emailEnabled = patch.emailEnabled;
  }
  if (typeof patch.discordWebhookUrl === 'string') {
    next.discordWebhookUrl = patch.discordWebhookUrl.trim();
  }
  await setAppState(KEY, next);
  return getNotificationSettings();
}

// A display-safe masked form of a webhook URL, e.g. ".../webhooks/157268…/…_wKz".
export function maskWebhook(url) {
  if (!url) return '';
  const m = url.match(/\/api\/webhooks\/(\d+)\/(.+)$/);
  if (!m) return '(set)';
  const [, id, tok] = m;
  return `…/webhooks/${id.slice(0, 6)}…/…${tok.slice(-4)}`;
}
