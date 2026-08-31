import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildStickerDelete, async execute(sticker) { await logEvent({ client: sticker.client, guildId: sticker.guild.id, eventType: EVENT_TYPES.STICKER_DELETE, data: { title: 'Sticker deleted', lines: [`**Name:** ${sticker.name}`], footer: { text: `Sticker ID: ${sticker.id}` } } }); } };
