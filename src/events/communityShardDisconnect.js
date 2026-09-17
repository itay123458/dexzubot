import { Events } from 'discord.js';
import { getCommunityGuildIds } from '../config/community.js';
import { resetInviteRewardBaseline } from '../services/betaInviteRewardsService.js';
export default {name:Events.ShardDisconnect,async execute(_event,_shardId,client){for(const id of getCommunityGuildIds())resetInviteRewardBaseline(client,id);}};
