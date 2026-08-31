import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildUpdate,
  async execute(oldGuild, newGuild) {
    try {
      const changes = [];
      if (oldGuild.name !== newGuild.name) changes.push(`**Name:** ${oldGuild.name} → ${newGuild.name}`);
      if (oldGuild.description !== newGuild.description) changes.push(`**Description:** ${oldGuild.description || 'None'} → ${newGuild.description || 'None'}`);
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push(`**Verification level:** ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
      if (oldGuild.afkChannelId !== newGuild.afkChannelId) changes.push(`**AFK channel:** ${oldGuild.afkChannel?.toString() || 'None'} → ${newGuild.afkChannel?.toString() || 'None'}`);
      if (!changes.length) return;
      await logEvent({ client: newGuild.client, guildId: newGuild.id, eventType: EVENT_TYPES.GUILD_UPDATE, data: {
        title: 'Server settings updated', lines: changes, thumbnail: newGuild.iconURL({ size: 256 }), footer: { text: `Server ID: ${newGuild.id}` },
      } });
    } catch (error) {
      logger.error('Error in guildUpdate event:', error);
    }
  },
};
