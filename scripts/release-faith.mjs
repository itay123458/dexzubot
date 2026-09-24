import { Client, GatewayIntentBits, Events } from 'discord.js';
import { once } from 'node:events';
import { initializeDatabase, db } from '../src/utils/database/wrapper.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { readCommunityValue, writeCommunityValue } from '../src/services/communityBetaService.js';
import { loadEmbedMotion } from '../src/services/embedMotionService.js';
import { loadEmbedCrown } from '../src/services/embedCrownService.js';
import { createEmbed } from '../src/utils/embeds.js';
import { faithRelease as release } from '../src/config/releases.js';
const beta = '1486680755869323388', channelId = '1549857857414111272';
if (process.env.BETA_GUILD_ID !== beta || process.env.GUILD_ID === beta) throw Error('Expected the approved DexzuBot Beta guild.');
const client = new Client({ intents: [GatewayIntentBits.Guilds] }); client.db = db;
try {
  await initializeDatabase(); if (!db.isAvailable()) throw Error('Persistent storage unavailable.');
  const ready = once(client, Events.ClientReady); await client.login(process.env.DISCORD_TOKEN); await ready;
  await loadEmbedMotion(client); await loadEmbedCrown(client);
  const channel = await client.channels.fetch(channelId); if (channel.guildId !== beta) throw Error('Release target mismatch.');
  const key = `guild:${beta}:release:${release.id}`, prior = await readCommunityValue(client, key);
  const message = prior ? await channel.messages.fetch(prior) : null;
  if (message && message.author.id !== client.user.id) throw Error('Release ownership mismatch.');
  const payload = { content: '', embeds: [createEmbed({ guildId: beta, title: release.title, author: 'DEXZUBOT / UPDATES',
    description: [release.summary, ...release.changes.map(text => `• ${text}`)].join('\n\n'),
    fields: [{ name: 'Try it', value: release.tryIt.join('\n') }, { name: 'Beta limits', value: release.scope }],
    thumbnail: client.user.displayAvatarURL(), footer: 'DexzuBot · Faith',
  })], allowedMentions: { parse: [] } };
  const sent = message ? await message.edit(payload) : await channel.send(payload);
  try { await writeCommunityValue(client, key, sent.id); } catch (error) { if (!message) await sent.delete(); throw error; }
  console.log(JSON.stringify({ release: sent.url }));
} finally { client.destroy(); await pgDb.disconnect(); }
