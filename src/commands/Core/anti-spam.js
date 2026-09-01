import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  slashOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('anti-spam')
    .setDescription('Configure automatic message spam protection (owner only)')
    .setDMPermission(false)
    .addSubcommand(command => command.setName('enable').setDescription('Enable anti-spam protection')
      .addIntegerOption(option => option.setName('messages').setDescription('Allowed messages per window (3-10)').setMinValue(3).setMaxValue(10))
      .addIntegerOption(option => option.setName('seconds').setDescription('Window length in seconds (3-30)').setMinValue(3).setMaxValue(30)))
    .addSubcommand(command => command.setName('disable').setDescription('Disable anti-spam protection'))
    .addSubcommand(command => command.setName('status').setDescription('Show the anti-spam configuration')),
  async execute(interaction, guildConfig, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const config = await getGuildConfig(client, interaction.guildId);
    const current = config.autoModeration || {};
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'status') return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Anti Spam Status', description: `**Status:** ${current.antiSpam ? 'Enabled' : 'Disabled'}\n**Limit:** ${current.spamMaxMessages || 5} messages per ${current.spamIntervalSeconds || 8} seconds` })] });
    const enabled = subcommand === 'enable';
    const spamMaxMessages = interaction.options.getInteger('messages') || current.spamMaxMessages || 5;
    const spamIntervalSeconds = interaction.options.getInteger('seconds') || current.spamIntervalSeconds || 8;
    await patchGuildConfig(client, interaction.guildId, { autoModeration: { antiSpam: enabled, spamMaxMessages, spamIntervalSeconds } });
    return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`Anti Spam ${enabled ? 'Enabled' : 'Disabled'}`, enabled ? `Members are limited to ${spamMaxMessages} messages every ${spamIntervalSeconds} seconds.` : 'Automatic spam filtering is disabled.')] });
  },
};
