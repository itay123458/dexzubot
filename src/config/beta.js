import { AsyncLocalStorage } from 'node:async_hooks';
import { isBotOwner, getBotOwners } from './bot.js';
const access = new AsyncLocalStorage();
export function isMainGuild(guildId) {
  const main = process.env.GUILD_ID?.trim();
  return Boolean(main && /^\d{17,20}$/.test(main) && String(guildId) === main);
}
// Only trusted Discord entry points establish this scope, never request bodies/custom IDs.
export function runWithBetaAccess(userId, guildId, callback) {
  return access.run({ userId, guildId }, callback);
}
export function canUseBetaFeatures(guildId, userId) {
  return isBetaGuild(guildId) || isMainGuild(guildId);
}
function canUseUnreleasedBeta(guildId, userId) {
  if (isBetaGuild(guildId)) return true;
  const scope = access.getStore();
  const actor = userId ?? (scope?.guildId === guildId ? scope.userId : null);
  return Boolean(getBetaGuildId() && isMainGuild(guildId) && isBotOwner(actor));
}
export function getBetaActorId() { return access.getStore()?.userId; }
export function canRegisterBetaCommand(command, guildId) {
  return !command?.betaOnly || isBetaGuild(guildId) || Boolean(isMainGuild(guildId) && (command?.releasedToMain || (getBetaGuildId() && getBotOwners().length)));
}
export function getBetaGuildId() {
  const guildId = process.env.BETA_GUILD_ID?.trim();
  return guildId && /^\d{17,20}$/.test(guildId) ? guildId : null;
}

export function isBetaGuild(guildId) {
  const betaGuildId = getBetaGuildId();
  return betaGuildId !== null && String(guildId) === betaGuildId;
}

export function canUseBetaCommand(command, guildId, userId, slash = false) {
  return !(command?.betaOnly || (slash && command?.betaSlash))
    || Boolean(command?.releasedToMain && isMainGuild(guildId))
    || canUseUnreleasedBeta(guildId, userId);
}
