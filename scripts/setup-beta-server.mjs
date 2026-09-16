// Explicit, repeatable setup for the user-approved beta guild. Never deletes data.
import { REST, Routes, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const guildId = '1486680755869323388';
const apply = process.argv.includes('--apply');
if (process.env.GUILD_ID === guildId) throw new Error('Refusing to remodel the production guild');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || process.env.TOKEN);
const reason = 'User-requested DexzuBot Beta server setup';
const [me, guild, channels, roles] = await Promise.all([
  rest.get(Routes.user()), rest.get(Routes.guild(guildId)),
  rest.get(Routes.guildChannels(guildId)), rest.get(Routes.guildRoles(guildId)),
]);
const member = await rest.get(Routes.guildMember(guildId, me.id));
if (process.argv.includes('--snapshot')) {
  console.log(JSON.stringify({ capturedAt: new Date().toISOString(), guild, channels, roles, botMember: member }, null, 2));
  process.exit(0);
}
const permissions = new PermissionsBitField(roles.filter(role => role.id === guildId || member.roles.includes(role.id))
  .reduce((bits, role) => bits | BigInt(role.permissions), 0n));
if (!permissions.has([PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
  throw new Error('DexzuBot needs Manage Server, Manage Channels and Manage Roles for beta setup');
}
const groups = [
  { name: 'DEXZUBOT BETA', info: true, children: [
    ['start-here', 'Welcome, beta scope, and testing rules.'],
    ['release-notes', 'Changes available for testing and release status.'],
    ['testing-guide', 'How to test updates and write useful bug reports.'],
  ] },
  { name: 'TESTING LAB', children: [
    ['beta-chat', 'Beta discussion. Earlier test messages are preserved.', '1543157790996955196'],
    ['bot-commands', 'Try DexzuBot commands here. Start with /beta and /help.'],
    ['count', 'Counting feature tests.', '1543279749609296022'],
    ['economy-test', 'Economy command tests. Use test balances and report unexpected results.'],
    ['ticket-test', 'Ticket setup and interaction tests.', '1543280865038303363'],
    ['logging-test', 'Logging feature tests.', '1543320978082369628'],
    ['welcome-test', 'Welcome and goodbye message previews.'],
    ['giveaway-test', 'Giveaway entry, ending, and reroll tests.'],
  ] },
  { name: 'FEEDBACK', children: [
    ['bug-reports', 'One issue per report: version, steps, expected result, actual result, and screenshot.'],
    ['feature-requests', 'Suggest improvements and explain the problem they solve.'],
    ['test-results', 'Record what you tested, the version, and PASS or FAIL.'],
  ] },
  { name: 'VOICE LAB', children: [['beta-lounge', null, '1543184181314719806', 2]] },
];
console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', guildId, currentName: guild.name,
  name: 'DexzuBot Beta', groups: groups.map(group => ({ name: group.name, channels: group.children.map(item => item[0]) })),
  preserve: 'All existing messages, roles, private ticket permissions and member counters', deletions: 0 }));
if (!apply) process.exit(0);

const backupDirectory = path.resolve(process.env.BETA_SETUP_BACKUP_DIR || 'backups');
await mkdir(backupDirectory, { recursive: true });
const backup = path.join(backupDirectory, `beta-server-${guildId}-${Date.now()}.json`);
await writeFile(backup, JSON.stringify({ capturedAt: new Date().toISOString(), guild, channels, roles, botMember: member }, null, 2), { flag: 'wx', mode: 0o600 });

const readOnly = [{ id: guildId, type: 0, allow: (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory).toString(),
  deny: (PermissionFlagsBits.SendMessages | PermissionFlagsBits.CreatePublicThreads | PermissionFlagsBits.CreatePrivateThreads | PermissionFlagsBits.SendMessagesInThreads).toString() }];
const betaAccess = [{ id: guildId, type: 0,
  allow: (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.SendMessages
    | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.EmbedLinks | PermissionFlagsBits.UseApplicationCommands
    | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak).toString(),
  deny: PermissionFlagsBits.MentionEveryone.toString() }];
