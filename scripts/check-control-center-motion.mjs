// Isolated browser regression: only API reads reach the private dashboard.
// No write request can pass either the browser route or the local proxy.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'file:///C:/Users/itayk/AppData/Local/Temp/dexzu-design-qa/node_modules/playwright/index.mjs');
const publicRoot = fileURLToPath(new URL('../src/web/public/', import.meta.url));
const apiOrigin = process.env.DASHBOARD_QA_API || 'http://127.0.0.1:13301';
const port = Number(process.env.DASHBOARD_MOTION_QA_PORT || 4174);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') return void res.writeHead(405).end();
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/dashboard/api/')) {
      const response = await fetch(apiOrigin + url.pathname + url.search);
      res.writeHead(response.status, { 'content-type': 'application/json' });
      return void res.end(await response.text());
    }
    const relative = url.pathname.replace(/^\/dashboard\/?/, '') || 'index.html';
    const target = path.resolve(publicRoot, relative);
    if (path.relative(publicRoot, target).startsWith('..')) return void res.writeHead(403).end();
    const bytes = await readFile(target);
    res.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(bytes);
  } catch { res.writeHead(502).end('QA request failed'); }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const failures = [];
let checks = 0;
const check = async (name, fn) => {
  try { await fn(); checks++; console.log(`PASS: ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL: ${name}: ${error.message}`); }
};
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    let saveResponse;
    let pendingWrite;
    const writes = [];
    await page.route('**/dashboard/api/**', async route => {
      if (route.request().method() === 'GET') return route.continue();
      writes.push(route.request().url());
      pendingWrite?.();
      const response = saveResponse ? await saveResponse : { status: 200, body: '{}' };
      return route.fulfill({ ...response, contentType: 'application/json' });
    });
    await page.addInitScript(() => {
      window.__metricSamples = [];
      const observer = new MutationObserver(() => {
        const el = document.querySelector('#metrics .metric strong');
        if (el) window.__metricSamples.push(el.textContent);
      });
      observer.observe(document, { childList: true, characterData: true, subtree: true });
    });
    await page.goto(`http://127.0.0.1:${port}/dashboard/`);
    await page.waitForFunction(() => typeof state !== 'undefined' && !!state?.server);
    await page.waitForTimeout(1100);
    const mode = reducedMotion === 'reduce' ? 'reduced' : 'normal';
    await check(`${mode}: real initial count and stable metric nodes`, async () => {
      const result = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('#metrics .metric')];
        const shown = nodes.map(el => el.querySelector('strong').textContent);
        const expected = [state.server.members, state.server.channels, state.server.roles ?? '—', state.bot.loadedCommands];
        render(state);
        return { same: nodes.every((el, i) => el === document.querySelectorAll('#metrics .metric')[i]), shown: shown.slice(0, 4), expected: expected.map(String), samples: window.__metricSamples };
      });
      assert.deepEqual(result.shown.map(value => value.replaceAll(',', '')), result.expected);
      assert.equal(result.same, true, 'Refreshing identical state must retain metric elements');
      if (mode === 'normal' && Number(result.expected[0]) > 1) assert.ok(result.samples.some(value => Number(value) >= 0 && Number(value) < Number(result.expected[0])), 'Initial real count should interpolate');
    });
    await check(`${mode}: zero and unavailable values stay truthful`, async () => {
      await page.evaluate(() => {
        window.__originalState = structuredClone(state);
        const fixture = structuredClone(state);
        fixture.server.members = 0;
        fixture.server.roles = null;
        fixture.bot.memoryMb = null;
        fixture.bot.latencyMs = null;
        render(fixture);
      });
      await page.waitForTimeout(900);
      assert.equal(await page.locator('#metrics .metric strong').nth(0).textContent(), '0');
      assert.equal(await page.locator('#metrics .metric strong').nth(2).textContent(), '—');
      assert.equal(await page.locator('#hero-memory').textContent(), '—');
      assert.doesNotMatch(await page.locator('#hero-connection').textContent(), /null|NaN|undefined/);
      await page.evaluate(() => render(window.__originalState));
    });
    await check(`${mode}: activity rows persist and unchanged scroll stays stable`, async () => {
      const result = await page.evaluate(async () => {
        const feed = document.getElementById('recent-activity');
        feed.style.maxHeight = '180px'; feed.style.overflowY = 'auto';
        state.recentActivity = Array.from({ length: 12 }, (_, i) => ({ id: `qa-${i}`, title: `QA event ${i}`, detail: 'Synthetic browser-only event', category: 'dashboard', timestamp: new Date(Date.now() - i * 60000).toISOString() }));
        activityExpanded = true;
        renderRecentActivity();
        await new Promise(resolve => setTimeout(resolve, 1100));
        const old = [...feed.querySelectorAll('.activity-row')];
        feed.scrollTop = 100;
        const scroll = feed.scrollTop;
        renderRecentActivity();
        const same = old.every((el, i) => feed.querySelectorAll('.activity-row')[i] === el);
        const stableScroll = feed.scrollTop === scroll;
        state.recentActivity.unshift({ id: 'qa-new', title: 'QA new event', category: 'dashboard', timestamp: new Date().toISOString() });
        latestActivityId = 'qa-new';
        renderRecentActivity();
        const retained = old.every(el => el.isConnected);
        const newRows = [...feed.querySelectorAll('.activity-row')].filter(el => el.getAnimations().some(animation => animation.playState === 'running'));
        return { same, stableScroll, retained, newCount: newRows.length, onlyNew: newRows.every(el => el.textContent.includes('QA new event')) };
      });
      assert.equal(result.same, true); assert.equal(result.stableScroll, true); assert.equal(result.retained, true);
      assert.ok(result.newCount <= 1); assert.equal(result.onlyNew, true);
      await page.evaluate(() => { activityExpanded = false; render(window.__originalState); });
    });
    await check(`${mode}: all 12 pages navigate and dock hitboxes stay stable`, async () => {
      const destinations = await page.locator('#dashboard-navigation [data-page]').evaluateAll(items => items.map(el => el.dataset.page));
      assert.equal(destinations.length, 12);
      for (const destination of destinations) {
        const button = page.locator(`[data-page="${destination}"]`);
        await button.click();
        await page.waitForTimeout(450);
        assert.equal(await button.getAttribute('aria-current'), 'page');
        assert.equal(await page.locator('.page.active').count(), 1);
        if (mode === 'reduced') assert.equal(await page.locator('.page.active').evaluate(el => el.getAnimations().some(animation => animation.playState === 'running')), false);
        await page.mouse.move(1400, 20);
        await page.waitForTimeout(220);
        const before = await button.boundingBox();
        await button.hover(); await page.waitForTimeout(220);
        const after = await button.boundingBox();
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) < 1, `${destination}: hover changed hitbox ${key}`);
      }
    });
    await check(`${mode}: search dismissal, rapid reopen, focus restoration`, async () => {
      const opener = page.locator('#open-control-search');
      await opener.click();
      assert.equal(await page.locator('#control-search-input').evaluate(el => el === document.activeElement), true, 'Opening search focuses its input');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('control-search-dialog').open);
      assert.equal(await opener.evaluate(el => el === document.activeElement), true, 'Escape returns focus to the opener');
      await opener.click();
      await page.evaluate(() => { document.getElementById('close-control-search').click(); document.getElementById('open-control-search').click(); });
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#control-search-dialog').evaluate(el => el.open), true, 'Old closing callback must not close the reopened dialog');
      assert.equal(await page.locator('#control-search-input').evaluate(el => el === document.activeElement), true, 'Reopening search focuses its input');
      await page.locator('#control-search-input').fill('tickets');
      await page.locator('#control-search-results button').first().click();
      await page.waitForFunction(() => !document.getElementById('control-search-dialog').open);
      assert.equal(await page.locator('[data-page="module-ticket"]').getAttribute('aria-current'), 'page');
      await page.waitForFunction(() => document.getElementById('dashboard-main') === document.activeElement);
    });
    await check(`${mode}: save pending/failure never reports success, successful save does`, async () => {
      await page.locator('[data-page="greetings"]').click();
      await page.locator('#welcome-message').fill('Browser-only motion regression');
      const button = page.locator('#save-greetings');
      for (const status of [500, 200]) {
        await page.evaluate(() => document.getElementById('toasts').replaceChildren());
        let finish;
        saveResponse = new Promise(resolve => { finish = resolve; });
        const started = new Promise(resolve => { pendingWrite = resolve; });
        await button.click(); await started;
        await page.waitForTimeout(250);
        assert.doesNotMatch(await button.textContent(), /saved/i);
        assert.equal(await button.getAttribute('aria-busy'), 'true', 'Pending write is announced as busy');
        assert.equal(await button.isDisabled(), true, 'Pending write prevents duplicate submission');
        assert.equal(await button.evaluate(el => el.classList.contains('saved-feedback')), false);
        assert.equal(await page.locator('#toasts .success').count(), 0);
        finish({ status, body: status === 200 ? '{}' : '{"error":"Synthetic save failure"}' });
        await page.waitForSelector(`#toasts .${status === 200 ? 'success' : 'error'}`);
        if (status === 200) await page.waitForFunction(() => /saved/i.test(document.getElementById('save-greetings').getAttribute('aria-label') || document.getElementById('save-greetings').textContent));
        else { assert.doesNotMatch(await button.textContent(), /saved/i); assert.equal(await button.evaluate(el => el.classList.contains('saved-feedback')), false); }
        assert.equal(await button.getAttribute('aria-busy'), null);
        assert.equal(await button.isDisabled(), false);
      }
      assert.equal(writes.filter(url => url.endsWith('/greetings')).length, 2);
      saveResponse = null; pendingWrite = null;
    });
    await check(`${mode}: ambient animations pause while document is hidden`, async () => {
      await page.locator('[data-page="overview"]').click(); await page.waitForTimeout(700);
      const result = await page.evaluate(async () => {
        const ambient = document.getAnimations().filter(animation => animation.effect?.getTiming().iterations === Infinity);
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        await new Promise(resolve => setTimeout(resolve, 100));
        const stillRunning = ambient.filter(animation => animation.playState === 'running').length;
        delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
        return { count: ambient.length, stillRunning };
      });
      assert.equal(result.stillRunning, 0);
      if (mode === 'normal') assert.ok(result.count > 0, 'Ambient motion should exist on the overview');
    });
    await check(`${mode}: no browser runtime errors`, async () => assert.deepEqual(errors, []));
    await page.close();
  }
  if (failures.length) throw new Error(`${failures.length} checks failed:\n${failures.join('\n')}`);
  console.log(`PASS: ${checks} motion regressions; all writes mocked.`);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
