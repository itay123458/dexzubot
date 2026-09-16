/** Beta commands share the bot process, but are available in one configured guild. */
export function getBetaGuildId() {
  const guildId = process.env.BETA_GUILD_ID?.trim();
  return guildId && /^\d{17,20}$/.test(guildId) ? guildId : null;
}

export function isBetaGuild(guildId) {
  const betaGuildId = getBetaGuildId();
  return betaGuildId !== null && String(guildId) === betaGuildId;
}

export function canUseBetaCommand(command, guildId) {
  return !command?.betaOnly || isBetaGuild(guildId);
}
