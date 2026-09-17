import { AsyncLocalStorage } from 'node:async_hooks';
import { getBetaGuildId, isBetaGuild } from '../config/beta.js';

const messageGuild = new AsyncLocalStorage();
let saved = null;
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
  const url = (file?.url || message.embeds?.[0]?.[kind === 'avatar' ? 'thumbnail' : 'image']?.url)?.split('?')[0];
  if (!validAsset(url) || !url.endsWith(`/${name}`)) throw new Error('Artwork attachment missing or invalid.');
  return url;
}

export async function loadEmbedMotion(client) {
  const guildId = getBetaGuildId();
  saved = guildId ? await client.db.get(embedMotionKey(guildId)) : null;
  return embedMotionState(guildId);
}

export function embedMotionState(guildId) {
  const ready = isBetaGuild(guildId) && validAsset(saved?.thumbnailUrl) && validAsset(saved?.bannerUrl);
  return { enabled: Boolean(ready && saved?.enabled !== false), ready: Boolean(ready) };
}

export function motionArtwork(guildId = currentMessageGuild()) {
  return embedMotionState(guildId).enabled ? { thumbnailUrl: saved.thumbnailUrl, bannerUrl: saved.bannerUrl } : null;
}

export async function saveEmbedMotion(client, guildId, enabled) {
  if (!isBetaGuild(guildId)) throw new Error('Animated messages are available only in Beta.');
  if (!embedMotionState(guildId).ready) throw new Error('Message artwork has not been installed yet.');
  const next = { ...saved, enabled };
  if (await client.db.set(embedMotionKey(guildId), next) === false) throw new Error('Could not save message animation settings.');
  saved = next;
  return embedMotionState(guildId);
}
