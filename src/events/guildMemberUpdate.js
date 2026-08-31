import { Events } from 'discord.js';
import { consumeBotModerationAction, logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      if (oldMember.nickname !== newMember.nickname) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            title: 'Nickname changed',
            lines: [
              `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
              `**ID:** \`${newMember.user.id}\``,
              `**Before:** ${oldMember.nickname || '*(no nickname)*'}`,
              `**After:** ${newMember.nickname || '*(no nickname)*'}`,
            ],
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
            userId: newMember.user.id,
          }
        });

      }

      const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));
      if (addedRoles.size || removedRoles.size) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_ROLE_UPDATE,
          data: {
            title: 'Member roles updated',
            author: { name: `@${newMember.user.username}`, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) },
            lines: [
              addedRoles.size ? `**Added:** ${addedRoles.map(role => role.toString()).join(', ')}` : null,
              removedRoles.size ? `**Removed:** ${removedRoles.map(role => `**${role.name}**`).join(', ')}` : null,
            ].filter(Boolean),
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
            userId: newMember.id,
            footer: { text: `User ID: ${newMember.id}` },
          },
        });
      }

      const oldTimeout = oldMember.communicationDisabledUntilTimestamp || null;
      const newTimeout = newMember.communicationDisabledUntilTimestamp || null;
      if (oldTimeout !== newTimeout) {
        const action = newTimeout ? 'timeout' : 'untimeout';
        if (consumeBotModerationAction(newMember.guild.id, action, newMember.id)) return;
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_TIMEOUT_UPDATE,
          data: {
            title: newTimeout ? 'Member timeout applied or changed' : 'Member timeout removed',
            lines: [
              `**User:** ${newMember.user.toString()}`,
              `**Before:** ${oldTimeout ? `<t:${Math.floor(oldTimeout / 1000)}:F>` : 'Not timed out'}`,
              `**After:** ${newTimeout ? `<t:${Math.floor(newTimeout / 1000)}:F>` : 'Not timed out'}`,
            ],
            thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
            userId: newMember.id,
          },
        });
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};
