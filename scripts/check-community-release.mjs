import assert from 'node:assert/strict';
process.env.GUILD_ID='1533088766821007390';process.env.BETA_GUILD_ID='1486680755869323388';
const {getCommunityConfig,saveCommunityConfig}=await import('../src/services/communityBetaService.js');
const {loadEmbedMotion,motionArtwork,saveEmbedMotion,embedMotionKey}=await import('../src/services/embedMotionService.js');
const {isSlashCommandEnabled}=await import('../src/config/commands/slashCommandCategories.js');
const main=process.env.GUILD_ID,beta=process.env.BETA_GUILD_ID,store=new Map();
const client={db:{get:async key=>store.get(key),set:async(key,value)=>{store.set(key,value);return true;}}};
assert.equal((await getCommunityConfig(client,main)).features.applications,false);
assert.equal((await getCommunityConfig(client,beta)).features.applications,false);
await assert.rejects(getCommunityConfig(client,'999999999999999999'));
await saveCommunityConfig(client,{id:main,roles:{fetch:async()=>{},cache:new Map()},channels:{}},{dmUpdates:{tickets:true}});
assert.equal((await getCommunityConfig(client,beta)).dmUpdates.tickets,false);
const assets={enabled:true,thumbnailUrl:'https://cdn.discordapp.com/attachments/123/456/dexzu-motion-avatar.gif',bannerUrl:'https://cdn.discordapp.com/attachments/123/457/dexzu-motion-giveaway.gif'};
store.set(embedMotionKey(main),assets);store.set(embedMotionKey(beta),assets);
await loadEmbedMotion(client);assert.ok(motionArtwork(main));assert.ok(motionArtwork(beta));
await saveEmbedMotion(client,main,false);assert.equal(motionArtwork(main),null);assert.ok(motionArtwork(beta));
assert.equal(motionArtwork('999999999999999999'),null);
for(const name of ['invite-rewards','beta-staff','community-beta']) {
 const command=(await import(`../src/commands/Community/${name}.js`)).default;
 assert.equal(isSlashCommandEnabled({...command,category:'Community'},main),true);
 assert.equal(isSlashCommandEnabled({...command,category:'Community'},'999999999999999999'),false);
}
for(const [name,legacy] of [['staff','beta-staff'],['community','community-beta']]) {
 const command=(await import(`../src/commands/Community/${name}.js`)).default;
 const old=(await import(`../src/commands/Community/${legacy}.js`)).default;
 assert.equal(command.data.toJSON().name,name);assert.equal(old.data.toJSON().name,legacy);
 assert.deepEqual(command.data.toJSON().options,old.data.toJSON().options);
}
console.log('Community release passed: configured guilds only, isolated settings, independent motion and command registration.');
