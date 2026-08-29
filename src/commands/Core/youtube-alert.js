import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isBotOwner } from '../../config/bot.js';
import { getGuildConfig, patchGuildConfig } from '../../services/config/guildConfig.js';
import {
    fetchLatestYouTubeVideo,
    sendYouTubeAlert,
    YOUTUBE_CHANNEL_HANDLE,
    YOUTUBE_CHANNEL_URL,
} from '../../services/youtubeAlertService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('youtube-alert')
        .setDescription('Configure automatic Dexzu YouTube upload alerts (owner only)')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Choose the channel for automatic upload alerts')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel where new videos will be posted')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('status').setDescription('Show the current upload alert configuration')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('test').setDescription('Send the current newest video as a test')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('disable').setDescription('Disable automatic upload alerts')
        ),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });

        if (!isBotOwner(interaction.user.id)) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Owner Only',
                    description: 'Only a configured DexzuBot owner can manage YouTube alerts.',
                    color: 'error',
                })],
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const config = await getGuildConfig(client, interaction.guildId);
        const current = config.youtubeAlert || {};

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel', true);
            const latestVideo = await fetchLatestYouTubeVideo();
            await patchGuildConfig(client, interaction.guildId, {
                youtubeAlert: {
                    enabled: true,
                    channelId: channel.id,
                    lastVideoId: latestVideo.id,
                    configuredBy: interaction.user.id,
                    configuredAt: new Date().toISOString(),
                },
            });

            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(
                    'YouTube Alerts Enabled',
                    `New uploads from [${YOUTUBE_CHANNEL_HANDLE}](${YOUTUBE_CHANNEL_URL}) will be posted in ${channel}.`,
                )],
            });
        }

        if (subcommand === 'disable') {
            await patchGuildConfig(client, interaction.guildId, {
                youtubeAlert: { ...current, enabled: false },
            });
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed('YouTube Alerts Disabled', 'Automatic upload alerts are now disabled.')],
            });
        }

        if (subcommand === 'status') {
            const destination = current.channelId ? `<#${current.channelId}>` : 'Not configured';
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'YouTube Alert Status',
                    description: [
                        `**Channel:** [${YOUTUBE_CHANNEL_HANDLE}](${YOUTUBE_CHANNEL_URL})`,
                        `**Destination:** ${destination}`,
                        `**Status:** ${current.enabled ? '🟢 Enabled' : '🔴 Disabled'}`,
                    ].join('\n'),
                })],
            });
        }

        if (!current.enabled || !current.channelId) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'YouTube Alerts Not Configured',
                    description: 'Run `/youtube-alert setup` first.',
                    color: 'error',
                })],
            });
        }

        const channel = await interaction.guild.channels.fetch(current.channelId).catch(() => null);
        if (!channel?.isTextBased?.()) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [createEmbed({
                    title: 'Alert Channel Unavailable',
                    description: 'Run `/youtube-alert setup` and choose another channel.',
                    color: 'error',
                })],
            });
        }

        const latestVideo = await fetchLatestYouTubeVideo();
        await sendYouTubeAlert(channel, latestVideo, { test: true });
        return InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed('Test Sent', `Posted the newest video in ${channel}.`)],
        });
    },
};
