import { communityArrow } from './communityMotionService.js';
import { isBetaGuild } from '../config/beta.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, escapeMarkdown } from 'discord.js';
import { createEmbed } from '../utils/embeds.js';
import { createSupportPanelMessage } from '../utils/brandPanels.js';
import { getGuildConfig, setGuildConfig } from './config/guildConfig.js';
import { assertBetaFeature, assertCommunityBeta, getCommunityConfig, readCommunityValue, writeCommunityValue } from './communityBetaService.js';
import { refreshConfiguredPanelDesigns } from './panelDesignService.js';
import { buildInviteRewardsPanel } from './betaInviteRewardsService.js';
import { buildStaffPanel } from './betaStaffService.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { Mutex } from '../utils/mutex.js';
const panelsKey = id => `guild:${id}:community-beta:panels`;
const fail = message => { throw createError(message,ErrorTypes.VALIDATION,message); };

export async function buildServerInfoPanel(client,guild) {
  const config=await assertBetaFeature(client,guild.id,'serverInfo');
  const labels={rules:'Server Rules',support:'Get Support',applications:'Apply for Staff',giveaways:'Giveaways',community:'Community',counting:'Counting'};
  const links=[new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Website / Dashboard').setURL(`https://ik.tailce7102.ts.net/dashboard/?workspace=${isBetaGuild(guild.id)?'beta':'main'}`)];
  for(const [key,id] of Object.entries(config.links)) if(id) {
    const channel=await guild.channels.fetch(id).catch(()=>null);
    if(channel?.guild?.id===guild.id) links.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(labels[key]).setURL(`https://discord.com/channels/${guild.id}/${id}`));
  }
  const destinations=Object.entries(config.links).filter(([,id])=>id).map(([key,id])=>`${communityArrow(guild.id)} **${labels[key]}** — <#${id}>`).join('\n');
  const embed=createEmbed({guildId:guild.id,title:`About ${escapeMarkdown(guild.name).slice(0,200)}`,author:'DEXZUBOT / COMMUNITY',
    description:'Your community, at a glance. Use the links below to find support, events, and places to join in.',
    fields:[...(destinations?[{name:'Explore the server',value:destinations}]:[]),{name:'Community at a glance',value:`**${guild.memberCount ?? '—'} members** · **${guild.premiumSubscriptionCount ?? 0} boosts** · Boost level **${guild.premiumTier ?? 0}**\nEstablished <t:${Math.floor(guild.createdTimestamp/1000)}:D>`},
      {name:'Community safety',value:'Follow the server rules and use private support to report a concern. Staff review applications and leave requests through DexzuBot.'}],
    footer:'DexzuBot · Statistics refreshed when this panel is published',
  });
  const rows=[];while(links.length)rows.push(new ActionRowBuilder().addComponents(links.splice(0,5)));
  return {embeds:[embed],components:rows,allowedMentions:{parse:[]}};
}
async function payloadFor(client,guild,kind) {
  if(kind==='inviteRewards') return buildInviteRewardsPanel(client,guild);
  if(['applications','leave','activity'].includes(kind)) return buildStaffPanel(client,guild,kind);
  if(kind==='serverInfo') return buildServerInfoPanel(client,guild);
  fail('Choose a supported panel.');
}
export async function refreshCommunityTicketPanel(client,guild) {
  assertCommunityBeta(guild.id);
  await getCommunityConfig(client,guild.id);
  return refreshConfiguredPanelDesigns(client,guild.id);
}
export async function refreshPublishedCommunityPanels(client,guild) {
  const config=await getCommunityConfig(client,guild.id);
  const saved=await readCommunityValue(client,panelsKey(guild.id)) || {};
  let refreshed=0,errors=0;
  for(const kind of Object.keys(saved))if(config.features[kind]) {
    try{await publishCommunityPanel(client,guild,kind);refreshed++;}catch{errors++;}
  }
  return {refreshed,errors};
}
export async function publishCommunityPanel(client,guild,kind) {
  return Mutex.runExclusive(`community-publish:${guild.id}`,async()=>{
    const config=await assertBetaFeature(client,guild.id,kind);
    const legacy=kind==='ticketCategories' ? await getGuildConfig(client,guild.id) : null;
    const channelId=legacy?.ticketPanelChannelId || config.channels[kind];
    if(!channelId) fail('Choose a panel channel in settings first. Ticket panels use the existing ticket configuration.');
    const channel=await guild.channels.fetch(channelId).catch(()=>null);
    const me=await guild.members.fetchMe({force:true});
    if(!channel?.isTextBased?.() || channel.guild.id!==guild.id || !channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])) fail('DexzuBot needs View Channel, Send Messages, and Embed Links in the panel channel.');
    const saved=await readCommunityValue(client,panelsKey(guild.id)) || {};
    const previous=legacy?.ticketPanelMessageId ? {channelId,messageId:legacy.ticketPanelMessageId} : saved[kind];
    let message=previous?.channelId===channelId ? await channel.messages.fetch(previous.messageId).catch(error=>{if(error.code===10008)return null;throw error;}) : null;
    if(message && message.author.id!==client.user.id) fail('The configured panel message does not belong to DexzuBot.');
    const payload=kind==='ticketCategories' ? createSupportPanelMessage(legacy,guild.iconURL?.(),message,guild.id) : await payloadFor(client,guild,kind);
    const created=!message;
    message=message ? await message.edit(payload) : await channel.send(payload);
    try {
      if(legacy) await setGuildConfig(client,guild.id,{...legacy,ticketPanelChannelId:channelId,ticketPanelMessageId:message.id});
      else await writeCommunityValue(client,panelsKey(guild.id),{...saved,[kind]:{channelId,messageId:message.id}});
    } catch(error) {
      if(created) await message.delete().catch(()=>{throw new Error(`Panel storage failed; remove the untracked panel before retrying: ${message.url}`);});
      throw error;
    }
    return {url:message.url || `https://discord.com/channels/${guild.id}/${channelId}/${message.id}`,kind,messageId:message.id};
  });
}
