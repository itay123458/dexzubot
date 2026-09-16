import { randomBytes } from 'node:crypto';
import { PermissionFlagsBits as P } from 'discord.js';
import { TitanBotError, ErrorTypes, wrapServiceBoundary } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

const deny = message => { throw new TitanBotError(message, ErrorTypes.VALIDATION, message); };
export function assertRoleManager(guild, actor) {
  if (!guild || actor?.guild?.id !== guild.id) deny('Use this command inside your server.');
  if (actor.id !== guild.ownerId && !actor.permissions.has(P.ManageRoles)) deny('You need Manage Roles to use this command.');
  if (!guild.members.me?.permissions.has(P.ManageRoles)) deny('I need Manage Roles before I can change roles.');
}
export function assertRoleEditable(guild, actor, role) {
  assertRoleManager(guild, actor);
  if (!role || role.guild?.id !== guild.id) deny('Choose a role from this server.');
  if (role.id === guild.id || role.managed) deny('Everyone and integration-managed roles cannot be changed here.');
  if (guild.members.me.roles.highest.comparePositionTo(role) <= 0) deny('Move my bot role above the selected role first.');
  if (actor.id !== guild.ownerId) {
    if (actor.roles.highest.comparePositionTo(role) <= 0) deny('Choose a role below your highest role.');
    if (!actor.permissions.has(role.permissions)) deny('You cannot manage a role with permissions you do not have.');
  }
}
export function canChangeMember(guild, actor, member) {
  return Boolean(member && member.guild?.id === guild.id && member.id !== guild.ownerId && member.id !== actor.id
    && member.id !== guild.members.me?.id
    && guild.members.me.roles.highest.comparePositionTo(member.roles.highest) > 0
    && (actor.id === guild.ownerId || actor.roles.highest.comparePositionTo(member.roles.highest) > 0));
}
export function parseRoleColor(input) {
  if (input == null) return undefined;
  if (!/^#?[0-9a-f]{6}$/i.test(input)) deny('Use a six-digit hex color, for example #67D5FF.');
  return Number.parseInt(input.replace('#', ''), 16);
}

// One preview per member/server; no collectors or per-preview timers to leak.
export class RoleChangePlans {
  constructor(now = Date.now) { this.pending = new Map(); this.now = now; }
  prune() {
    for (const [key, plan] of this.pending) if (plan.expires <= this.now()) this.pending.delete(key);
  }
  create({ guild, actor, role, action, audience = 'humans', source, members }) {
    this.prune();
    assertRoleEditable(guild, actor, role);
    if (!['add', 'remove', 'delete'].includes(action) || !['humans', 'bots', 'all'].includes(audience)) deny('Choose a valid role action and audience.');
    const memberIds = [], skippedIds = [];
    if (action !== 'delete') for (const member of members.values()) {
      if (audience === 'humans' && member.user.bot || audience === 'bots' && !member.user.bot) continue;
      if (source && !member.roles.cache.has(source.id)) continue;
      if (!canChangeMember(guild, actor, member) || member.roles.cache.has(role.id) === (action === 'add')) {
        skippedIds.push(member.id); continue;
      }
      memberIds.push(member.id);
    }
    if (memberIds.length > 100) deny('This preview matches more than 100 members. Select a source role to narrow the batch.');
    const key = `${guild.id}:${actor.id}`;
    if (!this.pending.has(key) && this.pending.size >= 500) deny('Too many pending role previews. Try again in two minutes.');
    const plan = { code: randomBytes(6).toString('hex'), guildId: guild.id, actorId: actor.id,
      roleId: role.id, action, audience, sourceId: source?.id, memberIds, skipped: skippedIds.length, expires: this.now() + 120000 };
    this.pending.set(key, plan);
    return plan;
  }
  take(code, guildId, actorId) {
    this.prune();
    const key = `${guildId}:${actorId}`, plan = this.pending.get(key);
    if (!plan || plan.code !== code) deny('That preview expired or belongs to someone else. Create a new preview.');
    this.pending.delete(key);
    return plan;
  }
}
export const roleChangePlans = new RoleChangePlans();
export const runningRoleJobs = new Set();

export const applyRolePlan = wrapServiceBoundary(async (guild, actorId, plan) => {
  const result = { changed: 0, skipped: 0, failed: 0, stopped: false };
  for (const memberId of plan.memberIds) {
    let actor, role;
    try {
      await guild.roles.fetch();
      await guild.members.fetchMe({ force: true });
      actor = await guild.members.fetch({ user: actorId, force: true });
      role = guild.roles.cache.get(plan.roleId);
      assertRoleEditable(guild, actor, role);
    } catch { result.stopped = true; break; }
    try {
      const member = await guild.members.fetch({ user: memberId, force: true });
      if (!canChangeMember(guild, actor, member)
        || (plan.sourceId && !member.roles.cache.has(plan.sourceId))
        || (plan.audience === 'humans' && member.user.bot) || (plan.audience === 'bots' && !member.user.bot)
        || member.roles.cache.has(role.id) === (plan.action === 'add')) { result.skipped++; continue; }
      await member.roles[plan.action](role.id, `DexzuBot role ${plan.action} requested by ${actorId}`);
      result.changed++;
    } catch (error) {
      result.failed++;
      logger.warn('Role batch member failed', { guildId: guild.id, memberId, code: error.code });
    }
  }
  return result;
}, { service: 'roleManagement', operation: 'applyRolePlan' });
