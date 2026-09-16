import assert from 'node:assert/strict';
import { createGiveawayEmbed, createGiveawayButtons } from '../src/services/giveawayService.js';
import * as giveawayService from '../src/services/giveawayService.js';
import { createSupportPanelEmbed } from '../src/utils/brandPanels.js';

try {
  const giveaway = { prize: 'Crystal rewards', hostId: '123456789012345678', winnerCount: 2, participants: ['1', '2'], endsAt: Date.now() + 60000 };
  const ended = createGiveawayEmbed(giveaway, 'ended', ['123456789012345678']).toJSON();
  assert.doesNotMatch(ended.description, /below to enter/i, 'Ended giveaways must not invite members to enter');
  assert.ok(ended.fields.some(field => field.value.includes('<@123456789012345678>')));
  const active = createGiveawayEmbed(giveaway, 'active').toJSON();
  assert.equal(active.footer.text, 'DexzuBot · Giveaways');
  assert.ok(active.fields.some(field => field.value.includes(':R>')), 'Active giveaway retains its deadline');
  assert.equal(createGiveawayEmbed({ ...giveaway, prize: 'x'.repeat(256) }, 'active').toJSON().title.length <= 256, true);
  assert.deepEqual(createGiveawayButtons(false).toJSON().components.map(button => button.custom_id), ['giveaway_join', 'giveaway_end']);
  assert.deepEqual(createGiveawayButtons(true).toJSON().components.map(button => button.custom_id), ['giveaway_reroll', 'giveaway_view']);
  const channel = allowed => ({ guild: { members: { me: {} } }, permissionsFor: () => ({ has: () => allowed }) });
  const withoutFiles = giveawayService.withGiveawayArtwork(createGiveawayEmbed(giveaway, 'active'), channel(false));
  assert.equal(withoutFiles.files, undefined, 'Artwork must not require new channel permissions');
  assert.equal(withoutFiles.embeds[0].toJSON().image, undefined);
  const withFiles = giveawayService.withGiveawayArtwork(createGiveawayEmbed(giveaway, 'active'), channel(true));
  assert.equal(withFiles.files.length, 1);
  assert.equal(withFiles.embeds[0].toJSON().image.url, 'attachment://dexzu-giveaway.jpg');
  const retained = giveawayService.withGiveawayArtwork(createGiveawayEmbed(giveaway, 'active'), channel(false), { attachments: new Map([['image', { name: 'dexzu-giveaway.jpg' }]]) });
  assert.equal(retained.files, undefined, 'Joining must reuse the banner rather than upload it again');
  assert.equal(retained.attachments, undefined, 'Existing attachments must not be cleared');
  assert.equal(retained.embeds[0].toJSON().image.url, 'attachment://dexzu-giveaway.jpg');
  const support = createSupportPanelEmbed({ ticketPanelMessage: 'Our custom support instructions' }).toJSON();
  assert.equal(support.description, 'Our custom support instructions');
  assert.equal(support.title, 'Support Tickets', 'Keep the title used to locate support panels');
  assert.equal(support.footer.text, 'DexzuBot · Private support');
  console.log('PASS: giveaway states, deadlines, branding, action IDs, permission fallback, attachment reuse, and custom support content.');

} catch (error) { console.error(error.message); process.exitCode = 1; }
