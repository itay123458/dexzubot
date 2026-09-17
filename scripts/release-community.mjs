import { Client, GatewayIntentBits, Events, ChannelType, PermissionFlagsBits } from 'discord.js';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { initializeDatabase, db } from '../src/utils/database/wrapper.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { getCommunityConfig, saveCommunityConfig, readCommunityValue, writeCommunityValue, assertCommunityPrivateChannel } from '../src/services/communityBetaService.js';
import { publishCommunityPanel } from '../src/services/communityBetaPanels.js';
import { loadEmbedMotion, embedMotionKey } from '../src/services/embedMotionService.js';
import { loadCommunityMotion } from '../src/services/communityMotionService.js';
import { communityRelease } from '../src/config/releases.js';
import { createEmbed } from '../src/utils/embeds.js';
import { loadEmbedCrown } from '../src/services/embedCrownService.js';

const main='1533088766821007390', beta='1486680755869323388';
const mode=process.argv[2];
if(process.env.GUILD_ID!==main || process.env.BETA_GUILD_ID!==beta || !['prepare','panels','announce'].includes(mode)) throw Error('Use prepare, panels or announce for the approved main and beta servers.');
const client=new Client({intents:[GatewayIntentBits.Guilds]});client.db=db;
try {
 await initializeDatabase();if(!db.isAvailable())throw Error('Persistent storage unavailable.');
 const ready=once(client,Events.ClientReady);await client.login(process.env.DISCORD_TOKEN);await ready;
 const guild=await client.guilds.fetch(main);await guild.roles.fetch();await guild.channels.fetch();await guild.members.fetchMe();
 const setupKey=`guild:${main}:community-release:setup`;
 if(mode==='prepare' && !await readCommunityValue(client,setupKey)) {
  const old=await getCommunityConfig(client,main);
  await mkdir('backups',{recursive:true});const backup=`backups/community-release-${Date.now()}.json`;
  await writeFile(backup,JSON.stringify({config:old,channels:guild.channels.cache.map(c=>({id:c.id,name:c.name,parent:c.parentId,overwrites:c.permissionOverwrites?.cache.map(o=>({id:o.id,type:o.type,allow:String(o.allow.bitfield),deny:String(o.deny.bitfield)}))}))},null,2),{flag:'wx',mode:0o600});
  const staffRoleId='1534038412082937956',reviewerRoleId='1534038511051735190';
  if(!guild.roles.cache.has(staffRoleId)||!guild.roles.cache.has(reviewerRoleId))throw Error('Expected main staff roles are missing.');
  const privateOverwrites=[{id:main,deny:[PermissionFlagsBits.ViewChannel]},{id:staffRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:reviewerRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}];
  const publicOverwrites=[{id:main,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.SendMessages]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks]}];
  const channel=async(name,parent,privateChannel=false)=>{
   const existing=guild.channels.cache.find(c=>c.name===name&&c.type===ChannelType.GuildText&&c.parentId===parent);
   if(existing){if(privateChannel)assertCommunityPrivateChannel(guild,existing,{reviewerRoleId});return existing;}
   return guild.channels.create({name,type:ChannelType.GuildText,parent,permissionOverwrites:privateChannel?privateOverwrites:publicOverwrites,reason:'DexzuBot community tools full release requested by owner'});
  };
  const communityParent='1533088767441637400',staffParent='1533417594252427375',infoParent='1533088767441637396';
  const review=await channel('staff-applications-review',staffParent,true);
  const invites=await channel('invite-rewards',communityParent);
  const applications=await channel('apply-for-staff','1534462967876161678');
  const leave=await channel('staff-leave',staffParent,true);
  const info=await channel('server-guide',infoParent);
  const config=await saveCommunityConfig(client,guild,{features:{inviteRewards:true,ticketCategories:true,applications:true,leave:true,activity:false,serverInfo:true},
   dmUpdates:{applications:true,tickets:true,leave:true},ticketButtons:{support:true,report:true,partnership:true},staffRoleId,reviewerRoleId,reviewChannelId:review.id,
   channels:{inviteRewards:invites.id,applications:applications.id,leave:leave.id,activity:null,serverInfo:info.id},
   links:{rules:'1533304708381540393',support:'1534463046766821536',applications:applications.id,community:'1533088767441637401',counting:'1534036556333973666'}});
  // Main artwork must be installed separately; never copy the Beta badge to Main.
  if(!await readCommunityValue(client,embedMotionKey(main))) {
   throw Error('Run scripts/install-main-artwork.mjs before preparing Main.');
  }
  await writeCommunityValue(client,setupKey,{backup,channels:config.channels});
  console.log(JSON.stringify({prepared:main,backup,channels:config.channels}));
 }
 await loadEmbedMotion(client);await loadCommunityMotion(client);await loadEmbedCrown(client);
 if(mode==='panels')for(const id of [beta,main]) {
  const g=await client.guilds.fetch(id),config=await getCommunityConfig(client,id);
  for(const kind of Object.keys(config.features))if(config.features[kind] && !(id===main && kind==='activity'))console.log(JSON.stringify(await publishCommunityPanel(client,g,kind)));
 }
 if(mode==='announce')for(const [id,channelId] of [[beta,'1549857857414111272']]) {
  const channel=await client.channels.fetch(channelId),key=`guild:${id}:release:${communityRelease.id}`;
  if(channel.guildId!==id||!channel.isTextBased())throw Error('Release channel is outside the intended server.');
  const prior=await readCommunityValue(client,key);
  const message=prior?await channel.messages.fetch(prior):null;
  if(message&&message.author.id!==client.user.id)throw Error('Release message ownership mismatch.');
  const payload={content:'',embeds:[createEmbed({guildId:id,title:'Community tools are live',author:'DEXZUBOT / UPDATES',description:communityRelease.changes.map(s=>`• ${s}`).join('\n'),fields:[{name:'Try it',value:'`/staff` · `/community guide` · `/invite-rewards`\nSettings: Dashboard → Operations → Community tools.'}],footer:'DexzuBot · 17 Sep 2026'})],allowedMentions:{parse:[]}};
  const sent=message?await message.edit(payload):await channel.send(payload);
  try{await writeCommunityValue(client,key,sent.id);}catch(error){if(!message)await sent.delete();throw error;}
  console.log(JSON.stringify({release:sent.url}));
 }
}finally{client.destroy();await pgDb.disconnect();}
