import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from '../../utils/embeds.js';
import { executeRoleOperation } from '../../services/roleOperationService.js';

const roleOption = option => option.setName('role').setDescription('Role to manage').setRequired(true);
const colorOption = option => option.setName('color').setDescription('Six-digit hex color, such as #67D5FF');
const data = new SlashCommandBuilder().setName('role').setDescription('Manage server roles and preview bulk changes')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
for (const action of ['add', 'remove']) {
  data.addSubcommand(sub => sub.setName(action).setDescription(`${action === 'add' ? 'Give' : 'Remove'} a member's role`)
    .addUserOption(option => option.setName('member').setDescription('Member to update').setRequired(true))
    .addRoleOption(roleOption));
  data.addSubcommand(sub => sub.setName(`bulk-${action}`).setDescription(`Preview a bulk role ${action}; confirmation required`)
    .addRoleOption(roleOption)
    .addStringOption(option => option.setName('audience').setDescription('Members to include').setRequired(true)
      .addChoices({ name: 'Humans', value: 'humans' }, { name: 'Bots', value: 'bots' }, { name: 'Everyone', value: 'all' }))
    .addRoleOption(option => option.setName('source').setDescription('Only members who already have this role')));
}
data.addSubcommand(sub => sub.setName('create').setDescription('Create a role with no server permissions')
  .addStringOption(option => option.setName('name').setDescription('Role name').setRequired(true).setMinLength(1).setMaxLength(100))
  .addStringOption(colorOption));
data.addSubcommand(sub => sub.setName('edit').setDescription('Change a role name, color, display, or mention setting')
  .addRoleOption(roleOption)
  .addStringOption(option => option.setName('name').setDescription('New name').setMinLength(1).setMaxLength(100))
  .addStringOption(colorOption)
  .addBooleanOption(option => option.setName('hoist').setDescription('Display separately in the member list'))
  .addBooleanOption(option => option.setName('mentionable').setDescription('Allow everyone to mention this role')));
data.addSubcommand(sub => sub.setName('delete').setDescription('Preview permanent role deletion; confirmation required').addRoleOption(roleOption));
data.addSubcommand(sub => sub.setName('info').setDescription('Show role details and permissions').addRoleOption(roleOption));
data.addSubcommand(sub => sub.setName('list').setDescription('List server roles by hierarchy')
  .addIntegerOption(option => option.setName('page').setDescription('Page number').setMinValue(1)));
for (const action of ['confirm', 'cancel']) data.addSubcommand(sub => sub.setName(action)
  .setDescription(`${action === 'confirm' ? 'Apply' : 'Discard'} your pending role preview`)
  .addStringOption(option => option.setName('code').setDescription('Code from your preview').setRequired(true)));

export default {
  data, betaOnly: true,
  async execute(interaction) {
    if (!await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral })) return;
    return executeRoleOperation({ guild: interaction.guild, options: interaction.options,
      actorId: interaction.user.id, client: interaction.client,
      reply: (title, description) => InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed().setTitle(title).setDescription(description)], allowedMentions: { parse: [] },
      }),
    });
  },
};
