import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.GuildEmojiCreate, async execute(emoji) { await logEvent({ client: emoji.client, guildId: emoji.guild.id, eventType: EVENT_TYPES.EMOJI_CREATE, data: { title: 'Emoji created', lines: [`**Emoji:** ${emoji.toString()}`, `**Name:** ${emoji.name}`], footer: { text: `Emoji ID: ${emoji.id}` } } }); } };
