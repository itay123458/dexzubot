// Preview by default. Applying requires a private snapshot path; never targets Main.
import { writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { Client, Events, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import { initializeDatabase, db } from '../src/utils/database/wrapper.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { defaultFaithSettings, getFaithSettings, saveFaithSettings } from '../src/services/faithService.js';
import { publishFaithGuide } from '../src/services/faithGuideService.js';

const beta = '1486680755869323388';
if (process.env.BETA_GUILD_ID !== beta || process.env.GUILD_ID === beta) throw Error('Expected the approved DexzuBot Beta guild.');
const apply = process.argv.includes('--apply');
const snapshot = process.argv[process.argv.indexOf('--snapshot') + 1];
if (apply && (!process.argv.includes('--snapshot') || !snapshot || snapshot.startsWith('--'))) throw Error('Applying requires --snapshot PATH.');
const client = new Client({ intents: [GatewayIntentBits.Guilds] }); client.db = db;
const specs = [
  ['my-faith', ChannelType.GuildText, 'Share your beliefs or faith journey if you want to. No one has to disclose their religion.', 'Optional introduction: What would you like to share about your faith or beliefs? What do you hope to learn here? Share only what you are comfortable making public.'],
  ['religious-talk', ChannelType.GuildText, 'Respectful questions and discussion about different beliefs.', 'Ask questions in good faith. Discuss ideas without attacking people.'],
  ['talk-for-religion', ChannelType.GuildVoice, '', ''],
  ['bible-talk', ChannelType.GuildText, 'Bible discussion and conversation about the daily verse.', 'Discuss today’s verse here. Include the passage and translation when quoting scripture.'],
  ['quran-talk', ChannelType.GuildText, 'Quran discussion and respectful questions.', 'Discuss passages and questions here. Include the surah, verse and translation when quoting.'],
  ['daily-bible', ChannelType.GuildText, 'Daily Bible verse from DexzuBot. Read and react; continue discussion in Bible-Talk.', 'DexzuBot posts one English World English Bible verse daily. Use /bible today or continue the discussion in Bible-Talk.'],
];
const normalized = name => name.toLowerCase().replace(/[^a-z]/g, '');
try {
  await initializeDatabase(); if (!db.isAvailable()) throw Error('Persistent storage unavailable.');
  const ready = once(client, Events.ClientReady); await client.login(process.env.DISCORD_TOKEN); await ready;
  const guild = await client.guilds.fetch(beta); await guild.channels.fetch(); await guild.members.fetchMe();
  const categories = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory && normalized(channel.name) === 'faith');
  if (categories.size > 1) throw Error('Multiple Faith categories found; choose a target explicitly.');
  let category = categories.first();
  const existing = specs.map(([name, type]) => {
    const matches = guild.channels.cache.filter(channel => channel.parentId === category?.id && channel.type === type && normalized(channel.name) === normalized(name));
    if (matches.size > 1) throw Error(`Multiple matching ${name} channels.`);
    return matches.first();
  });
  console.log(JSON.stringify({ guildId: beta, mode: apply ? 'apply' : 'preview', category: category?.id || 'create Faith',
    channels: specs.map(([name], index) => ({ name, action: existing[index] ? 'preserve channel; publish guidance' : 'create' })) }));
  if (!apply) process.exitCode = 0;
  else {
    await writeFile(snapshot, JSON.stringify({ capturedAt: new Date().toISOString(), guildId: beta,
      settings: await getFaithSettings(client, beta), channels: [...guild.channels.cache.values()].map(channel => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId, topic: channel.topic,
        overwrites: [...channel.permissionOverwrites.cache.values()].map(item => ({ id: item.id, type: item.type, allow: item.allow.bitfield.toString(), deny: item.deny.bitfield.toString() })) })),
    }, null, 2), { flag: 'wx', mode: 0o600 });
    if (!guild.members.me.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.PinMessages])) throw Error('DexzuBot needs Manage Channels, Manage Roles, Manage Messages and Pin Messages to set up Faith.');
    category ||= await guild.channels.create({ name: '✝ Faith', type: ChannelType.GuildCategory, reason: 'Approved Faith Beta setup' });
    const channels = [];
    for (const [index, [name, type, topic, intro]] of specs.entries()) {
      const channel = existing[index] || await guild.channels.create({ name, type, parent: category.id, ...(topic ? { topic } : {}), reason: 'Approved Faith Beta setup' });
      channels.push(channel);
      if (name === 'daily-bible') {
        // Inherited role/member allows otherwise override an @everyone deny.
        for (const overwrite of channel.permissionOverwrites.cache.values()) {
          if (overwrite.id === client.user.id || overwrite.id === guild.id) continue;
          await channel.permissionOverwrites.edit(overwrite.id, { SendMessages: false, CreatePublicThreads: false, CreatePrivateThreads: false, SendMessagesInThreads: false });
        }
        await channel.permissionOverwrites.edit(guild.id, { SendMessages: false, CreatePublicThreads: false, CreatePrivateThreads: false, SendMessagesInThreads: false, AddReactions: true });
        await channel.permissionOverwrites.edit(client.user.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true, ReadMessageHistory: true, ManageMessages: true, PinMessages: true });
      }
      if (!intro) continue;
      await publishFaithGuide(client, channel, name, intro);
    }
    const current = await getFaithSettings(client, beta);
    await saveFaithSettings(client, guild, { ...defaultFaithSettings(), ...current, enabled: true, channelId: channels[5].id, discussionChannelId: channels[3].id });
    console.log(JSON.stringify({ configured: true, categoryId: category.id, dailyChannelId: channels[5].id, discussionChannelId: channels[3].id }));
  }
} finally { client.destroy(); await pgDb.disconnect(); }
