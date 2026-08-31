import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildEmojiDelete, async execute(emoji) { await logEvent({ client: emoji.client, guildId: emoji.guild.id, eventType: EVENT_TYPES.EMOJI_DELETE, data: { title: 'Emoji deleted', lines: [`**Name:** ${emoji.name}`], footer: { text: `Emoji ID: ${emoji.id}` } } }); } };
