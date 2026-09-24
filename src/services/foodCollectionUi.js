import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { FOODS, FOOD_BY_ID, FOOD_RARITIES } from '../config/foods.js';
import { createEmbed } from '../utils/embeds.js';

export const foodCollectionButton = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('eat_collection').setLabel('My collection').setStyle(ButtonStyle.Secondary).setEmoji('📖'));
export function foodResultEmbed(client, guildId, result) {
  const food = FOOD_BY_ID.get(result.foodId);
  const rarity = FOOD_RARITIES.find(item => item.id === food.rarity);
  return createEmbed({ guildId, title: `${food.emoji} You ate ${food.name}!`, description: food.reaction,
    thumbnail: client.user?.displayAvatarURL(), fields: [
      { name: 'Rarity', value: rarity.label, inline: true },
      { name: result.isNew ? '✨ New food discovered!' : 'Another bite', value: `Eaten ${result.foodCount} time${result.foodCount === 1 ? '' : 's'}`, inline: true },
      { name: 'Your collection', value: `${result.discovered}/${FOODS.length} discovered · ${FOODS.length - result.discovered} remaining`, inline: false },
    ], footer: 'DexzuBot · Food collection · No coins required',
  });
}
export function foodCollectionEmbed(client, guildId, collection) {
  const discovered = FOODS.filter(food => collection.counts[food.id] > 0).length;
  return createEmbed({ guildId, title: 'Your food collection', thumbnail: client.user?.displayAvatarURL(),
    description: `**${discovered}/${FOODS.length} discovered** · ${FOODS.length - discovered} remaining\n${collection.totalEaten} meals eaten. ` + 'Try `/eat` to discover more.',
    fields: FOOD_RARITIES.flatMap(rarity => {
      const foods = FOODS.filter(food => food.rarity === rarity.id);
      const known = foods.filter(food => collection.counts[food.id] > 0);
      const lines = [
        ...known.map(food => `${food.emoji} ${food.name} ×${collection.counts[food.id]}`),
        ...(known.length < foods.length ? [`❔ ${foods.length - known.length} undiscovered`] : []),
      ];
      const chunks = [''];
      for (const line of lines) {
        const last = chunks.length - 1;
        if (chunks[last].length + line.length + 1 > 950) chunks.push(line);
        else chunks[last] += (chunks[last] ? '\n' : '') + line;
      }
      return chunks.map((value, index) => ({ name: `${rarity.label} · ${known.length}/${foods.length}${index ? ' (continued)' : ''}`, value }));
    }), footer: 'DexzuBot · Your collection in this server',
  });
}
export function foodGuideEmbed(guildId) {
  return createEmbed({ guildId, title: 'Food collection guide', description:
    '**`/eat`** — get a random food and reaction.\n**`/eat action:collection`** — see your discoveries and eaten counts.\nThe **My collection** button opens your own collection privately.\n\nDuplicates increase your count. New foods get a discovery badge. Collections and cooldowns survive restarts. No coins are spent.',
    fields: [{ name: 'Rarity odds', value: FOOD_RARITIES.map(item => `${item.label}: ${item.chance}%`).join(' · ') },
      { name: 'Cooldown', value: '30 seconds by default. Administrators can change it in Beta → Operations → Food collection.' }],
    footer: `DexzuBot · ${FOODS.length} foods · Beta`,
  });
}
