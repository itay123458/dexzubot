import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { pgDb } from '../utils/postgresDatabase.js';
import { communityArrow } from './communityMotionService.js';
import { motionArtwork } from './embedMotionService.js';
import { createEmbed } from '../utils/embeds.js';
import { createError, ErrorTypes, wrapServiceBoundary } from '../utils/errorHandler.js';
import { assertBetaFeature } from './communityBetaService.js';
import { createInviteRewardsStore, findRewardInviter, recordRewardJoin, summarizeRewards, applyRewardClaim, reconcileRewardMembers, seedExistingRewardMembers } from './betaInviteRewardsStore.js';

const snapshots = new WeakMap();
const queues = new WeakMap();
const generations = new WeakMap();
function generationMap(client) { if(!generations.has(client)) generations.set(client,new Map()); return generations.get(client); }
function generation(client,guildId) { return generationMap(client).get(guildId) || 0; }
export function resetInviteRewardBaseline(client, guildId) {
    generationMap(client).set(guildId,generation(client,guildId)+1);
    return snapshotMap(client).delete(guildId);
}
async function establishBaseline(client,guild) {
    const version=generation(client,guild.id);
    const members=await guild.members.fetch();
    await store().transaction(guild.id,async state=>seedExistingRewardMembers(state,members.values()));
    const invites=await fetchInvites(guild);
    if(version===generation(client,guild.id)) snapshotMap(client).set(guild.id,invites);
}
async function requireTracking(client, guildId) {
    try { return await assertBetaFeature(client,guildId,'inviteRewards'); }
    catch (error) { resetInviteRewardBaseline(client,guildId); throw error; }
}
function snapshotMap(client) { if (!snapshots.has(client)) snapshots.set(client,new Map()); return snapshots.get(client); }
function serial(client, guildId, operation) {
    if (!queues.has(client)) queues.set(client,new Map());
    const queue = queues.get(client);
    const task = (queue.get(guildId) || Promise.resolve()).catch(()=>{}).then(operation);
    queue.set(guildId,task);
    task.finally(()=>{if(queue.get(guildId)===task)queue.delete(guildId);}).catch(()=>{});
    return task;
}
function store() {
    if (!pgDb.isAvailable() || !pgDb.pool) throw createError('Invite rewards require PostgreSQL',ErrorTypes.DATABASE,'Invite rewards are temporarily unavailable. Please try again later.');
    return createInviteRewardsStore(pgDb.pool);
}
async function fetchInvites(guild) {
    const invites = await guild.invites.fetch();
    return [...invites.values()].map(invite=>({code:invite.code,uses:invite.uses,inviterId:invite.inviter?.bot ? null : invite.inviter?.id || null}));
}
const boundary = operation => ({service:'betaInviteRewards',operation});

export const initializeInviteRewards = wrapServiceBoundary(async (client, selectedGuildId=null) => {
    for(const guild of client.guilds.cache.values()) if(!selectedGuildId || guild.id===selectedGuildId) resetInviteRewardBaseline(client,guild.id);
    const results=[];
    for(const guild of client.guilds.cache.values()) {
        if(selectedGuildId && guild.id!==selectedGuildId) continue;
        try {
            await requireTracking(client,guild.id);
        } catch { continue; }
        try { await serial(client,guild.id,()=>establishBaseline(client,guild)); }
        catch(error) { results.push({guildId:guild.id,error:error.message}); }
    }
    return results;
},boundary('initialize'));

export const refreshRewardInvites = wrapServiceBoundary(async invite => {
    const guild=invite.guild;
    if(!guild) return;
    const client=guild.client;
    await requireTracking(client,guild.id);
    return serial(client,guild.id,async()=>{
        // Invalidate before fetching; a permission/network failure cannot retain an old baseline.
        snapshotMap(client).delete(guild.id);
        await establishBaseline(client,guild);
    });
},boundary('refresh'));

