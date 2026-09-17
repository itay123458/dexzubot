import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../src/utils/database/economyRewards.js').catch(()=>({}));
test('stale economy snapshots preserve invite credits awarded after the read',()=>{
 assert.equal(typeof module.mergeInviteRewardCredits,'function');
 const current={wallet:350,bank:0,inviteRewardCredits:250};
 assert.deepEqual(module.mergeInviteRewardCredits(current,{wallet:120,bank:5,inviteRewardCredits:0}),{wallet:370,bank:5,inviteRewardCredits:250});
});
test('fresh writes and current snapshots can intentionally reset a wallet without resurrecting credits',()=>{
 assert.equal(typeof module.mergeInviteRewardCredits,'function');
 const current={wallet:350,inviteRewardCredits:250};
 assert.equal(module.mergeInviteRewardCredits(current,{wallet:0,inviteRewardCredits:250}).wallet,0);
 assert.deepEqual(module.mergeInviteRewardCredits(current,{wallet:0}),{wallet:0,inviteRewardCredits:250});
});
test('reward markers must remain safe nonnegative integers and cannot advance through ordinary writes',()=>{
 assert.equal(typeof module.mergeInviteRewardCredits,'function');
 for(const value of [-1,NaN,Infinity,'250',Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>module.mergeInviteRewardCredits({inviteRewardCredits:250},{wallet:1,inviteRewardCredits:value}));
 assert.throws(()=>module.mergeInviteRewardCredits({inviteRewardCredits:250},{wallet:1,inviteRewardCredits:500}));
});

test('economy persistence locks the row and writes merged wallet and marker together',async()=>{
 const calls=[];let committed;
 const pool={connect:async()=>({query:async(sql,params)=>{
  calls.push(sql);
  if(sql.startsWith('SELECT'))return {rows:[{data:{wallet:350,inviteRewardCredits:250}}]};
  if(sql.startsWith('UPDATE'))committed=params;
  return {rows:[]};
 },release(){calls.push('RELEASE');}})};
 await module.saveEconomyPreservingInviteCredits(pool,'economy','guild','user',{wallet:120,bank:5,inviteRewardCredits:0});
 assert.ok(calls.some(sql=>sql.includes('FOR UPDATE')));
 assert.equal(committed[2],370);assert.equal(committed[4].inviteRewardCredits,250);
 assert.equal(calls.at(-2),'COMMIT');assert.equal(calls.at(-1),'RELEASE');
});
test('failed economy update rolls back and does not report success',async()=>{
 const calls=[];
 const pool={connect:async()=>({query:async(sql)=>{
  calls.push(sql);
  if(sql.startsWith('SELECT'))return {rows:[{data:{}}]};
  if(sql.startsWith('UPDATE'))throw new Error('write failure');
  return {rows:[]};
 },release(){calls.push('RELEASE');}})};
 await assert.rejects(module.saveEconomyPreservingInviteCredits(pool,'economy','guild','user',{wallet:0}),/write failure/);
 assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.includes('COMMIT'));assert.equal(calls.at(-1),'RELEASE');
});

test('economy read snapshots carry the marker even before the first reward',async()=>{
 const {getEconomyData}=await import('../src/utils/economy.js');
 const guild='123456789012345678',user='223456789012345678';
 process.env.BETA_GUILD_ID=guild;
 assert.equal((await getEconomyData({db:{get:async()=>({wallet:100})}},guild,user)).inviteRewardCredits,0);
 assert.equal((await getEconomyData({db:{get:async()=>({wallet:350,inviteRewardCredits:250})}},guild,user)).inviteRewardCredits,250);
});

test('main economy writes retain the original upsert without beta row locks or marker defaults',async()=>{
 process.env.BETA_GUILD_ID='123456789012345678';
 const main='323456789012345678',user='223456789012345678';
 const {getEconomyData}=await import('../src/utils/economy.js');
 assert.equal(Object.hasOwn(await getEconomyData({db:{get:async()=>({wallet:100})}},main,user),'inviteRewardCredits'),false);
 const {PostgreSQLDatabase}=await import('../src/utils/postgresDatabase.js');
 const database=new PostgreSQLDatabase();const queries=[];
 database.pool={query:async(sql,params)=>{queries.push({sql,params});return {rows:[]};},connect:async()=>{throw new Error('Main must not use beta transaction');}};
 const data={wallet:100,bank:20};
 assert.equal(await database.setStructuredData({type:'economy',guildId:main,userId:user},data),true);
 assert.equal(queries.length,3);
 assert.ok(queries[2].sql.includes('balance = $3, bank = $4, data = $5'));
 assert.deepEqual(queries[2].params,[main,user,100,20,data]);
});
