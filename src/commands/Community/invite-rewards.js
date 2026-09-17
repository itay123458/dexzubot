import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createError, ErrorTypes } from '../../utils/errorHandler.js';
import { buildInviteRewardsPanel, getInviteRewardSummary, claimInviteRewards, buildInviteRewardResult } from '../../services/betaInviteRewardsService.js';

export default {
    betaOnly:true, betaSlash:true,
    data:new SlashCommandBuilder().setName('invite-rewards').setDescription('Check or claim your community invite rewards').setDMPermission(false)
        .addSubcommand(command=>command.setName('balance').setDescription('Check your qualified invites and rewards'))
        .addSubcommand(command=>command.setName('claim').setDescription('Claim every newly reached milestone'))
        .addSubcommand(command=>command.setName('panel').setDescription('Publish the invite rewards panel (Manage Server)')),
    async execute(interaction,_config,client) {
        const action=interaction.options.getSubcommand();
        if(action==='panel' && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            throw createError('Invite panel permission denied',ErrorTypes.PERMISSION,'You need Manage Server to publish this panel.');
        }
        if(!await InteractionHelper.safeDefer(interaction,{flags:action==='panel'?[]:['Ephemeral']})) return;
        const payload=action==='panel' ? await buildInviteRewardsPanel(client,interaction.guild)
            : buildInviteRewardResult(client,await (action==='claim'?claimInviteRewards:getInviteRewardSummary)(client,interaction.guild,interaction.user.id),action==='claim');
        await InteractionHelper.safeEditReply(interaction,payload);
    },
};
