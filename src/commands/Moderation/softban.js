import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sendModerationReasonDm } from '../../utils/moderationDm.js';
import { ModerationService } from '../../services/moderation/moderationService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban and immediately unban a member to remove recent messages')
    .addUserOption(option => option
      .setName('target')
      .setDescription('Member to softban')
      .setRequired(true))
    .addStringOption(option => option
      .setName('reason')
      .setDescription('Reason for the softban')
      .setMaxLength(1000))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  category: 'moderation',

  async execute(interaction, config, client) {
    const deferred = await InteractionHelper.safeDefer(interaction);
    if (!deferred) return;
    const targetUser = interaction.options.getUser('target');
    const member = interaction.options.getMember('target');
    const providedReason = interaction.options.getString('reason')?.trim() || null;
    const reason = providedReason || 'No reason provided';

    if (!targetUser || !member) {
      throw new TitanBotError('Target not found', ErrorTypes.USER_INPUT, 'The target must currently be in this server.');
    }
    if (targetUser.id === interaction.user.id) {
      throw new TitanBotError('Cannot softban self', ErrorTypes.VALIDATION, 'You cannot softban yourself.');
    }
    if (targetUser.id === client.user.id) {
      throw new TitanBotError('Cannot softban bot', ErrorTypes.VALIDATION, 'You cannot softban the bot.');
    }

    const result = await ModerationService.softbanUser({
      guild: interaction.guild,
      member,
      moderator: interaction.member,
      reason,
      beforeAction: providedReason
        ? () => sendModerationReasonDm({
          user: targetUser,
          guild: interaction.guild,
          action: 'Softban',
          reason: providedReason,
        })
        : null,
    });

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed(
        `Softbanned ${targetUser.tag}`,
        `**Reason:** ${reason}\n**Messages removed:** Last 7 days\n**Case ID:** #${result.caseId}${providedReason ? `\n**DM:** ${result.dmSent ? 'Delivered' : 'Could not deliver'}` : ''}`,
      )],
    });
  },
};
