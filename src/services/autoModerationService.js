import { PermissionFlagsBits } from 'discord.js';
import { isBotOwner } from '../config/bot.js';
import { getGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

const PROMOTION_PATTERN = /(?:https?:\/\/|www\.|discord(?:app)?\.com\/invite\/|discord\.gg\/|(?:[a-z0-9-]+\.)+(?:com|net|org|gg|io|co|tv|me)\b)/i;

function memberBypassesAutoModeration(message) {
  return isBotOwner(message.author.id)
    || message.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
}

function containsPing(message) {
  return message.mentions.everyone
    || message.mentions.users.size > 0
    || message.mentions.roles.size > 0;
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
  if (memberBypassesAutoModeration(message)) return false;

  const config = await getGuildConfig(client, message.guild.id);
  const settings = config.autoModeration || {};

  if (settings.antiPromo && PROMOTION_PATTERN.test(message.content)) {
    return rejectMessage(message, 'promotional links and server invites are not allowed here.');
  }

  if (settings.antiPing && containsPing(message)) {
    return rejectMessage(message, 'pinging users, roles, `@everyone`, or `@here` is not allowed here.');
  }

  return false;
}
