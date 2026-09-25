import assert from 'node:assert/strict';
import express from 'express';
import { Collection } from 'discord.js';
process.env.BETA_GUILD_ID = '1486680755869323388';
process.env.GUILD_ID = '1533088766821007390';
const { registerDashboard } = await import('../src/web/dashboard.js');
const store = new Map();
const channel = { id: '1549857857414111272', guildId: process.env.BETA_GUILD_ID, type: 0, name: 'daily-bible', permissionsFor: () => ({ has: () => true }) };
const guild = { id: process.env.BETA_GUILD_ID, members: { me: {} }, channels: { cache: new Collection([[channel.id, channel]]), fetch: async id => id ? channel : new Collection([[channel.id, channel]]) } };
const client = { user: { id: '123456789012345679' }, guilds: { cache: new Collection([[guild.id, guild], [process.env.GUILD_ID, { ...guild, id: process.env.GUILD_ID }]]) }, db: {
  get: async key => structuredClone(store.get(key)), set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
} };
const app = express(); app.use(express.json());
// Exercise the real dashboard mount; its supplied auth middleware must run before Faith writes.
registerDashboard(app, client, { authorizeWorkspace: (req, res, next) => req.method === 'POST' && req.get('x-test-viewer') ? res.status(403).json({ error: 'read only' }) : next() });
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/dashboard/api/faith`;
const input = { enabled: true, channelId: channel.id, discussionChannelId: null, time: '09:00', timezone: 'Asia/Jerusalem', translation: 'WEB' };
const post = (body, headers = {}) => fetch(base + '?workspace=beta', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
try {
  assert.equal((await fetch(base + '?workspace=beta')).status, 200);
  assert.equal((await fetch(base)).status, 200, 'Main has released Faith controls');
  assert.equal(store.size, 0, 'viewing Main must not save settings');
  assert.equal((await post(input, { 'x-test-viewer': 'true' })).status, 403);
  assert.equal((await post(input, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ ...input, timezone: 'bad' })).status, 400);
  assert.equal((await post({ ...input, configuredBy: 'forged-user' })).status, 400);
  assert.equal((await post(input)).status, 200);
  const saved = await (await fetch(base + '?workspace=beta')).json();
  assert.equal(saved.config.enabled, true);
  assert.equal(saved.config.channelId, channel.id);
  assert.ok(saved.verse.text && saved.verse.reference);
  console.log('Faith route checks passed: real dashboard mount, Beta scope, authorization order, origin, validation and persistence.');
} finally { await new Promise(resolve => server.close(resolve)); }
