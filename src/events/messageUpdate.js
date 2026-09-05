import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { invalidateEditedCount } from '../services/countingGameService.js';
import { getExpectedCountValue } from '../services/countingGameService.js';

const MAX_LOGGED_EDIT_CONTENT_LENGTH = 512;

export default {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    try {
      if (!newMessage.guild || newMessage.author?.bot) return;

      if (oldMessage.content === newMessage.content) return;

      const editedCount = await invalidateEditedCount(newMessage.client, newMessage.guild.id, newMessage.id, newMessage.content);
      if (editedCount) {
        await newMessage.react('❌').catch(error => logger.warn('Failed to react to an edited counting message:', {
          guildId: newMessage.guild.id,
          channelId: newMessage.channel.id,
          messageId: newMessage.id,
          error: error.message,
        }));
        const nextNumber = getExpectedCountValue(editedCount.config);
        const resultText = editedCount.action === 'reset'
          ? 'The sequence has been reset to **1**.'
          : `The sequence was kept. The next number is **${nextNumber}**.`;
        await newMessage.channel.send(`❌ <@${newMessage.author.id}> edited an accepted counting message. ${resultText}`).catch(() => {});
        await logEvent({
          client: newMessage.client,
          guildId: newMessage.guild.id,
          eventType: EVENT_TYPES.COUNTING_FAILURE,
          data: {
            title: 'Counting message edited',
            lines: [`${newMessage.author.tag} edited the accepted count ${editedCount.accepted.count} in #${newMessage.channel.name}. Action: ${editedCount.action}.`],
            userId: newMessage.author.id,
            channelId: newMessage.channel.id,
          },
        });
      }

      const metaLines = [
        formatLogLine('Channel', newMessage.channel ? `${newMessage.channel.name} ${newMessage.channel.toString()}` : 'Unknown'),
        formatLogLine('Message ID', `\`${newMessage.id}\``),
        formatLogLine('Message author', newMessage.author ? newMessage.author.toString() : 'Unknown'),
        formatLogLine('Message created', `<t:${Math.floor(newMessage.createdTimestamp / 1000)}:R>`),
      ];

      const oldContent = oldMessage.content || '*(empty message)*';
      const newContent = newMessage.content || '*(empty message)*';
      const oldContentTruncated = oldContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${oldContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : oldContent;
      const newContentTruncated = newContent.length > MAX_LOGGED_EDIT_CONTENT_LENGTH
        ? `${newContent.substring(0, MAX_LOGGED_EDIT_CONTENT_LENGTH - 3)}...`
        : newContent;

      await logEvent({
        client: newMessage.client,
        guildId: newMessage.guild.id,
        eventType: EVENT_TYPES.MESSAGE_EDIT,
        data: {
          title: `Message edited in #${newMessage.channel?.name || 'unknown-channel'}`,
          author: newMessage.author ? {
            name: `@${newMessage.author.username}`,
            iconURL: newMessage.author.displayAvatarURL({ dynamic: true }),
          } : null,
          lines: metaLines,
          quoted: true,
          fields: [
            { name: 'Before', value: oldContentTruncated, inline: true },
            { name: 'After', value: newContentTruncated, inline: true },
          ],
          userId: newMessage.author?.id,
          channelId: newMessage.channel.id,
          footer: { text: `User ID: ${newMessage.author?.id || 'Unknown'} • Jump: ${newMessage.url}` },
        }
      });

    } catch (error) {
      logger.error('Error in messageUpdate event:', error);
    }
  }
};
