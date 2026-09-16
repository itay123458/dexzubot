import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (!process.env.DOCK_QA_LIVE) await page.route('**/dashboard/', route => route.fulfill({ path: fileURLToPath(new URL('../src/web/public/index.html', import.meta.url)), contentType: 'text/html' }));
  if (!process.env.DOCK_QA_LIVE) for (const name of ['app.js', 'command-center.css', 'motion.js', 'motion.css', 'workspace.js', 'control-center.js']) {
    await page.route(`**/${name}*`, route => route.fulfill({ path: fileURLToPath(new URL(`../src/web/public/${name}`, import.meta.url)), contentType: name.endsWith('.js') ? 'text/javascript' : 'text/css' }));
  }
  await page.route('**/dashboard/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort());
  await page.goto(`${process.env.DASHBOARD_QA_API || 'http://127.0.0.1:13301'}/dashboard/`);
  await page.locator('#metrics .metric').first().waitFor();
  const item = page.locator('[data-page="safety"]');
  const before = await item.boundingBox();
  await item.hover();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-page="safety"] .nav-icon')).transform !== 'none');
  assert.equal((await item.boundingBox()).y, before.y);
  assert.equal((await item.boundingBox()).width, before.width);
  await item.click();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => {
    const item = document.querySelector('.nav-item.active').getBoundingClientRect();
    const line = document.querySelector('#nav-active-indicator').getBoundingClientRect();
    return Math.abs(item.x + item.width / 2 - line.x - line.width / 2) < 1;
  });
  for (const name of ['logging', 'overview', 'greetings']) await page.locator(`[data-page="${name}"]`).click();
  assert.equal(await page.locator('[data-page="greetings"]').getAttribute('aria-current'), 'page');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await item.hover();
  assert.equal(await item.evaluate(el => getComputedStyle(el).transform), 'none');
  assert.equal(await page.locator('#nav-active-indicator').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#mobile-navigation').click();
  await page.locator('[data-page="overview"]').click();
  await page.waitForFunction(() => !document.body.classList.contains('navigation-open'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errors, []);
  console.log('PASS: dock hover, stable layout, sliding indicator, rapid navigation, reduced motion and mobile.');
} finally { await browser.close(); }
