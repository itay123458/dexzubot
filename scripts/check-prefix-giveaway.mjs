import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collection, PermissionsBitField } from 'discord.js';
import { createMockInteraction, executePrefixCommand } from '../src/utils/messageAdapter.js';
import command from '../src/commands/Giveaway/gcreate.js';

function fixture() {
  const store = new Map(), sent = [], replies = [];
  const guild = { id: '1486680755869323388', name: 'Beta', members: { me: {} } };
  const channel = { id: '1549857881833345104', name: 'giveaway-test', guild,
    isTextBased: () => true, permissionsFor: () => new PermissionsBitField(PermissionsBitField.All),
    toString: () => '<#1549857881833345104>',
    send: async payload => { sent.push(payload); return { id: '1549859999999999999' }; },
  };
  guild.channels = { cache: new Collection([[channel.id, channel]]), fetch: async () => channel };
  const client = { guilds: { cache: new Collection([[guild.id, guild]]) }, db: {
    get: async (key, fallback) => structuredClone(store.get(key) ?? fallback),
    set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
  } };
  const message = { id: '1549859999999999998', guild, channel, client, author: { id: '1127099544560205914', tag: 'tester' },
    member: { permissions: new PermissionsBitField(PermissionsBitField.All) }, createdTimestamp: Date.now(),
    reply: async payload => { replies.push(payload); return { id: '1549859999999999997', edit: async p => replies.push(p) }; },
  };
  return { message, channel, store, sent, replies };
}

test('prefix interactions expose the guild check used by giveaway commands', () => {
  const { message } = fixture();
  assert.equal(createMockInteraction(message, command.data, []).inGuild(), true);
  assert.equal(createMockInteraction({ ...message, guild: null }, command.data, []).inGuild(), false);
});
test('prefix channel options return the channel synchronously, as slash options do', () => {
  const { message, channel } = fixture();
  const interaction = createMockInteraction(message, command.data, ['10s', '1', 'test', `<#${channel.id}>`]);
  assert.equal(interaction.options.getChannel('channel'), channel);
});
test('unknown supplied channels are rejected rather than using the current channel', () => {
  const { message } = fixture();
  const interaction = createMockInteraction(message, command.data, ['10s', '1', 'test', '<#111111111111111111>']);
  assert.throws(() => interaction.options.getChannel('channel'), /channel/i);
});
test('10-second giveaways report the configured duration limit without sending a giveaway', async () => {
  const { message, sent } = fixture();
  await assert.rejects(command.execute(createMockInteraction(message, command.data, ['10s', '1', 'test'])), error => {
    assert.equal(error.type, 'validation');
    assert.match(error.userMessage, /Minimum duration/);
    return true;
  });
  assert.equal(sent.length, 0);
});
test('prefix dispatcher sends the duration explanation instead of UNKNOWN_ERROR', async () => {
  const { message, sent } = fixture();
  await executePrefixCommand(command, message, ['10s', '1', 'test'], message.client, '!', {});
  assert.equal(sent.length, 1);
  assert.match(JSON.stringify(sent[0]), /Minimum duration/);
  assert.doesNotMatch(JSON.stringify(sent[0]), /UNKNOWN_ERROR/);
});
for (const explicitChannel of [true, false]) {
  test(`gcreate 5m 1 test ${explicitChannel ? '#giveaway-test' : '(current channel)'} sends and saves`, async () => {
    const { message, channel, store, sent } = fixture();
    const args = ['5m', '1', 'test', ...(explicitChannel ? [`<#${channel.id}>`] : [])];
    await command.execute(createMockInteraction(message, command.data, args));
    assert.equal(sent.length, 2, 'Giveaway panel plus command confirmation');
    assert.equal(sent.filter(payload => JSON.stringify(payload).includes('giveaway_join')).length, 1);
    const saved = Object.values(store.get(`guild:${message.guild.id}:giveaways`));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].channelId, channel.id);
    assert.equal(saved[0].prize, 'test');
    assert.equal(saved[0].winnerCount, 1);
    assert.ok(saved[0].endTime > Date.now() && saved[0].endTime <= Date.now() + 300000);
  });
}
