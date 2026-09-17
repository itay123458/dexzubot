import { getBetaGuildId } from './beta.js';

// Release community features only to the two configured workspaces.
export function getCommunityGuildIds() {
  return [...new Set([process.env.GUILD_ID?.trim(), getBetaGuildId()].filter(id => /^\d{17,20}$/.test(id || '')))];
}
export function isCommunityGuild(guildId) {
  return guildId != null && getCommunityGuildIds().includes(String(guildId));
}
