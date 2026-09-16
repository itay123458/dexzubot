import assert from 'node:assert/strict';
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { listPrefixHelp, openPrefixHelp } from '../src/services/prefixHelpService.js';
import { buildCategoryComponents, buildCategoryEmbed, buildOverviewComponents, handleDashboardComponent } from '../src/commands/Core/modules/commands_dashboard.js';
try {
  const command = (name, extra = {}) => ({ category: 'Core', data: new SlashCommandBuilder().setName(name).setDescription(name), execute() {}, ...extra });
  const client = { commands: new Map([
    ['ping', command('ping')], ['hidden', command('hidden')], ['secret', command('secret', { ownerOnly: true })],
    ['slash', command('slash', { slashOnly: true })],
    ['staff', command('staff', { data: new SlashCommandBuilder().setName('staff').setDescription('staff').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) })],
  ]) };
  const member = { id: '1533088766821007392', permissions: { has: () => false }, roles: { cache: new Map() } };
  const config = { disabledCommands: { hidden: true } };
  assert.deepEqual(listPrefixHelp(client, config, member, 'channel', 'slash').map(x => x.name), ['ping', 'slash'], 'Slash help must hide disabled/staff/owner commands but include slash-only commands');
  assert.deepEqual(listPrefixHelp(client, config, member, 'channel').map(x => x.name), ['ping']);
  assert.equal(listPrefixHelp(client, { disabledCategories: ['Core'] }, member, 'channel').length, 0, 'Legacy disabled category arrays must hide the entire category');
  const category = { key: 'core', displayName: 'Core', icon: '⚙️', categoryDisabled: false, enabledCommands: ['c00'], disabledCount: 29, enabledCount: 1, totalCount: 30, commands: Array.from({ length: 30 }, (_, i) => ({ name: `c${String(i).padStart(2, '0')}`, protected: false })) };
  const rows = buildCategoryComponents('1533088766821007390', category, 1).map(row => row.toJSON());
  assert.ok(rows.some(row => row.components.some(c => c.options?.some(o => o.value === 'c29'))), 'Second page must reach command 30');
  const fields = buildCategoryEmbed(category, { name: 'Server' }).toJSON().fields;
  assert.ok(fields.some(field => /Enabled commands/i.test(field.name) && field.value.includes('c00')));
  assert.ok(fields.some(field => /Disabled commands/i.test(field.name) && field.value.includes('c29')));
  assert.ok(buildOverviewComponents('guild', { categories: [category] }).some(row => row.toJSON().components.some(c => c.custom_id?.startsWith('cmdaccess_prefix:'))), 'Overview must offer prefix settings');
  let stored = config;
  client.db = { get: async (_key, fallback) => structuredClone(stored || fallback), set: async (_key, value) => { stored = value; } };
  const handlers = {}, edits = [];
  const collector = { ended: false, on: (name, fn) => { handlers[name] = fn; } };
  const guild = { id: '1533088766821007390', members: { fetch: async () => member } };
  const interaction = { id: 'help-test', guild, guildId: guild.id, user: { id: member.id }, channel: { id: 'channel' }, deferReply: async () => {}, editReply: async view => edits.push(view), fetchReply: async () => ({ edit: async () => { throw new Error('Ephemeral messages require webhook editReply'); }, createMessageComponentCollector: () => collector }) };
  await openPrefixHelp(interaction, null, client, 'slash');
  const components = view => { const all = []; const walk = items => items.forEach(item => { all.push(item); if (item.components) walk(item.components); }); walk(view.components); return all; };
  const text = view => components(view).map(item => item.content || '').join('\n');
  assert.ok(edits[0].flags & 32768);
  assert.match(text(edits[0]), /\/ping/);
  assert.match(text(edits[0]), /\/slash/);
  assert.doesNotMatch(text(edits[0]), /\/(hidden|staff|secret)/);
  let rejected = false;
  await handlers.collect({ user: { id: 'other' }, reply: async () => { rejected = true; } });
  assert.ok(rejected); assert.equal(edits.length, 1, 'Another user must not change the menu');
  stored = { disabledCategories: { core: true } };
  await handlers.collect({ user: { id: member.id }, customId: 'prefix-help-help-test-category', values: ['Core'], deferUpdate: async () => {}, followUp: async () => {} });
  assert.doesNotMatch(text(edits.at(-1)), /\/(ping|slash)/, 'Existing help menu must refresh after category is disabled');
  const lastText = text(edits.at(-1));
  await handlers.end();
  assert.equal(text(edits.at(-1)), lastText, 'Timeout must retain the V2 panel content');
  assert.ok(components(edits.at(-1)).filter(item => [2, 3].includes(item.type)).every(item => item.disabled));
  let denied = false;
  await handleDashboardComponent({ guild, guildId: guild.id, user: { id: member.id }, customId: `cmdaccess_disable_all:${guild.id}:core`, reply: async () => { denied = true; } }, client);
  assert.ok(denied, 'Dashboard must recheck permissions before mutations');
  console.log('PASS: help filtering and dashboard sections/paging');
} catch (error) { console.error(error); process.exitCode = 1; }
