import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { request } from 'node:http';
process.env.NODE_ENV='test';
process.env.GUILD_ID='1533088766821007390';
process.env.BETA_GUILD_ID='1486680755869323388';
process.env.CLIENT_ID='1543159885854675024';
const {createDashboardAuth}=await import('../src/web/dashboardAuth.js');
const {createPublicDashboard}=await import('../src/web/publicDashboard.js');
const origin='https://dashboard.example',owner='1127099544560205914';
const store=new Map();
const member={id:owner,permissions:{has:()=>true}};
const guild={id:process.env.GUILD_ID,members:{fetch:async()=>member},channels:{cache:new Collection()},roles:{cache:new Collection()}};
const client={guilds:{cache:new Collection([[guild.id,guild]])},db:{get:async(k,f)=>structuredClone(store.get(k)??f),set:async(k,v)=>{store.set(k,structuredClone(v));return true;}}};
const auth=createDashboardAuth(client,{origin,clientSecret:'offline-oauth-secret',ownerIds:[owner],fetchImpl:async url=>new Response(JSON.stringify(url.includes('/token')?{access_token:'offline-token'}:{id:owner,username:'Owner'}),{headers:{'Content-Type':'application/json'}})});
const app=createPublicDashboard(client,auth,origin);
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const req=(path,options={})=>new Promise((resolve,reject)=>{
 const call=request(base+path,{method:options.method||'GET',headers:{host:'dashboard.example',...options.headers}},response=>{
  const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{
   const headers=new Headers();for(const [name,value] of Object.entries(response.headers))for(const item of Array.isArray(value)?value:[value])if(item!==undefined)headers.append(name,item);
   resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers}));
  });
 });call.on('error',reject);call.end(options.body);
});
try {
 assert.equal((await fetch(base+'/dashboard/api/prefix')).status,400,'untrusted host');
 for(const path of ['/health','/ready','/api','/other'])assert.equal((await req(path)).status,404,'public app must not expose private routes');
 for(const path of ['/dashboard/api/prefix','/dashboard/api/releases?workspace=beta','/dashboard/auth/access'])assert.equal((await req(path,{headers:{'Tailscale-User-Login':'owner','X-Forwarded-User':owner,'X-Dashboard-Private':'true'}})).status,401);
 assert.equal((await req('/dashboard/index.html')).status,302,'HTML requires session');
 assert.equal((await req('/dashboard/app.js')).status,302,'scripts require session');
 assert.equal((await req('/dashboard/auth/access/invites',{method:'POST',headers:{origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
 const login=await req('/dashboard/auth/login');assert.equal(login.status,302);
 const oauth=new URL(login.headers.get('location'));assert.equal(oauth.origin,'https://discord.com');assert.equal(oauth.searchParams.get('scope'),'identify');
 const stateCookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const callback=await req(`/dashboard/?code=offline-code&state=${oauth.searchParams.get('state')}`,{headers:{cookie:stateCookie}});assert.equal(callback.status,302);
 const session=callback.headers.getSetCookie().find(c=>c.startsWith('__Host-dexzu_session='));assert.ok(session.includes('Secure')&&session.includes('HttpOnly'));
 const cookie=session.split(';')[0];
 assert.equal((await req('/dashboard/',{headers:{cookie}})).status,200);
 assert.equal((await req('/dashboard/api/prefix',{headers:{cookie}})).status,200);
 const invite=await req('/dashboard/auth/access/invites',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify({userId:'223456789012345678',workspace:'beta',role:'viewer',hours:24})});
 assert.equal(invite.status,201,'real public app parses invite JSON before route');assert.ok((await invite.json()).url.startsWith(origin+'/dashboard/auth/invite?token='));
 assert.equal((await req('/dashboard/api/prefix',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{}'})).status,403,'missing Origin rejected');
 assert.equal((await req('/dashboard/api/prefix?workspace=beta&workspace=main',{headers:{cookie}})).status,400);
 assert.equal((await req('/dashboard/auth/session',{headers:{cookie}})).headers.get('Access-Control-Allow-Origin'),null);
 console.log('PASS: public listener isolation, host and Origin checks, forged headers, protected HTML/assets/APIs, real OAuth mount, cookie flags, invite JSON, workspace validation.');
}finally{await new Promise(resolve=>server.close(resolve));}
