import { createHash } from 'node:crypto';
import { MessageFlags } from 'discord.js';
import { readCommunityValue, writeCommunityValue } from './communityBetaService.js';
import { assertFaithGuild } from './faithService.js';
import { createEmbed } from '../utils/embeds.js';
import { Mutex } from '../utils/mutex.js';

export const FAITH_RULES = 'Respect people of every belief, including no belief. No harassment, slurs, or pressure to convert.';
export async function publishFaithGuide(client, channel, name, intro) {
  assertFaithGuild(channel.guildId);
  const key = `guild:${channel.guildId}:faith:guide:${channel.id}`;
  return Mutex.runExclusive(key, async () => {
    const stored = await readCommunityValue(client, key);
    const record = typeof stored === 'string' ? { messageId: stored } : stored || { startedAt: new Date().toISOString() };
    const marker = `DexzuBot · Faith guide · ${channel.id}`;
    let message = record.messageId ? await channel.messages.fetch(record.messageId).catch(error => {
      if (error.code === 10008) return null;
      throw error;
    }) : null;
    if (!message && stored && !record.messageId) {
      let before, scanned = false;
      for (let page = 0; page < 20; page++) {
        const batch = [...(await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) })).values()];
        message = batch.find(item => item.author.id === client.user.id && item.embeds.some(embed => embed.footer?.text === marker));
        if (message || batch.length < 100 || batch.some(item => item.createdTimestamp < Date.parse(record.startedAt))) { scanned = true; break; }
        before = batch.at(-1).id;
      }
      if (!scanned) throw Error('Guide history could not be reconciled safely.');
    }
    if (message && message.author.id !== client.user.id) throw Error('Guide ownership mismatch.');
    const payload = { embeds: [createEmbed({ guildId: channel.guildId, title: `Faith · ${name}`, description: `${intro}\n\n${FAITH_RULES}`,
      thumbnail: client.user.displayAvatarURL(), footer: marker })], allowedMentions: { parse: [] } };
    if (message) message = await message.edit(payload);
    else {
      record.startedAt ||= new Date().toISOString();
      delete record.messageId;
      await writeCommunityValue(client, key, record);
      message = await channel.send({ ...payload, flags: MessageFlags.SuppressNotifications,
        nonce: createHash('sha256').update(key).digest('hex').slice(0, 24), enforceNonce: true });
    }
    await writeCommunityValue(client, key, { ...record, messageId: message.id });
    if (!message.pinned) await message.pin('Faith category guide');
    return message;
  });
}
