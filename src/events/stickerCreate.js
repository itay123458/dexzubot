import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildStickerCreate, async execute(sticker) { await logEvent({ client: sticker.client, guildId: sticker.guild.id, eventType: EVENT_TYPES.STICKER_CREATE, data: { title: 'Sticker created', lines: [`**Name:** ${sticker.name}`, `**Description:** ${sticker.description || 'None'}`], footer: { text: `Sticker ID: ${sticker.id}` } } }); } };
