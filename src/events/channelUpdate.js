import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    try {
      if (!newChannel.guild) return;
      const changes = [];
      if (oldChannel.name !== newChannel.name) changes.push(`**Name:** ${oldChannel.name} → ${newChannel.name}`);
      if (oldChannel.parentId !== newChannel.parentId) changes.push(`**Category:** ${oldChannel.parent?.name || 'None'} → ${newChannel.parent?.name || 'None'}`);
      if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) changes.push(`**Topic:** ${oldChannel.topic || 'None'} → ${newChannel.topic || 'None'}`);
      if ('nsfw' in oldChannel && oldChannel.nsfw !== newChannel.nsfw) changes.push(`**Age restricted:** ${oldChannel.nsfw} → ${newChannel.nsfw}`);
      if ('rateLimitPerUser' in oldChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) changes.push(`**Slowmode:** ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`);
      if (!changes.length) return;
      await logEvent({ client: newChannel.client, guildId: newChannel.guild.id, eventType: EVENT_TYPES.CHANNEL_UPDATE, data: {
        title: 'Channel updated', headline: newChannel.toString(), lines: changes, channelId: newChannel.id, footer: { text: `Channel ID: ${newChannel.id}` },
      } });
    } catch (error) {
      logger.error('Error in channelUpdate event:', error);
    }
  },
};
