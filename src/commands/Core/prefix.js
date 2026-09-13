import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { getPrefixSettings, savePrefixSettings, canManagePrefix } from '../../services/prefixSettingsService.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';

export function buildPrefixPanel(settings, session) {
  const channels = new ChannelSelectMenuBuilder().setCustomId(`${session}-channels`).setPlaceholder('Allowed channels — clear for all channels').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(25);
  const roles = new RoleSelectMenuBuilder().setCustomId(`${session}-roles`).setPlaceholder('Allowed roles — clear for everyone').setMinValues(0).setMaxValues(25);
  if (settings.allowedChannelIds.length) channels.setDefaultChannels(settings.allowedChannelIds);
  if (settings.allowedRoleIds.length) roles.setDefaultRoles(settings.allowedRoleIds);
  return { embeds: [createEmbed({ title: 'Prefix Command Settings', color: 'primary', description: [
    `Prefix: **${settings.prefix}** · Commands: **${settings.enabled ? 'Enabled' : 'Disabled'}**`,
    'Choose channels and roles below. Empty selections allow all channels or everyone.',
    'These limits never grant staff permissions. Slash commands are unaffected.',
    `Help: **${settings.prefix}help** · Settings: **${settings.prefix}config** or **/prefix**`,
    'Changes save immediately and sync with the private website. Only you can use this panel; it expires after 10 minutes.',
  ].join('\n\n') })], allowedMentions: { parse: [] }, components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${session}-edit`).setLabel('Change prefix').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${session}-toggle`).setLabel(settings.enabled ? 'Disable prefix commands' : 'Enable prefix commands').setStyle(ButtonStyle.Secondary)),
    new ActionRowBuilder().addComponents(channels), new ActionRowBuilder().addComponents(roles),
  ] };
}

export default {
  category: 'Core',
  data: new SlashCommandBuilder().setName('prefix').setDescription('Configure prefix commands, allowed channels and roles').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false),
  async execute(interaction, _config, client) {
    if (!canManagePrefix(interaction.member)) return interaction.reply({ content: 'Manage Server permission is required.', flags: MessageFlags.Ephemeral });
    await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    const session = `prefix-panel-${interaction.id}`;
    const read = async () => {
      const settings = getPrefixSettings(await getGuildConfig(client, interaction.guildId));
      settings.allowedChannelIds = settings.allowedChannelIds.filter(id => interaction.guild.channels.cache.has(id));
      settings.allowedRoleIds = settings.allowedRoleIds.filter(id => interaction.guild.roles.cache.has(id));
      return settings;
    };
    await InteractionHelper.safeEditReply(interaction, buildPrefixPanel(await read(), session));
    const message = await interaction.fetchReply();
    let busy = false;
    const expiresAt = Date.now() + 600_000;
    const collector = message.createMessageComponentCollector({ time: 600_000, filter: component => {
      if (!component.customId.startsWith(session)) return false;
      if (component.user.id !== interaction.user.id) {
        void component.reply({ content: 'Open your own configuration panel.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return false;
      }
      return true;
    } });
    collector.on('collect', async component => {
      if (busy) { await component.reply({ content: 'Finish the current change first.', flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
      busy = true;
      let response = component;
      try {
        if (collector.ended || Date.now() >= expiresAt) throw new Error('This panel expired. Open /prefix again.');
        if (!canManagePrefix(await interaction.guild.members.fetch({ user: component.user.id, force: true }))) throw new Error('Manage Server permission is required.');
        let change;
        if (component.customId.endsWith('-edit')) {
          const modalId = `${session}-modal-${component.id}`;
          const input = new TextInputBuilder().setCustomId('value').setLabel('Prefix (1–10 characters, no spaces)').setStyle(TextInputStyle.Short).setMaxLength(10).setRequired(true).setValue((await read()).prefix);
          await component.showModal(new ModalBuilder().setCustomId(modalId).setTitle('Change prefix').addComponents(new ActionRowBuilder().addComponents(input)));
          const submitted = await component.awaitModalSubmit({ time: Math.max(1, Math.min(120_000, expiresAt - Date.now())), filter: item => item.customId === modalId && item.user.id === interaction.user.id }).catch(() => null);
          if (!submitted) return;
          response = submitted;
          await submitted.deferReply({ flags: MessageFlags.Ephemeral });
          if (!canManagePrefix(await interaction.guild.members.fetch({ user: submitted.user.id, force: true }))) throw new Error('Manage Server permission is required.');
          change = { prefix: submitted.fields.getTextInputValue('value') };
        } else {
          await component.deferUpdate();
          if (component.customId.endsWith('-toggle')) change = { enabled: !(await read()).enabled };
          if (component.customId.endsWith('-channels')) change = { allowedChannelIds: component.values };
          if (component.customId.endsWith('-roles')) change = { allowedRoleIds: component.values };
        }
        if (!change) return;
        const next = { ...await read(), ...change };
        if (collector.ended || Date.now() >= expiresAt) throw new Error('This panel expired. Open /prefix again.');
        const settings = await savePrefixSettings(client, interaction.guild, next);
        if (!collector.ended && Date.now() < expiresAt) await message.edit(buildPrefixPanel(settings, session));
        if (response !== component) await response.editReply({ content: 'Prefix saved.' });
      } catch (error) {
        const payload = { content: error.message || 'Could not save prefix settings.', flags: MessageFlags.Ephemeral };
        if (response.deferred || response.replied) await response.followUp(payload).catch(() => {});
        else await response.reply(payload).catch(() => {});
      } finally { busy = false; }
    });
    collector.on('end', () => { void message.edit({ components: [] }).catch(() => {}); });
  },
};
