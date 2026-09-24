import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { FOODS, FOOD_BY_ID, FOOD_RARITIES } from '../config/foods.js';
import { isBetaGuild } from '../config/beta.js';
import { readCommunityValue, writeCommunityValue } from './communityBetaService.js';
import { Mutex } from '../utils/mutex.js';
import { TitanBotError, ErrorTypes } from '../utils/errorHandler.js';

export const foodSettingsSchema = z.object({ enabled: z.boolean(), cooldownSeconds: z.number().int().min(5).max(3600) }).strict();
const defaults = () => ({ enabled: true, cooldownSeconds: 30 });
const settingsKey = guildId => `guild:${guildId}:food:settings`;
const collectionKey = (guildId, userId) => `guild:${guildId}:food:member:${userId}`;
const emptyCollection = () => ({ counts: {}, totalEaten: 0, lastEatenAt: null, receipts: [] });
export function assertFoodGuild(guildId) {
  if (!isBetaGuild(guildId)) throw new TitanBotError('Food collection is available in Beta first.', ErrorTypes.PERMISSION, 'Food collection is available in Beta first.');
}
export function chooseFood(random = randomInt) {
  const roll = random(10000);
  const rarity = roll < 7000 ? 'common' : roll < 9200 ? 'rare' : roll < 9900 ? 'epic' : 'legendary';
  const pool = FOODS.filter(food => food.rarity === rarity);
  return pool[random(pool.length)];
}
export async function getFoodSettings(client, guildId) {
  assertFoodGuild(guildId);
  return foodSettingsSchema.parse({ ...defaults(), ...await readCommunityValue(client, settingsKey(guildId)) });
}
export async function saveFoodSettings(client, guildId, input) {
  assertFoodGuild(guildId);
  const config = foodSettingsSchema.parse(input);
  await writeCommunityValue(client, settingsKey(guildId), config);
  return config;
}
export async function getFoodCollection(client, guildId, userId) {
  assertFoodGuild(guildId);
  z.string().regex(/^\d{17,20}$/).parse(userId);
  return await readCommunityValue(client, collectionKey(guildId, userId)) || emptyCollection();
}
export async function eatFood(client, guildId, userId, interactionId, { now = Date.now(), pick = chooseFood } = {}) {
  assertFoodGuild(guildId);
  z.string().regex(/^\d{17,20}$/).parse(userId);
  z.string().min(1).max(100).parse(interactionId);
  const key = collectionKey(guildId, userId);
  return Mutex.runExclusive(key, async () => {
    const pool = client.db?.connectionType === 'postgresql' && client.db.db?.pool;
    const connection = pool ? await pool.connect() : null;
    try {
      if (connection) await connection.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key]);
      // Use the held session for storage too: borrowing a second connection per
      // player can deadlock the pool when many players eat simultaneously.
      const storageClient = connection ? { db: { connectionType: 'postgresql',
        isAvailable: () => client.db.isAvailable(), db: { pool: connection } } } : client;
      const settings = await getFoodSettings(storageClient, guildId);
      const collection = await getFoodCollection(storageClient, guildId, userId);
      const receipt = collection.receipts.find(item => item.id === interactionId);
      if (receipt) return receipt.result;
      if (!settings.enabled) return { kind: 'disabled' };
      const nextAt = collection.lastEatenAt === null ? 0 : collection.lastEatenAt + settings.cooldownSeconds * 1000;
      if (now < nextAt) return { kind: 'cooldown', retryAfterSeconds: Math.ceil((nextAt - now) / 1000) };
      const selected = pick();
      const food = FOOD_BY_ID.get(selected?.id);
      if (!food) throw Error('Unknown food selection.');
      const priorCount = collection.counts[food.id] || 0;
      collection.counts[food.id] = priorCount + 1;
      collection.totalEaten++;
      collection.lastEatenAt = now;
      const result = { kind: 'meal', foodId: food.id, isNew: priorCount === 0, foodCount: priorCount + 1,
        discovered: FOODS.filter(item => collection.counts[item.id] > 0).length, totalEaten: collection.totalEaten };
      collection.receipts = [...collection.receipts.slice(-199), { id: interactionId, result }];
      await writeCommunityValue(storageClient, key, collection);
      return result;
    } finally {
      if (connection) {
        try { await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]); }
        finally { connection.release(); }
      }
    }
  });
}
export async function getFoodDashboardState(client, guildId) {
  return { settings: await getFoodSettings(client, guildId), totalFoods: FOODS.length,
    rarities: FOOD_RARITIES.map(rarity => ({ ...rarity, foods: FOODS.filter(food => food.rarity === rarity.id).length })) };
}
