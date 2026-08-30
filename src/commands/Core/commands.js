import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed, successEmbed } from '../../utils/embeds.js';
import { isBotOwner } from '../../config/bot.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  getCommandAccessSnapshot,
  isProtectedCommand,
} from '../../services/commandAccessService.js';
import { syncGuildCommandRegistration } from '../../handlers/loaders/commandLoader.js';
import { isSlashCommandCategoryEnabled } from '../../config/commands/slashCommandCategories.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  createDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/commands_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

function getCommandGroups(client, guildConfig) {
  const groups = new Map();
  const accessByCategory = new Map(
    getCommandAccessSnapshot(client, guildConfig).categories.map(category => [category.folder, category]),
  );
  const commands = [...client.commands.values()].sort((a, b) =>
    String(a.category).localeCompare(String(b.category)) || a.data.name.localeCompare(b.data.name),
  );

  for (const command of commands) {
    if (!isSlashCommandCategoryEnabled(command.category)) continue;

    const categoryAccess = accessByCategory.get(command.category);
    if (!categoryAccess || categoryAccess.categoryDisabled) continue;

    const data = command.data.toJSON();
    const access = command.ownerOnly ? 'Owner' : data.default_member_permissions != null ? 'Staff' : 'Everyone';
    const options = data.options || [];
    const paths = [];

    for (const option of options) {
      if (option.type === SUBCOMMAND_TYPE) paths.push(`${data.name} ${option.name}`);
      if (option.type === SUBCOMMAND_GROUP_TYPE) {
        for (const nested of option.options || []) {
          if (nested.type === SUBCOMMAND_TYPE) paths.push(`${data.name} ${option.name} ${nested.name}`);
        }
      }
    }

    if (paths.length === 0) paths.push(data.name);
    for (const path of paths) {
      if (!categoryAccess.enabledCommands.includes(path)) continue;
      const ownerSubcommand = command.ownerOnlySubcommands?.includes(path.slice(data.name.length + 1));
      const commandAccess = ownerSubcommand ? 'Owner' : access;
      if (!groups.has(command.category)) {
        groups.set(command.category, { Everyone: [], Staff: [], Owner: [] });
      }
      groups.get(command.category)[commandAccess].push(`• \`/${path}\``);
    }
  }

  return groups;
}

