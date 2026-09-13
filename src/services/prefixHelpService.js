import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { buildCommandRegistry, isCommandEnabledInConfig } from './commandAccessService.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { isBotOwner, isCommandCategoryEnabled } from '../config/bot.js';
import { supportsPrefixExecution } from '../utils/messageAdapter.js';
import { getCommandDefaultPermissions, memberMeetsCommandPermissions } from '../utils/permissionGuard.js';
import { getGuildConfig } from './config/guildConfig.js';
import { getPrefixSettings, prefixAllowed, canManagePrefix } from './prefixSettingsService.js';
import { createEmbed } from '../utils/embeds.js';

export function listPrefixHelp(client, config, member, channelId) {
  const entries = [];
  for (const category of buildCommandRegistry(client).values()) {
    if (!isCommandCategoryEnabled(category.folder) || config.disabledCategories?.[category.key]) continue;
    for (const entry of category.commands) {
      const [base, ...args] = entry.name.split(' ');
      const command = client.commands.get(base);
      if (!supportsPrefixExecution(command) || getPrefixRestriction(command, args, resolveSubcommandAlias).blocked) continue;
      if (!entry.isSubcommand && command.data.toJSON().options?.some(option => [1, 2].includes(option.type))) continue;
      if (!isCommandEnabledInConfig(config, entry.name, category.folder)) continue;
      if ((command.ownerOnly || command.ownerOnlySubcommands?.includes(args.join(' '))) && !isBotOwner(member?.id)) continue;
      if (!isBotOwner(member?.id) && !memberMeetsCommandPermissions(member, getCommandDefaultPermissions(command.data), { guildConfig: config, commandCategory: category.folder })) continue;
      if (base === 'prefix' && !canManagePrefix(member)) continue;
      if (!prefixAllowed(config, member, channelId) && !(base === 'prefix' && canManagePrefix(member))) continue;
      if (category.key === 'economy' && config.economy?.channelId && config.economy.channelId !== channelId) continue;
      entries.push({ name: entry.name, description: entry.description, category: category.displayName });
    }
  }
  return entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function openPrefixHelp(interaction, _config, client) {
  const session = `prefix-help-${interaction.id}`;
  let page = 0;
  const render = async () => {
    const config = await getGuildConfig(client, interaction.guildId);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const entries = listPrefixHelp(client, config, member, interaction.channel.id);
    const pages = Math.max(1, Math.ceil(entries.length / 8));
    page = Math.min(page, pages - 1);
    const prefix = getPrefixSettings(config).prefix;
    const embed = createEmbed({ title: 'DexzuBot · Prefix Help', color: 'primary', description: `Prefix: **${prefix}**\nEnabled commands available to you in this channel. Slash-only commands are in /help.` });
    for (const entry of entries.slice(page * 8, page * 8 + 8)) embed.addFields({ name: `${prefix}${entry.name}`, value: `${entry.category} · ${entry.description}`.slice(0, 1024) });
    if (!entries.length) embed.setDescription('No prefix commands are available to you in this channel. Use /help for slash commands.');
    embed.setFooter({ text: `Page ${page + 1}/${pages} · ${entries.length} commands · Menu expires in 5 minutes` });
    return { embeds: [embed], allowedMentions: { parse: [] }, components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${session}-prev`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${session}-next`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1))] };
  };
  await interaction.reply(await render());
  const message = await interaction.fetchReply();
  let busy = false;
  const collector = message.createMessageComponentCollector({ time: 300_000, filter: item => item.customId.startsWith(session) });
  collector.on('collect', async item => {
    if (item.user.id !== interaction.user.id) { await item.reply({ content: 'Open your own help menu.', flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
    if (busy) { await item.deferUpdate().catch(() => {}); return; }
    busy = true;
    try {
      await item.deferUpdate();
      page = Math.max(0, page + (item.customId.endsWith('-next') ? 1 : -1));
      await message.edit(await render());
    } catch { await item.followUp({ content: 'Could not refresh help. Please reopen the menu.', flags: MessageFlags.Ephemeral }).catch(() => {}); }
    finally { busy = false; }
  });
  collector.on('end', () => { void message.edit({ components: [] }).catch(() => {}); });
}
