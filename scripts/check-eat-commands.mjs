import assert from 'node:assert/strict';
import command from '../src/commands/Core/eat.js';
import button from '../src/interactions/buttons/fun/eatCollection.js';
import { InteractionHelper } from '../src/utils/interactionHelper.js';
import { getFoodCollection } from '../src/services/foodCollectionService.js';
import { foodCollectionEmbed } from '../src/services/foodCollectionUi.js';
import { FOODS } from '../src/config/foods.js';
process.env.BETA_GUILD_ID = '1486680755869323388';
const guildId = process.env.BETA_GUILD_ID, userId = '1127099544560205914';
const store = new Map(); const client = { user: { displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }, db: {
  get: async key => structuredClone(store.get(key)), set: async (key, value) => { store.set(key, structuredClone(value)); return true; },
} };
let action = null, reply, deferOptions;
const interaction = { guildId, id: 'meal-interaction', user: { id: userId }, options: { getString: () => action } };
const defer = InteractionHelper.safeDefer, edit = InteractionHelper.safeEditReply;
try {
  InteractionHelper.safeDefer = async (_, options) => { deferOptions = options; return true; };
  InteractionHelper.safeEditReply = async (_, payload) => { reply = payload; };
  assert.equal(command.data.toJSON().options[0].required ?? false, false, 'bare /eat stays usable');
  await command.execute(interaction, {}, client);
  assert.equal((await getFoodCollection(client, guildId, userId)).totalEaten, 1);
  assert.deepEqual(reply.allowedMentions, { parse: [] });
  assert.equal(reply.components[0].toJSON().components[0].custom_id, 'eat_collection');
  action = 'collection'; await command.execute(interaction, {}, client);
  assert.ok(deferOptions.flags, 'collection is private');
  assert.ok(reply.embeds[0].toJSON().description.includes(`1/${FOODS.length} discovered`));
  await button.execute({ ...interaction, user: { id: '123456789012345678' }, customId: `eat_collection:${userId}` }, client, [userId]);
  assert.ok(reply.embeds[0].toJSON().description.includes(`0/${FOODS.length} discovered`), 'button ignores forged target and reads clicking member');
  await assert.rejects(button.execute({ ...interaction, guildId: '999999999999999999' }, client));
  const full = foodCollectionEmbed(client, guildId, { totalEaten: 2400000, counts: Object.fromEntries(FOODS.map(food => [food.id, 100000])) }).toJSON();
  assert.ok(full.fields.every(field => field.value.length <= 1024), 'complete collection fits Discord fields');
  assert.ok(full.fields.length <= 25);
  assert.ok(full.title.length + full.description.length + full.footer.text.length + full.fields.reduce((n, f) => n + f.name.length + f.value.length, 0) <= 5900, 'complete collection fits the total embed limit with branding headroom');
  console.log('Eat command/button checks passed: bare command, saved meal, no mentions, private collection, caller identity and embed limits.');
} finally { InteractionHelper.safeDefer = defer; InteractionHelper.safeEditReply = edit; }
