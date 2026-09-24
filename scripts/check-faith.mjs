import assert from 'node:assert/strict';
import { faithSettingsSchema, localDay, verseForDay, deliverDailyBible, saveFaithSettings, getFaithSettings } from '../src/services/faithService.js';

process.env.BETA_GUILD_ID = '1486680755869323388';
const id = process.env.BETA_GUILD_ID;
const config = { enabled: true, channelId: '1549857857414111272', discussionChannelId: null, time: '09:00', timezone: 'Asia/Jerusalem', translation: 'WEB' };
assert.equal(localDay(new Date('2026-09-24T21:30:00Z'), config.timezone).date, '2026-09-25');
assert.equal(localDay(new Date('2026-12-24T07:00:00Z'), config.timezone).time, '09:00');
for (const patch of [{ time: '25:00' }, { timezone: 'Mars/Nowhere' }, { translation: 'made-up' }, { enabled: true, channelId: null }]) {
  assert.equal(faithSettingsSchema.safeParse({ ...config, ...patch }).success, false);
}
assert.deepEqual(verseForDay('2026-09-24'), verseForDay('2026-09-24'));
assert.notEqual(verseForDay('2026-09-24').reference, verseForDay('2026-09-25').reference);
const data = new Map();
const messages = new Map();
let failSend = false, failRead = false, failWrite = false, loseAck = false, sends = 0;
const client = { user: { id: 'bot', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }, db: {
  get: async key => { if (failRead) throw Error('storage offline'); return structuredClone(data.get(key)); },
  set: async (key, value) => { if (failWrite) return false; data.set(key, structuredClone(value)); return true; },
} };
const channel = { id: config.channelId, guildId: id, type: 0, name: 'daily-bible',
  permissionsFor: () => ({ has: () => true }),
  messages: { fetch: async () => messages },
  send: async payload => {
    if (failSend) throw Error('Discord unavailable');
    sends++;
    const message = { id: String(100 + sends), author: { id: 'bot' }, embeds: payload.embeds.map(e => e.toJSON()), createdTimestamp: Date.now() };
    messages.set(message.id, message);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    if (loseAck) throw Error('response lost after Discord accepted message');
    return message;
  },
};
const guild = { id, members: { me: {} }, channels: { fetch: async () => channel } };
await saveFaithSettings(client, guild, config);
const now = new Date('2026-09-24T06:00:00Z');
await deliverDailyBible(client, guild, new Date('2026-09-24T05:59:00Z'));
assert.equal(sends, 0, 'do not post before the schedule');
await Promise.all([deliverDailyBible(client, guild, now), deliverDailyBible(client, guild, now)]);
await deliverDailyBible({ ...client }, guild, now);
assert.equal(sends, 1, 'concurrent checks and restart must not duplicate');
failSend = true;
await assert.rejects(deliverDailyBible(client, guild, new Date('2026-09-25T06:00:00Z')));
failSend = false;
await deliverDailyBible(client, guild, new Date('2026-09-25T06:01:00Z'));
assert.equal(sends, 2, 'failed send can retry');
loseAck = true;
await assert.rejects(deliverDailyBible(client, guild, new Date('2026-09-26T06:00:00Z')));
loseAck = false;
await deliverDailyBible({ ...client }, guild, new Date('2026-09-26T06:01:00Z'));
assert.equal(sends, 3, 'uncertain delivery must reconcile history');
failRead = true;
await assert.rejects(deliverDailyBible(client, guild, new Date('2026-09-27T06:00:00Z')));
failRead = false; failWrite = true;
await assert.rejects(deliverDailyBible(client, guild, new Date('2026-09-27T06:00:00Z')));
failWrite = false;
assert.equal(sends, 3, 'storage failures must fail closed');
await deliverDailyBible(client, guild, new Date('2026-09-30T06:00:00Z'));
assert.equal(sends, 4, 'downtime posts today only');
await assert.rejects(saveFaithSettings(client, { ...guild, id: '1533088766821007390' }, config));
await deliverDailyBible(client, { ...guild, id: '1533088766821007390' }, now);
assert.equal(sends, 4, 'Beta scheduler must never post to Main');
channel.permissionsFor = () => ({ has: () => false });
await assert.rejects(deliverDailyBible(client, guild, new Date('2026-10-01T06:00:00Z')));
assert.equal(sends, 4, 'missing permissions must not send');
await saveFaithSettings(client, guild, { ...config, enabled: false, discussionChannelId: '1549857857414111273' });
assert.equal((await getFaithSettings(client, guild.id)).enabled, false, 'disabled must be persisted even if channels are inaccessible');
console.log('Faith checks passed: schedule, settings, restart, retries, uncertain delivery, storage and Beta isolation.');
