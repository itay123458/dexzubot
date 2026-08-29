import { createEmbed } from '../../utils/embeds.js';
import { createButton, getPaginationRow } from '../../utils/components.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Collection, ActionRowBuilder, MessageFlags, Routes } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { isSlashCommandCategoryEnabled } from '../../config/commands/slashCommandCategories.js';
import { isBotOwner } from '../../config/bot.js';
import { getGuildConfig } from '../../services/config/guildConfig.js';
import { isCommandEnabledInConfig } from '../../services/commandAccessService.js';
import { getCommandDefaultPermissions, memberMeetsCommandPermissions } from '../../utils/permissionGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACK_BUTTON_ID = "help-back-to-main";
const ALL_COMMANDS_ID = "help-all-commands";
const PAGINATION_PREFIX = "help-page";
const CATEGORY_SELECT_ID = "help-category-select";
const FOOTER_TEXT = "Made with ❤️";
const SUBCOMMAND_TYPE = 1;
const SUBCOMMAND_GROUP_TYPE = 2;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Counting: "🔢",
    Moderation: "🛡️",
    Economy: "💰",
    Music: "🎵",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    "Reaction Roles": "🎭",
    Community: "👥",
    Birthday: "🎂",
    "Join To Create": "🔌",
    Verification: "✅",
    Config: "⚙️",
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildHelpEntries(command, category) {
    const commandData = normalizeCommandData(command);
    if (!commandData?.name) {
        return [];
    }

    const baseName = commandData.name;
    const baseDescription = commandData.description || "No description";
    const options = commandData.options || [];
    const staffOnly = commandData.default_member_permissions != null;
    const ownerOnly = command?.ownerOnly === true;

    const entries = [];

    for (const option of options) {
        if (!option) continue;

        if (option.type === SUBCOMMAND_TYPE) {
            entries.push({
                baseName,
                displayName: `${baseName} ${option.name}`,
                description: option.description || baseDescription,
                category,
                staffOnly,
                ownerOnly,
            });
            continue;
        }

        if (option.type === SUBCOMMAND_GROUP_TYPE) {
            const nestedOptions = option.options || [];
            for (const nested of nestedOptions) {
                if (nested?.type !== SUBCOMMAND_TYPE) continue;

                entries.push({
                    baseName,
                    displayName: `${baseName} ${option.name} ${nested.name}`,
                    description: nested.description || option.description || baseDescription,
                    category,
                    staffOnly,
                    ownerOnly,
                });
            }
        }
    }

    if (entries.length === 0) {
        entries.push({
            baseName,
            displayName: baseName,
            description: baseDescription,
            category,
            staffOnly,
            ownerOnly,
        });
    }

    return entries;
}

function commandAccessRank(command) {
    if (command.ownerOnly) return 2;
    if (command.staffOnly) return 1;
    return 0;
}

function compareHelpEntries(a, b) {
    return commandAccessRank(a) - commandAccessRank(b)
        || a.displayName.localeCompare(b.displayName);
}