export const trackRewardJoin = wrapServiceBoundary(async member => {
    const {guild,client}=member;
    await requireTracking(client,guild.id);
    return serial(client,guild.id,async()=>{
        const config=await requireTracking(client,guild.id);
        const map=snapshotMap(client);
        const before=map.get(guild.id);
        if(!before) { await establishBaseline(client,guild); return; }
        const version=generation(client,guild.id);
        map.delete(guild.id);
        let after;
        try { after=await fetchInvites(guild); } catch { /* Unknown joins are persisted without credit. */ }
        if(version!==generation(client,guild.id)) return;
        if(after) map.set(guild.id,after);
        const inviterId=after ? findRewardInviter(before,after) : null;
        await store().transaction(guild.id,async state=>recordRewardJoin(state,member,inviterId,config));
    });
},boundary('join'));

export const trackRewardLeave = wrapServiceBoundary(async member => {
    const {guild,client}=member;
    await requireTracking(client,guild.id);
    return serial(client,guild.id,()=>store().transaction(guild.id,async state=>{
        // A tombstone also prevents pre-tracking members from farming a rejoin.
        state.members[member.id] ||= {inviterId:null,joinedAt:member.joinedTimestamp || Date.now(),reason:'unknown'};
        state.members[member.id].leftAt=Date.now();
    }));
},boundary('leave'));

async function summaryOrClaim(client,guild,userId,claim) {
    const config=await requireTracking(client,guild.id);
    const member=await guild.members.fetch({user:userId,force:true});
    if(member.user.bot) throw createError('Bot reward claim',ErrorTypes.VALIDATION,'Bots cannot claim invite rewards.');
    return serial(client,guild.id,()=>store().transaction(guild.id,async(state,credit)=>{
        await reconcileRewardMembers(state,guild,userId);
        return claim ? applyRewardClaim(state,userId,config,credit) : summarizeRewards(state,userId,config);
    }));
}
export const getInviteRewardSummary=wrapServiceBoundary((client,guild,userId)=>summaryOrClaim(client,guild,userId,false),boundary('summary'));
export const claimInviteRewards=wrapServiceBoundary((client,guild,userId)=>summaryOrClaim(client,guild,userId,true),boundary('claim'));

export const buildInviteRewardsPanel=wrapServiceBoundary(async(client,guild)=>{
    const config=await requireTracking(client,guild.id);
    const embed=createEmbed({guildId:guild.id,title:'Invite rewards',author:'DEXZUBOT / COMMUNITY',footer:'DexzuBot · Community',thumbnail:motionArtwork(guild.id)?.thumbnailUrl || client.user.displayAvatarURL(),
        description:`Invite friends and earn coins at each milestone. Each reward can be claimed once.\n\n${config.milestones.map(item=>`${communityArrow(guild.id)} **${item.invites} invites** → **${item.coins.toLocaleString()} coins**`).join('\n')}\n\nAccounts must be at least ${config.minAccountDays} days old and stay for ${config.minimumStayHours} hours. Only verified invites tracked while this feature is active count. Departures and rejoins do not count.`});
    return {embeds:[embed],components:[new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('beta_invites:balance').setLabel('Check Invite Balance').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('beta_invites:claim').setLabel('Claim Your Reward').setStyle(ButtonStyle.Primary))]};
},boundary('panel'));

export function buildInviteRewardResult(client,summary,claimed=false) {
    return {embeds:[createEmbed({title:claimed?'Invite rewards claimed':'Your invite balance',author:'DEXZUBOT / COMMUNITY',footer:'DexzuBot · Community',
        description:claimed ? (summary.awardedCoins?`Added **${summary.awardedCoins.toLocaleString()} coins** to your wallet.`:'You have no new rewards to claim yet.') : `You have **${summary.qualifiedInvites} qualified invites** and **${summary.pendingInvites}** waiting for the minimum stay.`,
        fields:[{name:'Ready to claim',value:`${summary.claimableCoins.toLocaleString()} coins`,inline:true},{name:'Already claimed',value:`${summary.claimedCoins.toLocaleString()} coins`,inline:true}]})]};
}

