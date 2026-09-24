// Only run against a disposable QA database, never the deployed bot database.
import assert from 'node:assert/strict';
import pg from 'pg';
import { eatFood, getFoodCollection, chooseFood } from '../src/services/foodCollectionService.js';
if (process.env.EAT_QA_DATABASE !== 'disposable') throw Error('Set EAT_QA_DATABASE=disposable for this isolated check.');
process.env.BETA_GUILD_ID = '1486680755869323388';
const pool = new pg.Pool({ connectionString: process.env.EAT_QA_DATABASE_URL, max: 2, connectionTimeoutMillis: 3000 });
const client = { db: { connectionType: 'postgresql', isAvailable: () => true, db: { pool } } };
try {
  await pool.query('CREATE TABLE IF NOT EXISTS temp_data (key TEXT PRIMARY KEY, value JSONB, expires_at TIMESTAMPTZ)');
  const users = Array.from({ length: 8 }, (_, index) => String(100000000000000000n + BigInt(index)));
  const meals = await Promise.all(users.map(id => eatFood(client, process.env.BETA_GUILD_ID, id, `qa-${id}`, { pick: () => chooseFood(() => 0) })));
  assert.equal(meals.filter(meal => meal.kind === 'meal').length, 8, 'more users than pool slots must finish');
  const restored = await getFoodCollection({ ...client }, process.env.BETA_GUILD_ID, users[0]);
  assert.equal(restored.totalEaten, 1);
  assert.equal(restored.counts.pizza, 1);
  assert.equal((await eatFood(client, process.env.BETA_GUILD_ID, users[0], `qa-${users[0]}`)).foodId, 'pizza');
  console.log('Eat PostgreSQL checks passed: eight concurrent members on two connections, durable records and receipt replay.');
} finally { await pool.end(); }
