import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  slashOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('anti-ping')
    .setDescription('Protect yourself from being pinged (owner only)')
    .setDMPermission(false)
    .addSubcommand(command => command
      .setName('enable')
      .setDescription('Protect yourself from direct user mentions'))
    .addSubcommand(command => command
      .setName('disable')
      .setDescription('Remove anti-ping protection from yourself'))
    .addSubcommand(command => command
      .setName('status')
      .setDescription('Show everyone currently protected by anti-ping')),

  async execute(interaction, guildConfig, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    const config = await getGuildConfig(client, interaction.guildId);
    const currentIds = config.autoModeration?.antiPingUserIds || [];

    if (subcommand === 'status') {
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: 'Anti Ping Status',
          description: currentIds.length > 0
            ? `**Protected owners**\n${currentIds.map(id => `<@${id}>`).join('\n')}`
            : 'Anti-ping is not protecting anyone.',
        })],
      });
    }

    const protectedIds = subcommand === 'enable'
      ? [...new Set([...currentIds, interaction.user.id])]
      : currentIds.filter(id => id !== interaction.user.id);

    await patchGuildConfig(client, interaction.guildId, {
      autoModeration: {
        antiPing: protectedIds.length > 0,
        antiPingUserIds: protectedIds,
      },
    });

    const enabled = subcommand === 'enable';
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed(
        `Anti Ping ${enabled ? 'Enabled' : 'Disabled'}`,
        enabled
          ? 'You are now protected from direct `@user` mentions. Role, `@everyone`, and `@here` pings are not blocked.'
          : 'Anti-ping protection has been removed from you.',
      )],
    });
  },
};
