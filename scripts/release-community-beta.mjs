import { Client, GatewayIntentBits, Events, ChannelType, PermissionFlagsBits } from 'discord.js';
import { once } from 'node:events';
import { mkdir,writeFile } from 'node:fs/promises';
import { initializeDatabase,db } from '../src/utils/database/wrapper.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { getCommunityConfig,saveCommunityConfig,readCommunityValue,writeCommunityValue } from '../src/services/communityBetaService.js';
import { publishCommunityPanel } from '../src/services/communityBetaPanels.js';
import { loadEmbedMotion } from '../src/services/embedMotionService.js';
import { betaReleases } from '../src/config/releases.js';
import { createEmbed } from '../src/utils/embeds.js';
import { loadEmbedCrown } from '../src/services/embedCrownService.js';
const guildId='1486680755869323388',prepare=process.argv.includes('--prepare'),announce=process.argv.includes('--announce');
if(process.env.BETA_GUILD_ID!==guildId || process.env.GUILD_ID===guildId || prepare===announce) throw new Error('Choose --prepare or --announce for the approved beta guild only.');
const client=new Client({intents:[GatewayIntentBits.Guilds]});client.db=db;
try {
 await initializeDatabase();if(!db.isAvailable())throw new Error('Persistent storage unavailable.');
 const ready=once(client,Events.ClientReady);await client.login(process.env.DISCORD_TOKEN);await ready;
 const guild=client.guilds.cache.get(guildId);if(!guild)throw new Error('Beta guild unavailable.');
 await Promise.all([guild.roles.fetch(),guild.channels.fetch(),guild.members.fetchMe()]);await loadEmbedMotion(client);await loadEmbedCrown(client);
 const key=`guild:${guildId}:community-beta:setup:v1`;
 if(prepare) {
  const previous=await readCommunityValue(client,key);
  if(!previous) {
   const old=await getCommunityConfig(client,guildId);
   await mkdir('backups',{recursive:true});
   const backup=`backups/community-beta-${Date.now()}.json`;
   await writeFile(backup,JSON.stringify({guildId,config:old,channels:[...guild.channels.cache.values()].map(c=>({id:c.id,name:c.name,parentId:c.parentId,type:c.type,overwrites:c.permissionOverwrites?.cache.map(o=>({id:o.id,type:o.type,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()}))}))},null,2),{flag:'wx',mode:0o600});
   const staffRoleId='1549859935435759739',reviewerRoleId='1486680755940626453';
   if(!guild.roles.cache.has(staffRoleId)||!guild.roles.cache.has(reviewerRoleId))throw new Error('Expected beta roles are missing.');
   const staffOverwrites=[{id:guildId,deny:[PermissionFlagsBits.ViewChannel]},{id:staffRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:reviewerRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}];
   const channel=async(name,parent,type=ChannelType.GuildText,overwrites=null)=>{
    const existing=guild.channels.cache.find(c=>c.name===name&&c.type===type);
    if(existing)return existing;
    return guild.channels.create({name,type,...(parent?{parent}:{}),...(overwrites?{permissionOverwrites:overwrites}:{}),reason:'DexzuBot beta community tools requested by owner'});
   };
   const privateCategory=await channel('BETA STAFF',null,ChannelType.GuildCategory,staffOverwrites);
   const reviewOverwrites=staffOverwrites.filter(o=>o.id!==staffRoleId);
   const review=await channel('staff-reviews',privateCategory.id,ChannelType.GuildText,reviewOverwrites);
   const invites=await channel('invite-rewards','1549857862879027214');
   const applications=await channel('apply-for-staff','1549857862879027214');
   const leave=await channel('staff-leave',privateCategory.id,ChannelType.GuildText,staffOverwrites);
   const activity=await channel('staff-activity',privateCategory.id,ChannelType.GuildText,staffOverwrites);
   const info=await channel('server-info','1549856707436478646');
   const config=await saveCommunityConfig(client,guild,{features:{inviteRewards:true,ticketCategories:true,applications:true,leave:true,activity:true,serverInfo:true},dmUpdates:{applications:true,tickets:true,leave:true},
     ticketButtons:{support:true,report:true,partnership:true},staffRoleId,reviewerRoleId,reviewChannelId:review.id,
     channels:{inviteRewards:invites.id,applications:applications.id,leave:leave.id,activity:activity.id,serverInfo:info.id},
     links:{rules:'1549857854570102886',support:'1543280865038303363',applications:applications.id,giveaways:'1549857881833345104',community:'1543157790996955196',counting:'1543279749609296022'}});
   await writeCommunityValue(client,key,{channels:config.channels,reviewChannelId:review.id,backup});
   console.log(JSON.stringify({prepared:true,backup,channels:config.channels}));
  } else {await getCommunityConfig(client,guildId);console.log('Existing beta configuration preserved.');}
  for(const kind of ['inviteRewards','ticketCategories','applications','leave','activity','serverInfo']) {
   if((await getCommunityConfig(client,guildId)).features[kind])console.log(JSON.stringify(await publishCommunityPanel(client,guild,kind)));
  }
 } else {
  const release=betaReleases.find(x=>x.id==='2026-09-17-community');
  const channel=await guild.channels.fetch('1549857857414111272');
  const key=`guild:${guildId}:release:${release.id}`,id=await readCommunityValue(client,key);
  const embed=createEmbed({guildId,title:'Community tools · Beta',author:'DEXZUBOT / BETA UPDATES',description:release.summary+'\n\n'+release.changes.map(x=>'• '+x).join('\n'),fields:[{name:'Try it',value:'`/invite-rewards` · `/beta-staff` · `/community-beta guide`\n[Beta dashboard](https://ik.tailce7102.ts.net/dashboard/?workspace=beta#operations) → Operations → Community tools.'},{name:'Beta only',value:release.scope}],footer:'DexzuBot · Beta · 17 Sep 2026'});
  const previous=id?await channel.messages.fetch(id):null;if(previous&&previous.author.id!==client.user.id)throw new Error('Release message is not owned by DexzuBot.');
  const payload={content:'',embeds:[embed],allowedMentions:{parse:[]}};
  const message=previous?await previous.edit(payload):await channel.send(payload);
  try {await writeCommunityValue(client,key,message.id);} catch(error) {
   if(!previous)await message.delete().catch(()=>{throw new Error(`Release storage failed; remove the untracked announcement before retrying: ${message.url}`);});
   throw error;
  }
  console.log(JSON.stringify({release:message.url}));
 }
} catch(error) {console.error(JSON.stringify({name:error.name,message:error.message}));process.exitCode=1;}
finally{client.destroy();await pgDb.disconnect();}