function chunkLines(lines, maxLength = 1000) {
  const chunks = [];
  let chunk = '';
  for (const line of lines) {
    if (chunk && chunk.length + line.length + 1 > maxLength) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += `${chunk ? '\n' : ''}${line}`;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function buildCommandListEmbeds(client, guildConfig) {
  const groups = getCommandGroups(client, guildConfig);
  const totalCommands = [...groups.values()].reduce(
    (total, group) => total + group.Everyone.length + group.Staff.length + group.Owner.length,
    0,
  );
  const categoryEntries = [...groups.entries()];

  return categoryEntries.map(([category, group], categoryIndex) => {
    const fields = [];
    for (const access of ['Everyone', 'Staff', 'Owner']) {
      const chunks = chunkLines(group[access]);
      chunks.forEach((value, index) => fields.push({
        name: `${access} Commands${chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ''}`,
        value,
        inline: false,
      }));
    }

    return createEmbed({
      title: `${category} Commands`,
      description: `Category ${categoryIndex + 1} of ${categoryEntries.length}`,
      fields,
      color: 'primary',
      footer: `Page ${categoryIndex + 1}/${categoryEntries.length} - ${totalCommands} enabled command paths`,
    });
  });
}

function buildCategoryChoices(client) {
  const registry = buildCommandRegistry(client);
  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'You need the **Manage Server** permission to manage commands.' });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Enable or disable bot commands and categories for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('Open the interactive command access dashboard'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable a command or entire category')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Disable a single command or a whole category')
            .setRequired(true)
            .addChoices(
              { name: 'Category', value: 'category' },
              { name: 'Command', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Category or command name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('Enable a command or entire category')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Enable a single command or a whole category')
            .setRequired(true)
            .addChoices(
              { name: 'Category', value: 'category' },
              { name: 'Command', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('Category or command name')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list-all')
        .setDescription('List every loaded bot command (owner only)'),
    ),
  category: 'Core',
  ownerOnlySubcommands: ['list-all'],

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoryChoices(interaction.client)
        .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.includes(query))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    // For command scope, get all commands including subcommands
    const registry = buildCommandRegistry(interaction.client);
    const allCommands = [];
    
    // Check if the query matches a category name - if so, show commands from that category
    const matchedCategory = resolveCategoryChoice(interaction.client, query);
    
    if (matchedCategory) {
      // Show commands from the matched category
      for (const command of matchedCategory.commands) {
        if (!isProtectedCommand(command.name)) {
          allCommands.push(command.name);
        }
      }
    } else {
      // Show all commands
      for (const category of registry.values()) {
        for (const command of category.commands) {
          // Include both base commands and subcommands
          if (!isProtectedCommand(command.name)) {
            allCommands.push(command.name);
          }
        }
      }
    }

    const choices = allCommands
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name: `/${name}`, value: name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'list-all') {
      if (!isBotOwner(interaction.user.id)) {
        return replyUserError(interaction, {
          type: ErrorTypes.PERMISSION,
          message: 'Only a configured DexzuBot owner can view the complete command list.',
        });
      }

      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      const embeds = buildCommandListEmbeds(client, config);

      await InteractionHelper.safeEditReply(interaction, { embeds: [embeds[0]] });
      for (const embed of embeds.slice(1)) {
        await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    if (subcommand === 'dashboard') {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [view.embed],
        components: view.components,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.createMessageComponentCollector({
        filter: createDashboardCollectorFilter(interaction.user.id, interaction.guildId),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on('collect', async (componentInteraction) => {
        try {
          if (!isCommandAccessCustomId(componentInteraction.customId)) {
            return;
          }
          await handleDashboardComponent(componentInteraction, client);
        } catch (error) {
          logger.error('Command access dashboard interaction failed', {
            error: error.message,
            customId: componentInteraction.customId,
            guildId: interaction.guildId,
          });
          await replyUserError(componentInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: error.message || 'Failed to update command access.',
          }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        const finalView = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
        const disabledComponents = finalView.components.map((row) => {
          const newRow = row.toJSON();
          newRow.components = newRow.components.map((component) => ({ ...component, disabled: true }));
          return newRow;
        });

        await replyMessage.edit({ components: disabledComponents }).catch(() => {});
      });

      return;
    }

    const scope = interaction.options.getString('scope');
    const target = interaction.options.getString('target');
    const isDisable = subcommand === 'disable';

    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) {
      return;
    }

    if (scope === 'category') {
      const category = resolveCategoryChoice(client, target);
      if (!category) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `No category matched \`${target}\`. Use \`/commands dashboard\` to browse categories.` });
      }

      if (isDisable) {
        await disableCategory(client, interaction.guildId, category.key);
        await syncGuildCommandRegistration(client, interaction.guildId);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              'Category Disabled',
              `All **${category.displayName}** commands are now disabled.\nProtected commands remain available.`,
            ),
          ],
        });
      }

      await enableCategory(client, interaction.guildId, category.key);
      await syncGuildCommandRegistration(client, interaction.guildId);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Category Enabled', `**${category.displayName}** commands are now enabled (except individually disabled commands).`)],
      });
    }

    const commandName = target.toLowerCase();
    if (isDisable) {
      await disableCommand(client, interaction.guildId, commandName);
      await syncGuildCommandRegistration(client, interaction.guildId);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('Command Disabled', `\`/${commandName}\` is now disabled in this server.`)],
      });
    }

    await enableCommand(client, interaction.guildId, commandName);
    await syncGuildCommandRegistration(client, interaction.guildId);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('Command Enabled', `\`/${commandName}\` is now enabled in this server.`)],
    });
  },
};
