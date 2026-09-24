import assert from 'node:assert/strict';
import command from '../src/commands/Core/bible.js';
import { InteractionHelper } from '../src/utils/interactionHelper.js';
import { getFaithSettings } from '../src/services/faithService.js';
process.env.BETA_GUILD_ID = '1486680755869323388';
const guildId = process.env.BETA_GUILD_ID, channelId = '1549857857414111272';
const store = new Map();
const client = { user: { displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }, db: {
  get: async key => structuredClone(store.get(key)), set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
} };
let admin = false, sub = 'setup', reply;
const guild = { id: guildId, members: { me: {} }, channels: { fetch: async () => ({ id: channelId, guildId, type: 0, permissionsFor: () => ({ has: () => true }) }) } };
const interaction = { guildId, guild, memberPermissions: { has: () => admin }, options: {
  getSubcommand: () => sub, getChannel: name => name === 'channel' ? { id: channelId } : null, getString: () => null,
} };
const defer = InteractionHelper.safeDefer, edit = InteractionHelper.safeEditReply;
try {
  InteractionHelper.safeDefer = async () => true;
  InteractionHelper.safeEditReply = async (_, payload) => { reply = payload; };
  await command.execute(interaction, {}, client);
  assert.equal(store.size, 0, 'ordinary members cannot configure posting');
  assert.match(reply.content, /Administrator/);
  admin = true; await command.execute(interaction, {}, client);
  assert.equal((await getFaithSettings(client, guildId)).enabled, true);
  admin = false; sub = 'today'; await command.execute(interaction, {}, client);
  assert.ok(reply.embeds[0].toJSON().description, 'members can read the daily verse');
  sub = 'disable'; await command.execute(interaction, {}, client);
  assert.equal((await getFaithSettings(client, guildId)).enabled, true, 'ordinary members cannot disable');
  admin = true; await command.execute(interaction, {}, client);
  assert.equal((await getFaithSettings(client, guildId)).enabled, false);
  await assert.rejects(command.execute({ ...interaction, guildId: '1533088766821007390' }, {}, client));
  command.data.toJSON();
  console.log('Faith commands passed: member read access, administrator setup/disable, and Beta boundary.');
} finally { InteractionHelper.safeDefer = defer; InteractionHelper.safeEditReply = edit; }
