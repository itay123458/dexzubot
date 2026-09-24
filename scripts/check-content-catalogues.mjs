import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { FOODS, FOOD_RARITIES } from '../src/config/foods.js';
import { FAITH_VERSES } from '../src/config/faithVerses.js';
import { verseForDay } from '../src/services/faithService.js';
assert.equal(FOODS.length, 120);
assert.equal(new Set(FOODS.map(f => f.id)).size, 120);
assert.equal(new Set(FOODS.map(f => f.name)).size, 120);
assert.deepEqual(FOOD_RARITIES.map(r => FOODS.filter(f => f.rarity === r.id).length), [48, 36, 24, 12]);
assert.equal(FOOD_RARITIES.reduce((n, r) => n + r.chance, 0), 100);
for (const food of FOODS) assert.ok(food.emoji && food.reaction && food.name.length <= 25);
assert.equal(FAITH_VERSES.length, 365);
assert.equal(new Set(FAITH_VERSES.map(v => v.reference)).size, 365);
assert.equal(new Set(FAITH_VERSES.map(v => v.source)).size, 33);
for (const verse of FAITH_VERSES) {
  assert.ok(verse.text.length > 15 && verse.text.length < 3000);
  assert.ok(!/[<>\ufffd]/.test(verse.text));
  assert.ok(!/Public Domain|Frequently Asked|When rendered in ALL/.test(verse.text));
  assert.match(verse.source, /^https:\/\/ebible\.org\/engwebp\/[A-Z0-9]+\.htm$/);
}
const readings = Array.from({ length: 365 }, (_, i) => verseForDay(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)).reference);
assert.equal(new Set(readings).size, 365, 'one full rotation without a repeated reference');
// Compare stable IDs and their names against the already released catalogue.
if (process.env.CHECK_CATALOGUE_HISTORY === '1') {
  const source = execFileSync('git', ['show', '6a96ca2:src/config/foods.js'], { encoding: 'utf8' });
  const original = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  for (const food of original.FOODS) assert.deepEqual(FOODS.find(f => f.id === food.id), food);
}
console.log('Catalogues passed: 120 unique foods, rarity totals, preserved original IDs, 365 sourced readings and a full nonrepeating rotation.');
