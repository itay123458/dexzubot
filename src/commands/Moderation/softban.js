import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sendModerationReasonDm } from '../../utils/moderationDm.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { formatModerationDuration, parseModerationDuration } from '../../utils/moderationDuration.js';
import { findSoftbanInviteChannel } from '../../services/moderation/timedSoftbanService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Temporarily ban a member, then unban and send them a return invite')
    .addUserOption(option => option
      .setName('target')
      .setDescription('Member to softban')
      .setRequired(true))
    .addStringOption(option => option
      .setName('duration')
      .setDescription('Duration: 1s, 5m, 2h, 7d, or 4w (maximum 28 days)')
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
    const durationInput = interaction.options.getString('duration');
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

    const durationMs = parseModerationDuration(durationInput);
    if (!durationMs) {
      throw new TitanBotError('Invalid softban duration', ErrorTypes.USER_INPUT, 'Use a duration such as `1s`, `5m`, `2h`, `7d`, or `4w`. The maximum is 28 days.');
    }
    const durationDisplay = formatModerationDuration(durationMs);
    const inviteChannel = findSoftbanInviteChannel(interaction.guild, interaction.channel);
    if (!inviteChannel) {
      throw new TitanBotError('No invite channel available', ErrorTypes.PERMISSION, 'I need **Create Invite** and **View Channel** permissions in at least one server text channel before I can create a timed softban.');
    }

    const result = await ModerationService.softbanUser({
      guild: interaction.guild,
      member,
      moderator: interaction.member,
      durationMs,
      inviteChannelId: inviteChannel.id,
      reason,
      beforeAction: providedReason
        ? () => sendModerationReasonDm({
          user: targetUser,
          guild: interaction.guild,
          action: 'Softban',
          reason: providedReason,
          duration: durationDisplay,
        })
        : null,
    });

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed(
        `Softbanned ${targetUser.tag}`,
        `**Duration:** ${durationDisplay}\n**Reason:** ${reason}\n**Messages removed:** Last 7 days\n**Expires:** <t:${Math.floor((Date.now() + durationMs) / 1000)}:R>\n**Return:** The member will be unbanned and sent a one-use invite.\n**Case ID:** #${result.caseId}${providedReason ? `\n**DM:** ${result.dmSent ? 'Delivered' : 'Could not deliver'}` : ''}`,
      )],
    });
  },
};
