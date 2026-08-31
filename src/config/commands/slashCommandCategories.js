export const ENABLED_SLASH_COMMAND_CATEGORIES = new Set([
    'Core',
    'Counting',
    'Economy',
    'Leveling',
    'Moderation',
    'ServerStats',
    'Ticket',
]);

export function isSlashCommandCategoryEnabled(category) {
    return ENABLED_SLASH_COMMAND_CATEGORIES.has(category);
}
