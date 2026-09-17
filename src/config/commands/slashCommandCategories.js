import { canUseBetaCommand, isBetaGuild } from '../beta.js';

export const ENABLED_SLASH_COMMAND_CATEGORIES = new Set([
    'Core',
    'Counting',
    'Economy',
    'Leveling',
    'Moderation',
    'ServerStats',
    'Ticket',
]);

export function isSlashCommandCategoryEnabled(category, guildId = null) {
    return ENABLED_SLASH_COMMAND_CATEGORIES.has(category) || (['Welcome','Community'].includes(category) && isBetaGuild(guildId));
}

export function isSlashCommandEnabled(command, guildId = null) {
    return Boolean(command && canUseBetaCommand(command, guildId)
      && (ENABLED_SLASH_COMMAND_CATEGORIES.has(command.category) || (command.betaSlash === true && isBetaGuild(guildId))));
}
