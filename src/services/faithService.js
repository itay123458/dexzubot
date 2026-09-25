import { z } from 'zod';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { createHash } from 'node:crypto';
import { FAITH_VERSES } from '../config/faithVerses.js';
import { isBetaGuild, isMainGuild, canUseBetaFeatures, getBetaActorId, runWithBetaAccess } from '../config/beta.js';
import { readCommunityValue, writeCommunityValue } from './communityBetaService.js';
import { Mutex } from '../utils/mutex.js';
import { createEmbed } from '../utils/embeds.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

const snowflake = z.string().regex(/^\d{17,20}$/).nullable();
export const faithSettingsSchema = z.object({
  enabled: z.boolean(), channelId: snowflake, discussionChannelId: snowflake,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(1).max(80).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Choose a valid IANA timezone, such as Asia/Jerusalem.'),
  translation: z.literal('WEB'),
}).strict().refine(value => !value.enabled || value.channelId, 'Choose a daily Bible channel.');
export const defaultFaithSettings = () => ({ enabled: false, channelId: null, discussionChannelId: null,
  time: '09:00', timezone: 'Asia/Jerusalem', translation: 'WEB' });
const configKey = id => `guild:${id}:faith:config`;
const ownerGrantKey = id => `guild:${id}:faith:owner-grant`;
const ledgerKey = id => `guild:${id}:faith:delivery`;
const fail = (message, type = ErrorTypes.VALIDATION) => { throw new TitanBotError(message, type, message); };
export function assertFaithGuild(id) {
  if (!canUseBetaFeatures(id)) fail('Faith tools are available in Main and Beta.', ErrorTypes.PERMISSION);
}
export function localDay(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function verseForDay(date) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return FAITH_VERSES[((day % FAITH_VERSES.length) + FAITH_VERSES.length) % FAITH_VERSES.length];
}
export async function getFaithSettings(client, id) {
  assertFaithGuild(id);
  return faithSettingsSchema.parse({ ...defaultFaithSettings(), ...await readCommunityValue(client, configKey(id)) });
}
export async function validateFaithChannel(guild, id, { delivery = true } = {}) {
  const channel = await guild.channels.fetch(id);
  if (!channel || channel.guildId !== guild.id || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    fail('Choose a text channel in this server.');
  }
  const required = [PermissionFlagsBits.ViewChannel];
  if (delivery) required.push(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory);
  if (!channel.permissionsFor(guild.members.me)?.has(required)) fail(`DexzuBot needs ${delivery ? 'View Channel, Send Messages, Embed Links and Read Message History' : 'View Channel'} in #${channel.name}.`);
  return channel;
}
export async function saveFaithSettings(client, guild, input) {
  assertFaithGuild(guild.id);
  const config = faithSettingsSchema.parse(input);
  if (config.enabled) await validateFaithChannel(guild, config.channelId);
  if (config.enabled && config.discussionChannelId) await validateFaithChannel(guild, config.discussionChannelId, { delivery: false });
  await writeCommunityValue(client, configKey(guild.id), config);
  if (isMainGuild(guild.id) && !isBetaGuild(guild.id)) {
    await writeCommunityValue(client, ownerGrantKey(guild.id), { userId: getBetaActorId() });
  }
  return config;
}
const marker = date => `Daily Bible · ${date} · WEB`;
export function bibleEmbed(client, guildId, config, date) {
  const verse = verseForDay(date);
  return createEmbed({ guildId, title: 'Bible Verse of the Day', description: verse.text,
    thumbnail: client.user?.displayAvatarURL(), url: verse.source,
    fields: [{ name: verse.reference, value: `[World English Bible](${verse.source})` },
      ...(config.discussionChannelId ? [{ name: 'Discuss this verse', value: `<#${config.discussionChannelId}>` }] : [])],
    footer: marker(date),
  });
}
export async function getFaithState(client, guild, now = new Date()) {
  const config = await getFaithSettings(client, guild.id);
  const delivery = await readCommunityValue(client, ledgerKey(guild.id)) || { entries: [] };
  const day = localDay(now, config.timezone);
  return { config, delivery, today: day.date, verse: verseForDay(day.date), collectionSize: FAITH_VERSES.length };
}
async function findPendingMessage(channel, client, entry) {
  let before;
  // The daily channel is read-only. Paginate anyway so unrelated traffic cannot hide a pending post.
  for (let page = 0; page < 20; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const messages = [...batch.values()];
    const match = messages.find(message => message.author.id === client.user.id &&
      message.embeds.some(embed => embed.footer?.text === marker(entry.date)));
    if (match) return match;
    if (messages.length < 100 || messages.some(message => message.createdTimestamp < Date.parse(entry.startedAt))) return null;
    before = messages.at(-1).id;
  }
  fail('Cannot safely reconcile the pending Bible post. Check the daily channel history before retrying.', ErrorTypes.CONFIGURATION);
}
async function withDeliveryLock(client, id, action) {
  return Mutex.runExclusive(`faith:${id}`, async () => {
    // A session lock also serializes accidental overlapping instances during deployment.
    const pool = client.db?.connectionType === 'postgresql' && client.db.db?.pool;
    if (!pool) return action(); // Shared storage helper rejects degraded production stores.
    const connection = await pool.connect();
    try {
      await connection.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [`faith:${id}`]);
      return await action();
    } finally {
      try { await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [`faith:${id}`]); }
      finally { connection.release(); }
    }
  });
}
export async function deliverDailyBible(client, guild, now = new Date()) {
  if (!isBetaGuild(guild.id)) {
    if (!isMainGuild(guild.id)) return;
    const grant = await readCommunityValue(client, ownerGrantKey(guild.id));
    if (!grant?.userId || !canUseBetaFeatures(guild.id, grant.userId)) return;
    return runWithBetaAccess(grant.userId, guild.id, () => deliverAuthorizedDailyBible(client, guild, now));
  }
  return deliverAuthorizedDailyBible(client, guild, now);
}
async function deliverAuthorizedDailyBible(client, guild, now) {
  return withDeliveryLock(client, guild.id, async () => {
    const config = await getFaithSettings(client, guild.id);
    const day = localDay(now, config.timezone);
    if (!config.enabled || day.time < config.time) return;
    const ledger = await readCommunityValue(client, ledgerKey(guild.id)) || { entries: [] };
    let entry = ledger.entries.find(item => item.date === day.date);
    if (entry?.status === 'sent') return;
    try {
      const channel = await validateFaithChannel(guild, entry?.channelId || config.channelId);
      if (entry) {
        const recovered = await findPendingMessage(channel, client, entry);
        if (recovered) {
          Object.assign(entry, { status: 'sent', messageId: recovered.id, sentAt: new Date(recovered.createdTimestamp).toISOString() });
          ledger.lastError = null;
          await writeCommunityValue(client, ledgerKey(guild.id), ledger);
          return;
        }
      } else {
        entry = { date: day.date, channelId: channel.id, status: 'pending', startedAt: now.toISOString() };
        ledger.entries = [...ledger.entries.slice(-59), entry];
      }
      ledger.lastAttemptAt = now.toISOString();
      await writeCommunityValue(client, ledgerKey(guild.id), ledger);
      const sent = await channel.send({ embeds: [bibleEmbed(client, guild.id, config, day.date)], allowedMentions: { parse: [] },
        nonce: createHash('sha256').update(`${guild.id}:${day.date}`).digest('hex').slice(0, 24), enforceNonce: true });
      Object.assign(entry, { status: 'sent', messageId: sent.id, sentAt: now.toISOString() });
      ledger.lastError = null;
      await writeCommunityValue(client, ledgerKey(guild.id), ledger);
    } catch (error) {
      // Keep pending intent if Discord accepted the post but the response or final write failed.
      ledger.lastError = String(error.userMessage || error.message).slice(0, 500);
      await writeCommunityValue(client, ledgerKey(guild.id), ledger).catch(() => {});
      throw error;
    }
  });
}
const pollers = new WeakSet(), polling = new WeakSet();
export function initializeFaith(client) {
  if (pollers.has(client)) return;
  pollers.add(client);
  const poll = async () => {
    if (polling.has(client) || !client.isReady()) return;
    polling.add(client);
    try {
      for (const guild of client.guilds.cache.values()) {
        if (!isBetaGuild(guild.id) && !isMainGuild(guild.id)) continue;
        await deliverDailyBible(client, guild).catch(error => logger.error('Daily Bible delivery failed', { error: error.message, guildId: guild.id }));
      }
    } finally { polling.delete(client); }
  };
  const timer = setInterval(() => void poll(), 60_000);
  timer.unref?.();
  void poll();
}
