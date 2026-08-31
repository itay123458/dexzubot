import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ChannelCreate,
  async execute(channel) {
    try {
      if (!channel.guild) return;
      await logEvent({ client: channel.client, guildId: channel.guild.id, eventType: EVENT_TYPES.CHANNEL_CREATE, data: {
        title: 'Channel created', lines: [`**Channel:** ${channel.toString()}`, `**Name:** ${channel.name}`, `**Type:** ${String(channel.type)}`], footer: { text: `Channel ID: ${channel.id}` },
      } });
    } catch (error) {
      logger.error('Error in channelCreate event:', error);
    }
  },
};
