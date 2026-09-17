import { REST, Routes } from 'discord.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { communityArrowKey, communityArrowName, validCommunityArrow } from '../src/services/communityMotionService.js';
import { writeCommunityValue } from '../src/services/communityBetaService.js';

export async function installCommunityArrow({ rest, applicationId, client, image }) {
  if (!/^\d{17,20}$/.test(applicationId)) throw new Error('Invalid application ID.');
  if (!Buffer.isBuffer(image) || image.length > 256 * 1024 || !/^GIF8[79]a$/.test(image.subarray(0, 6).toString())) throw new Error('A GIF under 256 KiB is required.');
  const { items } = await rest.get(Routes.applicationEmojis(applicationId));
  if (!Array.isArray(items)) throw new Error('Invalid application emoji response.');
  const matches = items.filter(item => item.name === communityArrowName);
  if (matches.length > 1) throw new Error('Multiple named arrows exist; resolve duplicates before installing.');
  // On a failed database write, a retry finds the uploaded emoji by name.
  const emoji = matches[0] || await rest.post(Routes.applicationEmojis(applicationId), { body: { name: communityArrowName, image: `data:image/gif;base64,${image.toString('base64')}` } });
  if (!validCommunityArrow(emoji)) throw new Error('Application arrow must be animated; existing emoji was preserved.');
  const value = { id: emoji.id, name: emoji.name, animated: true };
  await writeCommunityValue(client, communityArrowKey, value);
  return { ...value, reused: matches.length === 1 };
}

async function main() {
  const guildId = process.argv.find(arg => arg.startsWith('--guild='))?.slice(8);
  const configured = [process.env.GUILD_ID?.trim(), process.env.BETA_GUILD_ID?.trim()].filter(id => /^\d{17,20}$/.test(id || ''));
  if (!guildId || !configured.includes(guildId)) throw new Error('Pass --guild=<configured Main or Beta guild ID>.');
  if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required.');
  const { initializeDatabase, db } = await import('../src/utils/database/wrapper.js');
  const { pgDb } = await import('../src/utils/postgresDatabase.js');
  try {
    await initializeDatabase();
    if (!db.isAvailable()) throw new Error('Persistent database unavailable.');
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const guild = await rest.get(Routes.guild(guildId));
    if (guild.id !== guildId) throw new Error('Configured guild is unavailable to this application.');
    const application = await rest.get(Routes.oauth2CurrentApplication());
    const image = await readFile(new URL('../src/web/public/assets/embed-motion/dexzu-community-arrow.gif', import.meta.url));
    console.log(JSON.stringify(await installCommunityArrow({ rest, applicationId: application.id, client: { db }, image })));
  } finally { await pgDb.disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
