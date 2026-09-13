import { SlashCommandBuilder } from "discord.js";
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { isSlashCommandCategoryEnabled } from '../../config/commands/slashCommandCategories.js';
import { openPrefixHelp } from '../../services/prefixHelpService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";

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
};

function formatCategoryName(rawCategory) {
    return rawCategory
        .replace(/_/g, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory() && isSlashCommandCategoryEnabled(dirent.name))
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 All Commands",
            description: "Browse every available command in a single list",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName = formatCategoryName(category);
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `View commands in the ${categoryName} category`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({
        title: `✨ ${botName} Command Center`,
        description: [
            '**Find the command you need.**',
            'Choose a category below to explore the available commands.',
        ].join('\n'),
        color: 'primary',
        thumbnail: client.user?.displayAvatarURL?.({ size: 1024 }),
    });

    embed.setFooter({
        text: `${botName} • Help Menu`,
        iconURL: client.user?.displayAvatarURL?.(),
    });

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Choose a command category…",
        options,
    );

    return {
        embeds: [embed],
        components: [selectRow],
    };
}

export default {
    prefixExecute: openPrefixHelp,
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Displays the help menu with all available commands"),

    async execute(interaction, guildConfig, client) {
        return openPrefixHelp(interaction, guildConfig, client, 'slash');
    },
};
