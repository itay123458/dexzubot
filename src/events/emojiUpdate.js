import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildEmojiUpdate, async execute(oldEmoji, newEmoji) { if (oldEmoji.name === newEmoji.name) return; await logEvent({ client: newEmoji.client, guildId: newEmoji.guild.id, eventType: EVENT_TYPES.EMOJI_UPDATE, data: { title: 'Emoji updated', lines: [`**Emoji:** ${newEmoji.toString()}`, `**Name:** ${oldEmoji.name} → ${newEmoji.name}`], footer: { text: `Emoji ID: ${newEmoji.id}` } } }); } };
