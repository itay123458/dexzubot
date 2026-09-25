import assert from 'node:assert/strict';
import { parsePrefixCommand, mapArgumentsToOptions } from '../src/utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand } from '../src/utils/messageAdapter.js';
import { getPrefixRestriction } from '../src/config/commands/prefixRestrictions.js';
import { resolveSubcommandAlias } from '../src/config/commands/commandAliases.js';
import { getMusicDeferOptions } from '../src/services/music/prefixSupport.js';
import { listPrefixHelp } from '../src/services/prefixHelpService.js';
const commands = await Promise.all(['play','queue','join','nowplaying','music'].map(async name => (await import(`../src/commands/Music/${name}.js`)).default));
for (const command of commands) assert.equal(supportsPrefixExecution(command), true, `${command.data.name} supports prefix`);
const [play, queue, , , music] = commands;
for (const query of ['nevada vicetone', "Don't Stop Me Now Queen", 'https://example.com/a?x=1&y=2']) {
  const parsed = parsePrefixCommand(`!play ${query}`, '!');
  assert.equal(mapArgumentsToOptions(parsed.args, play.data).getString('query'), query);
}
assert.equal(mapArgumentsToOptions(parsePrefixCommand('!play "nevada vicetone"', '!').args, play.data).getString('query'), 'nevada vicetone');
assert.equal(mapArgumentsToOptions([], play.data).validateRequired().valid, false);
for (const sub of music.data.toJSON().options) {
  assert.equal(getPrefixRestriction(music, [sub.name], resolveSubcommandAlias).blocked, false, `${sub.name} prefix enabled`);
}
for (const [args, getter, name, value] of [
  [['loop','track'],'getString','mode','track'], [['volume','50'],'getInteger','level',50],
  [['seek','60'],'getInteger','seconds',60], [['remove','2'],'getInteger','position',2],
  [['move','2','3'],'getInteger','to',3], [['247','true'],'getBoolean','enabled',true],
  [['247','false'],'getBoolean','enabled',false],
]) assert.equal(mapArgumentsToOptions(args, music.data)[getter](name), value);
assert.equal(mapArgumentsToOptions(['2'], queue.data).getInteger('page'), 2);
assert.deepEqual(getMusicDeferOptions({ _isPrefixCommand: true }), {});
assert.ok(getMusicDeferOptions({}).flags);
const member = { id: '1127099544560205914', permissions: { has: () => true }, roles: { cache: new Map() } };
const help = listPrefixHelp({ commands: new Map(commands.map(c => [c.data.name, c])) }, {}, member, 'channel', 'prefix');
assert.ok(help.some(c => c.name === 'play'));
assert.ok(help.some(c => c.name === 'music loop'));
const replies = []; let searched;
const tracks = []; tracks.add = track => tracks.push(track);
const player = { queue: tracks, playing: true, setVolume() {} };
const client = { riffy: { players: new Map([['1486680755869323388', player]]), nodeMap: new Map([['node', { connected: true }]]),
  resolve: async ({ query }) => { searched = query; return { loadType: 'search', tracks: [{ info: { title: 'Nevada', author: 'Vicetone', uri: 'https://example.com/nevada' } }] }; } } };
const response = { id: 'response', edit: async payload => { replies.push(payload); return response; } };
const message = { id: 'message', author: { id: member.id }, member: { ...member, voice: { channel: { id: 'voice' } } },
  guild: { id: '1486680755869323388' }, client, createdTimestamp: Date.now(),
  channel: { id: 'text', send: async payload => { replies.push(payload); return response; } },
  reply: async payload => { replies.push(payload); return response; } };
await executePrefixCommand(play, message, ['nevada','vicetone'], client, '!', {});
assert.equal(searched, 'nevada vicetone', 'actual prefix execution searches the full query');
assert.equal(tracks.length, 1);
assert.ok(replies.length > 0);
assert.ok(replies.every(payload => !(payload.flags & 64)), 'prefix replies are never ephemeral');
console.log('Prefix music passed: command availability, full song queries, apostrophes, subcommands, numeric/boolean arguments, defer flags and help.');
