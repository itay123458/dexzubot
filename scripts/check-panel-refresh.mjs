import assert from 'node:assert/strict';
import { refreshConfiguredPanelDesigns, panelDesignKey, GIVEAWAY_DESIGN_REVISION } from '../src/services/panelDesignService.js';
import { getGuildConfigKey, getReactionRoleKey } from '../src/utils/database/keys.js';
import { giveawayKey } from '../src/utils/giveaways.js';

const guildId = '100000000000000001';
const channelId = '100000000000000002';
const botId = '100000000000000003';
const ticketId = '100000000000000004';
const verificationId = '100000000000000005';
const roleMessageId = '100000000000000006';
const giveawayId = '100000000000000007';
const roleId = '100000000000000008';
const edits = new Map();
let failVerification = true;
const message = (id, customId, type = 2, author = botId) => ({
    id, author: { id: author }, url: `https://discord.com/channels/${guildId}/${channelId}/${id}`,
    components: customId ? [{ type: 1, components: [{ type, custom_id: customId }] }] : [],
    embeds: [{ title: 'Legacy custom title', description: 'Legacy custom description' }],
    async edit(payload) {
        if (id === verificationId && failVerification) throw new Error('Simulated missing edit permission');
        edits.set(id, payload);
    },
});
const messages = new Map([
    [ticketId, message(ticketId, 'create_ticket', 2, 'another-bot')],
    [verificationId, message(verificationId, 'verify_user')],
    [roleMessageId, message(roleMessageId, 'reaction_roles', 3)],
    [giveawayId, message(giveawayId)],
]);
const channel = { messages: { fetch: async id => messages.get(id) } };
const guild = { id: guildId, name: 'Refresh check', channels: { fetch: async () => channel }, roles: { cache: new Map([[roleId, { id: roleId, name: 'Member' }]]) } };
const giveaway = { messageId: giveawayId, channelId, prize: 'Reward', hostId: botId, winnerCount: 1, participants: [botId], endsAt: Date.now() - 1000, ended: true, winnerIds: [botId], rerolledAt: '2026-09-16T00:00:00Z' };
const data = new Map([
    [getGuildConfigKey(guildId), { ticketPanelChannelId: channelId, ticketPanelMessageId: ticketId, verification: { channelId, messageId: verificationId, enabled: true } }],
    [getReactionRoleKey(guildId, roleMessageId), { guildId, channelId, messageId: roleMessageId, roles: [roleId] }],
    [giveawayKey(guildId), { [giveawayId]: giveaway }],
]);
let giveawayReads = 0;
const client = { user: { id: botId }, guilds: { cache: new Map([[guildId, guild]]) }, db: {
    async get(key) {
        // Discovery sees an older snapshot; render must re-read inside the lock.
        if (key === giveawayKey(guildId) && ++giveawayReads === 1) return { [giveawayId]: { ...giveaway, ended: false, winnerIds: [] } };
        return structuredClone(data.get(key));
    },
    async set(key, value) { data.set(key, structuredClone(value)); return true; },
    async list(prefix) { return [...data.keys()].filter(key => key.startsWith(prefix)); },
} };
const first = await refreshConfiguredPanelDesigns(client);
assert.equal(first.refreshed, 2);
assert.equal(first.errors, 1);
assert.equal(first.skipped, 1);
assert.ok(!edits.has(ticketId));
assert.ok(!data.has(panelDesignKey(guildId, verificationId)));
assert.equal(data.get(panelDesignKey(guildId, giveawayId)), GIVEAWAY_DESIGN_REVISION);
assert.equal(data.get(getReactionRoleKey(guildId, roleMessageId)).title, 'Legacy custom title');
assert.equal(data.get(getReactionRoleKey(guildId, roleMessageId)).description, 'Legacy custom description');
const renderedGiveaway = JSON.stringify(edits.get(giveawayId));
assert.ok(renderedGiveaway.includes(`<@${botId}>`));
assert.ok(renderedGiveaway.includes('Rerolled'));
assert.ok(renderedGiveaway.includes('giveaway_reroll'));
assert.ok(!renderedGiveaway.includes('giveaway_join'));
assert.deepEqual(data.get(giveawayKey(guildId)), { [giveawayId]: giveaway });
failVerification = false;
const second = await refreshConfiguredPanelDesigns(client);
assert.equal(second.refreshed, 1);
assert.equal(second.errors, 0);
assert.equal(second.skipped, 3);
const third = await refreshConfiguredPanelDesigns(client);
assert.equal(third.refreshed, 0);
assert.equal(third.skipped, 4);
console.log('Panel refresh checks passed: exact existing messages, author guard, legacy text, retry markers, current winners, idempotence.');
