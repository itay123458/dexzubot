// Browser coverage uses a real dashboard read as fixture; all writes stay in this local QA server.
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const response = await fetch(`${process.env.DASHBOARD_QA_API || 'http://127.0.0.1:13301'}/dashboard/api/state`);
assert.equal(response.status, 200);
const fixture = await response.json();
const reads = [], writes = [];
let holdSave, finishSave;
const app = express();
app.use(express.json());
app.use('/dashboard/api', async (req, res) => {
  const key = req.query.workspace || 'main';
  if (req.method === 'POST') {
    writes.push({ key, path: req.path, body: req.body });
    if (holdSave) await holdSave;
    return res.json({ ok: true, settings: req.body });
  }
  reads.push({ key, path: req.path });
  const state = structuredClone(fixture);
  state.workspace = { key, available: ['main', 'beta'] };
  state.server.name = key === 'beta' ? 'DexzuBot Beta' : 'Main QA Server';
  state.server.id = key === 'beta' ? '1486680755869323388' : '1533088766821007390';
  if (req.path === '/prefix') return res.json({ settings: state.prefixSettings });
  if (req.path === '/activity') return res.json({ activity: [] });
  return res.json(state);
});
app.use('/dashboard', express.static(fileURLToPath(new URL('../src/web/public/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/dashboard/`);
  await page.waitForFunction(() => document.getElementById('server-name').textContent === 'Main QA Server');
  assert.equal(await page.locator('a[data-workspace="main"]').getAttribute('aria-current'), 'page');
  await page.locator('a[data-workspace="beta"]').click();
  await page.waitForFunction(() => document.getElementById('server-name').textContent === 'DexzuBot Beta');
  assert.equal(await page.locator('a[data-workspace="beta"]').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('#workspace-notice').isVisible(), true);
  assert.match(await page.locator('#config-export').getAttribute('href'), /workspace=beta/);
  await page.evaluate(() => refreshRecentActivity());
  assert.ok(reads.some(req => req.path === '/activity' && req.key === 'beta'));
  await page.keyboard.press('Control+k');
  await page.locator('#control-search-input').fill('safety');
  await page.locator('#control-search-results button').first().click();
  holdSave = new Promise(resolve => { finishSave = resolve; });
  await page.locator('#save-ping').click();
  await page.waitForFunction(() => pendingDashboardWrites === 1);
  await page.locator('a[data-workspace="main"]').click();
  assert.match(page.url(), /workspace=beta/);
  finishSave(); holdSave = null;
  await page.waitForFunction(() => pendingDashboardWrites === 0);
  assert.ok(writes.some(req => req.key === 'beta' && req.path === '/anti-ping'));
  await page.locator('[data-page="operations"]').click();
  await page.locator('#command-prefix').fill('?');
  let dialogSeen = false;
  page.once('dialog', async dialog => { dialogSeen = true; await dialog.dismiss(); });
  await page.locator('a[data-workspace="main"]').click();
  assert.equal(dialogSeen, true, 'Switching must protect unsaved changes');
  assert.match(page.url(), /workspace=beta/);
  await page.locator('#prefix-settings-form').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => !dirtyPages.size && pendingDashboardWrites === 0);
  await page.locator('a[data-workspace="main"]').click();
  await page.waitForFunction(() => document.getElementById('server-name').textContent === 'Main QA Server');
  assert.equal(await page.locator('#workspace-notice').isVisible(), false);
  assert.doesNotMatch(await page.locator('#config-export').getAttribute('href'), /beta/);
  const betaPage = await browser.newPage();
  await betaPage.goto(`${origin}/dashboard/?workspace=beta`);
  await betaPage.waitForFunction(() => document.getElementById('server-name').textContent === 'DexzuBot Beta');
  await betaPage.waitForTimeout(800); // Let the normal-motion entrance settle before visual checks.
  assert.equal(await page.locator('#server-name').textContent(), 'Main QA Server', 'Separate tabs keep separate workspaces');
  const output = process.env.DASHBOARD_QA_OUTPUT;
  if (output) await mkdir(output, { recursive: true });
  for (const width of [1440, 820, 390, 320]) {
    await betaPage.setViewportSize({ width, height: 1000 });
    assert.equal(await betaPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow at ${width}px`);
    assert.equal(await betaPage.locator('a[data-workspace="main"]').isVisible(), true);
    if (output && [1440, 390].includes(width)) await betaPage.screenshot({ path: `${output}/beta-${width}.png`, fullPage: false });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: workspace switching, scoped writes/polling/export, pending save guard, unsaved drafts, independent tabs, search and mobile layouts');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { finishSave?.(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
