import assert from 'node:assert/strict';
import express from 'express';
import { Collection, PermissionsBitField } from 'discord.js';
process.env.NODE_ENV = 'test';
process.env.GUILD_ID = '1533088766821007390';
process.env.BETA_GUILD_ID = '1486680755869323388';
const { registerDashboard } = await import('../src/web/dashboard.js');
const store = new Map(), guild = { id: process.env.BETA_GUILD_ID, ownerId: '111111111111111111' };
const role = (id, position, managed = false) => ({ id, guild, name: `Role ${position}`, position, managed,
  hexColor: '#67d5ff', hoist: true, mentionable: true, permissions: new PermissionsBitField(),
  comparePositionTo: other => position - other.position, toString: () => `<@&${id}>` });
const selected = role('222222222222222222', 2), top = role('333333333333333333', 10, true);
guild.roles = { cache: new Collection([[selected.id, selected], [top.id, top]]), fetch: async () => guild.roles.cache };
const member = id => ({ id, guild, user: { bot: false }, permissions: new PermissionsBitField(PermissionsBitField.All), roles: { highest: role(id, 1), cache: new Collection() } });
const me = member('444444444444444444'), target = member('555555555555555555'); me.user.bot = true; me.roles.highest = top;
guild.members = { me, cache: new Collection([[me.id, me], [target.id, target]]), fetchMe: async () => me,
  fetch: async arg => arg ? guild.members.cache.get(typeof arg === 'string' ? arg : arg.user) : guild.members.cache };
let changes = 0;
target.roles.add = async id => { changes++; target.roles.cache.set(id, selected); };
target.roles.remove = async id => { changes++; target.roles.cache.delete(id); };
selected.edit = async changes => Object.assign(selected, changes);
const client = { user: { id: me.id }, guilds: { cache: new Collection([[guild.id, guild], [process.env.GUILD_ID, { ...guild, id: process.env.GUILD_ID }]]) },
  db: { get: async (key, fallback) => structuredClone(store.get(key) ?? fallback), set: async (key, value) => { store.set(key, structuredClone(value)); return true; } } };
const app = express(); registerDashboard(app, client);
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/dashboard/api`;
const post = (path, body, workspace = 'beta', headers = {}) => fetch(`${base}/${path}?workspace=${workspace}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
try {
  assert.equal((await fetch(`${base}/roles?workspace=beta`)).status, 200);
  assert.equal((await fetch(`${base}/roles`)).status, 200);
  const roles = await (await fetch(`${base}/roles?workspace=beta`)).json();
  assert.equal(roles.roles.find(item => item.id === selected.id).manageable, true);
  assert.equal(roles.roles.find(item => item.id === top.id).manageable, false);
  assert.equal((await post('roles/action', { action: 'add', role: selected.id, member: target.id }, 'main')).status, 400);
  assert.equal((await post('roles/action', { action: 'add', role: selected.id, member: target.id }, 'beta', { Origin: 'https://other.example' })).status, 403);
  assert.equal((await post('roles/action', { action: 'edit', role: selected.id, hoist: 'false' })).status, 400);
  assert.equal((await post('roles/action', { action: 'add', role: '999999999999999999', member: target.id })).status, 400);
  const preview = await (await post('roles/action', { action: 'bulk-add', role: selected.id, audience: 'humans' })).json();
  assert.equal(changes, 0); assert.equal(preview.preview.memberCount, 1); assert.ok(preview.preview.code);
  const confirmed = await post('roles/action', { action: 'confirm', code: preview.preview.code });
  assert.equal(confirmed.status, 200); assert.equal(changes, 1);
  assert.equal((await post('roles/action', { action: 'confirm', code: preview.preview.code })).status, 400);
  const edited = await post('roles/action', { action: 'edit', role: selected.id, name: 'New name' });
  assert.equal(edited.status, 200); assert.equal(selected.hoist, true); assert.equal(selected.mentionable, true);
  assert.equal((await post('roles/autorole', { roleId: selected.id })).status, 200);
  assert.equal((await (await fetch(`${base}/roles?workspace=beta`)).json()).autorole.roleId, selected.id);
  const savedKeys = [...store.keys()]; assert.ok(savedKeys.every(key => !key.includes(process.env.GUILD_ID)));
  const { patchGuildConfig } = await import('../src/services/config/guildConfig.js');
  await patchGuildConfig(client, guild.id, { verification: { enabled: true } });
  assert.equal((await post('roles/autorole', { roleId: selected.id })).status, 400);
  assert.equal((await post('roles/autorole', { roleId: null })).status, 200);
  me.permissions = new PermissionsBitField();
  assert.equal((await post('roles/action', { action: 'remove', role: selected.id, member: target.id })).status, 400);
  assert.equal(changes, 1);
  console.log('PASS: beta role API isolation, validation, preview/confirmation, edit preservation, autorole persistence and permission checks');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await new Promise(resolve => server.close(resolve)); }
