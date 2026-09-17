import assert from 'node:assert/strict';
import express from 'express';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {getCommunityConfig} from '../src/services/communityBetaService.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
process.env.BETA_GUILD_ID='1486680755869323388';
let config=await getCommunityConfig({db:{get:async()=>null}},process.env.BETA_GUILD_ID);
const fixture=await(await fetch('http://127.0.0.1:13301/dashboard/api/state')).json();
const writes=[],errors=[];let fail=false,hold,release;
const staff={applications:[{id:'a1',userId:'111111111111111111',status:'pending',questions:[{label:'Why staff?'}],answers:['I like helping people.']}],leave:[],activityChecks:[]};
const app=express();app.use(express.json());
app.use('/dashboard/api',async(req,res)=>{
 const workspace=req.query.workspace||'main';
 if(req.path.startsWith('/community-beta')) {
  if(req.method==='POST') {
   writes.push({workspace,path:req.path,body:req.body});
   if(fail)return res.status(500).json({error:'QA save failed.'});
   if(req.path.endsWith('/settings')){const patch=req.body;config={...config,...patch,...Object.fromEntries(['features','dmUpdates','ticketButtons','channels','links'].map(k=>[k,{...config[k],...patch[k]}]))};return res.json({ok:true,config});}
   if(req.path.endsWith('/staff'))return res.json({ok:true,result:{notification:{sent:false,reason:'dm_closed'}}});
   return res.json({ok:true,result:{url:'https://discord.com/channels/1486680755869323388/1/2'}});
  }
  if(hold)await hold;
  return res.json({config,staff,roles:[{id:'123456789012345678',name:'Beta Staff'}],channels:[{id:'234567890123456789',name:'beta-panels'}]});
 }
 if(req.path==='/roles')return res.json({roles:[],autorole:{roleId:null}});
 if(req.path==='/releases')return res.json({releases:[]});
 if(req.path==='/embed-motion')return res.json({enabled:true,ready:true});
 if(req.path==='/prefix')return res.json({settings:fixture.prefixSettings});
 if(req.path==='/activity')return res.json({activity:[]});
 const data=structuredClone(fixture);data.workspace={key:workspace,available:['main','beta']};return res.json(data);
});
app.use('/dashboard',express.static(fileURLToPath(new URL('../src/web/public/',import.meta.url))));
const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 const base=`http://127.0.0.1:${server.address().port}/dashboard/`;
 await page.goto(base+'?workspace=beta#operations');await page.locator('#community-inviteRewards-enabled').waitFor();
 assert.equal(await page.locator('#community-forms form').count(),7);
 await page.locator('#community-inviteRewards-milestones').fill('2:999');
 await page.locator('#community-ticketCategories-enabled').check();await page.locator('#community-ticketCategories-report').uncheck();
 await page.locator('form[data-key="ticketCategories"] button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#community-status').textContent.includes('settings saved'));
 assert.equal(await page.locator('#community-inviteRewards-milestones').inputValue(),'2:999');assert.equal(config.ticketButtons.report,false);
 fail=true;await page.locator('form[data-key="inviteRewards"] button[type="submit"]').click();await page.getByText('QA save failed.',{exact:true}).first().waitFor();
 assert.equal(config.milestones[0].coins,250);assert.equal(await page.evaluate(()=>dirtyPages.has('operations')),true);
 fail=false;hold=new Promise(resolve=>{release=resolve;});await page.locator('#community-refresh').click();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dexzu-discard',{detail:'operations'})));release();hold=null;
 await page.waitForFunction(()=>!document.querySelector('#community-refresh').disabled);
 assert.match(await page.locator('#community-inviteRewards-milestones').inputValue(),/^2:250/);
 await page.locator('#community-a1-reason').fill('Reviewed privately');await page.locator('#community-refresh').click();await page.waitForFunction(()=>!document.querySelector('#community-refresh').disabled);
 assert.equal(await page.locator('#community-a1-reason').inputValue(),'Reviewed privately');
 await page.locator('#community-staff').getByRole('button',{name:'Approve',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#community-status').textContent.includes('DM could not be delivered'));
 const output=join(tmpdir(),'dexzu-community-qa');await mkdir(output,{recursive:true});
 await page.locator('#community-forms').screenshot({path:join(output,'desktop.png')});
 for(const width of [390,768]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
 await page.locator('form[data-key="ticketCategories"]').screenshot({path:join(output,'mobile.png')});
 await page.goto(base+'#operations');assert.equal(await page.locator('#beta-community-controls').isVisible(),false);
 assert.ok(writes.every(w=>w.workspace==='beta'));assert.deepEqual(errors,[]);
 console.log('Community UI passed: seven forms, isolated drafts, save failure, discard during refresh, review DM warning, mobile, reduced motion, Main hidden.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
