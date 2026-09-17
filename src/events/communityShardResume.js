import { Events } from 'discord.js';
import { initializeInviteRewards } from '../services/betaInviteRewardsService.js';
export default {name:Events.ShardResume,async execute(_shardId,_replayedEvents,client){await initializeInviteRewards(client);}};
