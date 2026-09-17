import { Events } from 'discord.js';
import { getBetaGuildId } from '../config/beta.js';
import { resetInviteRewardBaseline } from '../services/betaInviteRewardsService.js';
export default {name:Events.ShardDisconnect,async execute(_event,_shardId,client){resetInviteRewardBaseline(client,getBetaGuildId());}};
