import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { assertFaithGuild, bibleEmbed, getFaithState, saveFaithSettings } from '../../services/faithService.js';

export default {
  slashOnly: true, betaOnly: true, releasedToMain: true,
  data: new SlashCommandBuilder().setName('bible').setDescription('Daily Bible verses and Faith settings').setDMPermission(false)
    .addSubcommand(sub => sub.setName('today').setDescription('Read today’s Bible verse'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show the daily verse schedule'))
    .addSubcommand(sub => sub.setName('guide').setDescription('How to use the Faith channels and daily verses'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Disable daily posts (Administrator)'))
    .addSubcommand(sub => sub.setName('setup').setDescription('Configure daily Bible posts (Administrator)')
      .addChannelOption(opt => opt.setName('channel').setDescription('Daily verse channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
      .addChannelOption(opt => opt.setName('discussion').setDescription('Bible discussion channel').addChannelTypes(ChannelType.GuildText))
      .addStringOption(opt => opt.setName('time').setDescription('24-hour time, such as 09:00'))
      .addStringOption(opt => opt.setName('timezone').setDescription('IANA timezone, such as Asia/Jerusalem'))),
  async execute(interaction, _config, client) {
    if (!await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral })) return;
    assertFaithGuild(interaction.guildId);
    const sub = interaction.options.getSubcommand();
    if (['setup', 'disable'].includes(sub) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return InteractionHelper.safeEditReply(interaction, { content: 'You need Discord Administrator permission to change Faith settings.' });
    }
    const state = await getFaithState(client, interaction.guild);
    if (sub === 'today') return InteractionHelper.safeEditReply(interaction, {
      embeds: [bibleEmbed(client, interaction.guildId, state.config, state.today)], allowedMentions: { parse: [] },
    });
    if (sub === 'guide') return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({
      guildId: interaction.guildId, title: 'Faith guide', description:
        '**My-Faith:** share your beliefs if you want to.\n**Religious-Talk:** respectful questions and discussion.\n**Talk-for-Religion:** voice conversation.\n**Bible-Talk / Quran-Talk:** discuss the respective texts.\n**daily-bible:** today’s verse; read and react.\n\nRespect people of every belief, including no belief. No harassment, slurs, or pressure to convert.',
      fields: [{ name: 'Commands', value: '`/bible today` · `/bible status`\nAdministrators: `/bible setup` · `/bible disable`' },
        { name: 'Dashboard', value: 'Dashboard → Faith: schedule, destination, preview and delivery status. English / World English Bible only in this release.' }],
    })] });
    if (sub === 'setup' || sub === 'disable') {
      try {
        const next = sub === 'disable' ? { ...state.config, enabled: false } : {
          ...state.config, enabled: true, channelId: interaction.options.getChannel('channel', true).id,
          discussionChannelId: interaction.options.getChannel('discussion')?.id || state.config.discussionChannelId,
          time: interaction.options.getString('time') || state.config.time,
          timezone: interaction.options.getString('timezone') || state.config.timezone,
        };
        await saveFaithSettings(client, interaction.guild, next);
        return InteractionHelper.safeEditReply(interaction, { content: sub === 'disable' ? 'Daily Bible posts are disabled.' : `Daily Bible posts are enabled at ${next.time} (${next.timezone}) in <#${next.channelId}>.`, allowedMentions: { parse: [] } });
      } catch (error) {
        if (error.name === 'ZodError') return InteractionHelper.safeEditReply(interaction, { content: 'Use a valid channel, HH:MM time and IANA timezone (for example 09:00 and Asia/Jerusalem).' });
        throw error;
      }
    }
    return InteractionHelper.safeEditReply(interaction, { embeds: [createEmbed({ guildId: interaction.guildId,
      title: 'Daily Bible schedule', description: `${state.config.enabled ? 'Enabled' : 'Disabled'} · ${state.config.time} (${state.config.timezone})\nChannel: ${state.config.channelId ? `<#${state.config.channelId}>` : 'Not configured'}\nEnglish · World English Bible`,
    })], allowedMentions: { parse: [] } });
  },
};
