// Uses live read-only state in memory; all invitations and writes are local mocks.
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const response = await fetch(`${process.env.DASHBOARD_QA_API || 'http://127.0.0.1:13301'}/dashboard/api/state`);
assert.equal(response.status, 200);
const fixture = await response.json();
const app = express();
app.use(express.json());
let role = 'owner', failInvite = false, expireSession = false;
const writes = [], authReads = [], invites = [];
const grants = [{ id: 'grant-test', userId: '12345678901234567', workspace: 'beta', role: 'viewer', createdAt: Date.now() }];
app.get('/dashboard/auth/login', (req, res) => res.send('<h1>Sign in</h1>'));
app.use('/dashboard/auth', (req, res) => {
  if (req.method === 'GET') authReads.push(req.path);
  if (expireSession) return res.status(401).json({ error: 'Session expired' });
  if (req.path === '/session') return res.json({ public: true, owner: role === 'owner', user: { id: '12345678901234567', username: 'QA account' }, grants: [{ workspace: 'beta', role }] });
  if (req.path === '/access') return res.json({ invites, grants });
  if (req.path === '/access/invites') {
    writes.push(req.body);
    if (failInvite) return res.status(400).json({ error: 'Recipient must join this server first.' });
    const invite = { ...req.body, id: 'invite-test', status: 'active', createdAt: Date.now(), expiresAt: Date.now() + 86400000 };
    invites.push(invite);
    return res.json({ ...invite, url: 'https://example.com/dashboard/auth/invite?token=qa-only' });
  }
  if (req.path === '/access/revoke') { writes.push(req.body); invites.splice(0); grants.splice(0); return res.json({ ok: true }); }
  if (req.path === '/logout') { writes.push({ logout: true }); return res.json({ ok: true }); }
  res.sendStatus(404);
});
app.use('/dashboard/api', (req, res) => {
  if (req.method !== 'GET') { writes.push({ forbiddenMutation: req.path }); return res.status(403).json({ error: 'Read only' }); }
  const state = structuredClone(fixture);
  state.workspace = { key: 'beta', available: ['main', 'beta'] };
  if (req.path === '/prefix') return res.json({ settings: state.prefixSettings });
  if (req.path === '/activity') return res.json({ activity: [] });
  if (req.path === '/roles') return res.json({ roles: [], autorole: { roleId: null, blocked: false } });
  if (req.path === '/releases') return res.json({ releases: [] });
  return res.json(state);
});
app.use('/dashboard', express.static(fileURLToPath(new URL('../src/web/public/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/dashboard/?workspace=beta`);
  await page.locator('[data-page="operations"]').click();
  await page.waitForFunction(() => !document.getElementById('dashboard-access').hidden);
  assert.equal(await page.locator('#dashboard-invite-role').inputValue(), 'viewer');
  assert.equal(await page.locator('#dashboard-invite-workspace').inputValue(), 'beta');
  assert.equal(await page.locator('#dashboard-invite-hours').inputValue(), '24');
  await page.locator('#dashboard-invite-user').fill('12345678901234567');
  failInvite = true;
  await page.locator('#dashboard-invite-form button').click();
  await page.waitForFunction(() => document.getElementById('dashboard-access-status').textContent.includes('Recipient must join'));
  assert.equal(await page.locator('#dashboard-invite-result').isVisible(), false);
  failInvite = false;
  await page.locator('#dashboard-invite-form button').click();
  await page.locator('#dashboard-invite-copy').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://example.com/dashboard/auth/invite?token=qa-only');
  assert.deepEqual(writes[1], { userId: '12345678901234567', workspace: 'beta', role: 'viewer', hours: 24 });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow at ${width}px`);
  }
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#dashboard-grants-list button').click();
  await page.waitForFunction(() => document.getElementById('dashboard-access-status').textContent === 'Revoked.');
  assert.equal(await page.locator('#dashboard-invite-link').inputValue(), '');
  assert.ok(writes.some(write => write.id === 'grant-test'));
  await page.setViewportSize({ width: 1440, height: 1000 });
  role = 'viewer'; authReads.length = 0;
  await page.reload();
  await page.waitForFunction(() => document.getElementById('dashboard-session-label').textContent.includes('read only'));
  assert.equal(await page.locator('#dashboard-access').isVisible(), false);
  assert.equal(authReads.includes('/access'), false, 'Non-owners never request access records');
  await page.keyboard.press('Control+k');
  await page.locator('#control-search-input').fill('safety');
  await page.locator('#control-search-results button').first().click();
  assert.equal(await page.locator('#save-ping').isDisabled(), true);
  assert.equal(await page.locator('#promo-search').isDisabled(), false);
  await page.evaluate(() => {
    const button = document.createElement('button'); button.id = 'qa-dynamic-save'; document.querySelector('[data-panel="safety"]').append(button);
    document.getElementById('save-ping').disabled = false;
  });
  await page.waitForFunction(() => document.getElementById('qa-dynamic-save').disabled && document.getElementById('save-ping').disabled);
  assert.equal(writes.some(write => write.forbiddenMutation), false);
  await page.locator('#dashboard-logout').click();
  await page.waitForURL('**/dashboard/auth/login');
  assert.ok(writes.some(write => write.logout));
  expireSession = true;
  await page.goto(`${origin}/dashboard/?workspace=beta`);
  await page.waitForURL('**/dashboard/auth/login');
  assert.deepEqual(errors, []);
  console.log('PASS: owner invite defaults/failure/create/copy/revoke; viewer record isolation, navigation and dynamic control locks; mobile overflow; logout and expired session redirect');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
