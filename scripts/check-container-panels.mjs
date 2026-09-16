import assert from 'node:assert/strict';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, ContainerBuilder } from 'discord.js';

const { toContainerMessage, disablePanelControls } = await import('../src/utils/panelLayout.js');
const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('existing_action').setLabel('Continue').setStyle(ButtonStyle.Primary));
const embed = new EmbedBuilder().setTitle('Community Support').setDescription('Custom instructions').setColor(0x65b4ff)
  .setThumbnail('https://example.com/avatar.png').setImage('attachment://banner.png')
  .addFields({ name: 'Help', value: 'Ask the team' }).setFooter({ text: 'DexzuBot · Support' });
const payload = toContainerMessage({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
assert.equal(payload.flags, MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
assert.deepEqual(payload.embeds, []);
assert.equal(payload.content, null);
assert.equal(payload.components[0].type, 17);
assert.equal(payload.components[0].accent_color, 0x65b4ff);
const json = JSON.stringify(payload);
assert.match(json, /existing_action/);
assert.match(json, /Custom instructions/);
assert.match(json, /attachment:\/\/banner.png/);
new ContainerBuilder(payload.components[0]).toJSON();
const disabled = disablePanelControls(payload.components);
assert.match(JSON.stringify(disabled), /"disabled":true/);
assert.match(JSON.stringify(disabled), /Community Support/);
assert.doesNotMatch(JSON.stringify(payload.components), /"disabled":true/);
assert.throws(() => toContainerMessage({ embeds: [{ description: 'x'.repeat(4001) }] }), /4000/);
console.log('PASS: container layout, inherited flags, action IDs, artwork, limits, and collector timeout keeps panel content.');
