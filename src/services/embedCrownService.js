import { isCommunityGuild } from '../config/community.js';
import { motionArtwork } from './embedMotionService.js';
import { readCommunityValue } from './communityBetaService.js';
import { embedEmojiAssets, embedEmojisKey } from '../config/embedEmojis.js';
export const embedCrownKey='community:animated-crown';
let crown=null;
let accents=[];
export async function loadEmbedCrown(client) {
 crown=null;
 accents=[];
 const value=await readCommunityValue(client,embedCrownKey);
 if(value?.name==='dexzu_crown' && value.animated===true && /^\d{17,20}$/.test(value.id)) crown=value;
 const saved=await readCommunityValue(client,embedEmojisKey);
 accents=embedEmojiAssets.flatMap(asset=>{
  const emoji=Array.isArray(saved)?saved.find(item=>item?.name===asset.name):null;
  return emoji?.animated===true && /^\d{17,20}$/.test(emoji.id)?[{...asset,id:emoji.id}]:[];
 });
 return {ready:Boolean(crown)};
}
export function embedCrownRevision(guildId) { return isCommunityGuild(guildId)&&crown?[crown.id,...accents.map(e=>e.id)].join('-'):'none'; }
export function crownTitle(title,guildId) {
 if(typeof title!=='string'||!title||!crown||!isCommunityGuild(guildId))return title;
 const prefix=motionArtwork(guildId)?`<a:dexzu_crown:${crown.id}>`:'👑';
 const clean=title.replace(/^(?:(?:<a?:dexzu_(?:crown|search|sparkles|gift|starburst):\d+>|[👑🔎✨🎁✦])\s*)+/u,'');
 // One contextual accent. Errors and moderation warnings keep their serious tone.
 const name=/\b(error|wrong|failed|denied|invalid|warning|ban|kick|timeout|missing)s?\b/i.test(clean)?null
  :/\b(giveaway|reward|prize|gift|winner|balance)s?\b/i.test(clean)?'dexzu_gift'
  :/\b(search|help|lookup|guide|information|info|support|list|find)s?\b/i.test(clean)?'dexzu_search'
  :/\b(staff|application|question|leave|activity|review|partnership)s?\b/i.test(clean)?'dexzu_starburst'
  :'dexzu_sparkles';
 const accent=accents.find(e=>e.name===name);
 const icon=accent?(motionArtwork(guildId)?`<a:${accent.name}:${accent.id}>`:accent.fallback):'';
 return `${prefix}${icon?` ${icon}`:''} ${clean}`.slice(0,256);
}
