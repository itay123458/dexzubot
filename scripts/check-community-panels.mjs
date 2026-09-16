import assert from 'node:assert/strict';
import { buildReactionRolePanelMessage, buildVerificationPanelMessage, preserveReactionRolePanelText } from '../src/utils/communityPanels.js';

const roles = Array.from({ length: 25 }, (_, i) => ({ id: String(100000000000000000n + BigInt(i)), name: `Role ${i} ${'x'.repeat(100)}` }));
const guild = { name: 'Community', roles: { cache: new Map(roles.map(role => [role.id, role])) } };
function flatten(components) {
    return components.flatMap(component => {
        const data = component.toJSON?.() || component;
        return [data, ...flatten(data.components || [])];
    });
}
function checkPayload(payload, customId) {
    assert.ok(Number(payload.flags) & 32768);
    assert.deepEqual(payload.embeds, []);
    assert.equal(payload.content, null);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    const flat = flatten(payload.components);
    assert.ok(flat.some(component => component.type === 17));
    return flat.find(component => component.custom_id === customId);
}
const verification = checkPayload(buildVerificationPanelMessage({ message: 'Custom access message', buttonText: 'Enter community', enabled: false }, guild), 'verify_user');
assert.equal(verification.label, 'Enter community');
assert.equal(verification.disabled, true);

const saved = { roles: roles.map(role => role.id) };
preserveReactionRolePanelText(saved, { embeds: [{ title: 'Custom 💎 title', description: 'Custom instructions\nSecond line' }] });
const select = checkPayload(buildReactionRolePanelMessage(saved, guild), 'reaction_roles');
assert.equal(select.options.length, 25);
assert.equal(select.max_values, 25);
assert.equal(select.min_values, 0);
assert.ok(select.options.every(option => option.label.length <= 100 && option.description.length <= 100));
preserveReactionRolePanelText(saved, { embeds: [] });
assert.equal(saved.title, 'Custom 💎 title');
assert.equal(saved.description, 'Custom instructions\nSecond line');
saved.roles = saved.roles.slice(0, 1);
assert.equal(checkPayload(buildReactionRolePanelMessage(saved, guild), 'reaction_roles').options.length, 1);
assert.equal(checkPayload(buildReactionRolePanelMessage({ ...saved, roles: ['missing'] }, guild), 'reaction_roles'), undefined);
checkPayload(buildVerificationPanelMessage({ message: 'x'.repeat(2000), buttonText: 'x'.repeat(80) }, guild), 'verify_user');
checkPayload(buildReactionRolePanelMessage({ title: 'x'.repeat(256), description: 'x'.repeat(2048), roles: roles.map(role => role.id) }, guild), 'reaction_roles');
assert.throws(() => buildReactionRolePanelMessage({ ...saved, description: 'x'.repeat(4096) }, guild), /4000-character limit/);
console.log('Community panel checks passed: V2 controls, custom text preservation, role limits, missing roles, disabled verification.');
