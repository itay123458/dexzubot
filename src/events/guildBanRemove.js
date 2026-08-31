import { Events } from 'discord.js';
import { consumeBotModerationAction, logEvent, EVENT_TYPES } from '../services/loggingService.js';

export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    if (consumeBotModerationAction(ban.guild.id, 'unban', ban.user.id)) return;
    await logEvent({ client: ban.client, guildId: ban.guild.id, eventType: EVENT_TYPES.MODERATION_UNBAN, data: {
      title: 'Member unbanned',
      author: { name: `@${ban.user.username}`, iconURL: ban.user.displayAvatarURL({ dynamic: true }) },
      lines: [`**User:** ${ban.user.toString()}`], userId: ban.user.id, footer: { text: `User ID: ${ban.user.id}` },
    } });
  },
};
