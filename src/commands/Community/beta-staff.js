import { SlashCommandBuilder } from 'discord.js';
import { buildStaffPanel, performStaffAction } from '../../services/betaStaffService.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
 slashOnly:true,betaOnly:true,betaSlash:true,category:'Community',
 data:new SlashCommandBuilder().setName('beta-staff').setDescription('DexzuBot beta staff tools').setDMPermission(false)
 .addSubcommand(s=>s.setName('applications').setDescription('Start or resume your private application'))
 .addSubcommand(s=>s.setName('leave').setDescription('Request 1–14 days of leave'))
 .addSubcommand(s=>s.setName('activity').setDescription('Respond to the current activity check'))
 .addSubcommand(s=>s.setName('activity-start').setDescription('Reviewers: open a staff activity check').addIntegerOption(o=>o.setName('hours').setDescription('Response deadline in hours').setRequired(true).setMinValue(1).setMaxValue(336)))
 .addSubcommand(s=>s.setName('activity-end').setDescription('Reviewers: close a check and view its audit').addStringOption(o=>o.setName('id').setDescription('Activity check ID').setRequired(true))),
 execute:withErrorHandling(async interaction=>{
  await InteractionHelper.safeDefer(interaction,{ephemeral:true});
  const action=interaction.options.getSubcommand();
  if(['applications','leave','activity'].includes(action))return InteractionHelper.safeReply(interaction,await buildStaffPanel(interaction.client,interaction.guild,action));
  const result=await performStaffAction({client:interaction.client,guild:interaction.guild,actor:interaction.user,action,input:{hours:interaction.options.getInteger('hours'),id:interaction.options.getString('id')}});
  const audit=result.check.audit;
  return InteractionHelper.safeReply(interaction,{content:audit?`Check ${result.check.id} closed.\nResponded: ${audit.responded.length}\nMissing: ${audit.missing.length}\nExcluded (approved leave): ${audit.excluded.length}\nFull member lists are available in the private dashboard.`:`Check ${result.check.id} is open.${result.published?'':' Use /beta-staff activity to respond; panel delivery was unavailable.'}`,allowedMentions:{parse:[]}});
 },{command:'beta-staff'})
};
