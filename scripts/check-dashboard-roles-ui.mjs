import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { betaReleases } from '../src/config/releases.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = await (await fetch(`${process.env.DASHBOARD_QA_API || 'http://127.0.0.1:13301'}/dashboard/api/state`)).json();
const roles = [{ id: '222222222222222222', name: 'Beta Tester', color: '#67d5ff', position: 2, manageable: true, hoist: true, mentionable: false, permissions: [] },
  { id: '333333333333333333', name: 'Tester Two', color: '#ffffff', position: 3, manageable: true, hoist: false, mentionable: false, permissions: [] },
  { id: '444444444444444444', name: 'DexzuBot', color: '#67d5ff', position: 10, managed: true, manageable: false, hoist: true, mentionable: false, permissions: ['Administrator'] }];
const writes = [], reads = [], errors = [];
let autorole = null, failNext = false, expires = 120000, hold, release;
const app = express(); app.use(express.json());
app.use('/dashboard/api', async (req, res) => {
  const workspace = req.query.workspace || 'main';
  if (req.method === 'POST') {
    writes.push({ workspace, path: req.path, body: req.body });
    if (hold) await hold;
    if (failNext) { failNext = false; return res.status(500).json({ error: 'Discord is unavailable. Nothing was saved.' }); }
    if (req.path === '/roles/autorole') { autorole = req.body.roleId; return res.json({ ok: true, roleId: autorole }); }
    if (req.path === '/prefix') return res.json({ ok: true, settings: req.body });
    if (req.body.action === 'bulk-add' || req.body.action === 'delete') return res.json({ ok: true, preview: { code: 'abcdef123456', expires: Date.now() + expires, action: req.body.action === 'delete' ? 'delete' : 'add', memberCount: 2, summary: 'Add **Beta Tester** for **2** eligible members. Skipped: 1.' } });
    if (req.body.action === 'edit') Object.assign(roles.find(role => role.id === req.body.role), req.body);
    return res.json({ ok: true, title: req.body.action === 'cancel' ? 'Role preview cancelled' : 'Role updated', description: req.body.action === 'confirm' ? 'Changed: **2**\nFailed: **0**' : 'Changes saved.' });
  }
  reads.push({ workspace, path: req.path });
  if (req.path === '/roles') return res.json({ roles, autorole: { roleId: autorole, blocked: false } });
  if (req.path === '/releases') return res.json({ releases: workspace === 'beta' ? betaReleases : [] });
  if (req.path === '/prefix') return res.json({ settings: fixture.prefixSettings });
  if (req.path === '/activity') return res.json({ activity: [] });
  const current = structuredClone(fixture);
  current.workspace = { key: workspace, available: ['main', 'beta'] };
  current.server.name = workspace === 'beta' ? 'DexzuBot Beta' : 'Main QA';
  return res.json(current);
});
app.use('/dashboard', express.static(fileURLToPath(new URL('../src/web/public/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}/dashboard/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: process.env.QA_MOTION || 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base); await page.waitForFunction(() => state?.server);
  assert.equal(await page.locator('#beta-role-controls').isVisible(), false);
  assert.equal(reads.some(read => read.path === '/roles'), false);
  await page.locator('a[data-workspace="beta"]').click();
  await page.waitForFunction(() => state?.workspace.key === 'beta');
  await page.getByText('Role commands are ready to test', { exact: true }).waitFor();
  await page.locator('#beta-release-content summary').last().click();
  await page.waitForFunction(() => [...document.querySelectorAll('#beta-release-content details')].at(-1).open);
  await page.locator('#beta-release-content details').last().locator('li').first().waitFor({ state: 'visible' });
  assert.match(await page.locator('#beta-release-content').textContent(), /100 eligible members/);
  await page.locator('#open-beta-roles').click();
  await page.waitForFunction(() => !document.querySelector('#role-autorole-form fieldset').disabled);
  await page.locator('#command-prefix').fill('?');
  await page.locator('#role-autorole').selectOption(roles[0].id);
  await page.locator('#role-autorole-form button').click();
  await page.waitForFunction(() => pendingDashboardWrites === 0 && document.getElementById('role-status').textContent.includes('saved'));
  assert.equal(await page.evaluate(() => dirtyPages.has('operations')), true, 'Saving roles must preserve prefix edits');
  await page.locator('#prefix-settings-form button[type="submit"]').click();
  await page.waitForFunction(() => !dirtyPages.size);
  await page.locator('#role-create-name').fill('New Tester');
  failNext = true;
  await page.locator('#role-create-form button').click();
  await page.waitForFunction(() => document.getElementById('role-status').dataset.error === 'true');
  assert.equal(await page.locator('#role-create-name').inputValue(), 'New Tester');
  assert.equal(await page.evaluate(() => dirtyPages.has('operations')), true);
  await page.locator('#role-create-form button').click();
  await page.waitForFunction(() => !dirtyPages.size);
  await page.locator('#role-edit-selected').selectOption(roles[0].id);
  await page.locator('#role-edit-name').fill('Renamed Tester');
  let discardPrompt = false;
  page.once('dialog', async dialog => { discardPrompt = true; await dialog.dismiss(); });
  await page.locator('#role-edit-selected').selectOption(roles[1].id);
  assert.equal(discardPrompt, true, 'Switching roles must protect the unsaved edit');
  assert.equal(await page.locator('#role-edit-name').inputValue(), 'Renamed Tester');
  await page.locator('#role-edit-form button[type="submit"]').click();
  await page.waitForFunction(() => pendingDashboardWrites === 0 && !dirtyPages.size);
  assert.equal(writes.find(write => write.body.action === 'edit').body.hoist, true);
  await page.locator('#role-edit-selected').selectOption(roles[2].id);
  await page.waitForFunction(() => document.querySelector('#role-edit-form fieldset').disabled);
  assert.equal(await page.locator('#role-edit-form button[type="submit"]').isDisabled(), true);
  await page.locator('#role-bulk-selected').selectOption(roles[0].id);
  await page.locator('#role-bulk-form button').click();
  await page.locator('#role-preview-dialog').waitFor({ state: 'visible' });
  assert.equal(writes.filter(write => write.body.action === 'confirm').length, 0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('role-preview-dialog').open && pendingDashboardWrites === 0);
  assert.ok(writes.some(write => write.body.action === 'cancel'));
  await page.locator('#role-bulk-form button').click();
  await page.locator('#role-preview-dialog').waitFor({ state: 'visible' });
  hold = new Promise(resolve => { release = resolve; });
  await page.locator('#role-confirm').click();
  await page.waitForFunction(() => pendingDashboardWrites === 1);
  await page.locator('a[data-workspace="main"]').click();
  assert.match(page.url(), /workspace=beta/);
  release(); hold = null;
  await page.waitForFunction(() => pendingDashboardWrites === 0 && document.getElementById('role-status').textContent.includes('Changed: 2'));
  assert.equal(writes.filter(write => write.body.action === 'confirm').length, 1);
  expires = -1;
  await page.locator('#role-bulk-form button').click();
  await page.locator('#role-preview-dialog').waitFor({ state: 'visible' });
  await page.locator('#role-confirm').click();
  assert.equal(writes.filter(write => write.body.action === 'confirm').length, 1, 'Expired preview must not write');
  assert.ok(writes.every(write => write.workspace === 'beta'));
  const output = join(tmpdir(), 'dexzu-role-dashboard-qa'); await mkdir(output, { recursive: true });
  await page.locator('#refresh-roles').click();
  await page.waitForFunction(() => document.getElementById('role-status').dataset.error === 'false');
  await page.locator('.toast-close').evaluateAll(buttons => buttons.forEach(button => button.click()));
  await page.waitForFunction(() => !document.querySelector('.toast'));
  await page.locator('#beta-role-controls').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(output, 'desktop.png') });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#beta-role-controls').evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(output, 'mobile.png') });
  assert.deepEqual(errors, []);
  console.log(`PASS: release notes, role forms, failed-save drafts, confirmation/cancellation/expiry, keyboard, mobile, reduced motion, workspace isolation. Screenshots: ${output}`);
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
