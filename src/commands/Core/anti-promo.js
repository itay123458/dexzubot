import {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SETUP_TIMEOUT_MS = 5 * 60 * 1000;

function selectedChannelText(channelIds) {
  return channelIds.length > 0 ? channelIds.map(id => `<#${id}>`).join('\n') : 'None selected';
}

export default {
  slashOnly: true,
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('anti-promo')
    .setDescription('Configure channels where promotional links are allowed (owner only)')
    .setDMPermission(false)
    .addSubcommand(command => command
      .setName('setup')
      .setDescription('Select every channel where promotional links are allowed'))
    .addSubcommand(command => command
      .setName('status')
      .setDescription('Show the anti-promo configuration'))
    .addSubcommand(command => command
      .setName('disable')
      .setDescription('Disable anti-promo protection')),

  async execute(interaction, guildConfig, client) {
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    const config = await getGuildConfig(client, interaction.guildId);
    const settings = config.autoModeration || {};
    const allowedChannelIds = settings.promoAllowedChannelIds || [];

    if (subcommand === 'status') {
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: 'Anti Promo Status',
          description: `**Status:** ${settings.antiPromo ? 'Enabled' : 'Disabled'}\n\n**Promotion channels**\n${selectedChannelText(allowedChannelIds)}`,
        })],
      });
    }

    if (subcommand === 'disable') {
      await patchGuildConfig(client, interaction.guildId, {
        autoModeration: { antiPromo: false },
      });
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Anti Promo Disabled', 'Promotional-link protection is now disabled.')],
        components: [],
      });
    }

    const customId = `anti-promo-channels:${interaction.guildId}:${interaction.user.id}`;
    const selector = new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Select all promotion channels')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(25);

    const availableDefaultChannels = allowedChannelIds.filter(channelId =>
      interaction.guild.channels.cache.get(channelId)?.isTextBased?.(),
    );
    if (availableDefaultChannels.length > 0) {
      selector.setDefaultChannels(...availableDefaultChannels.slice(0, 25));
    }

    await InteractionHelper.safeEditReply(interaction, {
      embeds: [createEmbed({
        title: 'Anti Promo Setup',
        description: 'Select every channel where members may post promotional links or server invites. Links in other channels will be removed. You can select up to 25 channels.',
      })],
      components: [new ActionRowBuilder().addComponents(selector)],
    });

    const reply = await interaction.fetchReply();
    const selection = await reply.awaitMessageComponent({
      filter: component => component.customId === customId && component.user.id === interaction.user.id,
      time: SETUP_TIMEOUT_MS,
    }).catch(() => null);

    if (!selection) {
      selector.setDisabled(true);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({
          title: 'Anti Promo Setup Expired',
          description: 'No changes were saved. Run `/anti-promo setup` to try again.',
          color: 'warning',
        })],
        components: [new ActionRowBuilder().addComponents(selector)],
      });
    }

    await selection.deferUpdate();
    await patchGuildConfig(client, interaction.guildId, {
      autoModeration: {
        antiPromo: true,
        promoAllowedChannelIds: selection.values,
      },
    });

    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed(
        'Anti Promo Enabled',
        `Promotional links are allowed only in:\n${selectedChannelText(selection.values)}`,
      )],
      components: [],
    });
  },
};
