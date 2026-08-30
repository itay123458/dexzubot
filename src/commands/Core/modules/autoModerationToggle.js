import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { patchGuildConfig } from '../../../services/config/guildConfig.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export function createAutoModerationToggle({ name, settingKey, label, description }) {
  return {
    slashOnly: true,
    ownerOnly: true,
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(`${description} (owner only)`)
      .setDMPermission(false)
      .addBooleanOption(option => option
        .setName('enabled')
        .setDescription(`Enable or disable ${label}`)
        .setRequired(true)),

    async execute(interaction, guildConfig, client) {
      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      const enabled = interaction.options.getBoolean('enabled', true);
      await patchGuildConfig(client, interaction.guildId, {
        autoModeration: { [settingKey]: enabled },
      });

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
          `${label} ${enabled ? 'Enabled' : 'Disabled'}`,
          `${label} is now **${enabled ? 'enabled' : 'disabled'}** for this server.`,
        )],
      });
    },
  };
}
