import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import { createSupportPanelMessage, TICKET_PANEL_MESSAGE_MAX_LENGTH } from '../src/utils/brandPanels.js';

const normal = createSupportPanelMessage({ ticketPanelMessage: 'x'.repeat(TICKET_PANEL_MESSAGE_MAX_LENGTH) });
assert.ok(normal.flags & MessageFlags.IsComponentsV2);
const config = { ticketPanelMessage: 'x'.repeat(4096), ticketButtonLabel: 'Contact staff' };
const legacy = createSupportPanelMessage(config);
assert.equal(legacy.flags, undefined);
assert.equal(legacy.embeds[0].toJSON().description, config.ticketPanelMessage);
assert.equal(legacy.components[0].toJSON().components[0].custom_id, 'create_ticket');
const existing = { flags: { has: flag => flag === MessageFlags.IsComponentsV2 } };
const restored = createSupportPanelMessage(config, null, existing);
assert.ok(restored.flags & MessageFlags.IsComponentsV2);
assert.deepEqual(restored.embeds, []);
assert.match(JSON.stringify(restored.components), /shortened/);
assert.equal(config.ticketPanelMessage.length, 4096, 'Rendering must not truncate stored configuration');
console.log('PASS: ticket input budget, legacy text preservation, and restored oversized text on existing V2 panels.');
