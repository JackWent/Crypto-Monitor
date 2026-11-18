import axios from 'axios';
import * as config from '../config.js';

// Discord delivery for miner offline / back-online alerts. The webhook URL is a
// secret and is read from the environment (DISCORD_WEBHOOK_URL) only — never
// hardcode it. When no webhook is set the app falls back to email (see offlineAlert.js).

export function isDiscordConfigured() {
  return Boolean(config.DISCORD_WEBHOOK_URL);
}

// Only genuine Discord webhook URLs are accepted — the server makes an outbound POST to
// whatever is stored, so this guards against pointing it at an arbitrary host.
const DISCORD_WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
export function isValidDiscordWebhook(url) {
  return typeof url === 'string' && DISCORD_WEBHOOK_RE.test(url.trim());
}

function dashboardUrl() {
  return config.DASHBOARD_PUBLIC_URL ? config.DASHBOARD_PUBLIC_URL.replace(/\/+$/, '') : '';
}

function formatOfflineDuration(offlineDurationMs) {
  const totalMinutes = Math.max(0, Math.floor(offlineDurationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatLastShare(worker) {
  const lastShareUnix = Number(worker.lastShare);
  return Number.isFinite(lastShareUnix) && lastShareUnix > 0
    ? new Date(lastShareUnix * 1000).toLocaleString()
    : 'Never';
}

// Builds a Discord embed object for a worker that has gone offline.
export function buildMinerOfflineEmbed(worker, offlineDurationMs) {
  const workerId = worker.workerId || 'Unknown worker';
  const url = dashboardUrl();
  const embed = {
    title: `🚨 Miner Offline: ${workerId}`,
    description: `⛏️ **${workerId}** has gone dark — offline for over **${formatOfflineDuration(offlineDurationMs)}**.\n🔔 You'll get a 🟢 ping the moment it's back to hashing.`,
    color: 0xff5f7a,
    fields: [
      { name: '🔧 Worker', value: workerId, inline: true },
      { name: '⏱️ Offline for', value: formatOfflineDuration(offlineDurationMs), inline: true },
      { name: '🕒 Last share', value: formatLastShare(worker), inline: false },
    ],
    footer: { text: '⚡ XMR Mining Dashboard' },
    timestamp: new Date().toISOString(),
  };
  if (url) embed.url = url;
  return embed;
}

// Builds a Discord embed object for a worker that has come back online.
export function buildMinerBackOnlineEmbed(worker) {
  const workerId = worker.workerId || 'Unknown worker';
  const url = dashboardUrl();
  const embed = {
    title: `✅ Miner Back Online: ${workerId}`,
    description: `🎉 **${workerId}** is back online and submitting shares again. Happy hashing! ⛏️💚`,
    color: 0x3ddc84,
    fields: [{ name: '🔧 Worker', value: workerId, inline: true }],
    footer: { text: '⚡ XMR Mining Dashboard' },
    timestamp: new Date().toISOString(),
  };
  if (url) embed.url = url;
  return embed;
}

// Posts a single embed to a Discord webhook. The webhook URL is passed in (the effective
// one from settings); it falls back to the env var so direct callers still work. Throws on
// failure so the alert loop can leave the alert unmarked and retry next cycle.
export async function sendDiscordEmbed(embed, webhookUrl) {
  const url = (webhookUrl || config.DISCORD_WEBHOOK_URL || '').trim();
  if (!url) {
    throw new Error('No Discord webhook configured');
  }
  if (!isValidDiscordWebhook(url)) {
    throw new Error('Invalid Discord webhook URL');
  }
  await axios.post(
    url,
    { embeds: [embed] },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000, maxRedirects: 0 }
  );
}
