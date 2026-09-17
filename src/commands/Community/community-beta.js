import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { publishCommunityPanel } from '../../services/communityBetaPanels.js';
import { getCommunityConfig, assertCommunityReviewer } from '../../services/communityBetaService.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
export default {
  communityRelease:true,slashOnly:true,
  data:new SlashCommandBuilder().setName('community-beta').setDescription('Configure and publish DexzuBot community panels')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s=>s.setName('guide').setDescription('Show community controls and commands'))
    .addSubcommand(s=>s.setName('panel').setDescription('Publish or update a configured panel').addStringOption(o=>o.setName('type').setDescription('Panel to publish').setRequired(true).addChoices(
      {name:'Invite rewards',value:'inviteRewards'},{name:'Ticket categories',value:'ticketCategories'},{name:'Staff applications',value:'applications'},
      {name:'Leave of absence',value:'leave'},{name:'Staff activity',value:'activity'},{name:'Server information',value:'serverInfo'}))),
  execute:withErrorHandling(async interaction=>{
    if(!await InteractionHelper.safeDefer(interaction,{ephemeral:true}))return;
    const config=await getCommunityConfig(interaction.client,interaction.guildId);
    assertCommunityReviewer(interaction.guild,await interaction.guild.members.fetch({user:interaction.user.id,force:true}),config);
    if(interaction.options.getSubcommand()==='panel') {
      const panel=await publishCommunityPanel(interaction.client,interaction.guild,interaction.options.getString('type'));
      return InteractionHelper.safeReply(interaction,{embeds:[createEmbed({title:'Panel ready',description:`[Open the panel](${panel.url})`})]});
    }
    return InteractionHelper.safeReply(interaction,{embeds:[createEmbed({title:'Community tools',description:'Use **Operations → Community tools** in the selected dashboard workspace for switches, channels, roles, questions, and rewards.',fields:[
      {name:'Invite rewards',value:'`/invite-rewards balance` · `/invite-rewards claim`'},
      {name:'Staff',value:'`/staff applications` · `/staff leave` · `/staff activity`'},
      {name:'Reviewers',value:'Review requests in the dashboard or private review channel. `/staff activity-start` and `activity-end` manage checks.'},
      {name:'Panels',value:'Choose panel channels, enable each feature, then use Publish panel or `/community panel`.'},
    ],footer:'DexzuBot · Community'})]});
  },{command:'community-beta'}),
};
