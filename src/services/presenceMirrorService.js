import config from '../config/application.js';
import { logger } from '../utils/logger.js';

function getActivityText(presence) {
  const activities = presence?.activities || [];
  const customStatus = activities.find((activity) => activity.type === 4 && activity.state);

  if (customStatus) {
    return customStatus.state;
  }

  const activity = activities.find((item) => item.details || item.name);
  return activity?.details || activity?.name || null;
}

export function applyMirroredPresence(client, presence) {
  const activityText = getActivityText(presence);

  if (!activityText) {
    client.user.setPresence(config.bot.presence);
    return false;
  }

  client.user.setPresence({
    status: config.bot.presence.status,
    activities: [{
      name: 'Custom Status',
      state: activityText,
      type: 4,
    }],
  });

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
