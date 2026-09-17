import { communityArrow } from './communityMotionService.js';
import { motionArtwork } from './embedMotionService.js';
import { randomUUID } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { db } from '../utils/database.js';
import { pgConfig } from '../config/database/postgres.js';
import { createEmbed } from '../utils/embeds.js';
import { createError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { assertCommunityBeta, assertBetaFeature, assertCommunityReviewer, assertCommunityStaff, assertCommunityPrivateChannel, notifyCommunityMember } from './communityBetaService.js';
import { answerApplication, reviewRequest, activityAudit, closeDueChecks } from './betaStaff/state.js';

const locks = new Map();
const key = id => `guild:${id}:beta_staff`;
const empty = () => ({applications:[],leave:[],activityChecks:[]});
const fail = message => { throw createError(message,ErrorTypes.VALIDATION,message); };
const button = (action,label,style=ButtonStyle.Primary) => new ButtonBuilder().setCustomId(`beta_staff:${action}`).setLabel(label).setStyle(style);
const row = (...buttons) => new ActionRowBuilder().addComponents(...buttons);
const embed = (client,guild,title,description) => createEmbed({guildId:guild.id,title:`DexzuBot · ${title}`,description,thumbnail:motionArtwork(guild.id)?.thumbnailUrl || client.user?.displayAvatarURL({size:64}),footer:'Staff tools'});
const trackLabel = app => app.track==='partnership-manager' ? 'Partnership manager' : 'Staff';
const partnershipQuestions = [
 {label:'Why would you like to become a partnership manager?',required:true},
 {label:'What experience do you have finding and managing community partnerships?',required:true},
 {label:'How would you decide whether another server is a good partner?',required:true},
 {label:'When are you available, and what is your time zone?',required:true},
 {label:'How would you approach a potential partner and handle a declined offer?',required:true},
 {label:'Is there anything else you would like us to know?',required:false},
];
const notificationNote = result => result?.sent ? ' A confirmation was sent by DM.' : result && result.reason!=='disabled' ? ' Your request is saved, but the DM update could not be delivered.' : '';
async function load(guild) {
 if (!db.isAvailable()) fail('Persistent storage is unavailable. Please try again later.');
 const result=await db.db.pool.query(`SELECT value FROM ${pgConfig.tables.temp_data} WHERE key = $1`,[key(guild.id)]);
 return structuredClone(result.rows[0]?.value || empty());
}
async function save(guild,state) {
 if (!db.isAvailable() || await db.set(key(guild.id),state) === false) fail('Your change could not be saved. Please try again.');
}
async function locked(guild,fn) {
 const previous=locks.get(guild.id)||Promise.resolve();
 const current=previous.catch(()=>{}).then(fn); locks.set(guild.id,current);
 try{return await current;}finally{if(locks.get(guild.id)===current)locks.delete(guild.id);}
}
async function member(guild,actor) { return guild.members.fetch({user:actor.id || actor.user?.id,force:true}); }
function locate(state,id) { return state.applications.find(x=>x.id===id)||state.leave.find(x=>x.id===id); }
function questionPayload(client,guild,app) {
 if(app.status!=='draft')return {embeds:[embed(client,guild,`${trackLabel(app)} application`,`${communityArrow(guild.id)} Status: **${app.status==='pending'?'Waiting for review':app.status}**\n${app.answers.length}/${app.questions.length} answers saved.`)],components:[],allowedMentions:{parse:[]}};
 const index=app.answers.length, q=app.questions[index];
 return {embeds:[embed(client,guild,`${trackLabel(app)} \u00b7 Question ${index+1}/${app.questions.length}`,`${communityArrow(guild.id)} ${q.label}\n\n${app.answers.length}/${app.questions.length} saved · ${q.required?'Required':'Optional'} · Up to 1000 characters. Your progress is saved after each answer.`)],components:[row(button(`answer:${app.id}:${index}`,'Answer'),...(!q.required?[button(`skip:${app.id}:${index}`,'Skip',ButtonStyle.Secondary)]:[]),button(`cancel:${app.id}`,'Cancel',ButtonStyle.Danger))],allowedMentions:{parse:[]}};
}
async function syncApplicationMessage(client,guild,config,state,app,channel) {
 assertCommunityPrivateChannel(guild,channel,config,{memberId:app.userId});
 const message=app.messageId?await channel.messages.fetch(app.messageId).catch(error=>{if(error.code===10008)return null;throw error;}):null;
 if(message) {
  if(message.author.id!==client.user.id)fail('The application card does not belong to DexzuBot.');
  await message.edit(questionPayload(client,guild,app));return;
 }
 const created=await channel.send(questionPayload(client,guild,app));
 app.messageId=created.id;
 try{await save(guild,state);}catch(error){await created.delete().catch(()=>{});throw error;}
}
export async function repairApplicationCard(client,guild,id) {
 return locked(guild,async()=>{
  const config=await assertBetaFeature(client,guild.id,'applications'),state=await load(guild);
  const app=state.applications.find(a=>a.id===id);if(!app)fail('Application not found.');
  const channel=await guild.channels.fetch(app.channelId);
  await syncApplicationMessage(client,guild,config,state,app,channel);
  return app.messageId;
 });
}
export function activityPayload(client,guild,check,leaves) {
 const audit=check.audit||activityAudit(check,leaves);
 const list=ids=>ids.length?ids.slice(0,35).map(id=>`<@${id}>`).join(', ')+(ids.length>35?` (+${ids.length-35} more in dashboard)`:''):'None';
 return {embeds:[embed(client,guild,`Staff activity · ${check.status}`,`Deadline: <t:${Math.floor(check.deadline/1000)}:F>\n\n**Responded (${audit.responded.length})**\n${list(audit.responded)}\n\n**Missing (${audit.missing.length})**\n${list(audit.missing)}\n\n**Excluded · approved leave (${audit.excluded.length})**\n${list(audit.excluded)}`)],components:check.status==='open'?[row(button(`respond:${check.id}`,'Confirm activity'))]:[],allowedMentions:{parse:[]}};
}
async function syncActivityMessage(client,guild,check,leaves) {
 if(!check.channelId||!check.messageId)return false;
 try{const channel=await guild.channels.fetch(check.channelId);const message=await channel.messages.fetch(check.messageId);await message.edit(activityPayload(client,guild,check,leaves));check.syncedStatus=check.status;return true;}catch{return false;}
}
async function createApplicationChannel(client,guild,config,userId) {
 const permissions=[{id:guild.id,deny:[PermissionFlagsBits.ViewChannel]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]},{id:userId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.SendMessages]}];
 if(config.reviewerRoleId)permissions.push({id:config.reviewerRoleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages]});
 return guild.channels.create({name:`application-${userId}`,type:ChannelType.GuildText,permissionOverwrites:permissions,reason:'DexzuBot private staff application'});
}
function reviewPayload(client,guild,request) {
 const isLeave=!!request.days, pending=request.status==='pending';
 return {embeds:[embed(client,guild,isLeave?'Leave request':`${trackLabel(request)} application`,`${communityArrow(guild.id)} Status: **${request.status}**\nMember: <@${request.userId}>\nID: ${request.id}\n${isLeave?`${request.days} day(s)\n${request.reason}`:'Review full answers in the dashboard: Operations / Community tools.'}`)],components:pending?[row(button(`review:${request.id}:approved`,'Approve',ButtonStyle.Success),button(`review:${request.id}:denied`,'Deny',ButtonStyle.Danger))]:[],allowedMentions:{parse:[]}};
}
async function postReview(client,guild,config,request) {
 try {
  const channel=await guild.channels.fetch(request.reviewChannelId || config.reviewChannelId);
  assertCommunityPrivateChannel(guild,channel,config);
  if(request.reviewMessageId) {
   const message=await channel.messages.fetch(request.reviewMessageId);
   if(message.author.id!==client.user.id)return false;
   await message.edit(reviewPayload(client,guild,request));
  } else {
   if(request.status!=='pending')return false;
   const message=await channel.send(reviewPayload(client,guild,request));
   request.reviewMessageId=message.id;request.reviewChannelId=channel.id;
  }
  return true;
 }catch{ return false; }
}
export async function getStaffState(client,guild,{readOnly=false}={}) {
 assertCommunityBeta(guild.id);
 return locked(guild,async()=>{
  const state=await load(guild);
  if(readOnly) {
   for(const check of state.activityChecks) if(check.status==='open')check.audit=activityAudit(check,state.leave);
   return state;
  }
  const before=JSON.stringify(state); closeDueChecks(state);
  if(JSON.stringify(state)!==before)await save(guild,state);
  let synced=false;for(const check of state.activityChecks)if(check.status==='closed'&&check.syncedStatus!=='closed')synced=await syncActivityMessage(client,guild,check,state.leave)||synced;
  if(synced)await save(guild,state);
  for(const check of state.activityChecks) if(check.status==='open')check.audit=activityAudit(check,state.leave);
  return state;
 });
}
export async function buildStaffPanel(client,guild,kind) {
 const config=await assertBetaFeature(client,guild.id,kind);
 if(kind==='applications')return {embeds:[embed(client,guild,'Join the team',`${communityArrow(guild.id)} Choose Staff or Partnership Manager to apply privately, one question at a time. Your progress is saved in one card. Choose either button to resume an existing application.`)],components:[row(button('start','Apply for Staff'),button('start-partnership','Apply for Partnership Manager',ButtonStyle.Secondary),...(config.applicationUrl?[new ButtonBuilder().setLabel('Apply via Website').setStyle(ButtonStyle.Link).setURL(config.applicationUrl)]:[]))],allowedMentions:{parse:[]}};
 if(kind==='leave')return {embeds:[embed(client,guild,'Leave of absence','Staff can request 1–14 days away. Approved leave is excluded from overlapping activity checks.')],components:[row(button('leave','Request leave'))],allowedMentions:{parse:[]}};
 const state=await getStaffState(client,guild),check=state.activityChecks.find(x=>x.status==='open');
 return {embeds:[embed(client,guild,'Staff activity',check?`Respond by <t:${Math.floor(check.deadline/1000)}:F>.\n${check.responses.length} response(s) recorded.`:'No activity check is open.')],components:check?[row(button(`respond:${check.id}`,'Confirm activity'))]:[],allowedMentions:{parse:[]}};
}
export async function performStaffAction({client,guild,actor,action,input={}}) {
 return locked(guild,async()=>{
  const state=await load(guild); closeDueChecks(state);
  const fresh=await member(guild,actor);
  if(['review','application-review','leave-review'].includes(action)) {
   const request=locate(state,input.id); if(!request)fail('Request not found.');
   const kind=request.days?'leave':'applications',config=await assertBetaFeature(client,guild.id,kind);
   assertCommunityReviewer(guild,fresh,config);
   try{reviewRequest(request,fresh.id,input.status,input.reason);}catch(error){fail(error.message);}
   await save(guild,state);
   if(kind==='applications' && request.channelId)try{const channel=await guild.channels.fetch(request.channelId);await syncApplicationMessage(client,guild,config,state,request,channel);}catch{}
   await postReview(client,guild,config,request);
   if(kind==='leave')for(const check of state.activityChecks)if(check.status==='open')await syncActivityMessage(client,guild,check,state.leave);
   const notification=await notifyCommunityMember(client,guild,request.userId,kind,embed(client,guild,'Request update',`Your ${request.days?'leave request':`${trackLabel(request).toLowerCase()} application`} was **${request.status}**.${request.reviewReason?`\n${request.reviewReason}`:''}`));
   return {request,notification};
  }
  const config=await assertBetaFeature(client,guild.id,'activity'); assertCommunityReviewer(guild,fresh,config);
  if(action==='activity-start') {
   if(state.activityChecks.some(c=>c.status==='open'))fail('An activity check is already open.');
   const hours=Number(input.hours); if(!Number.isFinite(hours)||hours<1||hours>336)fail('Choose a deadline of 1–336 hours.');
   const members=await guild.members.fetch();
   const check={id:randomUUID(),status:'open',createdAt:Date.now(),deadline:Date.now()+hours*3600000,eligible:[...members.values()].filter(m=>!m.user.bot&&m.roles.cache.has(config.staffRoleId)).map(m=>m.id),responses:[]};
   state.activityChecks.push(check); await save(guild,state);
   let published=false;
   try { const channel=await guild.channels.fetch(config.channels.activity); if(channel?.isTextBased()) {const message=await channel.send(activityPayload(client,guild,check,state.leave));check.channelId=channel.id;check.messageId=message.id;published=true;} }catch{}
   if(published)await save(guild,state);
   return {check,published};
  }
  if(action==='activity-end') {
   const check=state.activityChecks.find(c=>c.id===input.id);if(!check)fail('Activity check not found.');
   if(check.status==='open'){check.status='closed';check.closedAt=Date.now();check.deadline=Math.min(check.deadline,check.closedAt);check.audit=activityAudit(check,state.leave,check.closedAt);}
   await save(guild,state);const published=await syncActivityMessage(client,guild,check,state.leave);if(published)await save(guild,state);return {check,published};
  }
  fail('Unknown staff action.');
 });
}

