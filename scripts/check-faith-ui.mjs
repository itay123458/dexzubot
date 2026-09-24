// Browser QA: real read-only dashboard fixture; all writes stay inside this process.
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.DASHBOARD_QA_API || 'http://host.docker.internal:13301';
const fixture = await (await fetch(`${origin}/dashboard/api/state?workspace=beta`)).json();
const app = express(); app.use(express.json());
let role = 'manager', failSave = false;
let config = { enabled: false, channelId: null, discussionChannelId: null, time: '09:00', timezone: 'Asia/Jerusalem', translation: 'WEB' };
const writes = [];
app.get('/dashboard/auth/session', (req, res) => res.json({ public: true, owner: false, user: { id: '123456789012345678', username: 'QA' }, grants: [{ workspace: 'beta', role }] }));
app.get('/dashboard/api/faith', (req, res) => res.json({ config, channels: [{ id: '1549857857414111272', name: 'daily-bible' }],
  delivery: { entries: [] }, today: '2026-09-24', collectionSize: 26,
  verse: { text: 'The LORD is my shepherd; I shall lack nothing.', reference: 'Psalms 23:1', source: 'https://ebible.org/engwebp/PSA023.htm' },
}));
app.post('/dashboard/api/faith', (req, res) => {
  writes.push(req.body);
  if (role === 'viewer') return res.status(403).json({ error: 'Read only' });
  if (failSave) return res.status(400).json({ error: 'Choose a valid timezone.' });
  config = req.body; res.json({ ok: true, config });
});
app.use('/dashboard/api', async (req, res) => {
  if (req.method !== 'GET') return res.sendStatus(405);
  if (req.path === '/state') return res.json(fixture);
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
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard/?workspace=beta#faith`);
  await page.waitForFunction(() => document.getElementById('faith-status').textContent === 'Settings loaded.' && document.getElementById('server-name').textContent !== 'Connecting…');
  await page.locator('#faith-enabled').check();
  await page.locator('#faith-channel').selectOption('1549857857414111272');
  await page.locator('#faith-time').fill('10:15');
  await page.locator('#faith-form button[type=submit]').click();
  await page.waitForFunction(() => document.getElementById('faith-status').textContent === 'Faith settings saved.');
  assert.equal(writes.at(-1).time, '10:15');
  failSave = true;
  await page.locator('#faith-timezone').fill('invalid');
  await page.locator('#faith-form button[type=submit]').click();
  await page.waitForFunction(() => document.getElementById('faith-status').textContent === 'Choose a valid timezone.');
  assert.equal(await page.locator('#faith-timezone').inputValue(), 'invalid');
  failSave = false;
  await page.locator('#faith-timezone').fill('Asia/Jerusalem');
  await page.locator('#faith-form button[type=submit]').click();
  await page.waitForFunction(() => document.getElementById('faith-status').textContent === 'Faith settings saved.');
  await page.screenshot({ path: `${output}/faith-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no mobile overflow');
  await page.screenshot({ path: `${output}/faith-mobile.png`, fullPage: true });
  role = 'viewer'; await page.reload();
  await page.waitForFunction(() => document.getElementById('dashboard-session-label').textContent.includes('Viewer'));
  assert.equal(await page.locator('#faith-form button[type=submit]').isDisabled(), true, 'viewer cannot write');
  assert.deepEqual(errors, []);
  console.log('Faith UI passed: real dashboard layout, save, validation, retained draft, mobile width, and read-only controls.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
