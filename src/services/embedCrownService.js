import { isCommunityGuild } from '../config/community.js';
import { motionArtwork } from './embedMotionService.js';
import { readCommunityValue } from './communityBetaService.js';
export const embedCrownKey='community:animated-crown';
let crown=null;
export async function loadEmbedCrown(client) {
 crown=null;
 const value=await readCommunityValue(client,embedCrownKey);
 if(value?.name==='dexzu_crown' && value.animated===true && /^\d{17,20}$/.test(value.id)) crown=value;
 return {ready:Boolean(crown)};
}
export function embedCrownRevision(guildId) { return isCommunityGuild(guildId)?crown?.id || 'none':'none'; }
export function crownTitle(title,guildId) {
 if(typeof title!=='string'||!title||!crown||!isCommunityGuild(guildId))return title;
 const prefix=motionArtwork(guildId)?`<a:dexzu_crown:${crown.id}>`:'👑';
 const clean=title.replace(/^(?:<a?:dexzu_crown:\d+>|👑)\s*/u,'');
 return `${prefix} ${clean}`.slice(0,256);
}