export async function handleStaffInteraction(interaction) {
 const {client,guild}=interaction; if(!guild)fail('Use staff tools in a server.');
 const [,action,id,value]=interaction.customId.split(':');
 if(action==='review') {
  const state=await getStaffState(client,guild), request=locate(state,id); if(!request)fail('Request not found.');
  const config=await assertBetaFeature(client,guild.id,request.days?'leave':'applications');assertCommunityReviewer(guild,await member(guild,interaction.user),config);
  return interaction.showModal(new ModalBuilder().setCustomId(`beta_staff:decision:${id}:${value}`).setTitle('Review request').addComponents(row(new TextInputBuilder().setCustomId('reason').setLabel('Reason (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))));
 }
 if(action==='decision') {
  if (!await InteractionHelper.safeDefer(interaction,{ephemeral:true})) return;
  const result=await performStaffAction({client,guild,actor:interaction.user,action:'review',input:{id,status:value,reason:interaction.fields.getTextInputValue('reason')}});
  return InteractionHelper.safeReply(interaction,{content:`Request ${result.request.status}.${result.notification.sent?' Member notified.':` DM update: ${result.notification.reason}.`}`});
 }
 const feature=['leave','leave-submit'].includes(action)?'leave':action==='respond'?'activity':'applications';
 const config=await assertBetaFeature(client,guild.id,feature),fresh=await member(guild,interaction.user);
 if(feature!=='applications')assertCommunityStaff(guild,fresh,config);
 if(action==='leave')return interaction.showModal(new ModalBuilder().setCustomId('beta_staff:leave-submit').setTitle('Request leave').addComponents(row(new TextInputBuilder().setCustomId('days').setLabel('Days away (1–14)').setStyle(TextInputStyle.Short).setMaxLength(2)),row(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setMaxLength(1000))));
 if(action==='answer') {
  const state=await getStaffState(client,guild),app=state.applications.find(a=>a.id===id);
  if(!app||app.userId!==fresh.id)fail('Only the application owner can answer.');
  if(app.status!=='draft'||app.answers.length!==Number(value))fail('Application changed. Resume to continue.');
  return interaction.showModal(new ModalBuilder().setCustomId(`beta_staff:save:${id}:${value}`).setTitle(`Question ${Number(value)+1}`).addComponents(row(new TextInputBuilder().setCustomId('answer').setLabel(app.questions[Number(value)].label.slice(0,45)).setStyle(TextInputStyle.Paragraph).setRequired(app.questions[Number(value)].required).setMaxLength(1000))));
 }
 if (!await InteractionHelper.safeDefer(interaction,{ephemeral:true})) return;
 return locked(guild,async()=>{
  const state=await load(guild);closeDueChecks(state);
  if(action==='start'||action==='start-partnership') {
   let app=state.applications.find(a=>a.userId===fresh.id&&['draft','pending'].includes(a.status));
   let channel,created=false;
   if(!app) {
    const previous=state.applications.filter(a=>a.userId===fresh.id).at(-1);
    if(previous&&Date.now()-previous.createdAt<60000)fail('Wait one minute before starting another application.');
    if(previous?.channelId)channel=await guild.channels.fetch(previous.channelId).catch(()=>null);
    if(!channel){channel=await createApplicationChannel(client,guild,config,fresh.id);created=true;}
    assertCommunityPrivateChannel(guild,channel,config,{memberId:fresh.id});
    app={id:randomUUID(),userId:fresh.id,track:action==='start-partnership'?'partnership-manager':'staff',status:'draft',channelId:channel.id,questions:structuredClone(action==='start-partnership'?partnershipQuestions:config.questions),answers:[],createdAt:Date.now()};state.applications.push(app);
    try{await save(guild,state);}catch(error){if(created)await channel.delete('Application storage failed').catch(()=>{});throw error;}
   }
   channel ||= await guild.channels.fetch(app.channelId).catch(()=>null);
   if(!channel){channel=await createApplicationChannel(client,guild,config,fresh.id);app.channelId=channel.id;app.messageId=null;try{await save(guild,state);}catch(error){await channel.delete('Application storage failed').catch(()=>{});throw error;}}
   assertCommunityPrivateChannel(guild,channel,config,{memberId:fresh.id});
   await syncApplicationMessage(client,guild,config,state,app,channel);
   return InteractionHelper.safeReply(interaction,{content:`Continue your ${trackLabel(app).toLowerCase()} application in <#${app.channelId}>.`});
  }
  if(action==='leave-submit') {
   const days=Number(interaction.fields.getTextInputValue('days')),reason=interaction.fields.getTextInputValue('reason').trim();
   if(!Number.isInteger(days)||days<1||days>14)fail('Leave must be 1–14 days.');
   if(!reason||reason.length>1000)fail('Provide a reason of up to 1000 characters.');
   if(state.leave.some(l=>l.userId===fresh.id&&(l.status==='pending'||l.status==='approved'&&l.endAt>Date.now())))fail('You already have pending or active leave.');
   const request={id:randomUUID(),userId:fresh.id,status:'pending',days,reason,createdAt:Date.now()};state.leave.push(request);await save(guild,state);
   const posted=await postReview(client,guild,config,request);if(posted)await save(guild,state);
   const notification=await notifyCommunityMember(client,guild,fresh.id,'leave',embed(client,guild,'Leave request received',`Your request for **${days} day(s)** of leave has been saved and is waiting for review.\nRequest: ${request.id}`));
   return InteractionHelper.safeReply(interaction,{content:`Leave request saved for review.${posted?'':' Review-channel delivery failed; it remains available in the dashboard.'}${notificationNote(notification)}`});
  }
  if(action==='respond') {
   const check=state.activityChecks.find(c=>c.id===id);if(!check||check.status!=='open'||Date.now()>=check.deadline)fail('This activity check is closed.');
   if(!check.eligible.includes(fresh.id))fail('You were not included in this activity check.');
   if(!check.responses.includes(fresh.id))check.responses.push(fresh.id);await save(guild,state);await syncActivityMessage(client,guild,check,state.leave);return InteractionHelper.safeReply(interaction,{content:'Your activity response is saved.'});
  }
  const app=state.applications.find(a=>a.id===id);if(!app||app.userId!==fresh.id)fail('Only the application owner can change it.');
  if(action==='cancel'){if(app.status!=='draft')fail('Only drafts can be cancelled.');app.status='cancelled';await save(guild,state);let updated=false;try{const channel=await guild.channels.fetch(app.channelId);await syncApplicationMessage(client,guild,config,state,app,channel);updated=true;}catch{}return InteractionHelper.safeReply(interaction,{content:`Application cancelled.${updated?'':' The channel card could not be updated.'}`});}
  if(!['save','skip'].includes(action))fail('Unknown staff action.');
  try{answerApplication(app,fresh.id,Number(value),action==='skip'?'':interaction.fields.getTextInputValue('answer'));}catch(error){fail(error.message);}
  await save(guild,state);
  const channel=await guild.channels.fetch(app.channelId).catch(()=>null);
  let delivered=false;
  if(channel)try{await syncApplicationMessage(client,guild,config,state,app,channel);delivered=true;}catch{}
  let posted=true;if(app.status==='pending'){posted=await postReview(client,guild,config,app);if(posted)await save(guild,state);}
  const notification=app.status==='pending'?await notifyCommunityMember(client,guild,fresh.id,'applications',embed(client,guild,'Application received',`Your ${trackLabel(app).toLowerCase()} application has been saved and is waiting for review.\nApplication: ${app.id}`)):null;
  return InteractionHelper.safeReply(interaction,{content:`${app.status==='pending'?'Application submitted for review.':'Answer saved.'}${delivered?'':' Channel update failed; use Start / Resume to continue.'}${posted?'':' Review-channel delivery failed; the dashboard still has your application.'}${notificationNote(notification)}`,components:[]});
 });
}

export function initializeStaffWorkflows(client) {
 const recover=async()=>{for(const guild of client.guilds.cache.values())try{await assertBetaFeature(client,guild.id,'activity');await getStaffState(client,guild);}catch(error){if(error?.type!==ErrorTypes.VALIDATION)logger.debug('Staff activity recovery skipped for guild',guild.id);}};
 void recover();const timer=setInterval(()=>void recover(),30000);timer.unref?.();return ()=>clearInterval(timer);
}
