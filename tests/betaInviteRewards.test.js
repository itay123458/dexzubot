import test from 'node:test';
import assert from 'node:assert/strict';
const {pgDb}=await import('../src/utils/postgresDatabase.js');
pgDb.isAvailable=()=>true;
pgDb.pool={connect:async()=>({query:async()=>({rows:[]}),release(){}})};
const module = await import('../src/services/betaInviteRewardsStore.js').catch(() => ({}));
const now = 2_000_000_000_000;
const config = { minAccountDays: 7, minimumStayHours: 24, milestones: [{invites:2,coins:250},{invites:5,coins:700}] };
test('only a single observed one-use invite increase can be attributed', () => {
  assert.equal(typeof module.findRewardInviter, 'function');
  const before = [{code:'a',uses:0,inviterId:'owner'}];
  assert.equal(module.findRewardInviter(before,[{code:'a',uses:1,inviterId:'owner'}]),'owner');
  assert.equal(module.findRewardInviter(before,[{code:'a',uses:2,inviterId:'owner'}]),null);
  assert.equal(module.findRewardInviter(before,[{code:'new',uses:1,inviterId:'owner'}]),null);
  assert.equal(module.findRewardInviter(before,[]),null);
});
test('rejoins, bots, self-invites and new accounts never earn credit', () => {
  assert.equal(typeof module.recordRewardJoin, 'function');
  const state = {members:{},claims:{}};
  const member = {id:'member', user:{bot:false,createdTimestamp:now-8*86400000},joinedTimestamp:now};
  module.recordRewardJoin(state,member,'owner',config,now);
  assert.equal(state.members.member.inviterId,'owner');
  state.members.member.leftAt = now+1;
  module.recordRewardJoin(state,member,'owner',config,now+2);
  assert.equal(state.members.member.inviterId,null);
  for (const [id,user,owner] of [['bot',{bot:true,createdTimestamp:0},'owner'],['self',{createdTimestamp:0},'self'],['new',{createdTimestamp:now},'owner']]) {
    module.recordRewardJoin(state,{id,user,joinedTimestamp:now},owner,config,now);
    assert.equal(state.members[id].inviterId,null);
  }
});
test('retained qualified invites unlock each cumulative milestone only once', () => {
  assert.equal(typeof module.summarizeRewards, 'function');
  const state={members:{},claims:{owner:{'2':{coins:250}}}};
  for(let n=0;n<5;n++) state.members[n]={inviterId:'owner',joinedAt:now-86400000,leftAt:null};
  const summary=module.summarizeRewards(state,'owner',config,now);
  assert.equal(summary.qualifiedInvites,5);
  assert.equal(summary.claimableCoins,700);
  state.members[0].leftAt=now;
  assert.equal(module.summarizeRewards(state,'owner',config,now).claimableCoins,0);
});

test('claim markers are withheld when wallet credit fails', async () => {
  assert.equal(typeof module.applyRewardClaim,'function');
  const state={members:{a:{inviterId:'owner',joinedAt:now-86400000},b:{inviterId:'owner',joinedAt:now-86400000}},claims:{}};
  await assert.rejects(module.applyRewardClaim(state,'owner',config,async()=>{throw new Error('wallet unavailable');},now), /wallet unavailable/);
  assert.deepEqual(state.claims,{});
  let total=0;
  const first=await module.applyRewardClaim(state,'owner',config,async(_id,amount)=>{total+=amount;},now);
  const retry=await module.applyRewardClaim(state,'owner',config,async(_id,amount)=>{total+=amount;},now);
  assert.equal(first.awardedCoins,250);
  assert.equal(retry.awardedCoins,0);
  assert.equal(total,250);
});

test('a failed ledger write rolls back and releases its database connection', async () => {
  const statements=[];
  const pool={connect:async()=>({query:async(sql)=>{
    statements.push(sql);
    if(sql.startsWith('SELECT value')) return {rows:[]};
    if(sql.startsWith('INSERT INTO') && sql.includes('(key,value')) throw new Error('disk full');
    return {rows:[]};
  },release(){statements.push('RELEASE');}})};
  await assert.rejects(module.createInviteRewardsStore(pool).transaction('guild',async()=>42),/disk full/);
  assert.ok(statements.includes('ROLLBACK'));
  assert.ok(!statements.includes('COMMIT'));
  assert.equal(statements.at(-1),'RELEASE');
});

test('live membership excludes departures and unseen rejoins; network errors do not become departures', async () => {
  assert.equal(typeof module.reconcileRewardMembers,'function');
  const state={members:{gone:{inviterId:'owner',joinedAt:100},rejoined:{inviterId:'owner',joinedAt:100}},claims:{}};
  const guild={members:{fetch:async({user})=>{if(user==='gone') throw Object.assign(new Error('unknown'),{code:10007});return {joinedTimestamp:200,user:{bot:false}};}}};
  await module.reconcileRewardMembers(state,guild,'owner',now);
  assert.equal(state.members.gone.leftAt,now);
  assert.equal(state.members.rejoined.inviterId,null);
  const networkState={members:{known:{inviterId:'owner',joinedAt:100}},claims:{}};
  await assert.rejects(module.reconcileRewardMembers(networkState,{members:{fetch:async()=>{throw new Error('timeout');}}},'owner',now),/timeout/);
  assert.equal(networkState.members.known.leftAt,undefined);
});

