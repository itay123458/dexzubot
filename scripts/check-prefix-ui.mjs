import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(new URL('../src/web/public/app.js', import.meta.url), 'utf8');
const prefix = readFileSync(new URL('../src/web/public/prefix-settings.js', import.meta.url), 'utf8');
const events = {}, inputs = {}, dirtyPages = new Set();
const element = id => inputs[id] ||= { addEventListener: (event, fn) => { events[`${id}:${event}`] = fn; } };
const state = { prefixSettings: { prefix: '!', enabled: true, allowedChannelIds: [], allowedRoleIds: [] }, channels: [], accessRoles: [] };
const context = vm.createContext({ $, state, dirtyPages, checkbox: () => '', escapeHtml: x => x, setInterval: () => {}, document: { querySelector: () => ({ classList: { toggle() {} } }) }, window: { addEventListener: (event, fn) => { events[event] = fn; } } });
function $(id) { return element(id); }
vm.runInContext(app.match(/function setDirty\(page, dirty = true\) \{[\s\S]*?\n\}/)[0], context);
vm.runInContext(prefix, context);
events['prefix-settings-form:input']();
assert.ok(dirtyPages.has('operations'), 'Prefix edits must trigger navigation/unload protection');
element('command-prefix').value = 'draft';
events['dexzu-discard']?.({ detail: 'operations' });
events['dexzu-state']({ detail: state });
assert.equal(element('command-prefix').value, '!', 'Discard must release the local draft and restore saved settings');
console.log('PASS: prefix edits are guarded and discard restores saved settings');
