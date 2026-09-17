// Explicit beta release, idempotent via stored message IDs. Never targets Main.
import { REST, Routes } from 'discord.js';
import { readFile } from 'node:fs/promises';
import { initializeDatabase, db } from '../src/utils/database/wrapper.js';
import { pgDb } from '../src/utils/postgresDatabase.js';
import { createEmbed } from '../src/utils/embeds.js';
import { embedMotionKey, loadEmbedMotion } from '../src/services/embedMotionService.js';
import { betaReleases } from '../src/config/releases.js';
const guildId = '1486680755869323388';
if (process.env.BETA_GUILD_ID !== guildId || process.env.GUILD_ID === guildId) throw new Error('Expected the approved, isolated beta guild.');
const mode = process.argv.includes('--install') ? 'install' : process.argv.includes('--announce') ? 'announce' : null;
if (!mode) throw new Error('Choose --install or --announce.');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const channelId = mode === 'install' ? '1543320978082369628' : '1549857857414111272';
const channel = await rest.get(Routes.channel(channelId));
if (channel.guild_id !== guildId) throw new Error('Release channel is not in Beta.');
const me = await rest.get(Routes.user());
try {
  await initializeDatabase();
  if (!db.isAvailable()) throw new Error('Persistent database unavailable.');
  const key = `${embedMotionKey(guildId)}:${mode}:v1`;
  const previous = await db.get(key);
  let message;
  if (previous) {
    message = await rest.get(Routes.channelMessage(channelId, previous));
    if (message.author.id !== me.id) throw new Error('Saved release message is not owned by DexzuBot.');
  }
  if (mode === 'install') {
    if (!message) {
      const files = await Promise.all(['avatar', 'giveaway'].map(async kind => ({ name: `dexzu-motion-${kind}.gif`, data: await readFile(new URL(`../src/web/public/assets/embed-motion/dexzu-motion-${kind}.gif`, import.meta.url)) })));
      message = await rest.post(Routes.channelMessages(channelId), { files, body: {
        embeds: [createEmbed({ title: 'Beta message artwork', description: 'Artwork used by DexzuBot’s animated messages. Keep this post so the image links stay available.', thumbnail: 'attachment://dexzu-motion-avatar.gif', image: 'attachment://dexzu-motion-giveaway.gif', footer: 'DexzuBot · Beta artwork' }).toJSON()], allowed_mentions: { parse: [] },
      } });
      if (await db.set(key, message.id) === false) throw new Error('Could not save artwork message ID.');
    }
    const assetUrl = kind => {
      const file = message.attachments.find(item => item.filename === `dexzu-motion-${kind}.gif`);
      if (!file) throw new Error('Artwork attachment missing.');
      return file.url.split('?')[0];
    };
    const existing = await db.get(embedMotionKey(guildId));
    if (await db.set(embedMotionKey(guildId), { enabled: existing?.enabled !== false, thumbnailUrl: assetUrl('avatar'), bannerUrl: assetUrl('giveaway') }) === false) throw new Error('Could not save artwork configuration.');
  } else {
    const state = await loadEmbedMotion({ db });
    if (!state.ready) throw new Error('Install artwork before announcing.');
    const release = betaReleases.find(item => item.id === '2026-09-17-message-motion');
    const embed = createEmbed({ guildId, title: 'Animated messages · Beta', author: 'DEXZUBOT / BETA UPDATES',
      description: `${release.summary}\n\n${release.changes.map(line => `• ${line}`).join('\n')}`,
      fields: [{ name: 'Try it', value: 'Run `/ping` or `/role list`.\n[Beta dashboard](https://ik.tailce7102.ts.net/dashboard/?workspace=beta#operations) → Operations → Animated messages.' },
        { name: 'Beta only', value: `${release.scope} Text and buttons stay still; Discord controls GIF playback.` }],
      footer: 'DexzuBot · Beta · 17 Sep 2026',
    });
    const body = { content: '', embeds: [embed.toJSON()], allowed_mentions: { parse: [] } };
    message = previous ? await rest.patch(Routes.channelMessage(channelId, previous), { body }) : await rest.post(Routes.channelMessages(channelId), { body });
    if (await db.set(key, message.id) === false) throw new Error('Could not save release message ID.');
  }
  console.log(JSON.stringify({ mode, guildId, url: `https://discord.com/channels/${guildId}/${channelId}/${message.id}` }));
} finally { await pgDb.disconnect(); }
