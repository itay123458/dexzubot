import assert from 'node:assert/strict';
import express from 'express';
import { Collection } from 'discord.js';
process.env.BETA_GUILD_ID = '1486680755869323388'; process.env.GUILD_ID = '1533088766821007390';
const { registerDashboard } = await import('../src/web/dashboard.js');
const store = new Map();
const guild = id => ({ id });
const client = { guilds: { cache: new Collection([process.env.BETA_GUILD_ID, process.env.GUILD_ID].map(id => [id, guild(id)])) }, db: {
  get: async key => structuredClone(store.get(key)), set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
} };
const app = express(); app.use(express.json());
registerDashboard(app, client, { authorizeWorkspace: (req, res, next) => req.method === 'POST' && req.get('x-test-viewer') ? res.status(403).json({ error: 'read only' }) : next() });
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/dashboard/api/food`;
const post = (body, headers = {}) => fetch(base + '?workspace=beta', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
try {
  assert.equal((await fetch(base + '?workspace=beta')).status, 200);
  assert.equal((await fetch(base)).status, 403);
  assert.equal((await post({ enabled: false, cooldownSeconds: 30 }, { 'x-test-viewer': 'true' })).status, 403);
  assert.equal((await post({ enabled: false, cooldownSeconds: 30 }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ enabled: true, cooldownSeconds: 0 })).status, 400);
  assert.equal((await post({ enabled: true, cooldownSeconds: 30, userId: 'forged' })).status, 400);
  assert.equal((await post({ enabled: false, cooldownSeconds: 45 })).status, 200);
  const data = await (await fetch(base + '?workspace=beta')).json();
  assert.deepEqual(data.settings, { enabled: false, cooldownSeconds: 45 });
  assert.equal(data.totalFoods, 120);
  assert.equal(data.rarities.reduce((sum, item) => sum + item.chance, 0), 100);
  console.log('Eat routes passed: Beta scope, auth ordering, origin, settings validation and persistence.');
} finally { await new Promise(resolve => server.close(resolve)); }
