import { PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../config/bot.js';
import { getGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const PROMOTION_PATTERN = /(?:https?:\/\/|www\.|discord(?:app)?\.com\/invite\/|discord\.gg\/|(?:[a-z0-9-]+\.)+(?:com|net|org|gg|io|co|tv|me)\b)/i;
const spamWindows = new Map();

function memberBypassesAntiPromo(message) {
  return message.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
}

function containsProtectedPing(message, protectedUserIds) {
  return protectedUserIds.some(userId => message.mentions.users.has(userId));
}

function exceedsSpamLimit(message, settings) {
  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const intervalMs = (settings.spamIntervalSeconds || 8) * 1000;
  const recent = (spamWindows.get(key) || []).filter(timestamp => now - timestamp < intervalMs);
  recent.push(now);
  spamWindows.set(key, recent);
  return recent.length > (settings.spamMaxMessages || 5);
}

function mentionCount(message) {
  return message.mentions.users.size + message.mentions.roles.size;
}

async function rejectMessage(message, reason) {
  const deleted = await message.delete().then(() => true).catch(() => false);
  if (!deleted) {
    logger.warn('[AUTO_MODERATION] Could not delete blocked message', {
      guildId: message.guild.id,
      channelId: message.channel.id,
      userId: message.author.id,
      reason,
    });
    return true;
  }

  const warning = await message.channel.send(`<@${message.author.id}>, ${reason}`).catch(() => null);
  if (warning) {
    setTimeout(() => warning.delete().catch(() => {}), 5000);
  }

  logger.info('[AUTO_MODERATION] Message removed', {
    guildId: message.guild.id,
    channelId: message.channel.id,
    userId: message.author.id,
    reason,
  });
  return true;
}

export async function handleAutoModeration(message, client) {
  if (isBotOwner(message.author.id)) return false;

  const config = await getGuildConfig(client, message.guild.id);
  const settings = config.autoModeration || {};
  const promotionAllowed = (settings.promoAllowedChannelIds || []).includes(message.channel.id);
  const bypassesFilters = memberBypassesAntiPromo(message);

  if (settings.antiSpam && !bypassesFilters && exceedsSpamLimit(message, settings)) {
    return rejectMessage(message, `slow down — no more than ${settings.spamMaxMessages || 5} messages every ${settings.spamIntervalSeconds || 8} seconds.`);
  }

  if (settings.antiMassMentions && !bypassesFilters && mentionCount(message) > (settings.maxMentions || 5)) {
    return rejectMessage(message, `messages may contain at most ${settings.maxMentions || 5} mentions.`);
  }

  if (settings.antiPromo
    && !promotionAllowed
    && !bypassesFilters
    && PROMOTION_PATTERN.test(message.content)) {
    return rejectMessage(message, 'promotional links and server invites are not allowed here.');
  }

  const protectedUserIds = settings.antiPingUserIds || [];
  if (settings.antiPing && containsProtectedPing(message, protectedUserIds)) {
    return rejectMessage(message, 'that bot owner has anti-ping protection enabled.');
  }

  return false;
}
