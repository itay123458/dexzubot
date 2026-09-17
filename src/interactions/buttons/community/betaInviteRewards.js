import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getInviteRewardSummary, claimInviteRewards, buildInviteRewardResult } from '../../../services/betaInviteRewardsService.js';

export default {
    name:'beta_invites',
    async execute(interaction,client,args) {
        const action=args[0];
        if(!interaction.guild || !['balance','claim'].includes(action)) throw createError('Invalid invite reward action',ErrorTypes.VALIDATION,'This invite reward action is unavailable.');
        if(!await InteractionHelper.safeDefer(interaction,{flags:['Ephemeral']})) return;
        const summary=await (action==='claim'?claimInviteRewards:getInviteRewardSummary)(client,interaction.guild,interaction.user.id);
        await InteractionHelper.safeEditReply(interaction,buildInviteRewardResult(client,summary,action==='claim'));
    },
};
