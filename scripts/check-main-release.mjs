import assert from 'node:assert/strict';
import { canUseBetaCommand, canRegisterBetaCommand } from '../src/config/beta.js';
import { eatFood } from '../src/services/foodCollectionService.js';
import { getFaithSettings, deliverDailyBible } from '../src/services/faithService.js';
import { assertRoleManager } from '../src/services/roleManagementService.js';
import { registerCommands } from '../src/handlers/loaders/commandLoader.js';
import { Collection } from 'discord.js';
import { isSlashCommandCategoryEnabled, isSlashCommandEnabled } from '../src/config/commands/slashCommandCategories.js';
const main = '1533088766821007390', beta = '1486680755869323388', other = '123456789012345678', member = '123456789012345679';
process.env.GUILD_ID = main; process.env.BETA_GUILD_ID = beta;
const commands = await Promise.all(['Core/eat','Core/bible','Moderation/role','Welcome/autorole'].map(async file => (await import(`../src/commands/${file}.js`)).default));
for (const command of commands) {
  assert.equal(canUseBetaCommand(command, main, member, true), true, `${command.data.name} released to Main members`);
  assert.equal(canUseBetaCommand(command, beta, member, true), true);
  assert.equal(canUseBetaCommand(command, other, member, true), false);
  assert.equal(canRegisterBetaCommand(command, main), true);
}
assert.equal(canUseBetaCommand({ betaOnly: true }, main, member), false, 'future unreleased Beta commands remain protected');
const data = new Map(); let writes = 0;
const client = { db: { get: async key => structuredClone(data.get(key)), set: async (key,value) => { writes++; data.set(key,structuredClone(value)); return true; } } };
assert.equal((await getFaithSettings(client, main)).enabled, false);
await deliverDailyBible(client, { id: main });
assert.equal(writes, 0, 'reading Main and running the scheduler never enables or writes settings');
assert.equal((await eatFood(client, main, member, 'main-meal')).kind, 'meal');
await assert.rejects(eatFood(client, other, member, 'other-meal'));
const guild = { id: main, ownerId: 'owner', members: { me: { permissions: { has: () => true } } } };
assert.throws(() => assertRoleManager(guild, { id: member, guild, permissions: { has: () => false } }), /Manage Roles/);
let registered;
await registerCommands({ commands: new Collection(commands.map(c => [c.data.name, { ...c, category: c.data.name === 'role' ? 'Moderation' : c.data.name === 'autorole' ? 'Welcome' : 'Core' }])), rest: { put: async (_, payload) => { registered = payload.body; } } },
  { clientId: other, guildId: main, guildConfig: { disabledCommands: { eat: true } } });
assert.ok(!registered.some(c => c.name === 'eat'), 'existing disabled command settings remain effective');
assert.ok(registered.some(c => c.name === 'bible'));
process.env.BETA_GUILD_ID = '';
assert.equal(isSlashCommandCategoryEnabled('Welcome', main), true);
assert.equal(isSlashCommandEnabled({ ...commands[3], category: 'Welcome' }, main), true);
assert.equal(canUseBetaCommand(commands[0], main, member, true), true);
process.env.BETA_GUILD_ID = beta;
console.log('Main release checks passed: released commands, future Beta protection, server isolation, existing permissions/settings and no automatic setup.');
