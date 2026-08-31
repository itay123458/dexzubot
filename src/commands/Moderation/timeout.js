import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { formatModerationDuration, parseModerationDuration } from '../../utils/moderationDuration.js';
import { sendModerationReasonDm } from '../../utils/moderationDm.js';

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a user for a specific duration.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to timeout")
                .setRequired(true),
        )
        .addStringOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Duration: 1s, 5m, 2h, 7d, or 4w (maximum 28 days)")
                    .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the timeout").setMaxLength(1000),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Timeout interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'timeout',
            });
            return;
        }

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const durationInput = interaction.options.getString("duration");
        const providedReason = interaction.options.getString("reason")?.trim() || null;
        const reason = providedReason || "No reason provided";

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to timeout.',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Cannot timeout self",
                ErrorTypes.VALIDATION,
                "You cannot timeout yourself.",
            );
        }
        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Cannot timeout bot",
                ErrorTypes.VALIDATION,
                "You cannot timeout the bot.",
            );
        }
        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "The target user is not currently in this server.",
            );
        }

        const durationMs = parseModerationDuration(durationInput);
        if (!durationMs) {
            throw new TitanBotError(
                'Invalid timeout duration',
                ErrorTypes.USER_INPUT,
                'Use a duration such as `1s`, `5m`, `2h`, `7d`, or `4w`. The maximum is 28 days.',
            );
        }

        const durationDisplay = formatModerationDuration(durationMs);
        const result = await ModerationService.timeoutUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            durationMs,
            reason,
            beforeAction: providedReason
                ? () => sendModerationReasonDm({
                    user: targetUser,
                    guild: interaction.guild,
                    action: 'Timeout',
                    reason: providedReason,
                    duration: durationDisplay,
                })
                : null,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `⏳ **Timed out** ${targetUser.tag} for ${durationDisplay}.`,
                    `**Reason:** ${reason}\n**Case ID:** #${result.caseId}${providedReason ? `\n**DM:** ${result.dmSent ? 'Delivered' : 'Could not deliver'}` : ''}`,
                ),
            ],
        });
    },
};
