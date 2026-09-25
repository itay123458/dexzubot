import assert from 'node:assert/strict';
import { InteractionHelper } from '../src/utils/interactionHelper.js';
import { selectSearchTrack } from '../src/services/music/searchSelection.js';
import { playQuery } from '../src/services/music/musicActions.js';
const tracks = ['Nevada (Remix)', 'Nevada', 'Nevada (Cover)'].map((title, i) => ({ info: { title, author: i === 1 ? 'Vicetone' : 'Another artist', length: 180000, uri: `https://example.com/${i}` } }));
const originalEdit = InteractionHelper.safeEditReply;
const replies = []; let selection = '1', ack = 0;
const interaction = { id: 'search-123', user: { id: 'member' }, guild: { id: 'guild' }, channel: { id: 'text' }, member: { voice: { channel: { id: 'voice' } } },
  fetchReply: async () => ({ awaitMessageComponent: async ({ filter }) => {
    assert.equal(filter({ customId: 'music_pick_search-123', user: { id: 'someone-else' } }), false);
    if (selection === 'timeout') throw Object.assign(Error('expired'), { code: 'InteractionCollectorError' });
    return { values: [selection], deferUpdate: async () => { ack++; } };
  } }),
};
try {
  InteractionHelper.safeEditReply = async (_, payload) => { replies.push(payload); };
  const chosen = await selectSearchTrack(interaction, tracks);
  assert.equal(chosen, tracks[1], 'choose the original, not the first remix');
  assert.equal(ack, 1);
  assert.equal(replies[0].components[0].toJSON().components[0].options[1].description, 'Vicetone · 3:00');
  assert.deepEqual(replies.at(-1).components, []);
  selection = 'timeout'; assert.equal(await selectSearchTrack(interaction, tracks), null);
  assert.deepEqual(replies.at(-1).components, []);
  selection = '999'; await assert.rejects(selectSearchTrack(interaction, tracks));
  const queue = []; queue.add = track => queue.push(track);
  const player = { voiceChannel: 'voice', queue, playing: true, setVolume() {} };
  let created = 0, resolved = 0;
  const client = { riffy: { nodeMap: new Map([['node', { connected: true }]]), players: new Map([['guild', player]]), createConnection() { created++; return player; },
    resolve: async () => { resolved++; return { loadType: 'search', tracks }; } } };
  await playQuery(client, interaction, 'nevada', { chooseTrack: async () => tracks[1] });
  assert.equal(queue[0], tracks[1]); assert.equal(resolved, 1, 'do not search again after selection');
  const cancelled = await playQuery(client, interaction, 'nevada', { chooseTrack: async () => null });
  assert.equal(cancelled.cancelled, true); assert.equal(queue.length, 1); assert.equal(created, 0);
  interaction.member.voice.channel = { id: 'different-voice' };
  await assert.rejects(playQuery(client, interaction, 'nevada', { chooseTrack: async () => tracks[0] }));
  assert.equal(queue.length, 1, 'reject control from another voice channel');
  interaction.member.voice.channel = { id: 'voice' };
  client.riffy.resolve = async () => ({ loadType: 'track', tracks: [tracks[0]] });
  await playQuery(client, interaction, 'https://example.com/0', { chooseTrack: () => { throw Error('Direct links should not show search selection'); } });
  assert.equal(queue[1], tracks[0]);
  client.riffy.resolve = async () => ({ loadType: 'playlist', tracks, playlistInfo: { name: 'Example playlist' } });
  await playQuery(client, interaction, 'https://example.com/playlist');
  assert.equal(queue.length, 3, 'playlist adds remaining track while preserving duplicate protection');
  client.riffy.resolve = async () => ({ loadType: 'empty', tracks: [] });
  await assert.rejects(playQuery(client, interaction, 'missing-song'));
  assert.equal(queue.length, 3);
  console.log('Music search passed: explicit recording selection, caller ownership, timeout, invalid selection, exact track queueing and voice guard.');
} finally { InteractionHelper.safeEditReply = originalEdit; }
