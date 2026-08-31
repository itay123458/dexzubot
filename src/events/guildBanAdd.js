import { Events } from 'discord.js';
import { consumeBotModerationAction, logEvent, EVENT_TYPES } from '../services/loggingService.js';

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    if (consumeBotModerationAction(ban.guild.id, 'ban', ban.user.id)) return;
    await logEvent({ client: ban.client, guildId: ban.guild.id, eventType: EVENT_TYPES.MODERATION_BAN, data: {
      title: 'Member banned',
      author: { name: `@${ban.user.username}`, iconURL: ban.user.displayAvatarURL({ dynamic: true }) },
      lines: [`**User:** ${ban.user.toString()}`, `**Reason:** ${ban.reason || 'No reason provided'}`],
      userId: ban.user.id,
      footer: { text: `User ID: ${ban.user.id}` },
    } });
  },
};
