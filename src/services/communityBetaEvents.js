import { isBetaGuild } from '../config/beta.js';
import { getCommunityConfig } from './communityBetaService.js';
import { resetInviteRewardBaseline } from './betaInviteRewardsService.js';
import { logger } from '../utils/logger.js';

export async function runCommunityInviteEvent(operation,object) {
  const guild=object.guild;
  if(!isBetaGuild(guild?.id)) return;
  try {
    if(!(await getCommunityConfig(guild.client,guild.id)).features.inviteRewards) {
      resetInviteRewardBaseline(guild.client,guild.id); return;
    }
    await operation(object);
  } catch(error) {
    resetInviteRewardBaseline(guild.client,guild.id);
    logger.warn('Beta invite tracking could not complete; no invite credit was guessed.',{guildId:guild.id,error:error.message});
  }
}
