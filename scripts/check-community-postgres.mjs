// Only the isolated local QA database. Never run against a deployment database.
import assert from 'node:assert/strict';
import express from 'express';
import {PermissionsBitField,PermissionFlagsBits} from 'discord.js';
const url=new URL(process.env.POSTGRES_URL || 'http://invalid');
if(url.hostname!=='127.0.0.1' || url.port!=='15432' || url.pathname!=='/dexzu_community_qa') throw new Error('This check requires the isolated local QA PostgreSQL database.');
process.env.BETA_GUILD_ID='1486680755869323388';
process.env.GUILD_ID='1533088766821007390';
const {initializeDatabase,db}=await import('../src/utils/database/wrapper.js');
const {pgDb}=await import('../src/utils/postgresDatabase.js');
const {createInviteRewardsStore,applyRewardClaim}=await import('../src/services/betaInviteRewardsStore.js');
const {getEconomyData,setEconomyData}=await import('../src/utils/economy.js');
const {getCommunityConfig,saveCommunityConfig}=await import('../src/services/communityBetaService.js');
const {getStaffState}=await import('../src/services/betaStaffService.js');
try {
 await initializeDatabase(); assert.equal(db.connectionType,'postgresql');
 const id=process.env.BETA_GUILD_ID,user='123456789012345678',client={db};
 await pgDb.pool.query('DELETE FROM temp_data WHERE key = ANY($1)',[[`guild:${id}:community-beta:config`,`guild:${id}:community-beta:panels`]]);
 const guild={id,roles:{fetch:async()=>{},cache:new Map()},channels:{fetch:async()=>null}};
 const config=await saveCommunityConfig(client,guild,{features:{inviteRewards:true},minimumStayHours:0});
 assert.equal((await getCommunityConfig(client,id)).features.inviteRewards,true);
 assert.deepEqual(await getStaffState(client,guild),{applications:[],leave:[],activityChecks:[]});
 // Reset only this disposable QA DB's account and ledger for repeatable checks.
 await pgDb.pool.query('DELETE FROM temp_data WHERE key=$1',[`beta_invite_rewards:${id}`]);
 await pgDb.pool.query('DELETE FROM economy WHERE guild_id=$1 AND user_id=$2',[id,user]);
 assert.equal(await setEconomyData(client,id,user,{wallet:100,bank:0}),true);
 const stale=await getEconomyData(client,id,user);
 const store=createInviteRewardsStore(pgDb.pool);
 await store.transaction(id,async state=>{for(let n=0;n<2;n++)state.members[`m${n}`]={inviterId:user,joinedAt:Date.now()-86400000,leftAt:null};});
 const results=await Promise.all([1,2].map(()=>store.transaction(id,(state,credit)=>applyRewardClaim(state,user,config,credit))));
 assert.equal(results.reduce((sum,r)=>sum+r.awardedCoins,0),250);
 assert.equal((await getEconomyData(client,id,user)).wallet,350);
 stale.wallet+=10; assert.equal(await setEconomyData(client,id,user,stale),true);
 assert.equal((await getEconomyData(client,id,user)).wallet,360,'A stale ordinary update must retain committed rewards');
 const reset=await getEconomyData(client,id,user); reset.wallet=0; await setEconomyData(client,id,user,reset);
 assert.equal((await getEconomyData(client,id,user)).wallet,0,'An explicit current reset remains absolute');
 const {registerDashboard}=await import('../src/web/dashboard.js');
 const {createSupportPanelMessage}=await import('../src/utils/brandPanels.js');
 const {createTicket}=await import('../src/services/ticket.js');
 const me={id:'222222222222222222',permissions:new PermissionsBitField(PermissionFlagsBits.Administrator),roles:{cache:new Map()}};
 client.user={id:me.id,displayAvatarURL:()=>null};guild.members={me,fetchMe:async()=>me,fetch:async()=>me};
 let posted=0;const messages=new Map();const channel={id:'333333333333333333',guild,name:'panel-test',type:0,isTextBased:()=>true,isThread:()=>false,permissionsFor:()=>me.permissions,messages:{fetch:async id=>messages.get(id)},send:async payload=>{posted++;const message={id:'444444444444444444',author:client.user,edit:async()=>message};messages.set(message.id,message);return message;}};
 guild.channels={cache:new Map([[channel.id,channel]]),fetch:async id=>id?channel:guild.channels.cache};
 client.guilds={cache:new Map([[id,guild],[process.env.GUILD_ID,{...guild,id:process.env.GUILD_ID}]])};
 const app=express();registerDashboard(app,client);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base=`http://127.0.0.1:${server.address().port}/dashboard/api/community-beta`;
 const post=(path,body,workspace='beta',origin=null)=>fetch(`${base}/${path}?workspace=${workspace}`,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
 try {
   assert.equal((await fetch(base+'?workspace=main')).status,403);
   assert.equal((await fetch(base+'?workspace=beta')).status,200);
   assert.equal((await post('settings',{features:{serverInfo:true}},'main')).status,403);
   assert.equal((await post('settings',{features:{serverInfo:true}},'beta','https://other.example')).status,403);
   assert.equal((await post('settings',{features:{serverInfo:'true'}})).status,400);
   assert.equal((await post('settings',{features:{applications:true},reviewChannelId:channel.id})).status,400,'Public review channels are rejected');
   guild.name='QA server';guild.createdTimestamp=1700000000000;guild.memberCount=5;
   assert.equal((await post('settings',{features:{serverInfo:true,ticketCategories:true},channels:{serverInfo:channel.id},ticketButtons:{support:true,report:false,partnership:true}})).status,200);
   const panel=JSON.stringify(createSupportPanelMessage({},null,null,id));assert.ok(panel.includes('create_ticket:beta:partnership'));assert.ok(!panel.includes('create_ticket:beta:report'));
   assert.ok(!JSON.stringify(createSupportPanelMessage({},null,null,process.env.GUILD_ID)).includes('create_ticket:beta'));
   guild.client=client;await assert.rejects(createTicket(guild,{id:user},null,'test','none','report'));assert.equal(posted,0);
   assert.equal((await post('publish',{kind:'serverInfo'})).status,200);
   assert.equal((await post('publish',{kind:'serverInfo'})).status,200);assert.equal(posted,1,'Publishing updates the existing panel');
   const query=pgDb.pool.query.bind(pgDb.pool);
   pgDb.pool.query=(sql,args)=>args?.[0]?.endsWith?.(':community-beta:panels')&&sql.startsWith('SELECT')?Promise.reject(new Error('QA read failure')):query(sql,args);
   try{assert.equal((await post('publish',{kind:'serverInfo'})).status,500);assert.equal(posted,1);}finally{pgDb.pool.query=query;}
 } finally {await new Promise(resolve=>server.close(resolve));}
 console.log('Real PostgreSQL passed: config/staff persistence, concurrent single payout, stale economy update, explicit reset.');
 console.log('Community API passed: beta and origin guards, validation, private-review guard, ticket toggles, idempotent publishing, failed pointer reads.');
} finally {await pgDb.disconnect();}
