// Browser regression check. Run in an isolated QA environment with Playwright
// and Chromium installed. API reads use a tunnel; writes are mocked below.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const publicRoot = fileURLToPath(new URL('../src/web/public/', import.meta.url));
const apiOrigin = process.env.DASHBOARD_QA_API || 'http://host.docker.internal:13301';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (pathname.startsWith('/dashboard/api/')) {
      const response = await fetch(apiOrigin + pathname);
      res.writeHead(response.status, { 'content-type': 'application/json' });
      res.end(await response.text()); return;
    }
    const relative = pathname.replace(/^\/dashboard\/?/, '') || 'index.html';
    const target = path.resolve(publicRoot, relative);
    if (!target.startsWith(publicRoot)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(await readFile(target));
  } catch { res.writeHead(502).end('QA request failed'); }
});
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const writes = [];
  await page.route('**/dashboard/api/**', async route => {
    if (route.request().method() === 'GET') return route.continue();
    writes.push({ url: route.request().url(), body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('http://127.0.0.1:4173/dashboard/');
  await page.waitForFunction(() => document.getElementById('server-name').textContent !== 'Connecting…');
  assert.equal(await page.locator('[data-layout-choice],#dashboard-layout').count(), 0);
  const pages = await page.locator('[data-page]').evaluateAll(items => items.map(item => item.dataset.page));
  const overflow = [];
  const widths = [2560, 1920, 1440, 1280, 1024, 820, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    for (const destination of pages) {
      if (width <= 760) await page.locator('#mobile-navigation').click();
      await page.locator(`[data-page="${destination}"]`).click();
      await page.waitForTimeout(80);
      assert.equal(await page.locator(`[data-page="${destination}"]`).getAttribute('aria-current'), 'page');
      const exceeds = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (exceeds) overflow.push({ width, destination, elements: await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0,6).map(e => e.className || e.tagName)) });
      if ([1440,390].includes(width) && ['overview','logging','greetings','youtube'].includes(destination)) {
        await page.screenshot({ path: `/output/${destination}-${width}.png`, fullPage: true });
      }
    }
  }
  assert.deepEqual(overflow, [], 'Pages must not overflow horizontally');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-page="overview"]').click();
  const category = page.locator('[data-category]').first();
  const wasEnabled = await category.isChecked();
  await category.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  assert.ok(writes.some(w => w.url.endsWith('/category') && w.body.enabled === !wasEnabled));
  assert.equal(await category.evaluate(el => el.closest('.module-controls') !== null), true);
  await page.locator('[data-page="greetings"]').click();
  await page.locator('#welcome-message').fill('Welcome {user} to {server}!');
  await page.locator('#save-greetings').click();
  await page.waitForTimeout(100);
  assert.ok(writes.some(w => w.url.endsWith('/greetings') && w.body.welcomeMessage === 'Welcome {user} to {server}!'));
  await page.locator('[data-page="leveling"]').click();
  await page.locator('#leveling-xp-min').fill('999');
  await page.locator('#leveling-xp-max').fill('1');
  assert.equal(await page.locator('#save-leveling').isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-navigation').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#mobile-navigation').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#mobile-navigation').evaluate(el => el === document.activeElement), true);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${pages.length} pages × ${widths.length} widths; no overflow or runtime errors; mocked toggle/save, validation, navigation, Escape and focus checks.`);
} finally {
  await browser.close();
  server.close();
}
