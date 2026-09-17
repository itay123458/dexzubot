import assert from 'node:assert/strict';
process.env.GUILD_ID='1533088766821007390';process.env.BETA_GUILD_ID='1486680755869323388';
const {loadEmbedCrown,embedCrownKey}=await import('../src/services/embedCrownService.js');
const {loadEmbedMotion,embedMotionKey,saveEmbedMotion,runWithMessageGuild}=await import('../src/services/embedMotionService.js');
const {createEmbed,createMotionEmbed}=await import('../src/utils/embeds.js');
const main=process.env.GUILD_ID,beta=process.env.BETA_GUILD_ID;
const store=new Map([[embedCrownKey,{id:'123456789012345678',name:'dexzu_crown',animated:true}]]);
for(const id of [main,beta])store.set(embedMotionKey(id),{enabled:true,thumbnailUrl:'https://cdn.discordapp.com/attachments/123/456/dexzu-motion-avatar.gif',bannerUrl:'https://cdn.discordapp.com/attachments/123/456/dexzu-motion-giveaway.gif'});
const client={db:{get:async key=>store.get(key),set:async(key,value)=>store.set(key,value)}};
await loadEmbedMotion(client);await loadEmbedCrown(client);
for(const id of [main,beta]) {
 const title=createEmbed({guildId:id,title:'Welcome'}).toJSON().title;
 assert.match(title,/^<a:dexzu_crown:123456789012345678> Welcome$/);
 assert.equal(createEmbed({guildId:id,title}).toJSON().title,title);
 assert.ok(createEmbed({guildId:id,title:'x'.repeat(256)}).toJSON().title.length<=256);
 assert.match(createMotionEmbed(id).setTitle('Next page').toJSON().title,/dexzu_crown/);
 assert.match(runWithMessageGuild(id,()=>createEmbed().setTitle('Chained').toJSON().title),/dexzu_crown/);
}
assert.equal(createEmbed({guildId:'999999999999999999',title:'Outside'}).toJSON().title,'Outside');
await saveEmbedMotion(client,main,false);assert.ok(!createEmbed({guildId:main,title:'Still'}).toJSON().title.includes('<a:'));
store.delete(embedCrownKey);await loadEmbedCrown(client);assert.equal(createEmbed({guildId:beta,title:'Fallback'}).toJSON().title,'Fallback');
console.log('Embed crown passed: both guilds, chained builders, title limits, no duplicates, motion off, missing asset.');
