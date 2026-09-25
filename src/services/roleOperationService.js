import { escapeMarkdown } from 'discord.js';
import { TitanBotError, ErrorTypes, wrapServiceBoundary } from '../utils/errorHandler.js';
import { canUseBetaFeatures } from '../config/beta.js';
import { getGuildConfig } from './config/guildConfig.js';
import { isCommandEnabledInConfig } from './commandAccessService.js';
import { assertRoleManager, assertRoleEditable, canChangeMember, parseRoleColor,
  roleChangePlans, runningRoleJobs, applyRolePlan } from './roleManagementService.js';

const fail = message => { throw new TitanBotError(message, ErrorTypes.VALIDATION, message); };
function validName(value) {
  const name = value?.trim();
  if (!name || name.length > 100) fail('Role names must contain 1 to 100 characters.');
  return name;
}
export const executeRoleOperation = wrapServiceBoundary(async ({ guild, options, actorId, client, reply, auditSource = null }) => {
    if (!guild || !canUseBetaFeatures(guild.id)) fail('Role management is available in Main and Beta.');
    await guild.roles.fetch();
    await guild.members.fetchMe({ force: true });
    const actor = await guild.members.fetch({ user: actorId, force: true });
    assertRoleManager(guild, actor);
    const action = options.getSubcommand();
    if (action === 'cancel') {
      roleChangePlans.take(options.getString('code').trim(), guild.id, actor.id);
      return reply('Role preview cancelled', 'No changes were applied.');
    }
    if (action === 'confirm') {
      if (runningRoleJobs.has(guild.id)) fail('A role batch is already running in this server. Wait for it to finish.');
      const plan = roleChangePlans.take(options.getString('code').trim(), guild.id, actor.id);
      const config = await getGuildConfig(client, guild.id);
      const originalCommand = `role ${plan.action === 'delete' ? 'delete' : `bulk-${plan.action}`}`;
      if (!isCommandEnabledInConfig(config, originalCommand, 'Moderation')) fail('That role action has been disabled since this preview was created.');
      const role = guild.roles.cache.get(plan.roleId);
      assertRoleEditable(guild, actor, role);
      if (runningRoleJobs.has(guild.id)) fail('A role batch is already running in this server. Create a new preview after it finishes.');
      runningRoleJobs.add(guild.id);
      try {
        if (plan.action === 'delete') {
          const name = escapeMarkdown(role.name);
          await role.delete(`DexzuBot role deletion requested by ${auditSource || actor.id}`);
          return await reply('Role deleted', `Deleted **${name}**.`);
        }
        await reply('Updating roles', `Applying the confirmed ${plan.action} to ${plan.memberIds.length} members. This may take a moment.`);
        const result = await applyRolePlan(guild, actor.id, plan);
        const remaining = plan.memberIds.length - result.changed - result.skipped - result.failed;
        return await reply(result.stopped ? 'Role batch stopped' : 'Role batch finished',
          `Changed: **${result.changed}**\nSkipped after preview: **${result.skipped}**\nFailed: **${result.failed}**`
          + (result.stopped ? `\nNot attempted: **${remaining}**\nPermissions or server data changed. Create a new preview to continue.` : '')
          + '\nOnly confirmed successful changes are included in the changed count.', { result });
      } finally { runningRoleJobs.delete(guild.id); }
    }
    if (action === 'create') {
      const name = validName(options.getString('name')), color = parseRoleColor(options.getString('color'));
      const role = await guild.roles.create({ name, ...(color !== undefined ? { colors: { primaryColor: color } } : {}),
        permissions: [], mentionable: false, hoist: false, reason: `DexzuBot role creation requested by ${auditSource || actor.id}` });
      return reply('Role created', `Created ${role} with no server permissions.`);
    }
    if (action === 'list') {
      const roles = [...guild.roles.cache.values()].sort((a, b) => b.comparePositionTo(a));
      const pages = Math.max(1, Math.ceil(roles.length / 20)), page = options.getInteger('page') ?? 1;
      if (!Number.isInteger(page) || page < 1 || page > pages) fail(`Choose a page between 1 and ${pages}.`);
      return reply(`Server roles (${page}/${pages})`, roles.slice((page - 1) * 20, page * 20)
        .map(role => `${role} ${role.managed ? '(managed)' : ''}`).join('\n'));
    }
    const role = options.getRole('role');
    if (!role || role.guild?.id !== guild.id) fail('Choose a role from this server.');
    if (action === 'info') {
      const permissions = role.permissions.toArray().join(', ') || 'None';
      return reply(escapeMarkdown(role.name), `ID: \`${role.id}\`\nColor: **${role.hexColor}**\nPosition: **${role.position}**`
        + `\nManaged: **${role.managed ? 'Yes' : 'No'}**\nSeparate display: **${role.hoist ? 'Yes' : 'No'}**`
        + `\nMentionable: **${role.mentionable ? 'Yes' : 'No'}**\nPermissions: ${permissions}`);
    }
    assertRoleEditable(guild, actor, role);
    if (action === 'edit') {
      const changes = {}, name = options.getString('name'), color = parseRoleColor(options.getString('color'));
      if (name !== null) changes.name = validName(name);
      if (color !== undefined) changes.colors = { primaryColor: color };
      for (const key of ['hoist', 'mentionable']) if (options.get(key) != null) changes[key] = options.getBoolean(key);
      if (!Object.keys(changes).length) fail('Choose at least one setting to change.');
      await role.edit({ ...changes, reason: `DexzuBot role edit requested by ${auditSource || actor.id}` });
      return reply('Role updated', `Saved the changes to ${role}.`);
    }
    if (action === 'delete' || action.startsWith('bulk-')) {
      if (runningRoleJobs.has(guild.id)) fail('A role batch is already running in this server. Wait for it to finish.');
      const members = await guild.members.fetch();
      const plan = roleChangePlans.create({ guild, actor, role, members,
        action: action === 'delete' ? 'delete' : action.slice(5),
        audience: options.getString('audience') ?? 'all', source: options.getRole('source') });
      plan.auditSource = auditSource;
      const impact = action === 'delete'
        ? `Permanently delete ${role}. **${members.filter(member => member.roles.cache.has(role.id)).size}** members currently have it. Channel permissions and bot settings using this role may need updating.`
        : `${plan.action === 'add' ? 'Add' : 'Remove'} ${role} for **${plan.memberIds.length}** eligible members.\nSkipped: **${plan.skipped}** (hierarchy restrictions or already in the requested state).\nAudience: **${plan.audience}**${plan.sourceId ? ` with <@&${plan.sourceId}>` : ''}.`;
      return reply('Review role changes', `${impact}\n\nNo changes applied yet. Expires in **2 minutes**. Only you can confirm.\n`
        + `\`/role confirm code:${plan.code}\`\n\`/role cancel code:${plan.code}\`\nPrefix: \`!role confirm ${plan.code}\` (use your configured prefix).`, { preview: { code: plan.code, expires: plan.expires, action: plan.action, roleId: role.id, memberCount: plan.memberIds.length, skipped: plan.skipped, summary: impact } });
    }
    if (action === 'add' || action === 'remove') {
      const target = options.getUser('member');
      if (!target) fail('Choose a server member.');
      const member = await guild.members.fetch({ user: target.id, force: true });
      if (!canChangeMember(guild, actor, member)) fail('You cannot change this member: their role is too high, or they are you, the server owner, or this bot.');
      if (member.roles.cache.has(role.id) === (action === 'add')) return reply('No change needed', `That member ${action === 'add' ? 'already has' : 'does not have'} ${role}.`);
      await member.roles[action](role.id, `DexzuBot role ${action} requested by ${auditSource || actor.id}`);
      return reply('Member role updated', `${action === 'add' ? 'Added' : 'Removed'} ${role} ${action === 'add' ? 'for' : 'from'} <@${member.id}>.`);
    }
}, { service: 'roles', operation: 'execute' });
