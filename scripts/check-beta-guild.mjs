import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Collection, SlashCommandBuilder } from 'discord.js';
import { registerCommands } from '../src/handlers/loaders/commandLoader.js';
import { getBetaGuildId, isBetaGuild, canUseBetaCommand } from '../src/config/beta.js';
import { executePrefixCommand } from '../src/utils/messageAdapter.js';
import { listPrefixHelp } from '../src/services/prefixHelpService.js';
import interactionCreate from '../src/events/interactionCreate.js';
import betaStatus from '../src/commands/Core/beta.js';
import { getCommandAccessSnapshot } from '../src/services/commandAccessService.js';

const betaGuildId = '1486680755869323388';
const productionGuildId = '1533088766821007390';
process.env.BETA_GUILD_ID = betaGuildId;
const stable = { category: 'Core', data: new SlashCommandBuilder().setName('ping').setDescription('Check connection'), execute() {} };
const beta = { category: 'Core', betaOnly: true, data: new SlashCommandBuilder().setName('beta').setDescription('Check beta scope'), execute() {} };

test('registration isolates beta commands from global and production payloads', async () => {
  const writes = [];
  const client = { commands: new Collection([['ping', stable], ['beta', beta]]),
    rest: { put: async (route, payload) => { writes.push({ route, names: payload.body.map(command => command.name) }); } } };
  await registerCommands(client, { clientId: '123456789012345678' });
  await registerCommands(client, { clientId: '123456789012345678', guildId: productionGuildId });
  await registerCommands(client, { clientId: '123456789012345678', guildId: betaGuildId });
  assert.deepEqual(writes, [
    { route: '/applications/123456789012345678/commands', names: ['ping'] },
    { route: `/applications/123456789012345678/guilds/${productionGuildId}/commands`, names: ['ping'] },
    { route: `/applications/123456789012345678/guilds/${betaGuildId}/commands`, names: ['ping', 'beta'] },
  ]);
});

test('beta configuration fails closed and never restricts stable commands', () => {
  try {
    for (const value of ['', 'invalid', '123', '1486680755869323388/commands']) {
      process.env.BETA_GUILD_ID = value;
      assert.equal(getBetaGuildId(), null);
      assert.equal(isBetaGuild(betaGuildId), false);
      assert.equal(canUseBetaCommand(beta, betaGuildId), false);
      assert.equal(canUseBetaCommand(stable, productionGuildId), true);
    }
    process.env.BETA_GUILD_ID = ` ${betaGuildId} `;
    assert.equal(getBetaGuildId(), betaGuildId);
    assert.equal(canUseBetaCommand(beta, betaGuildId), true);
    assert.equal(canUseBetaCommand(beta, productionGuildId), false);
    assert.equal(canUseBetaCommand(beta, null), false);
  } finally { process.env.BETA_GUILD_ID = betaGuildId; }
});

test('slash and prefix help list beta commands only in the beta guild', () => {
  const client = { commands: new Collection([['ping', stable], ['beta', beta]]) };
  const member = { id: '123456789012345678', permissions: { has: () => true }, roles: { cache: new Map() } };
  for (const mode of ['slash', 'prefix']) {
    assert.deepEqual(listPrefixHelp(client, {}, member, 'channel', mode, productionGuildId).map(entry => entry.name), ['ping']);
    assert.deepEqual(listPrefixHelp(client, {}, member, 'channel', mode, betaGuildId).map(entry => entry.name), ['beta', 'ping']);
  }
});

test('dashboard snapshots omit beta metadata unless the beta guild is explicit', () => {
  const client = { commands: new Collection([['ping', stable], ['beta', beta]]) };
  assert.equal(getCommandAccessSnapshot(client, {}).totalCommands, 1);
  assert.equal(getCommandAccessSnapshot(client, {}, productionGuildId).totalCommands, 1);
  assert.equal(getCommandAccessSnapshot(client, {}, betaGuildId).totalCommands, 2);
});

test('beta registration still respects its own guild command configuration', async () => {
  let names;
  const client = { commands: new Collection([['ping', stable], ['beta', beta]]),
    rest: { put: async (route, payload) => { names = payload.body.map(command => command.name); } } };
  await registerCommands(client, { clientId: '123456789012345678', guildId: betaGuildId,
    guildConfig: { disabledCommands: { beta: true } } });
  assert.deepEqual(names, ['ping']);
});

test('prefix execution rejects beta outside its guild even for staff', async () => {
  let executions = 0;
  const replies = [];
  const command = { ...beta, execute: async () => { executions++; } };
  for (const guildId of [productionGuildId, betaGuildId]) {
    const message = { id: '123456789012345678', author: { id: '123456789012345679' }, guild: { id: guildId },
      member: { permissions: { has: () => true } },
      channel: { send: async payload => { replies.push(payload); return { id: 'reply' }; } } };
    await executePrefixCommand(command, message, [], {}, '!', {});
  }
  assert.equal(executions, 1);
  assert.equal(replies.length, 1);
  assert.match(replies[0].content, /only in the DexzuBot beta server/);
});

test('slash dispatch and autocomplete reject stale beta commands outside beta', async () => {
  let executions = 0;
  const replies = [];
  const command = { ...beta, execute: async () => { executions++; }, autocomplete: async () => { executions++; } };
  const client = { commands: new Collection([['beta', command]]) };
  const interaction = { id: '123456789012345678', commandName: 'beta', guildId: productionGuildId,
    user: { id: '123456789012345679', tag: 'Tester' }, options: { data: [] },
    isChatInputCommand: () => true, isAutocomplete: () => false,
    reply: async payload => { replies.push(payload); },
    editReply: async payload => { replies.push(payload); }, followUp: async payload => { replies.push(payload); } };
  await interactionCreate.execute(interaction, client);
  assert.equal(executions, 0);
  assert.equal(replies.length, 1);
  assert.match(JSON.stringify(replies[0]), /only in the DexzuBot beta server/);
  let choices;
  await interactionCreate.execute({ ...interaction, _responseCoordinator: undefined,
    isChatInputCommand: () => false, isAutocomplete: () => true,
    respond: async value => { choices = value; } }, client);
  assert.deepEqual(choices, []);
  assert.equal(executions, 0);
});

test('beta status is an explicit guild-only beta command with an honest scope', async () => {
  assert.equal(betaStatus.betaOnly, true);
  assert.equal(betaStatus.data.toJSON().dm_permission, false);
  let reply;
  await betaStatus.execute({ id: '123456789012345678', user: { id: '123456789012345679' },
    reply: async payload => { reply = payload; } });
  assert.equal(reply.flags & 64, 64);
  assert.equal(reply.flags & 32768, 32768);
  assert.match(JSON.stringify(reply), /Role management is ready to test/);
  assert.match(JSON.stringify(reply), /same bot application and running process/);
});
