import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const HEALTH_KEY_PREFIX = 'dashboardHealth:';
const SNAPSHOT_KEY_PREFIX = 'dashboardConfigSnapshots:';
const MAX_SNAPSHOTS = 10;

const healthKey = guildId => `${HEALTH_KEY_PREFIX}${guildId}`;
const snapshotKey = guildId => `${SNAPSHOT_KEY_PREFIX}${guildId}`;

function channelPermissionCheck(channel, member, required) {
  if (!channel) return { ok: false, detail: 'Channel is not configured or no longer exists.' };
  const permissions = channel.permissionsFor(member);
  const missing = required.filter(permission => !permissions?.has(permission.flag)).map(permission => permission.name);
  return { ok: missing.length === 0, detail: missing.length ? `Missing: ${missing.join(', ')}` : 'Ready' };
}

export async function inspectGuildOperations(client, guild) {
  const config = await getGuildConfig(client, guild.id);
  const botMember = guild.members.me;
  const checks = [];
  const add = (key, label, result) => checks.push({ key, label, ...result });
  add('discord', 'Discord connection', { ok: client.isReady(), detail: client.isReady() ? 'Connected' : 'Disconnected' });
  const dbStatus = client.db?.getStatus?.() || {};
  add('database', 'Persistent database', { ok: dbStatus.isAvailable === true && dbStatus.isDegraded !== true, detail: dbStatus.isDegraded ? 'Degraded mode' : (dbStatus.connectionType || 'Connected') });
  add('moderation', 'Moderation permissions', {
    ok: botMember?.permissions.has([PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages]) === true,
    detail: 'Ban, kick, timeout, and message management',
  });
  add('roles', 'Role management', { ok: botMember?.permissions.has(PermissionFlagsBits.ManageRoles) === true, detail: 'Required for level and staff roles' });
  const sendRequirements = [
    { flag: PermissionFlagsBits.ViewChannel, name: 'View Channel' },
    { flag: PermissionFlagsBits.SendMessages, name: 'Send Messages' },
    { flag: PermissionFlagsBits.EmbedLinks, name: 'Embed Links' },
  ];
  for (const [key, label, channelId] of [
    ['moderationLogs', 'Moderation log channel', config.logging?.channels?.moderation],
    ['serverLogs', 'Server log channel', config.logging?.channels?.server],
    ['youtube', 'YouTube alert channel', config.youtubeAlert?.channelId],
    ['leveling', 'Level-up channel', config.leveling?.levelUpChannel],
  ]) {
    if (!channelId) {
      add(key, label, { ok: false, warning: true, detail: 'Not configured' });
      continue;
    }
    add(key, label, channelPermissionCheck(guild.channels.cache.get(channelId), botMember, sendRequirements));
  }
  const result = {
    checkedAt: new Date().toISOString(),
    healthy: checks.every(check => check.ok || check.warning),
    failed: checks.filter(check => !check.ok && !check.warning).length,
    warnings: checks.filter(check => check.warning).length,
    checks,
  };
  await client.db.set(healthKey(guild.id), result);
  return result;
}

export async function getOperationsHealth(client, guild) {
  return (await client.db.get(healthKey(guild.id))) || inspectGuildOperations(client, guild);
}

export async function createConfigSnapshot(client, guildId, actorId = 'dashboard') {
  const config = await getGuildConfig(client, guildId);
  const snapshots = await listConfigSnapshots(client, guildId);
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    createdBy: actorId || 'dashboard',
    config,
  };
  await client.db.set(snapshotKey(guildId), [snapshot, ...snapshots].slice(0, MAX_SNAPSHOTS));
  return { id: snapshot.id, createdAt: snapshot.createdAt, createdBy: snapshot.createdBy };
}

export async function listConfigSnapshots(client, guildId) {
  const stored = await client.db.get(snapshotKey(guildId));
  return Array.isArray(stored) ? stored : [];
}

export async function restoreConfigSnapshot(client, guildId, snapshotId) {
  const snapshot = (await listConfigSnapshots(client, guildId)).find(item => item.id === snapshotId);
  if (!snapshot?.config) throw new Error('That configuration snapshot was not found.');
  await setGuildConfig(client, guildId, snapshot.config, { source: 'dashboard.snapshot.restore' });
  return { id: snapshot.id, createdAt: snapshot.createdAt };
}

export async function exportGuildConfiguration(client, guildId) {
  const config = await getGuildConfig(client, guildId);
  return { product: 'DexzuBot', version: 1, guildId, exportedAt: new Date().toISOString(), config };
}

export function initializeOperationsHealthChecks(client) {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      await inspectGuildOperations(client, guild).catch(error => logger.warn('[OPERATIONS_HEALTH] Check failed', { guildId: guild.id, error: error.message }));
    }
  };
  void run();
  const timer = setInterval(() => void run(), 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}
