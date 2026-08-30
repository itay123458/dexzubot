import { PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../config/bot.js';
import { getGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const PROMOTION_PATTERN = /(?:https?:\/\/|www\.|discord(?:app)?\.com\/invite\/|discord\.gg\/|(?:[a-z0-9-]+\.)+(?:com|net|org|gg|io|co|tv|me)\b)/i;

function memberBypassesAntiPromo(message) {
  return message.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
}

function containsProtectedPing(message, protectedUserIds) {
  return protectedUserIds.some(userId => message.mentions.users.has(userId));
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

  if (settings.antiPromo
    && !promotionAllowed
    && !memberBypassesAntiPromo(message)
    && PROMOTION_PATTERN.test(message.content)) {
    return rejectMessage(message, 'promotional links and server invites are not allowed here.');
  }

  const protectedUserIds = settings.antiPingUserIds || [];
  if (settings.antiPing && containsProtectedPing(message, protectedUserIds)) {
    return rejectMessage(message, 'that bot owner has anti-ping protection enabled.');
  }

  return false;
}
