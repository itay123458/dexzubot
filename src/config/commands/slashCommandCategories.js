export const ENABLED_SLASH_COMMAND_CATEGORIES = new Set([
    'Core',
    'Counting',
    'Economy',
    'Logging',
    'Moderation',
    'Music',
    'ServerStats',
    'Ticket',
]);

export function isSlashCommandCategoryEnabled(category) {
    return ENABLED_SLASH_COMMAND_CATEGORIES.has(category);
}
