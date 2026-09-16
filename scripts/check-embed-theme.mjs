import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EmbedBuilder } from 'discord.js';
import { createEmbed } from '../src/utils/embeds.js';
import { getColor } from '../src/config/bot.js';
import serverInfo from '../src/commands/Utility/serverinfo.js';
import userInfo from '../src/commands/Utility/userinfo.js';
import info from '../src/commands/Core/info.js';
import { buildNowPlayingEmbed, buildQueueEmbed } from '../src/services/music/musicEmbeds.js';

test('preserves emoji, currency, and significant code whitespace throughout embeds', () => {
  const text = '💎 ₪250 • 🪙100\n```js\n  const balance =  250;\n\treturn balance;\n```';
  const data = createEmbed({ title: '💎 Account', description: text,
    author: { name: '✨ Member', iconURL: 'https://example.com/avatar.png', url: 'https://example.com' },
    fields: [{ name: '🪙 Wallet', value: text }] }).toJSON();
  assert.equal(data.title, '💎 Account');
  assert.equal(data.description, text);
  assert.equal(data.fields[0].name, '🪙 Wallet');
  assert.equal(data.fields[0].value, text);
  assert.equal(data.author.name, '✨ Member');
  assert.equal(data.author.icon_url, 'https://example.com/avatar.png');
});

test('retains complete requested footer metadata and supports replacement and clearing', () => {
  const embed = createEmbed({ footer: { text: 'Requested by ✨ Alice • 2 results', iconURL: 'https://example.com/avatar.png' } });
  assert.deepEqual(embed.toJSON().footer, { text: 'Requested by ✨ Alice • 2 results', icon_url: 'https://example.com/avatar.png' });
  embed.setFooter({ text: 'Next refresh in 30s' });
  assert.equal(embed.toJSON().footer.text, 'Next refresh in 30s');
  embed.setFooter(null);
  assert.equal(embed.toJSON().footer, undefined);
});

test('honors explicit timestamps while leaving default cards undated', () => {
  const date = new Date('2026-09-16T12:00:00Z');
  assert.equal(createEmbed({ timestamp: date }).toJSON().timestamp, date.toISOString());
  assert.ok(createEmbed({ timestamp: true }).toJSON().timestamp);
  assert.equal(createEmbed().toJSON().timestamp, undefined);
  assert.equal(createEmbed().setTimestamp(date).toJSON().timestamp, date.toISOString());
});

test('applies crystal blue branding while preserving status colors and Discord validation', () => {
  assert.equal(createEmbed().toJSON().color, 0x65B4FF);
  assert.equal(createEmbed().toJSON().footer.text, '💎 DexzuBot');
  assert.equal(createEmbed({ color: 'error' }).toJSON().color, getColor('error'));
  assert.equal(createEmbed().setColor(0x123456).toJSON().color, 0x123456);
  assert.throws(() => createEmbed().setTitle('x'.repeat(257)));
});

test('does not modify the behavior of third-party EmbedBuilder instances', () => {
  const embed = new EmbedBuilder().setTitle('🎵 Music').setDescription('  spaced  text  ')
    .setFooter({ text: 'A caller footer', iconURL: 'https://example.com/icon.png' })
    .setTimestamp(new Date('2026-09-16T12:00:00Z'));
  assert.equal(embed.toJSON().title, '🎵 Music');
  assert.equal(embed.toJSON().description, '  spaced  text  ');
  assert.equal(embed.toJSON().footer.icon_url, 'https://example.com/icon.png');
  assert.equal(embed.toJSON().timestamp, '2026-09-16T12:00:00.000Z');
});

test('info commands deliver branded V2 cards through the real reply helper', async () => {
  const user = { id: '123456789012345678', username: 'Member', tag: 'Member', bot: false,
    createdAt: new Date('2020-01-01'), displayAvatarURL: () => 'https://example.com/avatar.png', toString: () => '<@123456789012345678>' };
  const guild = { id: '234567890123456789', name: 'A'.repeat(100), description: 'A community for everyone.',
    memberCount: 100000, createdAt: new Date('2020-01-01'), premiumTier: 3, premiumSubscriptionCount: 10,
    iconURL: () => 'https://example.com/guild.png', fetchOwner: async () => ({ user, toString: () => user.toString() }),
    channels: { cache: { size: 500 } }, roles: { cache: { size: 250 } }, members: { cache: new Map() } };
  for (const command of [serverInfo, userInfo, info]) {
    let payload;
    const interaction = { id: '345678901234567890', user, guild, guildId: guild.id, deferred: false,
      options: { getUser: () => user },
      client: { user, users: { fetch: async () => user }, guilds: { cache: { size: 100 } }, commands: { size: 200 } },
      async deferReply() { this.deferred = true; }, async editReply(value) { payload = value; } };
    await command.execute(interaction);
    assert.equal(payload.flags, 32768, command.data.name);
    assert.deepEqual(payload.embeds, []);
    assert.equal(payload.components[0].type, 17);
    assert.equal(payload.components[0].accent_color, 0x65B4FF);
    assert.match(JSON.stringify(payload.components), /DexzuBot/);
    assert.doesNotMatch(JSON.stringify(payload.components), /\?\? [A-Z]/);
  }
});

test('music cards preserve playback state and queue pagination metadata', () => {
  const track = { info: { title: '🎵 Sample', author: 'Artist', length: 120000, requester: { username: 'Listener' } } };
  const playing = buildNowPlayingEmbed(track, { position: 1000, paused: true, queue: [] }, { volume: 50 }).toJSON();
  assert.equal(playing.description, '🎵 Sample');
  assert.equal(playing.fields[0].name, '🎤 Artist');
  assert.match(playing.footer.text, /DexzuBot.*Paused/);
  const queue = buildQueueEmbed(Array.from({ length: 11 }, () => track), track, 1).toJSON();
  assert.match(queue.footer.text, /Page 2 of 2.*11 queued/);
  assert.match(queue.description, /11\./);
});
