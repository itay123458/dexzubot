import config from '../config/application.js';
import { logger } from '../utils/logger.js';

function getFallbackPresence(client) {
  const mirrorGuildId = config.bot.presence.mirrorGuildId;
  const guildName = mirrorGuildId
    ? client.guilds?.cache?.get?.(mirrorGuildId)?.name
    : client.guilds?.cache?.first?.()?.name;
  return {
    status: config.bot.presence.status,
    activities: [{
      name: 'Custom Status',
      state: guildName ? `Helping out in ${guildName}` : 'Ready to help',
      type: 4,
    }],
  };
}

function getMirroredActivity(presence) {
  const activities = presence?.activities || [];
  const customStatus = activities.find((activity) => activity.type === 4 && activity.state);

  if (customStatus) {
    return {
      text: customStatus.state,
      emoji: customStatus.emoji ? {
        name: customStatus.emoji.name,
        ...(customStatus.emoji.id ? { id: customStatus.emoji.id } : {}),
        ...(customStatus.emoji.animated != null ? { animated: customStatus.emoji.animated } : {}),
      } : null,
    };
  }

  const activity = activities.find((item) => item.details || item.name);
  const text = activity?.details || activity?.name || null;
  return text ? { text, emoji: null } : null;
}

export function applyMirroredPresence(client, presence) {
  const mirroredActivity = getMirroredActivity(presence);

  if (!mirroredActivity) {
    client.user.setPresence(getFallbackPresence(client));
    return false;
  }

  const unicodeEmoji = mirroredActivity.emoji && !mirroredActivity.emoji.id
    ? mirroredActivity.emoji.name
    : null;
  const activity = {
    name: 'Custom Status',
    state: unicodeEmoji
      ? `${unicodeEmoji} ${mirroredActivity.text}`
      : mirroredActivity.text,
    type: 4,
  };

  client.user.setPresence({
    status: config.bot.presence.status,
    activities: [activity],
  });

  return true;
}

export async function initializePresenceMirror(client) {
  const mirrorUserId = config.bot.presence.mirrorUserId;
  const mirrorGuildId = config.bot.presence.mirrorGuildId;
  const mirrorGuild = mirrorGuildId ? client.guilds.cache.get(mirrorGuildId) : null;
  const guilds = mirrorGuild
    ? [mirrorGuild]
    : (mirrorGuildId ? [] : [...client.guilds.cache.values()]);

  for (const guild of guilds) {
    try {
      const member = await guild.members.fetch({ user: mirrorUserId, withPresences: true });
      if (applyMirroredPresence(client, member.presence)) {
        logger.info(`Mirroring Discord activity for user ${mirrorUserId}.`);
        return;
      }
    } catch (error) {
      logger.debug(`Could not fetch mirrored presence in guild ${guild.id}: ${error.message}`);
    }
  }

  if (mirrorGuildId && !mirrorGuild) {
    logger.warn(`Presence mirror server ${mirrorGuildId} is not available to the bot.`);
  }

  applyMirroredPresence(client, null);
}
