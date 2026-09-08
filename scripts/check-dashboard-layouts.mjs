import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/web/public/layouts.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/web/public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/web/public/layouts.css', import.meta.url), 'utf8');
function setup(saved, blocked = false) {
  const handlers = {};
  const events = {};
  const picker = { value: '', addEventListener: (name, fn) => { handlers[name] = fn; } };
  const hint = { textContent: '' };
  const body = { dataset: {} };
  const choices = ['classic', 'compact', 'topnav', 'studio', 'focus', 'command'].map(layout => ({
    dataset: { layoutChoice: layout }, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this[name] = callback; },
  }));
  const storage = new Map([['dexzu-dashboard-layout', saved]]);
  const context = {
    document: { body, querySelectorAll: () => choices, getElementById: id => id === 'dashboard-layout' ? picker : hint },
    window: { dispatchEvent() {}, addEventListener: (name, fn) => { events[name] = fn; } },
    Event: class { constructor(type) { this.type = type; } },
    localStorage: {
      getItem: key => { if (blocked) throw new Error('Blocked'); return storage.get(key); },
      setItem: (key, value) => { if (blocked) throw new Error('Blocked'); storage.set(key, value); },
    },
  };
  runInNewContext(source, context);
  return { body, picker, hint, storage, handlers, events, choices };
}
for (const layout of ['classic', 'compact', 'topnav', 'studio', 'focus', 'command']) {
  const f = setup(layout);
  assert.equal(f.body.dataset.layout, layout);
  assert.equal(f.picker.value, layout);
  assert.ok(html.includes(`value="${layout}"`));
  assert.equal(f.choices.filter(button => button.attributes['aria-pressed'] === 'true').length, 1);
  const button = f.choices.find(button => button.dataset.layoutChoice === layout);
  button.click();
  assert.equal(f.storage.get('dexzu-dashboard-layout'), layout);
  assert.equal(f.picker.value, layout);
}
assert.equal(setup('invalid').body.dataset.layout, 'classic');
assert.equal(setup(null).body.dataset.layout, 'classic');
const f = setup('classic');
f.picker.value = 'topnav';
f.handlers.change();
assert.equal(f.storage.get('dexzu-dashboard-layout'), 'topnav');
assert.equal(f.body.dataset.layout, 'topnav');
f.events.storage({ key: 'dexzu-dashboard-layout', newValue: 'compact' });
assert.equal(f.body.dataset.layout, 'compact');
f.events.storage({ key: null, newValue: null });
assert.equal(f.body.dataset.layout, 'classic');
const blocked = setup(null, true);
blocked.picker.value = 'compact';
blocked.handlers.change();
assert.equal(blocked.body.dataset.layout, 'compact');
assert.match(blocked.hint.textContent, /visit only/);
assert.match(html, /for="dashboard-layout"/);
assert.match(html, /\/dashboard\/layouts.js/);
assert.match(html, /\/dashboard\/layouts.css/);
assert.match(css, /max-width: 680px/);
console.log('Dashboard layout checks passed: defaults, all layouts, persistence, cross-tab sync, blocked storage, assets and mobile rules.');
