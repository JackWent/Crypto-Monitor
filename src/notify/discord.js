import axios from 'axios';
import * as config from '../config.js';

// Discord delivery for miner offline / back-online alerts. The webhook URL is a
// secret and is read from the environment (DISCORD_WEBHOOK_URL) only — never
// hardcode it. When no webhook is set the app falls back to email (see offlineAlert.js).

export function isDiscordConfigured() {
  return Boolean(config.DISCORD_WEBHOOK_URL);
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
    title: `🔴 Miner Offline: ${workerId}`,
    description: `**${workerId}** has been offline for over **${formatOfflineDuration(offlineDurationMs)}**. You'll get another alert when it's back.`,
    color: 0xff5f7a,
    fields: [
      { name: 'Worker', value: workerId, inline: true },
      { name: 'Offline for', value: formatOfflineDuration(offlineDurationMs), inline: true },
      { name: 'Last share', value: formatLastShare(worker), inline: false },
    ],
    footer: { text: 'XMR Mining Dashboard' },
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
    title: `🟢 Miner Back Online: ${workerId}`,
    description: `**${workerId}** is back online and submitting shares again.`,
    color: 0x3ddc84,
    fields: [{ name: 'Worker', value: workerId, inline: true }],
    footer: { text: 'XMR Mining Dashboard' },
    timestamp: new Date().toISOString(),
  };
  if (url) embed.url = url;
  return embed;
}

// Posts a single embed to the configured Discord webhook. Throws on failure so
// callers (the alert loop) can leave the alert unmarked and retry next cycle.
export async function sendDiscordEmbed(embed) {
  if (!config.DISCORD_WEBHOOK_URL) {
    throw new Error('DISCORD_WEBHOOK_URL is not configured');
  }
  await axios.post(
    config.DISCORD_WEBHOOK_URL,
    { embeds: [embed] },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );
}
