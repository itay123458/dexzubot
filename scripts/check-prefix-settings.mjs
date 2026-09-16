import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { GuildConfigSchema } from '../src/utils/schemas.js';

assert.equal(GuildConfigSchema.safeParse({ prefixCommands: { enabled: 'false' } }).success, false, 'Reject a string toggle instead of silently accepting it');
assert.equal(GuildConfigSchema.safeParse({ prefixCommands: { allowedChannelIds: ['not-a-channel'] } }).success, false, 'Reject malformed channel IDs');
assert.equal(GuildConfigSchema.safeParse({ prefixCommands: { allowedRoleIds: ['not-a-role'] } }).success, false, 'Reject malformed role IDs');
console.log('PASS: prefix configuration schema rejects invalid settings');
try {
  const service = await import('../src/services/prefixSettingsService.js').catch(() => null);
  assert.ok(service, 'Shared prefix policy and settings service must exist');
  const { prefixAllowed, savePrefixSettings, getPrefixSettings } = service;
  const config = { prefixCommands: { enabled: true, allowedChannelIds: ['1533088767441637398'], allowedRoleIds: ['1533088766821007391'] } };
  const member = { id: '1533088766821007392', roles: { cache: new Map([['1533088766821007391', {}]]) } };
  assert.equal(prefixAllowed(config, member, '1533088767441637398'), true);
  assert.equal(prefixAllowed(config, member, '1533088767441637399'), false);
  assert.equal(prefixAllowed(config, { ...member, roles: { cache: new Map() } }, '1533088767441637398'), false);
  assert.equal(prefixAllowed({ prefixCommands: { enabled: false } }, member, '1533088767441637398'), false);
  assert.equal(prefixAllowed({}, member, '1533088767441637398'), true);
  const data = new Map();
  const client = { db: { get: async (k, fallback) => structuredClone(data.get(k) ?? fallback), set: async (k, v) => { data.set(k, structuredClone(v)); return true; } } };
  const guild = { id: '1533088766821007390', channels: { cache: new Map([['1533088767441637398', { type: 0 }]]) }, roles: { cache: new Map([['1533088766821007391', { managed: false }]]) } };
  const input = { prefix: '?', ...config.prefixCommands };
  await savePrefixSettings(client, guild, input);
  assert.deepEqual(getPrefixSettings(data.get(`guild:${guild.id}:config`)), input, 'Stored settings must survive a fresh read');
  await assert.rejects(savePrefixSettings(client, guild, { ...input, prefix: 'two words' }));
  await assert.rejects(savePrefixSettings(client, guild, { ...input, allowedChannelIds: ['1533088767441637399'] }));
  await assert.rejects(savePrefixSettings(client, guild, { ...input, allowedRoleIds: [guild.id] }));
  console.log('PASS: channel/role/disabled restrictions and shared persisted settings');
  const panel = await import('../src/commands/Core/prefix.js').catch(() => null);
  assert.ok(panel, 'Discord prefix dashboard must exist');
  const view = panel.buildPrefixPanel(input, 'test');
  assert.equal(view.components.length, 3, 'Prefix/toggle buttons, channel picker and role picker');
  assert.equal(service.canManagePrefix(member), false, 'Ordinary members cannot change configuration');
  assert.equal(service.canManagePrefix({ ...member, permissions: { has: () => true } }), true);
  const { InteractionHelper } = await import('../src/utils/interactionHelper.js');
  const oldDefer = InteractionHelper.safeDefer, oldEdit = InteractionHelper.safeEditReply;
  InteractionHelper.safeDefer = async () => true;
  InteractionHelper.safeEditReply = async () => true;
  const handlers = {};
  const edits = [];
  const collector = { ended: false, on: (event, fn) => { handlers[event] = fn; } };
  const message = { edit: async () => { throw new Error('Ephemeral message needs editReply'); }, createMessageComponentCollector: () => collector };
  const admin = { ...member, permissions: { has: () => true } };
  guild.members = { fetch: async () => admin };
  try {
    await panel.default.execute({ id: 'test', member: admin, user: { id: member.id }, guildId: guild.id, guild, fetchReply: async () => message, editReply: async value => edits.push(value) }, null, client);
    await handlers.collect({ id: 'edit', customId: 'prefix-panel-test-edit', user: { id: member.id }, showModal: async () => {}, awaitModalSubmit: async () => {
      collector.ended = true; handlers.end();
      return { user: { id: member.id }, fields: { getTextInputValue: () => 'expired' }, deferReply: async () => {}, editReply: async () => {}, reply: async () => {}, followUp: async () => {} };
    } });
    assert.equal(getPrefixSettings(data.get(`guild:${guild.id}:config`)).prefix, '?', 'Expired modal must not save');
    assert.ok(edits.every(edit => edit.components.length === 0), 'Expired panel must not restore dead controls');
    collector.ended = false;
    guild.members.fetch = async () => member;
    await handlers.collect({ customId: 'prefix-panel-test-toggle', user: { id: member.id }, deferUpdate: async () => {}, reply: async () => {} });
    assert.equal(getPrefixSettings(data.get(`guild:${guild.id}:config`)).enabled, true, 'Revoked permissions must prevent writes');
    guild.members.fetch = async () => admin;
    guild.channels.cache.clear(); guild.roles.cache.clear();
    await handlers.collect({ customId: 'prefix-panel-test-toggle', user: { id: member.id }, deferUpdate: async () => {}, reply: async () => {} });
    assert.equal(getPrefixSettings(data.get(`guild:${guild.id}:config`)).enabled, false, 'Deleted channel and role must not lock the panel');
    assert.ok(edits.some(edit => edit.components.length > 0), 'Successful change must refresh the ephemeral prefix panel');
    guild.channels.cache.set('1533088767441637398', { type: 0 });
    guild.roles.cache.set('1533088766821007391', { managed: false });
    await savePrefixSettings(client, guild, input);
    console.log('PASS: panel expiry, permission revocation and deleted selections');
  } finally { InteractionHelper.safeDefer = oldDefer; InteractionHelper.safeEditReply = oldEdit; }
  const help = await import('../src/services/prefixHelpService.js').catch(() => null);
  assert.ok(help, 'Prefix help builder must exist');
  const { SlashCommandBuilder, PermissionFlagsBits } = await import('discord.js');
  const command = (name, extra = {}) => ({ category: 'Core', data: new SlashCommandBuilder().setName(name).setDescription(`Use ${name}`), execute() {}, ...extra });
  const helpClient = { commands: new Map([
    ['ping', command('ping')], ['secret', command('secret', { ownerOnly: true })],
    ['slash', command('slash', { slashOnly: true })], ['hidden', command('hidden')],
    ['staff', command('staff', { data: new SlashCommandBuilder().setName('staff').setDescription('Staff only').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) })],
  ]) };
  const ordinary = { ...member, permissions: { has: () => false } };
  const entries = help.listPrefixHelp(helpClient, { disabledCommands: { hidden: true } }, ordinary, '1533088767441637398');
  assert.deepEqual(entries.map(item => item.name), ['ping'], 'Help must hide disabled, slash-only, owner and staff commands');
  assert.equal(help.listPrefixHelp(helpClient, { disabledCategories: { core: true } }, ordinary, '1533088767441637398').length, 0);
  console.log('PASS: permission-aware prefix help');
  const { default: express } = await import('express');
  const { registerDashboard } = await import('../src/web/dashboard.js');
  client.guilds = { cache: new Collection([[guild.id, guild]]) };
  const app = express(); registerDashboard(app, client);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/dashboard/api/prefix`;
    const response = await fetch(url);
    assert.equal(response.status, 200, 'Website must expose saved prefix settings');
    assert.deepEqual((await response.json()).settings, input);
    const save = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, prefix: '$' }) });
    assert.equal(save.status, 200);
    assert.equal(getPrefixSettings(data.get(`guild:${guild.id}:config`)).prefix, '$', 'Website saves must use the Discord settings store');
    const bad = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, prefix: '' }) });
    assert.equal(bad.status, 400);
    assert.equal(getPrefixSettings(data.get(`guild:${guild.id}:config`)).prefix, '$');
    const crossOrigin = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify(input) });
    assert.equal(crossOrigin.status, 403);
    console.log('PASS: website/Discord shared persistence, rejected writes, same-origin protection');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
} catch (error) { console.error(error); process.exitCode = 1; }
