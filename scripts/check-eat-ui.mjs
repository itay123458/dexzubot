// Read-only live fixture; all food writes and session roles are local QA mocks.
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { FOODS, FOOD_RARITIES } from '../src/config/foods.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.DASHBOARD_QA_API || 'http://host.docker.internal:13301';
const fixture = await (await fetch(`${origin}/dashboard/api/state?workspace=beta`)).json();
const app = express(); app.use(express.json());
let role = 'manager', failSave = false, reads = 0;
let settings = { enabled: true, cooldownSeconds: 30 }; const writes = [];
app.get('/dashboard/auth/session', (req, res) => res.json({ public: true, owner: false, user: { id: '123456789012345678', username: 'QA' }, grants: [{ workspace: 'beta', role }] }));
app.get('/dashboard/api/food', (req, res) => {
  reads++;
  res.json({ settings, totalFoods: FOODS.length, rarities: FOOD_RARITIES.map(rarity => ({ ...rarity, foods: FOODS.filter(food => food.rarity === rarity.id).length })) });
});
app.post('/dashboard/api/food', (req, res) => {
  writes.push(req.body);
  if (role === 'viewer') return res.status(403).json({ error: 'Read only' });
  if (failSave) return res.status(400).json({ error: 'Could not save. Try again.' });
  settings = req.body; res.json({ ok: true, settings });
});
app.use('/dashboard/api', async (req, res) => {
  if (req.method !== 'GET') return res.sendStatus(405);
  if (req.path === '/state' && req.query.workspace === 'beta') return res.json(fixture);
  const response = await fetch(`${origin}/dashboard/api${req.url}`);
  res.status(response.status).type('json').send(await response.text());
});
app.use('/dashboard', express.static(fileURLToPath(new URL('../src/web/public/', import.meta.url))));
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const output = process.env.DASHBOARD_QA_OUTPUT || '/output'; await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}/dashboard/`;
  await page.goto(`${base}?workspace=beta#operations`);
  await page.waitForFunction(() => document.getElementById('food-settings-status').textContent === 'Settings loaded.' && document.getElementById('server-name').textContent !== 'Connecting…');
  await page.locator('#food-cooldown').fill('45');
  await page.locator('#food-settings-form button').click();
  await page.waitForFunction(() => document.getElementById('food-settings-status').textContent === 'Food settings saved.');
  assert.deepEqual(writes.at(-1), { enabled: true, cooldownSeconds: 45 });
  failSave = true; await page.locator('#food-cooldown').fill('60'); await page.locator('#food-settings-form button').click();
  await page.waitForFunction(() => document.getElementById('food-settings-status').textContent === 'Could not save. Try again.');
  assert.equal(await page.locator('#food-cooldown').inputValue(), '60');
  failSave = false; await page.locator('#food-settings-form button').click();
  await page.waitForFunction(() => document.getElementById('food-settings-status').textContent === 'Food settings saved.');
  await page.locator('#food-collection-controls summary').click();
  await page.locator('#food-collection-controls').screenshot({ path: `${output}/food-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#food-collection-controls').screenshot({ path: `${output}/food-mobile.png` });
  role = 'viewer'; await page.reload();
  await page.waitForFunction(() => document.getElementById('dashboard-session-label').textContent.includes('Viewer'));
  assert.equal(await page.locator('#food-settings-form button').isDisabled(), true);
  const priorReads = reads; await page.goto(`${base}?workspace=main#operations`);
  await page.waitForFunction(() => document.getElementById('server-name').textContent !== 'Connecting…');
  assert.equal(await page.locator('#food-collection-controls').isVisible(), false);
  assert.equal(reads, priorReads, 'Main must not request Beta food data');
  assert.deepEqual(errors, []);
  console.log('Eat UI passed: save, errors, retained drafts, mobile width, viewer controls and Main isolation.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
