import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
export default { name: Events.InviteDelete, async execute(invite) { if(!invite.guild)return; await logEvent({ client: invite.client, guildId: invite.guild.id, eventType: EVENT_TYPES.INVITE_DELETE, data: { title: 'Invite deleted', lines: [`**Code:** \`${invite.code}\``, `**Channel:** ${invite.channel?.toString()||'Unknown'}`], channelId: invite.channelId, footer: { text: `Invite code: ${invite.code}` } } }); } };
