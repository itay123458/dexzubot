import assert from 'node:assert/strict';
import { publishFaithGuide } from '../src/services/faithGuideService.js';
process.env.BETA_GUILD_ID = '1486680755869323388';
const store = new Map(), messages = new Map();
let loseAck = true, sends = 0, pins = 0;
const client = { user: { id: 'bot', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }, db: {
  get: async key => structuredClone(store.get(key)), set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
} };
const channel = { id: '1549857857414111272', guildId: process.env.BETA_GUILD_ID,
  messages: { fetch: async input => typeof input === 'string' ? messages.get(input) : messages },
  send: async payload => {
    sends++;
    const msg = { id: '123', author: { id: 'bot' }, embeds: payload.embeds.map(embed => embed.toJSON()), createdTimestamp: Date.now(), pinned: false,
      edit: async () => msg, pin: async () => { msg.pinned = true; pins++; } };
    messages.set(msg.id, msg);
    if (loseAck) throw Error('lost acknowledgement');
    return msg;
  },
};
await assert.rejects(publishFaithGuide(client, channel, 'my-faith', 'Optional introduction.'));
loseAck = false;
await publishFaithGuide(client, channel, 'my-faith', 'Optional introduction.');
await publishFaithGuide(client, channel, 'my-faith', 'Optional introduction.');
assert.equal(sends, 1, 'interrupted setup must reconcile an unpinned guide');
assert.equal(pins, 1, 'recovered guide must be pinned');
console.log('Faith guide checks passed: lost response, rerun and pin recovery.');
