import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/utils/database.js';
import { performStaffAction, getStaffState, handleStaffInteraction } from '../src/services/betaStaffService.js';
import { InteractionHelper } from '../src/utils/interactionHelper.js';
const gid='123456789012345678';
process.env.BETA_GUILD_ID=gid;
let state,writeFails=false,readFails=false,authorized=true,writes=0,dmEnabled=false,dmAttempts=0;
db.isAvailable=()=>true;
db.db={pool:{query:async()=>{if(readFails)throw Error('read failed');return {rows:state?[{value:structuredClone(state)}]:[]};}}};
db.set=async(k,value)=>{if(writeFails)return false;writes++;state=structuredClone(value);return true;};
const client={user:{displayAvatarURL:()=>undefined},db:{get:async()=>({features:{applications:true,leave:true,activity:true},dmUpdates:{applications:dmEnabled,leave:dmEnabled},staffRoleId:'223456789012345678'})}};
const reviewer={id:'reviewer',send:async()=>{dmAttempts++;throw Error('DM closed');},permissions:{has:()=>authorized},roles:{cache:{has:()=>false}}};
const guild={id:gid,members:{fetch:async opts=>opts?reviewer:new Map([['member',{id:'member',user:{bot:false},roles:{cache:{has:()=>true}}}]])},channels:{fetch:async()=>null}};
function reset(){state={applications:[{id:'app',userId:'member',status:'pending'}],leave:[],activityChecks:[]};writeFails=false;readFails=false;authorized=true;writes=0;dmEnabled=false;dmAttempts=0;}
const review=()=>performStaffAction({client,guild,actor:reviewer,action:'review',input:{id:'app',status:'approved'}});
test('review denied without reviewer permission',async()=>{reset();authorized=false;await assert.rejects(review);assert.equal(writes,0);});
test('failed write never commits review',async()=>{reset();writeFails=true;await assert.rejects(review);assert.equal(state.applications[0].status,'pending');});
test('failed reads never overwrite persisted state',async()=>{reset();readFails=true;await assert.rejects(review,/read failed/);assert.equal(writes,0);});
test('concurrent duplicate reviews commit only once',async()=>{reset();const results=await Promise.allSettled([review(),review()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(writes,1);});
test('concurrent activity starts create only one check',async()=>{reset();const start=()=>performStaffAction({client,guild,actor:reviewer,action:'activity-start',input:{hours:2}});const results=await Promise.allSettled([start(),start()]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(state.activityChecks.length,1);});
test('expired checks close on recovery and persist audit',async()=>{reset();state.activityChecks=[{id:'check',status:'open',createdAt:1,deadline:2,eligible:['a','b'],responses:['a']}];const result=await getStaffState(client,guild);assert.equal(result.activityChecks[0].status,'closed');assert.deepEqual(state.activityChecks[0].audit,{responded:['a'],missing:['b'],excluded:[]});});
test('non-beta state access rejected',async()=>{reset();await assert.rejects(()=>getStaffState(client,{id:'999999999999999999'}));assert.equal(writes,0);});
InteractionHelper.safeDefer=async()=>true;
InteractionHelper.safeReply=async(i,payload)=>payload;
function answerInteraction(){return {client,guild,user:reviewer,customId:'beta_staff:save:app:0',fields:{getTextInputValue:()=> 'Answer'}};}
test('application answer checks owner before write',async()=>{reset();Object.assign(state.applications[0],{status:'draft',questions:[{label:'Question',required:true}],answers:[]});await assert.rejects(()=>handleStaffInteraction(answerInteraction()));assert.equal(writes,0);});
test('two concurrent final answers submit exactly once',async()=>{reset();Object.assign(state.applications[0],{userId:'reviewer',status:'draft',questions:[{label:'Question',required:true}],answers:[]});const results=await Promise.allSettled([handleStaffInteraction(answerInteraction()),handleStaffInteraction(answerInteraction())]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.deepEqual(state.applications[0].answers,['Answer']);assert.equal(state.applications[0].status,'pending');assert.equal(writes,1);});
test('late activity responses cannot reopen expired check',async()=>{reset();state.activityChecks=[{id:'check',status:'open',createdAt:1,deadline:2,eligible:['reviewer'],responses:[]}];await assert.rejects(()=>handleStaffInteraction({...answerInteraction(),customId:'beta_staff:respond:check'}));assert.equal(writes,0);});
test('cancelled application reuses its private channel, and rapid restart is limited',async()=>{
 reset();state.applications=[{id:'old',userId:'reviewer',status:'cancelled',channelId:'channel',createdAt:Date.now()-120000}];
 let created=0,sent=0;
 const previous=guild.channels;
 const channel={id:'channel',guild,isTextBased:()=>true,permissionsFor:()=>({has:()=>false}),send:async()=>{sent++;}};
 guild.channels={fetch:async()=>channel,create:async()=>{created++;return channel;}};
 try{await handleStaffInteraction({...answerInteraction(),customId:'beta_staff:start'});assert.equal(created,0);assert.equal(sent,1);const app=state.applications.at(-1);app.status='cancelled';await assert.rejects(()=>handleStaffInteraction({...answerInteraction(),customId:'beta_staff:start'}),/minute/);assert.equal(created,0);}finally{guild.channels=previous;}
});
test('deleted draft channel is recreated with saved answers intact',async()=>{
 reset();state.applications=[{id:'app',userId:'reviewer',status:'draft',channelId:'gone',createdAt:1,questions:[{label:'First',required:true},{label:'Next',required:true}],answers:['Saved answer']}];
 const previous=guild.channels;let created=0;
 guild.channels={fetch:async()=>null,create:async()=>{created++;return {id:'replacement',guild,isTextBased:()=>true,permissionsFor:()=>({has:()=>false}),send:async()=>{}};}};
 try{await handleStaffInteraction({...answerInteraction(),customId:'beta_staff:start'});assert.equal(created,1);assert.equal(state.applications[0].channelId,'replacement');assert.deepEqual(state.applications[0].answers,['Saved answer']);}finally{guild.channels=previous;}
});
test('changed public application channel never receives submitted answer',async()=>{
 reset();Object.assign(state.applications[0],{userId:'reviewer',status:'draft',channelId:'channel',questions:[{label:'Question',required:true}],answers:[]});
 const previous=guild.channels;let sends=0;
 guild.channels={fetch:async()=>({guild,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async()=>{sends++;}})};
 try{await handleStaffInteraction(answerInteraction());assert.equal(sends,0);assert.equal(state.applications[0].status,'pending');}finally{guild.channels=previous;}
});
test('activity closure edits the original Discord message with three audit lists',async()=>{
 reset();state.activityChecks=[{id:'check',status:'open',createdAt:1,deadline:Date.now()+100000,eligible:['a','b','c'],responses:['a'],channelId:'channel',messageId:'message'}];state.leave=[{userId:'c',status:'approved',startAt:2,endAt:Date.now()+100000}];
 const previous=guild.channels;let payload;
 guild.channels={fetch:async()=>({messages:{fetch:async id=>{assert.equal(id,'message');return {edit:async p=>{payload=p;}};}}})};
 try{const result=await performStaffAction({client,guild,actor:reviewer,action:'activity-end',input:{id:'check'}});assert.equal(result.published,true);assert.deepEqual(payload.components,[]);assert.match(payload.embeds[0].data.description,/Responded \(1\)/);assert.match(payload.embeds[0].data.description,/Missing \(1\)/);assert.match(payload.embeds[0].data.description,/approved leave \(1\)/);}finally{guild.channels=previous;}
});
test('disabled submission DMs are not sent',async()=>{
 reset();Object.assign(state.applications[0],{userId:'reviewer',status:'draft',questions:[{label:'Question',required:true}],answers:[]});
 await handleStaffInteraction(answerInteraction());assert.equal(dmAttempts,0);assert.equal(state.applications[0].status,'pending');
});
test('closed application submission DM reports failure while preserving submission',async()=>{
 reset();dmEnabled=true;Object.assign(state.applications[0],{userId:'reviewer',status:'draft',questions:[{label:'Question',required:true}],answers:[]});
 const result=await handleStaffInteraction(answerInteraction());assert.equal(dmAttempts,1);assert.equal(state.applications[0].status,'pending');assert.match(result.content,/DM.*could not be delivered/);
});
test('closed leave submission DM reports failure while preserving request',async()=>{
 reset();dmEnabled=true;const result=await handleStaffInteraction({...answerInteraction(),customId:'beta_staff:leave-submit',fields:{getTextInputValue:name=>name==='days'?'2':'Away'}});
 assert.equal(dmAttempts,1);assert.equal(state.leave[0].status,'pending');assert.match(result.content,/DM.*could not be delivered/);
});
