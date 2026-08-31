import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';

export default {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    const authors = new Set(messages.map(message => message.author?.id).filter(Boolean));
    await logEvent({ client: channel.client, guildId: channel.guild.id, eventType: EVENT_TYPES.MESSAGE_BULK_DELETE, data: {
      title: `Messages bulk deleted in #${channel.name}`,
      lines: [`**Messages:** ${messages.size}`, `**Known authors:** ${authors.size}`, `**Channel:** ${channel.toString()}`],
      channelId: channel.id,
      footer: { text: `Channel ID: ${channel.id}` },
    } });
  },
};
