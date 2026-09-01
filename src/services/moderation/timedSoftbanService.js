import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { markBotModerationAction } from '../loggingService.js';

const KEY_PREFIX = 'temp:timed-softbans:';
const MAX_TIMER_DELAY = 2_000_000_000;
const RETRY_DELAY = 5 * 60 * 1000;
const timers = new Map();

const recordKey = guildId => `${KEY_PREFIX}${guildId}`;
const timerKey = (guildId, userId) => `${guildId}:${userId}`;

async function getRecords(client, guildId) {
  const records = await client.db.get(recordKey(guildId), []);
  return Array.isArray(records) ? records : [];
}

async function saveRecords(client, guildId, records) {
  if (records.length) await client.db.set(recordKey(guildId), records);
  else await client.db.delete(recordKey(guildId));
}

function canCreateInvite(channel, guild) {
  if (!channel?.isTextBased?.() || channel.isThread?.()) return false;
  const permissions = channel.permissionsFor(guild.members.me);
  return permissions?.has(PermissionFlagsBits.ViewChannel)
    && permissions.has(PermissionFlagsBits.CreateInstantInvite);
}

export function findSoftbanInviteChannel(guild, preferredChannel = null) {
  if (canCreateInvite(preferredChannel, guild)) return preferredChannel;
  if (canCreateInvite(guild.systemChannel, guild)) return guild.systemChannel;
  return guild.channels.cache.find(channel => canCreateInvite(channel, guild)) || null;
}

async function removeRecord(client, guildId, userId) {
  const records = await getRecords(client, guildId);
  await saveRecords(client, guildId, records.filter(record => record.userId !== userId));
  const key = timerKey(guildId, userId);
  clearTimeout(timers.get(key));
  timers.delete(key);
}

async function completeTimedSoftban(client, record) {
  const guild = client.guilds.cache.get(record.guildId)
    || await client.guilds.fetch(record.guildId).catch(() => null);
  if (!guild) throw new Error(`Guild ${record.guildId} is unavailable`);

  try {
    markBotModerationAction(guild.id, 'unban', record.userId);
    await guild.members.unban(record.userId, `Timed softban expired: ${record.reason}`);
  } catch (error) {
    if (error.code !== 10026) throw error;
  }

  const configuredChannel = await guild.channels.fetch(record.inviteChannelId).catch(() => null);
  const inviteChannel = findSoftbanInviteChannel(guild, configuredChannel);
  let inviteUrl = null;
  if (inviteChannel) {
    const invite = await inviteChannel.createInvite({
      maxAge: 7 * 24 * 60 * 60,
      maxUses: 1,
      unique: true,
      reason: `Return invite after timed softban for ${record.userId}`,
    }).catch(error => {
      logger.warn('[TIMED_SOFTBAN] Could not create return invite', { guildId: guild.id, userId: record.userId, error: error.message });
      return null;
    });
    inviteUrl = invite?.url || null;
  }

  const user = await client.users.fetch(record.userId).catch(() => null);
  if (user) {
    const content = inviteUrl
      ? `Your timed ban from **${guild.name}** has ended. You may rejoin using this one-use invite:\n${inviteUrl}`
      : `Your timed ban from **${guild.name}** has ended, but I could not create a return invite. Please contact the server staff.`;
    await user.send({ content }).catch(error => logger.debug(`[TIMED_SOFTBAN] Could not DM ${record.userId}: ${error.message}`));
  }

  await removeRecord(client, record.guildId, record.userId);
  logger.info('[TIMED_SOFTBAN] Completed', { guildId: guild.id, userId: record.userId, inviteCreated: Boolean(inviteUrl) });
}

function scheduleRecord(client, record) {
  const key = timerKey(record.guildId, record.userId);
  clearTimeout(timers.get(key));
  const remaining = new Date(record.expiresAt).getTime() - Date.now();
  const delay = Math.max(0, Math.min(remaining, MAX_TIMER_DELAY));
  const timer = setTimeout(async () => {
    if (remaining > MAX_TIMER_DELAY) {
      scheduleRecord(client, record);
      return;
    }
    try {
      await completeTimedSoftban(client, record);
    } catch (error) {
      logger.error('[TIMED_SOFTBAN] Completion failed; retrying', { guildId: record.guildId, userId: record.userId, error: error.message });
      const retryRecord = { ...record, expiresAt: new Date(Date.now() + RETRY_DELAY).toISOString() };
      await scheduleTimedSoftban(client, retryRecord).catch(saveError => {
        logger.error('[TIMED_SOFTBAN] Could not persist retry', { guildId: record.guildId, userId: record.userId, error: saveError.message });
        scheduleRecord(client, retryRecord);
      });
    }
  }, delay);
  timer.unref?.();
  timers.set(key, timer);
}

export async function scheduleTimedSoftban(client, record) {
  const records = await getRecords(client, record.guildId);
  const updated = [...records.filter(item => item.userId !== record.userId), record];
  await saveRecords(client, record.guildId, updated);
  scheduleRecord(client, record);
}

export async function initializeTimedSoftbans(client) {
  let scheduled = 0;
  for (const guild of client.guilds.cache.values()) {
    const records = await getRecords(client, guild.id);
    for (const record of records) {
      if (!record?.userId || !record?.expiresAt) continue;
      scheduleRecord(client, record);
      scheduled += 1;
    }
  }
  logger.info('[TIMED_SOFTBAN] Scheduler restored', { scheduled });
  return scheduled;
}
