import config from '../config/application.js';
import { logger } from '../utils/logger.js';
import { GatewayOpcodes } from 'discord.js';

function getFallbackPresence(client) {
  const guildName = client.guilds?.cache?.first?.()?.name;
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

  const activity = {
    name: 'Custom Status',
    state: mirroredActivity.text,
    type: 4,
  };

  client.user.setPresence({
    status: config.bot.presence.status,
    activities: [activity],
  });

  if (mirroredActivity.emoji) {
    client.ws.broadcast({
      op: GatewayOpcodes.PresenceUpdate,
      d: {
        since: null,
        status: config.bot.presence.status,
        afk: false,
        activities: [{
          ...activity,
          emoji: mirroredActivity.emoji,
        }],
      },
    });
  }

  return true;
}

export async function initializePresenceMirror(client) {
  const mirrorUserId = config.bot.presence.mirrorUserId;

  for (const guild of client.guilds.cache.values()) {
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

  applyMirroredPresence(client, null);
}