function addGroupedCommandFields(embed, commands, formatLine, page = null) {
    const sections = [
        { name: 'Commands', commands: commands.filter(command => commandAccessRank(command) === 0) },
        { name: '🔒 Staff Commands', commands: commands.filter(command => commandAccessRank(command) === 1) },
        { name: '🔐 Owner Commands', commands: commands.filter(command => commandAccessRank(command) === 2) },
    ];

    for (const section of sections) {
        if (section.commands.length === 0) continue;

        const chunks = [];
        let currentChunk = '';
        for (const command of section.commands) {
            const line = formatLine(command);
            if ((currentChunk + '\n' + line).length > 1000) {
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += (currentChunk ? '\n' : '') + line;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        chunks.forEach((chunk, index) => {
            const suffix = chunks.length > 1 ? ` (Part ${index + 1})` : '';
            const pageSuffix = page == null ? '' : ` · Page ${page}`;
            embed.addFields({
                name: `${section.name}${suffix}${pageSuffix}`,
                value: chunk,
                inline: false,
            });
        });
    }
}

function userCanUseCommand(command, category, interaction, guildConfig) {
    const userId = interaction?.user?.id;
    if (userId && isBotOwner(userId)) {
        return true;
    }

    if (command?.ownerOnly) {
        return false;
    }

    const requiredPermissions = getCommandDefaultPermissions(command?.data);
    return memberMeetsCommandPermissions(interaction?.member, requiredPermissions, {
        guildConfig,
        commandCategory: category,
    });
}

async function getHelpGuildConfig(client, interaction) {
    if (!interaction?.guildId) return null;
    return getGuildConfig(client, interaction.guildId);
}

function normalizeCommandData(command) {
    const rawData = command?.data;
    if (!rawData) {
        return null;
    }

    const jsonData = typeof rawData.toJSON === 'function' ? rawData.toJSON() : rawData;
    if (!jsonData?.name) {
        return null;
    }

    return {
        ...jsonData,
        options: Array.isArray(jsonData.options)
            ? jsonData.options.map((option) =>
                  typeof option?.toJSON === 'function' ? option.toJSON() : option,
              )
            : [],
    };
}

async function fetchRegisteredCommands(client) {
    const registeredCommands = new Collection();
    const applicationId = client?.application?.id || client?.user?.id;

    if (!client?.rest || !applicationId) {
        return registeredCommands;
    }

    try {
        const commands = await client.rest.get(Routes.applicationCommands(applicationId));
        for (const command of commands) {
            registeredCommands.set(command.name, command);
        }
    } catch (error) {
        logger.error('Error fetching registered commands:', error);
    }

    return registeredCommands;
}

async function createCategoryCommandsMenu(category, client, interaction) {
    if (!isSlashCommandCategoryEnabled(category)) {
        return createAllCommandsMenu(1, client, interaction);
    }

    const categoryName = formatCategoryName(category);
    const icon = CATEGORY_ICONS[categoryName] || "🔍";

    const categoryCommands = [];
    const guildConfig = await getHelpGuildConfig(client, interaction);

    try {
        const categoryPath = path.join(__dirname, "../../commands", category);
        const commandFiles = (await fs.readdir(categoryPath))
            .filter((file) => file.endsWith(".js"))
            .sort();

        for (const file of commandFiles) {
            const filePath = path.join(categoryPath, file);
            const commandModule = await import(`file://${filePath}`);
            const command = commandModule.default;
            const commandData = normalizeCommandData(command);

            if (commandData && userCanUseCommand(command, category, interaction, guildConfig)) {
                if (
                    commandData.name === "help" ||
                    commandData.name === "commandlist"
                )
                    continue;

                categoryCommands.push(
                    ...buildHelpEntries(command, categoryName).filter(entry =>
                        !guildConfig || isCommandEnabledInConfig(guildConfig, entry.displayName, category)
                    ),
                );
            }
        }
    } catch (error) {
        logger.error(
            `Error reading commands from category ${category}:`,
            error,
        );
    }

    categoryCommands.sort(compareHelpEntries);

    const registeredCommands = await fetchRegisteredCommands(client);

    const embed = createEmbed({
        title: `${icon} ${categoryName} Commands`,
        description: categoryCommands.length > 0
            ? `Click any command mention below to use it.`
            : `No commands found in the **${categoryName}** category.`
    });

    if (categoryCommands.length > 0) {
        addGroupedCommandFields(embed, categoryCommands, cmd => {
            const registeredCmd = registeredCommands.get(cmd.baseName);
            const mention = registeredCmd?.id
                ? `</${cmd.displayName}:${registeredCmd.id}>`
                : `\`/${cmd.displayName}\``;
            return `${mention} · ${cmd.description}`;
        });
    }

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);

    return {
        embeds: [embed],
        components: [buttonRow],
    };
}

export async function createAllCommandsMenu(page = 1, client, interaction = null) {
    const commandsPerPage = 45;
    const allCommands = [];

    const commandsPath = path.join(__dirname, "../../commands");
    const guildConfig = await getHelpGuildConfig(client, interaction);
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory() && isSlashCommandCategoryEnabled(dirent.name))
        .map((dirent) => dirent.name)
        .sort();

    for (const category of categoryDirs) {
        try {
            const categoryPath = path.join(
                __dirname,
                "../../commands",
                category,
            );
            const commandFiles = (await fs.readdir(categoryPath))
                .filter((file) => file.endsWith(".js"))
                .sort();

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                const commandModule = await import(`file://${filePath}`);
                const command = commandModule.default;
                const commandData = normalizeCommandData(command);

                if (commandData && userCanUseCommand(command, category, interaction, guildConfig)) {
                    if (
                        commandData.name === "help" ||
                        commandData.name === "commandlist"
                    )
                        continue;

                    const categoryName = formatCategoryName(category);

                    allCommands.push(
                        ...buildHelpEntries(command, categoryName).filter(entry =>
                            !guildConfig || isCommandEnabledInConfig(guildConfig, entry.displayName, category)
                        ),
                    );
                }
            }
        } catch (error) {
            logger.error(
                `Error reading commands from category ${category}:`,
                error,
            );
        }
    }

    allCommands.sort(compareHelpEntries);

    const registeredCommands = await fetchRegisteredCommands(client);

    const totalPages = Math.ceil(allCommands.length / commandsPerPage);
    const startIndex = (page - 1) * commandsPerPage;
    const endIndex = startIndex + commandsPerPage;
    const pageCommands = allCommands.slice(startIndex, endIndex);

    const embed = createEmbed({
        title: "📋 All Commands",
        description: `Browse every available command in one list. Use the page buttons below to move through the full set.`
    });

    embed.setFooter({ text: FOOTER_TEXT });
    embed.setTimestamp();

    if (pageCommands.length > 0) {
        addGroupedCommandFields(embed, pageCommands, cmd => {
            const registeredCmd = registeredCommands.get(cmd.baseName);
            const mention = registeredCmd?.id
                ? `</${cmd.displayName}:${registeredCmd.id}>`
                : `\`/${cmd.displayName}\``;
            return `${mention} · ${cmd.category}`;
        }, page);
    }

    const components = [];

    if (totalPages > 1) {
        const paginationRow = getPaginationRow(
            PAGINATION_PREFIX,
            page,
            totalPages,
        );
        components.push(paginationRow);
    }

    const backButton = createButton(
        BACK_BUTTON_ID,
        "Back",
        "primary",
        "⬅️",
        false,
    );

    const buttonRow = new ActionRowBuilder().addComponents(backButton);
    components.push(buttonRow);

    return {
        embeds: [embed],
        components,
        currentPage: page,
        totalPages,
    };
}

export const helpCategorySelectMenu = {
    name: CATEGORY_SELECT_ID,
    async execute(interaction, client) {
        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            const selectedCategory = interaction.values[0];

            if (selectedCategory === ALL_COMMANDS_ID) {
                const { embeds, components } = await createAllCommandsMenu(1, client, interaction);
                await interaction.editReply({
                    embeds,
                    components,
                });
            } else {
                const { embeds, components } = await createCategoryCommandsMenu(selectedCategory, client, interaction);
                await interaction.editReply({
                    embeds,
                    components,
                });
            }
        } catch (error) {
            if (error?.code === 40060 || error?.code === 10062) {
                logger.warn('Help category select interaction already acknowledged or expired.', {
                    event: 'interaction.help.select.unavailable',
                    errorCode: String(error.code),
                    customId: interaction.customId,
                    interactionId: interaction.id,
                });
                return;
            }

            await handleInteractionError(interaction, error, {
                type: 'select_menu',
                customId: interaction.customId,
                handler: 'help_category',
            });
        }
    },
};
