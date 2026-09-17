import { currentMessageGuild, motionArtwork } from './embedMotionService.js';
import { readCommunityValue } from './communityBetaService.js';

export const communityArrowKey = 'community:animated-arrow';
export const communityArrowName = 'dexzu_arrow';
let saved = null;
export const validCommunityArrow = value => Boolean(value && /^\d{17,20}$/.test(value.id) && value.name === communityArrowName && value.animated === true);

export async function loadCommunityMotion(client) {
  // Clear stale state first: a failed reload must never keep using an old emoji.
  saved = null;
  const value = await readCommunityValue(client, communityArrowKey);
  if (validCommunityArrow(value)) saved = { id: value.id, name: value.name, animated: true };
  return { ready: Boolean(saved) };
}

export function communityArrow(guildId = currentMessageGuild()) {
  return saved && motionArtwork(guildId) ? `<a:${saved.name}:${saved.id}>` : '◆';
}
