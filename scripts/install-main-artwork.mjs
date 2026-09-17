import { REST, Routes } from 'discord.js';
import { readFile } from 'node:fs/promises';
import { initializeDatabase,db } from '../src/utils/database/wrapper.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { readCommunityValue,writeCommunityValue } from '../src/services/communityBetaService.js';
import { embedMotionKey,uploadedMotionAssetUrl } from '../src/services/embedMotionService.js';
import { createEmbed } from '../src/utils/embeds.js';
const main='1533088766821007390',beta='1486680755869323388',channelId='1543320978082369628';
if(process.env.GUILD_ID!==main||process.env.BETA_GUILD_ID!==beta)throw Error('Expected the configured DexzuBot servers.');
try {
 await initializeDatabase();const client={db},rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
 const channel=await rest.get(Routes.channel(channelId));if(channel.guild_id!==beta)throw Error('Artwork storage channel mismatch.');
 const key=`guild:${main}:embed-motion:assets:v1`,id=await readCommunityValue(client,key);
 let message=id?await rest.get(Routes.channelMessage(channelId,id)):null;
 if(message&&message.author.id!==process.env.CLIENT_ID)throw Error('Artwork message ownership mismatch.');
 if(!message) {
  const data=await readFile(new URL('../src/web/public/assets/embed-motion/dexzu-motion-avatar-main.gif',import.meta.url));
  message=await rest.post(Routes.channelMessages(channelId),{files:[{name:'dexzu-motion-avatar-main.gif',data}],body:{embeds:[createEmbed({title:'DexzuBot artwork',description:'Regular DexzuBot artwork used by Main. Keep this asset post.',thumbnail:'attachment://dexzu-motion-avatar-main.gif',footer:'DexzuBot · Artwork'}).toJSON()],allowed_mentions:{parse:[]}}});
  try{await writeCommunityValue(client,key,message.id);}catch(error){await rest.delete(Routes.channelMessage(channelId,message.id));throw error;}
 }
 const current=await readCommunityValue(client,embedMotionKey(main)),betaArt=await readCommunityValue(client,embedMotionKey(beta));
 const bannerUrl=current?.bannerUrl || betaArt?.bannerUrl;if(!bannerUrl)throw Error('Giveaway artwork is not installed.');
 await writeCommunityValue(client,embedMotionKey(main),{...current,enabled:current?.enabled!==false,bannerUrl,thumbnailUrl:uploadedMotionAssetUrl(message,'avatar-main')});
 console.log(JSON.stringify({guild:main,artworkMessage:message.id,asset:'dexzu-motion-avatar-main.gif'}));
}finally{await pgDb.disconnect();}
