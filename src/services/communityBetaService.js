import { z } from 'zod';
import { PermissionFlagsBits } from 'discord.js';
import { isBetaGuild } from '../config/beta.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { Mutex } from '../utils/mutex.js';
import { pgConfig } from '../config/database/postgres.js';

const snowflake = z.string().regex(/^\d{17,20}$/).nullable();
const idFields = names => z.object(Object.fromEntries(names.map(name => [name, snowflake]))).strict();
export const COMMUNITY_FEATURES = ['inviteRewards','ticketCategories','applications','leave','activity','serverInfo'];
const bools = names => z.object(Object.fromEntries(names.map(name => [name,z.boolean()]))).strict();
export const communityConfigSchema = z.object({
  features: bools(COMMUNITY_FEATURES), dmUpdates: bools(['applications','tickets','leave']),
  ticketButtons: bools(['support','report','partnership']),
  staffRoleId: snowflake, reviewerRoleId: snowflake, reviewChannelId: snowflake,
  channels: idFields(['inviteRewards','applications','leave','activity','serverInfo']),
  links: idFields(['rules','support','applications','giveaways','community','counting']),
  questions: z.array(z.object({ label: z.string().trim().min(3).max(200), required: z.boolean() }).strict()).min(1).max(10),
  milestones: z.array(z.object({ invites: z.number().int().min(1).max(10000), coins: z.number().int().min(1).max(1000000) }).strict()).min(1).max(10)
    .refine(items => new Set(items.map(item=>item.invites)).size === items.length,'Invite milestones must have different thresholds.'),
  minAccountDays: z.number().int().min(0).max(365), minimumStayHours: z.number().int().min(0).max(720),
}).strict();
export const communityConfigKey = id => `guild:${id}:community-beta:config`;
const cached = new Map();
export const cachedCommunityConfig = id => isBetaGuild(id) ? cached.get(id) || defaults() : null;
const defaults = () => ({
  features: Object.fromEntries(COMMUNITY_FEATURES.map(name=>[name,false])),
  dmUpdates: { applications:false,tickets:false,leave:false },
  ticketButtons: {support:true,report:true,partnership:true},
  staffRoleId:null,reviewerRoleId:null,reviewChannelId:null,
  channels:{inviteRewards:null,applications:null,leave:null,activity:null,serverInfo:null},
  links:{rules:null,support:null,applications:null,giveaways:null,community:null,counting:null},
  questions:[
    {label:'Why would you like to join the staff team?',required:true},
    {label:'What moderation or community experience do you have?',required:true},
    {label:'When are you usually available, and what is your time zone?',required:true},
    {label:'How would you handle a disagreement between members?',required:true},
    {label:'Is there anything else you would like us to know?',required:false},
  ],
  milestones:[{invites:2,coins:250},{invites:5,coins:700},{invites:8,coins:1200},{invites:10,coins:1750},{invites:14,coins:2500}],
  minAccountDays:7,minimumStayHours:24,
});
const fail = (message,type=ErrorTypes.VALIDATION) => { throw new TitanBotError(message,type,message); };
function persistentPool(client) {
  if (!client.db?.connectionType) return null; // Injected test stores.
  if(client.db.connectionType!=='postgresql' || !client.db.isAvailable() || !client.db.db?.pool) fail('Persistent community storage is unavailable. Please try again.',ErrorTypes.DATABASE);
  return client.db.db.pool;
}
export async function readCommunityValue(client,key) {
  const pool=persistentPool(client);
  return pool ? (await pool.query(`SELECT value FROM ${pgConfig.tables.temp_data} WHERE key=$1`,[key])).rows[0]?.value : await client.db.get(key);
}
export async function writeCommunityValue(client,key,value) {
  const pool=persistentPool(client);
  if(pool) await pool.query(`INSERT INTO ${pgConfig.tables.temp_data} (key,value,expires_at) VALUES ($1,$2,NULL) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,expires_at=NULL`,[key,JSON.stringify(value)]);
  else if(await client.db.set(key,value)===false) fail('Community settings could not be saved. Please try again.',ErrorTypes.DATABASE);
}
export function assertCommunityBeta(guildId) {
  if(!isBetaGuild(guildId)) fail('These community tools are available only in the DexzuBot beta server.',ErrorTypes.PERMISSION);
}
function merge(base,patch) {
  return {...base,...patch,...Object.fromEntries(['features','dmUpdates','ticketButtons','channels','links'].map(key=>[key,{...base[key],...patch?.[key]}]))};
}
export async function getCommunityConfig(client,guildId) {
  assertCommunityBeta(guildId);
  const stored=await readCommunityValue(client,communityConfigKey(guildId));
  const config=communityConfigSchema.parse(merge(defaults(),stored||{}));
  cached.set(guildId,config);
  return config;
}
export async function assertBetaFeature(client,guildId,feature) {
  const config=await getCommunityConfig(client,guildId);
  if(!config.features[feature]) fail('This feature is switched off in Beta. Staff can enable it in the dashboard.',ErrorTypes.CONFIGURATION);
  return config;
}
export function assertCommunityReviewer(guild,member,config) {
  assertCommunityBeta(guild.id);
  if(member?.permissions?.has(PermissionFlagsBits.ManageGuild) || (config.reviewerRoleId && member?.roles?.cache?.has(config.reviewerRoleId))) return;
  fail('You need Manage Server or the configured reviewer role.',ErrorTypes.PERMISSION);
}
export function assertCommunityStaff(guild,member,config) {
  assertCommunityBeta(guild.id);
  if(config.staffRoleId && member?.roles?.cache?.has(config.staffRoleId)) return;
  assertCommunityReviewer(guild,member,config);
}
export function assertCommunityPrivateChannel(guild,channel,config,{memberId=null}={}) {
  if (!channel?.isTextBased?.() || channel.guild?.id!==guild.id || channel.permissionsFor(guild.id)?.has(PermissionFlagsBits.ViewChannel)) fail('Choose a private channel visible only to the member and staff reviewers.');
  for (const overwrite of channel.permissionOverwrites?.cache?.values?.() || []) {
    if(!overwrite.allow?.has(PermissionFlagsBits.ViewChannel)) continue;
    if([guild.members.me?.id,guild.ownerId,memberId].filter(Boolean).includes(overwrite.id)) continue;
    if(overwrite.id===config.reviewerRoleId) continue;
    const role=guild.roles.cache.get(overwrite.id);
    const member=guild.members.cache?.get(overwrite.id);
    if(role?.permissions?.has(PermissionFlagsBits.ManageGuild) || member?.permissions?.has(PermissionFlagsBits.ManageGuild)) continue;
    fail('That channel also allows people outside the reviewer team. Restrict its access before using it for private requests.');
  }
}
export async function saveCommunityConfig(client,guild,patch) {
  assertCommunityBeta(guild.id);
  return Mutex.runExclusive(`community-config:${guild.id}`,async()=>{
    const current=await getCommunityConfig(client,guild.id);
    if(!patch || typeof patch!=='object' || Array.isArray(patch)) fail('Choose valid community settings.');
    const patchSchema=communityConfigSchema.partial().extend(Object.fromEntries(['features','dmUpdates','ticketButtons','channels','links'].map(key=>[key,communityConfigSchema.shape[key].partial().optional()])));
    if(!patchSchema.safeParse(patch).success) fail('Choose valid community settings.');
    const parsed=communityConfigSchema.safeParse(merge(current,patch));
    if(!parsed.success) fail(parsed.error.issues[0]?.message || 'Choose valid community settings.');
    const config=parsed.data;
    await guild.roles.fetch();
    for(const key of ['staffRoleId','reviewerRoleId']) if(config[key] && (config[key]===guild.id || !guild.roles.cache.has(config[key]))) fail('Select an existing server role other than @everyone.');
    for(const id of new Set([config.reviewChannelId,...Object.values(config.channels),...Object.values(config.links)].filter(Boolean))) {
      const channel=await guild.channels.fetch(id).catch(()=>null);
      if(!channel || channel.guild?.id!==guild.id || !channel.isTextBased?.() || channel.isThread?.()) fail('Select existing text channels in this server.');
      if(id===config.reviewChannelId) assertCommunityPrivateChannel(guild,channel,config);
    }
    if((config.features.applications || config.features.leave) && !config.reviewChannelId) fail('Choose a private staff review channel before enabling applications or leave requests.');
    if((config.features.leave || config.features.activity) && !config.staffRoleId) fail('Choose a staff role before enabling leave requests or activity checks.');
    if(config.features.ticketCategories && !Object.values(config.ticketButtons).some(Boolean)) fail('Enable at least one ticket category button.');
    config.milestones.sort((a,b)=>a.invites-b.invites);
    await writeCommunityValue(client,communityConfigKey(guild.id),config);
    cached.set(guild.id,config);
    return config;
  });
}
export async function notifyCommunityMember(client,guild,userId,kind,embed) {
  try {
  if(!isBetaGuild(guild?.id)) return {sent:false,reason:'unavailable'};
  const config=await getCommunityConfig(client,guild.id);
  if(!config.dmUpdates[kind]) return {sent:false,reason:'disabled'};
  const member=await guild.members.fetch(userId).catch(()=>null);
  if(!member || member.user?.bot) return {sent:false,reason:'unavailable'};
  try { await member.send({embeds:[embed],allowedMentions:{parse:[]}}); return {sent:true}; }
  catch { return {sent:false,reason:'dm_closed'}; }
  } catch { return {sent:false,reason:'unavailable'}; }
}
