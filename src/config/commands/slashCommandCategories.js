import { canUseBetaCommand, isBetaGuild } from '../beta.js';
import { isCommunityGuild } from '../community.js';

export const ENABLED_SLASH_COMMAND_CATEGORIES = new Set([
    'Core',
    'Counting',
    'Economy',
    'Leveling',
    'Moderation',
    'Music',
    'ServerStats',
    'Ticket',
]);

export function isSlashCommandCategoryEnabled(category, guildId = null) {
    return (category === 'Community' && isCommunityGuild(guildId)) || ENABLED_SLASH_COMMAND_CATEGORIES.has(category) || (['Welcome','Community'].includes(category) && isBetaGuild(guildId));
}

export function isSlashCommandEnabled(command, guildId = null) {
    return Boolean(command && (!command.communityRelease || isCommunityGuild(guildId)) && canUseBetaCommand(command, guildId)
      && ((command.communityRelease && isCommunityGuild(guildId)) || ENABLED_SLASH_COMMAND_CATEGORIES.has(command.category) || (command.betaSlash === true && isBetaGuild(guildId))));
}