test('missing invite usage counters cannot manufacture one invite', () => {
  assert.equal(module.findRewardInviter([{code:'a',uses:null,inviterId:'owner'}],[{code:'a',uses:1,inviterId:'owner'}]),null);
});

test('concurrent claims, store recreation, and failed commits preserve exactly one reward', async () => {
  // Transactional database double: executes the adapter's SQL transaction boundaries,
  // advisory lock, wallet increment, and ledger writes with isolated pending changes.
  let persisted={members:{a:{inviterId:'owner',joinedAt:now-86400000},b:{inviterId:'owner',joinedAt:now-86400000}},claims:{}};
  let wallet=0, tail=Promise.resolve(), failSave=true;
  const pool={connect:async()=>{
    let draft, draftWallet, unlock;
    return {async query(sql,params=[]) {
      if(sql==='BEGIN') return {rows:[]};
      if(sql.includes('pg_advisory_xact_lock')) {
        const previous=tail; tail=new Promise(resolve=>{unlock=resolve;}); await previous;
        draft=structuredClone(persisted); draftWallet=wallet;
      } else if(sql.startsWith('SELECT value')) return {rows:[{value:draft}]};
      else if(sql.startsWith('UPDATE ') && sql.includes('balance = balance +')) draftWallet+=params[2];
      else if(sql.startsWith('INSERT INTO') && sql.includes('(key,value')) {
        if(failSave) {failSave=false; throw new Error('write failed');}
        draft=JSON.parse(params[1]);
      } else if(sql==='COMMIT') {persisted=draft;wallet=draftWallet;unlock();unlock=null;}
      else if(sql==='ROLLBACK') {unlock?.();unlock=null;}
      return {rows:[]};
    },release(){unlock?.();}};
  }};
  const claim=()=>module.createInviteRewardsStore(pool).transaction('guild',(state,credit)=>module.applyRewardClaim(state,'owner',config,credit,now));
  await assert.rejects(claim(),/write failed/);
  assert.equal(wallet,0);
  assert.deepEqual(persisted.claims,{});
  const results=await Promise.all([claim(),claim(),claim()]);
  assert.deepEqual(results.map(item=>item.awardedCoins).sort((a,b)=>a-b),[0,0,250]);
  assert.equal(wallet,250);
  assert.equal((await claim()).awardedCoins,0);
});

test('disabling tracking and explicit configuration resets invalidate the invite baseline', async () => {
  const service=await import('../src/services/betaInviteRewardsService.js');
  assert.equal(typeof service.resetInviteRewardBaseline,'function');
  const id='123456789012345678'; process.env.BETA_GUILD_ID=id;
  let enabled=true;
  const client={db:{get:async()=>({features:{inviteRewards:enabled}})},guilds:{cache:new Map()}};
  const guild={id,client,members:{fetch:async()=>new Map()},invites:{fetch:async()=>new Map([['code',{code:'code',uses:0,inviter:{id:'owner'}}]])}};
  client.guilds.cache.set(id,guild);
  await service.initializeInviteRewards(client);
  assert.equal(service.resetInviteRewardBaseline(client,id),true);
  await service.initializeInviteRewards(client);
  enabled=false;
  await assert.rejects(service.trackRewardJoin({guild,client}));
  assert.equal(service.resetInviteRewardBaseline(client,id),false);
});

test('configuration reset cannot be undone by an older in-flight baseline fetch', async () => {
 const service=await import('../src/services/betaInviteRewardsService.js');
 const id='123456789012345678'; process.env.BETA_GUILD_ID=id;
 let release,entered;const started=new Promise(resolve=>{entered=resolve;});
 const client={db:{get:async()=>({features:{inviteRewards:true}})},guilds:{cache:new Map()}};
 const guild={id,client,members:{fetch:async()=>new Map()},invites:{fetch:async()=>{entered();return new Promise(resolve=>{release=()=>resolve(new Map());});}}};
 client.guilds.cache.set(id,guild);
 const init=service.initializeInviteRewards(client);await started;
 service.resetInviteRewardBaseline(client,id);release();await init;
 assert.equal(service.resetInviteRewardBaseline(client,id),false);
});

test('baseline records existing members without replacing earned attribution and prevents rejoin credit',()=>{
 assert.equal(typeof module.seedExistingRewardMembers,'function');
 const state={members:{tracked:{inviterId:'owner',joinedAt:1}},claims:{}};
 module.seedExistingRewardMembers(state,[{id:'old',joinedTimestamp:100},{id:'tracked',joinedTimestamp:1}]);
 assert.equal(state.members.tracked.inviterId,'owner');
 module.recordRewardJoin(state,{id:'old',joinedTimestamp:now,user:{createdTimestamp:0}},'owner',config,now);
 assert.equal(state.members.old.inviterId,null);
});
