// Stable IDs keep saved collections valid when display copy changes.
export const FOOD_RARITIES = Object.freeze([
  { id: 'common', label: 'Common', chance: 70 },
  { id: 'rare', label: 'Rare', chance: 22 },
  { id: 'epic', label: 'Epic', chance: 7 },
  { id: 'legendary', label: 'Legendary', chance: 1 },
]);
const rows = [
  ['pizza', '🍕', 'Pizza slice', 'common', 'Mostly cheese. An excellent decision.'],
  ['apple', '🍎', 'Apple', 'common', 'A crisp bite. Somewhere, a doctor checks their calendar.'],
  ['toast', '🍞', 'Toast', 'common', 'Bread went to the spa and came back crunchy.'],
  ['cookie', '🍪', 'Cookie', 'common', 'You promised to have just one. The crumbs disagree.'],
  ['fries', '🍟', 'Fries', 'common', 'You found the extra-crispy one at the bottom. Victory.'],
  ['banana', '🍌', 'Banana', 'common', 'Nature packed your snack in its own wrapper.'],
  ['rice', '🍚', 'Rice bowl', 'common', 'Simple, warm, and absolutely carrying the meal.'],
  ['sandwich', '🥪', 'Sandwich', 'common', 'Two slices of bread holding your afternoon together.'],
  ['carrot', '🥕', 'Carrot', 'common', 'Maximum crunch. Everyone in voice chat heard it.'],
  ['popcorn', '🍿', 'Popcorn', 'common', 'The snack is ready. Now you just need some harmless drama.'],
  ['pretzel', '🥨', 'Pretzel', 'common', 'A delicious knot. You decided not to untie it.'],
  ['ice', '🧊', 'Ice cube', 'common', 'Congratulations. You have successfully chewed water.'],
  ['sushi', '🍣', 'Sushi', 'rare', 'A tiny work of art. You ate the exhibition.'],
  ['taco', '🌮', 'Taco', 'rare', 'The first bite was perfect. The second became a salad.'],
  ['ramen', '🍜', 'Ramen', 'rare', 'One noodle escaped. The rest were delicious.'],
  ['donut', '🍩', 'Galaxy donut', 'rare', 'The sprinkles look like stars. You ate a small universe.'],
  ['dumpling', '🥟', 'Dumpling', 'rare', 'A little pocket of happiness. No zipper required.'],
  ['waffle', '🧇', 'Waffle tower', 'rare', 'Every square holds syrup and a tiny architectural achievement.'],
  ['cake', '🍰', 'Cloud cake', 'epic', 'So fluffy you checked whether gravity was still enabled.'],
  ['curry', '🍛', 'Dragon curry', 'epic', 'Your character breathed imaginary fire. The bowl looks proud.'],
  ['mushroom', '🍄', 'Glowing mushroom', 'epic', 'A fictional dungeon snack. Your character now has mood lighting.'],
  ['icecream', '🍨', 'Aurora sundae', 'epic', 'Three flavors, seven colors, and one very confused spoon.'],
  ['burger', '🍔', 'Golden burger', 'legendary', 'The dungeon chef bows. You ask if it comes with fries.'],
  ['feast', '🍱', 'Dexzu feast', 'legendary', 'The rarest lunch in the dungeon. Even the final boss wants a bite.'],
];
export const FOODS = Object.freeze(rows.map(([id, emoji, name, rarity, reaction]) => Object.freeze({ id, emoji, name, rarity, reaction })));
export const FOOD_BY_ID = new Map(FOODS.map(food => [food.id, food]));
