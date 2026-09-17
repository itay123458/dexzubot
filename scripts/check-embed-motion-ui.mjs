import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { betaReleases } from '../src/config/releases.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fixture = await (await fetch('http://127.0.0.1:13301/dashboard/api/state')).json();
const app = express(); app.use(express.json());
let enabled = true, fail = false; const writes = [], errors = [];
app.use('/dashboard/api', (req, res) => {
  const workspace = req.query.workspace || 'main';
  if (req.path === '/embed-motion') {
    if (req.method === 'POST') {
      writes.push(workspace);
      if (fail) return res.status(500).json({ error: 'Save failed for this test.' });
      enabled = req.body.enabled;
    }
    return res.json({ enabled, ready: true, panels: { errors: 0 } });
  }
  if (req.path === '/roles') return res.json({ roles: [], autorole: { roleId: null } });
  if (req.path === '/releases') return res.json({ releases: betaReleases });
  if (req.path === '/activity') return res.json({ activity: [] });
  if (req.path === '/prefix') return res.json({ settings: fixture.prefixSettings });
  const state = structuredClone(fixture); state.workspace = { key: workspace, available: ['main', 'beta'] }; return res.json(state);
});
app.use('/dashboard', express.static(fileURLToPath(new URL('../src/web/public/', import.meta.url))));
const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard/?workspace=beta#operations`);
  await page.waitForFunction(() => state?.server && !document.querySelector('#embed-motion-form fieldset').disabled);
  await page.locator('#beta-embed-motion').waitFor({ state: 'visible' });
  assert.match(await page.locator('#embed-motion-avatar').getAttribute('src'), /\.gif$/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('#embed-motion-avatar').src.endsWith('.png'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#embed-motion-enabled').uncheck();
  fail = true; await page.locator('#embed-motion-form button').click();
  await page.getByText('Save failed for this test.', { exact: true }).waitFor();
  assert.equal(enabled, true); assert.ok(await page.evaluate(() => dirtyPages.has('operations')));
  fail = false; await page.locator('#embed-motion-form button').click();
  await page.waitForFunction(() => document.querySelector('#embed-motion-status').textContent.startsWith('Message design saved'));
  assert.equal(enabled, false); assert.equal(await page.evaluate(() => dirtyPages.has('operations')), false);
  await page.locator('#embed-motion-enabled').check(); await page.locator('#embed-motion-form button').click();
  await page.waitForFunction(() => !document.querySelector('#embed-motion-form fieldset').disabled);
  const output = join(tmpdir(), 'dexzu-embed-motion-qa'); await mkdir(output, { recursive: true });
  await page.locator('#beta-embed-motion').screenshot({ path: join(output, 'preview.png') });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/dashboard/#operations`);
  assert.equal(await page.locator('#beta-embed-motion').isVisible(), false);
  assert.ok(writes.every(workspace => workspace === 'beta')); assert.deepEqual(errors, []);
  console.log('Motion UI passed: preview, reduced motion, failed/successful saves, drafts, mobile, beta-only controls.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
