import assert from 'node:assert/strict';
import { eatFood, getFoodCollection, saveFoodSettings, chooseFood, foodSettingsSchema } from '../src/services/foodCollectionService.js';
process.env.BETA_GUILD_ID = '1486680755869323388';
const guild = process.env.BETA_GUILD_ID, user = '1127099544560205914';
const values = new Map(); let writesFail = false, readsFail = false;
const client = { db: { get: async key => { if (readsFail) throw Error('offline'); return structuredClone(values.get(key)); },
  set: async (key, value) => { if (writesFail) return false; values.set(key, structuredClone(value)); return true; } } };
for (const [roll, rarity] of [[0,'common'],[6999,'common'],[7000,'rare'],[9199,'rare'],[9200,'epic'],[9899,'epic'],[9900,'legendary'],[9999,'legendary']]) {
  assert.equal(chooseFood(max => max === 10000 ? roll : 0).rarity, rarity);
}
assert.equal(foodSettingsSchema.safeParse({ enabled: true, cooldownSeconds: 0 }).success, false);
assert.equal(foodSettingsSchema.safeParse({ enabled: 'true', cooldownSeconds: 30 }).success, false);
const now = 2_000_000_000_000;
const pick = () => chooseFood(() => 0);
const first = await eatFood(client, guild, user, 'interaction-1', { now, pick });
assert.equal(first.kind, 'meal'); assert.equal(first.isNew, true); assert.equal(first.foodCount, 1);
assert.equal((await eatFood({ ...client }, guild, user, 'interaction-1', { now: now + 1000, pick })).kind, 'meal', 'retry same interaction returns receipt');
assert.equal((await getFoodCollection(client, guild, user)).totalEaten, 1);
const cooling = await eatFood(client, guild, user, 'interaction-2', { now: now + 1000, pick });
assert.equal(cooling.kind, 'cooldown'); assert.equal(cooling.retryAfterSeconds, 29);
const second = await eatFood(client, guild, user, 'interaction-3', { now: now + 30000, pick });
assert.equal(second.isNew, false); assert.equal(second.foodCount, 2);
const concurrent = await Promise.all(['4','5'].map(id => eatFood(client, guild, user, `interaction-${id}`, { now: now + 60000, pick })));
assert.equal(concurrent.filter(result => result.kind === 'meal').length, 1);
assert.equal((await getFoodCollection(client, guild, user)).totalEaten, 3);
assert.equal((await getFoodCollection(client, guild, '123456789012345678')).totalEaten, 0, 'members have separate collections');
writesFail = true;
await assert.rejects(eatFood(client, guild, user, 'interaction-6', { now: now + 90000, pick }));
writesFail = false;
assert.equal((await getFoodCollection(client, guild, user)).totalEaten, 3, 'failed save must not award food');
readsFail = true;
await assert.rejects(eatFood(client, guild, user, 'interaction-7', { now: now + 90000, pick }));
readsFail = false;
await saveFoodSettings(client, guild, { enabled: false, cooldownSeconds: 30 });
assert.equal((await eatFood(client, guild, user, 'interaction-8', { now: now + 90000, pick })).kind, 'disabled');
assert.equal((await getFoodCollection(client, guild, user)).totalEaten, 3, 'disabled game preserves collection access');
await assert.rejects(eatFood(client, '999999999999999999', user, 'interaction-9', { now, pick }));
const pgValues = new Map(); let released = false;
const connection = { release: () => { released = true; }, query: async (sql, params) => {
  if (sql.includes('pg_advisory_')) return { rows: [] };
  if (sql.startsWith('SELECT value')) return { rows: pgValues.has(params[0]) ? [{ value: structuredClone(pgValues.get(params[0])) }] : [] };
  if (sql.startsWith('INSERT INTO')) { pgValues.set(params[0], JSON.parse(params[1])); return { rows: [] }; }
  throw Error('Unexpected query');
} };
const pgClient = { db: { connectionType: 'postgresql', isAvailable: () => true, db: { pool: {
  connect: async () => connection, query: async () => { throw Error('Query escaped the locked session: can deadlock a full connection pool'); },
} } } };
assert.equal((await eatFood(pgClient, guild, user, 'pg-interaction', { now, pick })).kind, 'meal');
assert.equal(released, true, 'locked database session is released');
console.log('Eat checks passed: rarity boundaries, discovery, duplicates, restart, concurrency, cooldown, storage and Beta isolation.');
