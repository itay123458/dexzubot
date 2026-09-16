import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, PermissionFlagsBits } from 'discord.js';
import { getCommandAccessSnapshot, isCommandEnabledInConfig } from './commandAccessService.js';
import { isSlashCommandCategoryEnabled } from '../config/commands/slashCommandCategories.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { isBotOwner, isCommandCategoryEnabled } from '../config/bot.js';
import { supportsPrefixExecution } from '../utils/messageAdapter.js';
import { getCommandDefaultPermissions, memberMeetsCommandPermissions } from '../utils/permissionGuard.js';
import { getGuildConfig } from './config/guildConfig.js';
import { getPrefixSettings, prefixAllowed, canManagePrefix, canUsePrefixCommand } from './prefixSettingsService.js';
import { createEmbed } from '../utils/embeds.js';

export function listPrefixHelp(client, config, member, channelId, mode = 'prefix') {
  const entries = [];
  for (const category of getCommandAccessSnapshot(client, config).categories) {
    if (!(mode === 'slash' ? isSlashCommandCategoryEnabled(category.folder) : isCommandCategoryEnabled(category.folder)) || category.categoryDisabled) continue;
    for (const entry of category.commands) {
      const [base, ...args] = entry.name.split(' ');
      const command = client.commands.get(base);
      if (mode === 'prefix' && !canUsePrefixCommand(command, member, config)) continue;
      if (mode === 'prefix' && (!supportsPrefixExecution(command) || getPrefixRestriction(command, args, resolveSubcommandAlias).blocked)) continue;
      if (!entry.isSubcommand && command.data.toJSON().options?.some(option => [1, 2].includes(option.type))) continue;
      if (!isCommandEnabledInConfig(config, entry.name, category.folder)) continue;
      if ((command.ownerOnly || command.ownerOnlySubcommands?.includes(args.join(' '))) && !isBotOwner(member?.id)) continue;
      if (!isBotOwner(member?.id) && !memberMeetsCommandPermissions(member, getCommandDefaultPermissions(command.data), { guildConfig: config, commandCategory: category.folder })) continue;
      if (base === 'prefix' && !canManagePrefix(member)) continue;
      if ((base === 'configwizard' || (base === 'commands' && args[0] !== 'list-all')) && !member?.permissions?.has(PermissionFlagsBits.ManageGuild)) continue;
      if (mode === 'prefix' && !prefixAllowed(config, member, channelId) && !(base === 'prefix' && canManagePrefix(member))) continue;
      if (category.key === 'economy' && config.economy?.channelId && config.economy.channelId !== channelId) continue;
      entries.push({ name: entry.name, description: entry.description, category: category.displayName });
    }
  }
  return entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function openPrefixHelp(interaction, _config, client, mode = 'prefix') {
  const session = `prefix-help-${interaction.id}`;
  let page = 0;
  let selectedCategory = 'all';
  const render = async () => {
    const config = await getGuildConfig(client, interaction.guildId);
    const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
    const allEntries = listPrefixHelp(client, config, member, interaction.channel.id, mode);
    const categories = [...new Set(allEntries.map(entry => entry.category))];
    if (!categories.includes(selectedCategory)) selectedCategory = 'all';
    const entries = selectedCategory === 'all' ? allEntries : allEntries.filter(entry => entry.category === selectedCategory);
    const pages = Math.max(1, Math.ceil(entries.length / 8));
    page = Math.min(page, pages - 1);
    const prefix = mode === 'slash' ? '/' : getPrefixSettings(config).prefix;
    const embed = createEmbed({ title: `${mode === 'slash' ? 'Slash' : 'Prefix'} Command Guide`, author: 'DEXZUBOT / COMMANDS', thumbnail: client.user?.displayAvatarURL?.(), color: 'primary', description: `Find your way around the dungeon.\n\n**${selectedCategory === 'all' ? 'All enabled categories' : selectedCategory}**\nCommands available to you in this channel.` });
    for (const entry of entries.slice(page * 8, page * 8 + 8)) embed.addFields({ name: `${prefix}${entry.name}`, value: `${entry.category} · ${entry.description}`.slice(0, 1024) });
    if (!entries.length) embed.setDescription(`No enabled ${mode} commands are available to you in this channel.`);
    embed.setFooter({ text: `Page ${page + 1}/${pages} · ${entries.length} commands · Menu expires in 5 minutes` });
    return { embeds: [embed], allowedMentions: { parse: [] }, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${session}-category`).setPlaceholder('Choose an enabled category').addOptions([
      { label: 'All enabled commands', value: 'all', default: selectedCategory === 'all' },
      ...categories.slice(0, 24).map(category => ({ label: category, value: category, default: category === selectedCategory })),
    ])), new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${session}-prev`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${session}-next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1))] };
  };
  if (mode === 'slash') await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const initial = await render();
  if (mode === 'slash') await interaction.editReply(initial); else await interaction.reply(initial);
  const message = await interaction.fetchReply();
  const editMenu = view => mode === 'slash' ? interaction.editReply(view) : message.edit(view);
  let busy = false;
  const collector = message.createMessageComponentCollector({ time: 300_000, filter: item => item.customId.startsWith(session) });
  collector.on('collect', async item => {
    if (item.user.id !== interaction.user.id) { await item.reply({ content: 'Open your own help menu.', flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
    if (busy) { await item.deferUpdate().catch(() => {}); return; }
    busy = true;
    try {
      await item.deferUpdate();
      if (item.customId.endsWith('-category')) { selectedCategory = item.values[0]; page = 0; }
      else page = Math.max(0, page + (item.customId.endsWith('-next') ? 1 : -1));
      const view = await render();
      if (!collector.ended) await editMenu(view);
    } catch { await item.followUp({ content: 'Could not refresh help. Please reopen the menu.', flags: MessageFlags.Ephemeral }).catch(() => {}); }
    finally { busy = false; }
  });
  collector.on('end', () => { void editMenu({ components: [] }).catch(() => {}); });
}
