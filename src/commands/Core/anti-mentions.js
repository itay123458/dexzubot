import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
  slashOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('anti-mentions')
    .setDescription('Configure mass-mention protection (owner only)')
    .setDMPermission(false)
    .addSubcommand(command => command.setName('enable').setDescription('Enable mass-mention protection').addIntegerOption(option => option.setName('limit').setDescription('Maximum mentions per message (2-20)').setMinValue(2).setMaxValue(20)))
    .addSubcommand(command => command.setName('disable').setDescription('Disable mass-mention protection'))
    .addSubcommand(command => command.setName('status').setDescription('Show the mass-mention configuration')),
  async execute(interaction, guildConfig, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const config = await getGuildConfig(client, interaction.guildId);
    const current = config.autoModeration || {};
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'status') return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ title: 'Mass Mention Protection', description: `**Status:** ${current.antiMassMentions ? 'Enabled' : 'Disabled'}\n**Maximum mentions:** ${current.maxMentions || 5} per message` })] });
    const enabled = subcommand === 'enable';
    const maxMentions = interaction.options.getInteger('limit') || current.maxMentions || 5;
    await patchGuildConfig(client, interaction.guildId, { autoModeration: { antiMassMentions: enabled, maxMentions } });
    return InteractionHelper.safeEditReply(interaction, { embeds: [successEmbed(`Mass Mention Protection ${enabled ? 'Enabled' : 'Disabled'}`, enabled ? `Messages containing more than ${maxMentions} mentions will be removed.` : 'Mass-mention filtering is disabled.')] });
  },
};
