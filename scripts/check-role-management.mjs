import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collection, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { createMockInteraction } from '../src/utils/messageAdapter.js';
import autorole from '../src/commands/Welcome/autorole.js';
import * as slashVisibility from '../src/config/commands/slashCommandCategories.js';
import { canUseBetaCommand } from '../src/config/beta.js';
import { updateWelcomeConfig } from '../src/utils/database.js';
import { logger } from '../src/utils/logger.js';
import { registerCommands } from '../src/handlers/loaders/commandLoader.js';
import { listPrefixHelp } from '../src/services/prefixHelpService.js';
import commandsCommand from '../src/commands/Core/commands.js';
import { BotConfig } from '../src/config/bot.js';
const command = (await import('../src/commands/Moderation/role.js').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
})).default;

const service = await import('../src/services/roleManagementService.js').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
function fixture() {
  const guild = { id: '1486680755869323388', ownerId: 'owner' };
  const role = (id, position, managed = false) => ({ id, name: id, position, managed, guild,
    permissions: new PermissionsBitField(), comparePositionTo: other => position - other.position });
  const selected = role('123456789012345678', 2);
  const member = (id, position, bot = false) => ({ id, guild, user: { bot },
    permissions: new PermissionsBitField(P.ManageRoles),
    roles: { highest: role(`${id}-top`, position), cache: new Collection() } });
  const actor = member('actor', 8), me = member('bot', 10, true);
  const target = member('target', 1);
  guild.members = { me, cache: new Collection([[actor.id, actor], [target.id, target], [me.id, me]]),
    fetch: async arg => arg ? guild.members.cache.get(typeof arg === 'string' ? arg : arg.user) : guild.members.cache,
    fetchMe: async () => me };
  guild.roles = { cache: new Collection([[selected.id, selected]]), fetch: async id => id ? guild.roles.cache.get(id) : guild.roles.cache };
  return { guild, actor, me, target, selected, role, member };
}
test('prefix role getter returns the role synchronously and rejects an unknown mention', () => {
  const { guild, selected } = fixture();
  const message = { guild, author: {}, member: {}, id: 'm' };
  assert.equal(createMockInteraction(message, autorole.data, ['add', `<@&${selected.id}>`]).options.getRole('role'), selected);
  assert.throws(() => createMockInteraction(message, autorole.data, ['add', '<@&999999999999999999>']).options.getRole('role'));
});
test('role changes require native permission and respect both role hierarchies', () => {
  assert.equal(typeof service.assertRoleEditable, 'function', 'Role safety service must exist');
  const { guild, actor, selected, role, me } = fixture();
  service.assertRoleEditable(guild, actor, selected);
  for (const invalid of [role(guild.id, 0), role('managed', 1, true), role('equal', 8), role('higher', 11)]) {
    assert.throws(() => service.assertRoleEditable(guild, actor, invalid));
  }
  actor.permissions = new PermissionsBitField();
  assert.throws(() => service.assertRoleEditable(guild, actor, selected));
  actor.id = guild.ownerId;
  service.assertRoleEditable(guild, actor, selected);
  me.permissions = new PermissionsBitField();
  assert.throws(() => service.assertRoleEditable(guild, actor, selected));
});
test('bulk preview freezes eligible humans, skips existing roles, and cannot be stolen or reused', () => {
  assert.equal(typeof service.RoleChangePlans, 'function');
  const { guild, actor, target, selected, member } = fixture();
  const already = member('already', 1); already.roles.cache.set(selected.id, selected);
  guild.members.cache.set(already.id, already);
  const plans = new service.RoleChangePlans();
  const plan = plans.create({ guild, actor, role: selected, action: 'add', audience: 'humans', members: guild.members.cache });
  assert.deepEqual(plan.memberIds, ['target']);
  assert.throws(() => plans.take(plan.code, guild.id, 'stranger'));
  assert.equal(plans.take(plan.code, guild.id, actor.id), plan);
  assert.throws(() => plans.take(plan.code, guild.id, actor.id));
  assert.equal(target.roles.cache.has(selected.id), false, 'Preview must not apply roles');
});
test('expired confirmations and a second pending preview never apply the old operation', () => {
  assert.equal(typeof service.RoleChangePlans, 'function');
  const { guild, actor, selected } = fixture();
  let now = 0;
  const plans = new service.RoleChangePlans(() => now);
  const params = { guild, actor, role: selected, action: 'remove', audience: 'all', members: guild.members.cache };
  const first = plans.create(params), second = plans.create(params);
  assert.throws(() => plans.take(first.code, guild.id, actor.id));
  now = 120001;
  assert.throws(() => plans.take(second.code, guild.id, actor.id));
});
test('bulk execution reports partial failures and rechecks revoked permissions', async () => {
  assert.equal(typeof service.applyRolePlan, 'function');
  const { guild, actor, selected, target, member } = fixture();
  const second = member('second', 1); guild.members.cache.set(second.id, second);
  target.roles.add = async () => { throw new Error('Discord rejected'); };
  second.roles.add = async () => { second.roles.cache.set(selected.id, selected); };
  const result = await service.applyRolePlan(guild, actor.id, { roleId: selected.id, action: 'add', memberIds: [target.id, second.id] });
  assert.deepEqual(result, { changed: 1, skipped: 0, failed: 1, stopped: false });
  actor.permissions = new PermissionsBitField();
  const stopped = await service.applyRolePlan(guild, actor.id, { roleId: selected.id, action: 'remove', memberIds: [target.id, second.id] });
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.changed, 0);
});
test('role commands and autorole are released to Main and Beta', () => {
  assert.ok(command, 'Role command must exist');
  process.env.BETA_GUILD_ID = '1486680755869323388'; process.env.GUILD_ID = '1533088766821007390';
  assert.equal(canUseBetaCommand(command, '1533088766821007390'), true);
  assert.equal(canUseBetaCommand(command, process.env.BETA_GUILD_ID), true);
  assert.equal(typeof slashVisibility.isSlashCommandEnabled, 'function');
  assert.equal(slashVisibility.isSlashCommandEnabled({ ...autorole, category: 'Welcome' }, process.env.BETA_GUILD_ID), true);
  assert.equal(slashVisibility.isSlashCommandEnabled({ ...autorole, category: 'Welcome' }, '1533088766821007390'), true);
});
function commandFixture(subcommand, values = {}) {
  const f = fixture(), replies = [];
  const interaction = { id: '123456789012345679', createdTimestamp: Date.now(), guild: f.guild, guildId: f.guild.id, user: { id: f.actor.id }, member: f.actor,
    client: { db: { get: async (_key, fallback) => fallback ?? {}, set: async () => true } }, deferred: false, replied: false, inGuild: () => true,
    deferReply: async () => { interaction.deferred = true; },
    editReply: async payload => { replies.push(payload); return payload; },
    options: { get: name => values[name] ?? null, getSubcommand: () => subcommand, getRole: name => values[name] ?? null,
      getUser: () => f.target.user.id ? f.target.user : { id: f.target.id },
      getString: name => values[name] ?? null, getInteger: name => values[name] ?? null,
      getBoolean: name => values[name] ?? null } };
  return { ...f, interaction, replies };
}
test('role add performs one change and only replies successfully after Discord accepts it', async () => {
  assert.ok(command);
  const f = commandFixture('add');
  f.interaction.options.getRole = () => f.selected;
  let changes = 0;
  f.target.roles.add = async id => { assert.equal(id, f.selected.id); changes++; };
  await command.execute(f.interaction);
  assert.equal(changes, 1); assert.equal(f.replies.length, 1);
  f.target.roles.add = async () => { throw new Error('Discord unavailable'); };
  f.replies.length = 0;
  await assert.rejects(command.execute(f.interaction));
  assert.equal(f.replies.length, 0);
});
test('registration and slash help expose released autorole without enabling other welcome commands', async () => {
  const writes = [];
  const commands = new Collection([
    ['role', { ...command, category: 'Moderation' }], ['autorole', { ...autorole, category: 'Welcome' }],
    ['welcome', { ...autorole, betaSlash: false, category: 'Welcome' }],
  ]);
  const client = { commands, rest: { put: async (_route, payload) => writes.push(payload.body) } };
  await registerCommands(client, { clientId: '123456789012345678', guildId: '1533088766821007390' });
  await registerCommands(client, { clientId: '123456789012345678', guildId: '1486680755869323388' });
  assert.deepEqual(writes[0].map(item => item.name), ['role', 'autorole']);
  assert.deepEqual(writes[1].map(item => item.name), ['role', 'autorole']);
  const { actor } = fixture(); actor.permissions = new PermissionsBitField(PermissionsBitField.All);
  const entries = listPrefixHelp(client, {}, actor, 'channel', 'slash', '1486680755869323388').map(entry => entry.name);
  assert.ok(entries.includes('role bulk-add')); assert.ok(entries.includes('autorole add'));
});
test('bulk source filters and remove preview do not include unrelated members', () => {
  const { guild, actor, selected, target, role, member } = fixture();
  const source = role('source', 1), other = member('other', 1);
  guild.members.cache.set(other.id, other);
  target.roles.cache.set(source.id, source); target.roles.cache.set(selected.id, selected);
  other.roles.cache.set(selected.id, selected);
  const plan = new service.RoleChangePlans().create({ guild, actor, role: selected, source,
    action: 'remove', audience: 'humans', members: guild.members.cache });
  assert.deepEqual(plan.memberIds, ['target']);
});
test('bulk limit rejects oversized previews without mutating members', () => {
  const { guild, actor, selected, member } = fixture();
  const members = new Collection(Array.from({ length: 101 }, (_, i) => [`m${i}`, member(`m${i}`, 1)]));
  assert.throws(() => new service.RoleChangePlans().create({ guild, actor, role: selected, action: 'add', members }), /100/);
});
test('role deletion only happens after the matching confirmation, which is single-use', async () => {
  const f = commandFixture('delete');
  let deleted = 0;
  f.selected.delete = async () => { deleted++; };
  f.interaction.options.getRole = name => name === 'role' ? f.selected : null;
  await command.execute(f.interaction);
  assert.equal(deleted, 0);
  const code = service.roleChangePlans.pending.get(`${f.guild.id}:${f.actor.id}`).code;
  f.interaction.options.getSubcommand = () => 'confirm';
  f.interaction.options.getString = () => code;
  await command.execute(f.interaction);
  assert.equal(deleted, 1);
  await assert.rejects(command.execute(f.interaction));
  assert.equal(deleted, 1);
});
test('a role preview cancelled through the command cannot later be confirmed', async () => {
  const f = commandFixture('bulk-add', { audience: 'humans' });
  f.interaction.options.getRole = name => name === 'role' ? f.selected : null;
  await command.execute(f.interaction);
  const code = service.roleChangePlans.pending.get(`${f.guild.id}:${f.actor.id}`).code;
  f.interaction.options.getSubcommand = () => 'cancel';
  f.interaction.options.getString = () => code;
  await command.execute(f.interaction);
  f.interaction.options.getSubcommand = () => 'confirm';
  await assert.rejects(command.execute(f.interaction));
});
test('bulk stops between members when moderator permission is revoked', async () => {
  const { guild, actor, selected, target, member } = fixture();
  const next = member('next', 1); guild.members.cache.set(next.id, next);
  target.roles.add = async () => { actor.permissions = new PermissionsBitField(); };
  let secondCalled = false; next.roles.add = async () => { secondCalled = true; };
  const result = await service.applyRolePlan(guild, actor.id, { roleId: selected.id, action: 'add', memberIds: [target.id, next.id] });
  assert.equal(result.changed, 1); assert.equal(result.stopped, true); assert.equal(secondCalled, false);
});
test('invalid role colors cannot reach Discord role creation', async () => {
  assert.ok(command);
  const f = commandFixture('create', { name: 'Test', color: 'oops' });
  let changes = 0; f.guild.roles.create = async () => { changes++; };
  await assert.rejects(command.execute(f.interaction));
  assert.equal(changes, 0);
});
test('autorole persistence rejects failed saves instead of reporting success', async () => {
  const client = { db: { get: async () => ({}), set: async () => { throw new Error('Offline'); } } };
  logger.silent = true;
  try { await assert.rejects(updateWelcomeConfig(client, '1486680755869323388', { roleIds: ['123456789012345678'] })); }
  finally { logger.silent = false; }
});
test('prefix role rename preserves omitted hoist and mentionable settings', async () => {
  const f = commandFixture('edit');
  f.interaction.options = createMockInteraction({ guild: f.guild, author: f.actor.user }, command.data,
    ['edit', `<@&${f.selected.id}>`, 'Renamed']).options;
  let saved;
  f.selected.edit = async changes => { saved = changes; };
  await command.execute(f.interaction);
  assert.equal(saved.name, 'Renamed');
  assert.equal(Object.hasOwn(saved, 'hoist'), false);
  assert.equal(Object.hasOwn(saved, 'mentionable'), false);
});
test('owner command list includes role and autorole paths in beta', async () => {
  const f = commandFixture('list-all'), owners = BotConfig.commands.owners;
  BotConfig.commands.owners = [f.actor.id];
  f.interaction.followUp = async payload => f.replies.push(payload);
  const client = { commands: new Collection([['role', { ...command, category: 'Moderation' }],
    ['autorole', { ...autorole, category: 'Welcome' }]]) };
  try {
    await commandsCommand.execute(f.interaction, {}, client);
    assert.match(JSON.stringify(f.replies), /role bulk-add/);
    assert.match(JSON.stringify(f.replies), /autorole add/);
  } finally { BotConfig.commands.owners = owners; }
});
