import assert from 'node:assert/strict';
import { botConfig } from '../src/config/bot.js';
import { canUseBetaCommand, canRegisterBetaCommand, runWithBetaAccess, canUseBetaFeatures } from '../src/config/beta.js';
import { eatFood } from '../src/services/foodCollectionService.js';
import { getFaithSettings, saveFaithSettings, deliverDailyBible } from '../src/services/faithService.js';
import { registerCommands } from '../src/handlers/loaders/commandLoader.js';
import { executePrefixCommand } from '../src/utils/messageAdapter.js';
import { listPrefixHelp } from '../src/services/prefixHelpService.js';
import { SlashCommandBuilder, Collection } from 'discord.js';
import interactionCreate from '../src/events/interactionCreate.js';
import { assertFoodGuild } from '../src/services/foodCollectionService.js';
const owners = botConfig.commands.owners;
const owner = '1127099544560205914', member = '123456789012345679';
const main = '1533088766821007390', beta = '1486680755869323388';
process.env.GUILD_ID = main; process.env.BETA_GUILD_ID = beta;
botConfig.commands.owners = [owner];
try {
  const command = { betaOnly: true };
  assert.equal(canRegisterBetaCommand(command, main), true);
  assert.equal(canRegisterBetaCommand(command, null), false);
  assert.equal(canUseBetaCommand(command, main, owner), true);
  assert.equal(canUseBetaCommand(command, main, member), false);
  assert.equal(canUseBetaCommand(command, '123456789012345678', owner), false);
  assert.equal(canUseBetaCommand(command, beta, member), true);
  assert.equal(canUseBetaCommand({ betaSlash: true }, main, member, true), false);
  assert.equal(canUseBetaCommand({ betaSlash: true }, main, member), true, 'existing stable prefix behavior is preserved');
  const data = new Map();
  const client = { db: { get: async key => structuredClone(data.get(key)), set: async (key, value) => { data.set(key, structuredClone(value)); return true; } } };
  await Promise.all([
    runWithBetaAccess(owner, main, async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(canUseBetaFeatures(main), true);
      assert.equal(canUseBetaFeatures(beta), true);
      assert.equal((await eatFood(client, main, owner, 'owner-meal')).kind, 'meal');
    }),
    runWithBetaAccess(member, main, async () => {
      assert.equal(canUseBetaFeatures(main), true);
      assert.equal((await eatFood(client, main, member, 'member-meal')).kind, 'meal');
    }),
  ]);
  assert.equal(canUseBetaCommand(command, main, member), false, 'unreleased command owner scope must not leak');
  await runWithBetaAccess(owner, '123456789012345678', async () => assert.equal(canUseBetaCommand(command, main), false));
  const probe = { betaOnly: true, category: 'Core', data: new SlashCommandBuilder().setName('beta-test').setDescription('Owner access test'),
    execute: async () => { assertFoodGuild(main); runs++; }, autocomplete: async () => { runs++; } };
  let runs = 0, registered;
  const dispatchClient = { ...client, commands: new Collection([['beta-test', probe]]), rest: { put: async (_, payload) => { registered = payload.body; } } };
  await registerCommands(dispatchClient, { clientId: '123456789012345678', guildId: main });
  assert.ok(registered.some(c => c.name === 'beta-test'));
  const actor = id => ({ id, permissions: { has: () => true }, roles: { cache: new Map() } });
  assert.ok(listPrefixHelp(dispatchClient, {}, actor(owner), 'channel', 'slash', main).some(c => c.name === 'beta-test'));
  assert.equal(listPrefixHelp(dispatchClient, {}, actor(member), 'channel', 'slash', main).length, 0);
  const base = { id: '123456789012345678', commandName: 'beta-test', guildId: main, options: { data: [] },
    isChatInputCommand: () => true, isAutocomplete: () => false,
    reply: async () => ({}), editReply: async () => ({}), followUp: async () => ({}) };
  await interactionCreate.execute({ ...base, user: { id: owner } }, dispatchClient);
  assert.equal(runs, 1, 'real owner slash dispatch enters the service scope');
  await interactionCreate.execute({ ...base, user: { id: member } }, dispatchClient);
  assert.equal(runs, 1, 'administrator cannot bypass owner gate');
  const autocomplete = { ...base, isChatInputCommand: () => false, isAutocomplete: () => true, respond: async choices => assert.deepEqual(choices, []) };
  await interactionCreate.execute({ ...autocomplete, user: { id: member } }, dispatchClient);
  await interactionCreate.execute({ ...autocomplete, user: { id: owner } }, dispatchClient);
  assert.equal(runs, 2);
  for (const id of [member, owner]) await executePrefixCommand(probe, { id: 'message', author: { id }, member: actor(id), guild: { id: main }, channel: { send: async () => ({}) }, reply: async () => ({}) }, [], dispatchClient, '!', {});
  assert.equal(runs, 3, 'prefix owner only');
  let sends = 0;
  const channel = { id: '123456789012345678', guildId: main, type: 0, name: 'daily', permissionsFor: () => ({ has: () => true }),
    send: async () => { sends++; return { id: 'sent', createdTimestamp: Date.now() }; } };
  const guild = { id: main, members: { me: {} }, channels: { fetch: async () => channel } };
  client.user = { id: 'bot', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' };
  await runWithBetaAccess(owner, main, async () => {
    const config = await getFaithSettings(client, main);
    await saveFaithSettings(client, guild, { ...config, enabled: true, channelId: channel.id, time: '00:00' });
  });
  await deliverDailyBible(client, guild, new Date('2026-09-25T12:00:00Z'));
  assert.equal(sends, 1, 'explicit owner schedule survives without interaction context');
  botConfig.commands.owners = [];
  await deliverDailyBible(client, guild, new Date('2026-09-26T12:00:00Z'));
  assert.equal(sends, 2, 'released Main schedule persists independently of bot-owner membership');
  console.log('Beta owner Main checks passed: registration, owner-only runtime, other guild denial, independent async requests and real food service.');
} finally { botConfig.commands.owners = owners; }
