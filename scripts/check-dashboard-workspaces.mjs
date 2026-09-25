import assert from 'node:assert/strict';
import express from 'express';
import { Collection } from 'discord.js';

process.env.NODE_ENV = 'test';
process.env.GUILD_ID = '1533088766821007390';
process.env.BETA_GUILD_ID = '1486680755869323388';
const { registerDashboard } = await import('../src/web/dashboard.js');
const store = new Map();
const guild = id => ({ id, channels: { cache: new Collection() }, roles: { cache: new Collection() } });
const client = {
  guilds: { cache: new Collection([process.env.GUILD_ID, process.env.BETA_GUILD_ID].map(id => [id, guild(id)])) },
  db: { get: async (key, fallback) => structuredClone(store.get(key) ?? fallback), set: async (key, value) => { store.set(key, structuredClone(value)); return true; } },
};
const app = express();
registerDashboard(app, client);
const server = await new Promise(resolve => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
const base = `http://127.0.0.1:${server.address().port}/dashboard/api`;
const save = (workspace, prefix, extra = {}) => fetch(`${base}/prefix${workspace}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify({ prefix, enabled: true, allowedChannelIds: [], allowedRoleIds: [] }) });
try {
  const betaReleases = await fetch(`${base}/releases?workspace=beta`);
  assert.equal(betaReleases.status, 200);
  assert.ok((await betaReleases.json()).releases.some(release => release.id === '2026-09-16-roles'));
  assert.deepEqual((await (await fetch(`${base}/releases`)).json()).releases.map(release=>release.id), ['2026-09-25-beta-owner-main','2026-09-25-music-prefix','2026-09-17-dashboard-access','2026-09-17-community-release']);
  assert.equal((await save('', '!')).status, 200);
  assert.equal((await save('?workspace=beta', '?')).status, 200);
  assert.equal((await (await fetch(`${base}/prefix`)).json()).settings.prefix, '!', 'Beta writes must not change main settings');
  assert.equal((await (await fetch(`${base}/prefix?workspace=beta`)).json()).settings.prefix, '?');
  assert.equal((await save('?workspace=invalid', '$')).status, 400);
  assert.equal((await save('?workspace=beta&workspace=main', '$')).status, 400);
  assert.equal((await save('?workspace=beta', '$', { Origin: 'https://untrusted.example' })).status, 403);
  client.guilds.cache.delete(process.env.BETA_GUILD_ID);
  assert.equal((await save('?workspace=beta', '$')).status, 503, 'Missing beta guild must never fall back to main');
  assert.equal((await (await fetch(`${base}/prefix`)).json()).settings.prefix, '!');
  delete process.env.BETA_GUILD_ID;
  assert.equal((await fetch(`${base}/prefix?workspace=beta`)).status, 503);
  client.guilds.cache.delete(process.env.GUILD_ID);
  client.guilds.cache.set('111111111111111111', guild('111111111111111111'));
  assert.equal((await save('', '$')).status, 503, 'Missing configured main must not target another guild');
  console.log('PASS: main/beta reads and writes are isolated; invalid, duplicate, cross-origin and unavailable workspaces fail closed');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await new Promise(resolve => server.close(resolve)); }
