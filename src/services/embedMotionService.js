import { AsyncLocalStorage } from 'node:async_hooks';
import { getCommunityGuildIds, isCommunityGuild } from '../config/community.js';
import { getBetaGuildId } from '../config/beta.js';

const messageGuild = new AsyncLocalStorage();
const savedByGuild = new Map();
export const embedMotionKey = guildId => `guild:${guildId}:embed-motion`;
export const runWithMessageGuild = (guildId, callback) => messageGuild.run(guildId ?? null, callback);
export const currentMessageGuild = () => messageGuild.getStore() ?? null;
// Collectors subscribe to Discord independently of repository event handlers.
// Scope this instance's emissions, including timeout callbacks, to its source.
export function createGuildCollector(source, options) {
  const guildId = source.guildId || source.guild?.id || currentMessageGuild();
  const collector = source.createMessageComponentCollector(options);
  const emit = collector.emit;
  collector.emit = function (...args) {
    return runWithMessageGuild(guildId, () => emit.apply(this, args));
  };
  return collector;
}
const validAsset = value => typeof value === 'string' && /^https:\/\/cdn\.discordapp\.com\/attachments\/\d+\/\d+\/dexzu-motion-[\w-]+\.gif$/.test(value);

export function uploadedMotionAssetUrl(message, kind) {
  const name = `dexzu-motion-${kind}.gif`;
  // Discord can move embed-used uploads out of the attachments array.
  const file = message.attachments?.find(item => item.filename === name);
  const url = (file?.url || message.embeds?.[0]?.[kind.startsWith('avatar') ? 'thumbnail' : 'image']?.url)?.split('?')[0];
  if (!validAsset(url) || !url.endsWith(`/${name}`)) throw new Error('Artwork attachment missing or invalid.');
  return url;
}

export async function loadEmbedMotion(client) {
  savedByGuild.clear();
  for(const guildId of getCommunityGuildIds()) savedByGuild.set(guildId,await client.db.get(embedMotionKey(guildId)));
  return embedMotionState(getBetaGuildId());
}

export function embedMotionState(guildId) {
  const saved = savedByGuild.get(guildId);
  const ready = isCommunityGuild(guildId) && validAsset(saved?.thumbnailUrl) && validAsset(saved?.bannerUrl);
  return { enabled: Boolean(ready && saved?.enabled !== false), ready: Boolean(ready) };
}

export function motionArtwork(guildId = currentMessageGuild()) {
  const saved = savedByGuild.get(guildId);
  return embedMotionState(guildId).enabled ? { thumbnailUrl: saved.thumbnailUrl, bannerUrl: saved.bannerUrl } : null;
}

export async function saveEmbedMotion(client, guildId, enabled) {
  if (!isCommunityGuild(guildId)) throw new Error('Animated messages are available in the configured workspaces.');
  if (!embedMotionState(guildId).ready) throw new Error('Message artwork has not been installed yet.');
  const next = { ...savedByGuild.get(guildId), enabled };
  if (await client.db.set(embedMotionKey(guildId), next) === false) throw new Error('Could not save message animation settings.');
  savedByGuild.set(guildId,next);
  return embedMotionState(guildId);
}
