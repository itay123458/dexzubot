import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete a specific amount of messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages (1-100)")
        .setRequired(true),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",
  abuseProtection: { maxAttempts: 5, windowMs: 60_000 },

  async execute(interaction, config, client) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction, {
      flags: MessageFlags.Ephemeral,
    });
    if (!deferSuccess) {
      logger.warn(`Purge interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'purge'
      });
      return;
    }

    const amount = interaction.options.getInteger("amount");
    const channel = interaction.channel;

    if (amount < 1 || amount > 100)
      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Please specify a number between 1 and 100.' });

    try {
      const fetched = await channel.messages.fetch({ limit: amount });
      const bulkDeleteCutoff = Date.now() - (14 * 24 * 60 * 60 * 1000) + 10_000;
      const recentMessages = fetched.filter(message => message.createdTimestamp > bulkDeleteCutoff);
      const olderMessages = fetched.filter(message => message.createdTimestamp <= bulkDeleteCutoff);
      const bulkDeleted = recentMessages.size ? await channel.bulkDelete(recentMessages, true) : new Map();
      let individuallyDeleted = 0;
      let failed = recentMessages.size - bulkDeleted.size;
      for (const message of olderMessages.values()) {
        try {
          await message.delete();
          individuallyDeleted += 1;
        } catch (error) {
          failed += 1;
          logger.warn('Purge could not individually delete an older message', { channelId: channel.id, messageId: message.id, error: error.message });
        }
      }
      const deletedCount = bulkDeleted.size + individuallyDeleted;

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${channel} (${deletedCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Deleted ${deletedCount} messages`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id,
            bulkDeleted: bulkDeleted.size,
            individuallyDeleted,
            failed
          }
        }
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            "Messages Purged",
            `Deleted **${deletedCount}** of **${fetched.size}** fetched messages in ${channel}.` +
              `${individuallyDeleted ? `\n**Older messages deleted individually:** ${individuallyDeleted}` : ''}` +
              `${failed ? `\n**Could not delete:** ${failed} (check permissions or message availability)` : ''}`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });

      setTimeout(() => {
        interaction.deleteReply().catch(err => 
          logger.debug('Failed to auto-delete purge response:', err)
        );
      }, 3000);
    } catch (error) {
      logger.error('Purge command error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Message deletion failed. Check that DexzuBot has **Manage Messages**, **View Channel**, and **Read Message History** permissions in this channel.' });
    }
  }
};
