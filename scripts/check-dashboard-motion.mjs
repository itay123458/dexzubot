import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
try {
  const page = await browser.newPage();
  const html = await readFile(new URL('../src/web/public/index.html', import.meta.url), 'utf8');
  await page.setContent('<section class="page active"><article class="card motion-enter">Content</article><article class="card stable">Settled</article></section><button class="icon-button loading"><svg><path d="M0 0h10"/></svg></button><div class="toast">Saved</div><div class="skeleton">Loading</div><i class="status-dot good"></i>');
  for (const [, name] of html.matchAll(/href="\/dashboard\/([^"?]+\.css)(?:\?[^" ]*)?"/g)) {
    await page.addStyleTag({ content: await readFile(new URL(`../src/web/public/${name}`, import.meta.url), 'utf8') });
  }
  const animation = selector => page.locator(selector).evaluate(el => getComputedStyle(el).animationName);
  assert.notEqual(await animation('.motion-enter'), 'none', 'Shared entry must animate with normal motion');
  assert.notEqual(await animation('.loading svg'), 'none', 'Refresh icon must spin while loading');
  assert.equal(await animation('.loading'), 'none', 'Refresh button hit target must stay still');
  assert.notEqual(await animation('.toast'), 'none', 'Toast entry must animate');
  assert.notEqual(await animation('.skeleton'), 'none', 'Loading placeholders must animate');
  assert.equal(await animation('.stable'), 'none', 'Nested cards must not replay entry animations');
  assert.notEqual(await animation('.status-dot'), 'none', 'Online indicators gently pulse');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const selector of ['.motion-enter', '.loading svg', '.toast', '.skeleton']) assert.equal(await animation(selector), 'none');
  console.log('PASS: page, refresh, toast and loading motion; stable cards and hit targets; reduced-motion fallback.');
} finally { await browser.close(); }
