import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { z } from 'zod';
import { getCommandPrefix, isBotOwner } from '../config/bot.js';
import { patchGuildConfig } from './config/guildConfig.js';

const ids = z.array(z.string().regex(/^\d{17,20}$/)).max(25);
const settingsSchema = z.object({
  prefix: z.string().min(1).max(10).regex(/^[^\s`<>"'\\]+$/, 'Use 1–10 characters without spaces, quotes, backticks or angle brackets.'),
  enabled: z.boolean(), allowedChannelIds: ids, allowedRoleIds: ids,
}).strict();

export function getPrefixSettings(config) {
  return { prefix: config?.prefix || getCommandPrefix(), enabled: config?.prefixCommands?.enabled !== false,
    allowedChannelIds: config?.prefixCommands?.allowedChannelIds || [], allowedRoleIds: config?.prefixCommands?.allowedRoleIds || [] };
}

export function canManagePrefix(member) {
  return Boolean(member && (isBotOwner(member.id) || member.guild?.ownerId === member.id || member.permissions?.has(PermissionFlagsBits.ManageGuild)));
}

export function prefixAllowed(config, member, channelId) {
  const settings = getPrefixSettings(config);
  return settings.enabled && (!settings.allowedChannelIds.length || settings.allowedChannelIds.includes(channelId)) &&
    (!settings.allowedRoleIds.length || settings.allowedRoleIds.some(id => member?.roles?.cache?.has(id)));
}

export async function savePrefixSettings(client, guild, input) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Invalid prefix settings.');
  const settings = parsed.data;
  for (const id of settings.allowedChannelIds) {
    const channel = guild.channels.cache.get(id);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error('Choose text channels from this server.');
  }
  for (const id of settings.allowedRoleIds) {
    const role = guild.roles.cache.get(id);
    if (!role || role.managed || id === guild.id) throw new Error('Choose non-managed roles from this server (not @everyone).');
  }
  const { prefix, ...prefixCommands } = settings;
  await patchGuildConfig(client, guild.id, { prefix, prefixCommands });
  return settings;
}