const destinations = new Map();
for (const [position, group] of groups.entries()) {
  let category = channels.find(channel => channel.type === 4 && channel.name === group.name);
  if (!category) {
    category = await rest.post(Routes.guildChannels(guildId), { reason, body: { name: group.name, type: 4, position,
      permission_overwrites: group.info ? readOnly : betaAccess } });
    channels.push(category);
  }
  for (const [index, [name, topic, existingId, type = 0]] of group.children.entries()) {
    let channel = channels.find(item => (existingId && item.id === existingId) || (item.name === name && item.parent_id === category.id));
    const body = { name, type, parent_id: category.id, position: index, ...(topic ? { topic } : {}) };
    if (channel) {
      // Moving an existing channel never syncs or broadens its overwrites.
      await rest.patch(Routes.channel(channel.id), { reason, body: { ...body, permission_overwrites: channel.permission_overwrites || [] } });
    } else {
      channel = await rest.post(Routes.guildChannels(guildId), { reason, body: { ...body,
        permission_overwrites: group.info ? readOnly : betaAccess, ...(type === 0 ? { rate_limit_per_user: 2 } : {}) } });
      channels.push(channel);
    }
    destinations.set(name, channel.id);
  }
}
for (const [id, name, position] of [['1543203034002231356', 'SERVER STATUS', 4], ['1543281329469136947', 'PRIVATE TICKETS', 5]]) {
  if (channels.some(channel => channel.id === id)) await rest.patch(Routes.channel(id), { reason, body: { name, position } });
}
if (!roles.some(role => role.name === 'Beta Tester')) await rest.post(Routes.guildRoles(guildId), {
  reason, body: { name: 'Beta Tester', color: 0x65b4ff, permissions: '0', mentionable: false },
});
const guildUpdate = { name: 'DexzuBot Beta' };
if (me.avatar) {
  const response = await fetch(`https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=256`);
  if (!response.ok) throw new Error('Could not load DexzuBot branding');
  guildUpdate.icon = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
}
await rest.patch(Routes.guild(guildId), { reason, body: guildUpdate });
await rest.patch(Routes.guildMember(guildId, '@me'), { reason, body: { nick: 'DexzuBot Beta' } });
const link = name => `<#${destinations.get(name)}>`;
const guides = [
  ['start-here', 'Welcome to DexzuBot Beta', `This is the testing home for DexzuBot updates.\n\n**Start here**\n1. Read ${link('testing-guide')}.\n2. Check ${link('release-notes')} for what is ready to test.\n3. Try commands in ${link('bot-commands')}.\n4. Share findings in ${link('bug-reports')} and ${link('test-results')}.\n\n**Beta scope**\nThis server uses the same DexzuBot application. Commands marked beta-only are restricted to this server. The bot process is shared with production, so shared backend changes are not isolated.\n\nKeep experiments in the test channels, use test data, and never post tokens or private credentials.`],
  ['testing-guide', 'How to test an update', `**Before testing**\nRead the release notes and record the version. Start with /beta to check this server's beta status.\n\n**Test checklist**\n• Commands and buttons respond correctly.\n• Permission checks work for both staff and regular members.\n• Invalid inputs produce clear errors.\n• Saved settings survive a restart.\n• Dashboard controls work on desktop and mobile.\n\n**Bug report template**\nVersion:\nCommand or page:\nSteps to reproduce:\nExpected result:\nActual result:\nScreenshot or error message:\n\nPost one issue per message in ${link('bug-reports')}. Mark completed checks PASS or FAIL in ${link('test-results')}.`],
  ['release-notes', 'Beta testing workspace is ready', `**Setup release**\n• Dedicated testing channels and feedback areas.\n• Guild-ID-based beta command registration.\n• /beta reports the server's beta status.\n\nNew features must be explicitly marked beta-only or use the beta-server check before release. Existing features remain available for regression testing.\n\nFuture beta releases will list their changes and checks here. This channel does not automatically publish Git commits.`],
  ['bug-reports', 'Report a DexzuBot bug', 'Include the version, command or page, steps to reproduce, expected result, actual result, and a screenshot if useful. One issue per message makes reports easier to track. Please remove private information from screenshots.'],
];
const urls = [];
for (const [name, title, description] of guides) {
  const channelId = destinations.get(name);
  const existing = await rest.get(Routes.channelMessages(channelId), { query: new URLSearchParams({ limit: '50' }) });
  const message = existing.find(item => item.author.id === me.id && item.embeds?.some(embed => embed.footer?.text === `DexzuBot Beta • ${name}`));
  const payload = { allowed_mentions: { parse: [] }, embeds: [{ title, description, color: 0x65b4ff, footer: { text: `DexzuBot Beta • ${name}` } }] };
  const saved = message
    ? await rest.patch(Routes.channelMessage(channelId, message.id), { body: payload })
    : await rest.post(Routes.channelMessages(channelId), { body: payload });
  urls.push(`https://discord.com/channels/${guildId}/${channelId}/${saved.id}`);
}
console.log(JSON.stringify({ name: (await rest.get(Routes.guild(guildId))).name, backup, channels: Object.fromEntries(destinations), guides: urls }));
// Apply only the beta guild's command destination through the normal config layer.
const { initializeDatabase, db } = await import('../src/utils/database/wrapper.js');
const { getGuildConfig, setGuildConfig } = await import('../src/services/config/guildConfig.js');
const { pgDb } = await import('../src/utils/postgresDatabase.js');
try {
  await initializeDatabase();
  if (!db.isAvailable()) throw new Error('PostgreSQL is unavailable; beta configuration was not changed');
  const config = await getGuildConfig({ db }, guildId);
  await writeFile(path.join(backupDirectory, `beta-config-${guildId}-${Date.now()}.json`), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
  config.economy = { ...config.economy, channelId: destinations.get('economy-test') };
  await setGuildConfig({ db }, guildId, config);
  console.log(JSON.stringify({ betaEconomyChannelId: config.economy.channelId, configurationSaved: true }));
} finally { await pgDb.disconnect(); }
