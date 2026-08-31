import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    try {
      const changes = [];
      if (oldRole.name !== newRole.name) changes.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
      if (oldRole.hexColor !== newRole.hexColor) changes.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
      if (oldRole.hoist !== newRole.hoist) changes.push(`**Displayed separately:** ${oldRole.hoist} → ${newRole.hoist}`);
      if (oldRole.mentionable !== newRole.mentionable) changes.push(`**Mentionable:** ${oldRole.mentionable} → ${newRole.mentionable}`);
      if (!oldRole.permissions.equals(newRole.permissions)) {
        const added = newRole.permissions.toArray().filter(permission => !oldRole.permissions.has(permission));
        const removed = oldRole.permissions.toArray().filter(permission => !newRole.permissions.has(permission));
        if (added.length) changes.push(`**Permissions added:** ${added.join(', ')}`);
        if (removed.length) changes.push(`**Permissions removed:** ${removed.join(', ')}`);
      }
      if (!changes.length) return;
      await logEvent({ client: newRole.client, guildId: newRole.guild.id, eventType: EVENT_TYPES.ROLE_UPDATE, data: {
        title: 'Role updated', headline: newRole.toString(), lines: changes, footer: { text: `Role ID: ${newRole.id}` },
      } });
    } catch (error) {
      logger.error('Error in roleUpdate event:', error);
    }
  },
};
