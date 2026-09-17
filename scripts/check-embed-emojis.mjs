import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
process.env.GUILD_ID='1533088766821007390';process.env.BETA_GUILD_ID='1486680755869323388';
const {embedEmojiAssets,embedEmojisKey}=await import('../src/config/embedEmojis.js');
const {loadEmbedCrown,embedCrownKey,embedCrownRevision}=await import('../src/services/embedCrownService.js');
const {loadEmbedMotion,embedMotionKey,saveEmbedMotion}=await import('../src/services/embedMotionService.js');
const {createEmbed}=await import('../src/utils/embeds.js');
const main=process.env.GUILD_ID,beta=process.env.BETA_GUILD_ID;
const emojis=embedEmojiAssets.map((e,i)=>({name:e.name,id:`12345678901234567${i}`,animated:true}));
const store=new Map([[embedCrownKey,{id:'223456789012345678',name:'dexzu_crown',animated:true}],[embedEmojisKey,emojis]]);
for(const id of [main,beta])store.set(embedMotionKey(id),{enabled:true,thumbnailUrl:'https://cdn.discordapp.com/attachments/123/456/dexzu-motion-avatar.gif',bannerUrl:'https://cdn.discordapp.com/attachments/123/456/dexzu-motion-giveaway.gif'});
const client={db:{get:async key=>store.get(key),set:async(key,value)=>store.set(key,value)}};
await loadEmbedMotion(client);await loadEmbedCrown(client);
for(const guildId of [main,beta]) {
 for(const [title,name] of [['Invite rewards','gift'],['Server guide','search'],['Staff application','starburst'],['Welcome','sparkles']]) {
  const result=createEmbed({guildId,title}).toJSON().title;
  assert.match(result,new RegExp(`<a:dexzu_${name}:`));
  assert.equal((result.match(/<a:/g)||[]).length,2);
  assert.equal(createEmbed({guildId,title:result}).toJSON().title,result);
 }
 assert.ok(!createEmbed({guildId,title:'Something Went Wrong'}).toJSON().title.includes('sparkles'));
 assert.ok(createEmbed({guildId,title:'x'.repeat(256)}).toJSON().title.length<=256);
 assert.ok(embedCrownRevision(guildId).includes(emojis[0].id));
}
assert.equal(createEmbed({guildId:'999999999999999999',title:'Welcome'}).toJSON().title,'Welcome');
await saveEmbedMotion(client,main,false);
assert.ok(!createEmbed({guildId:main,title:'Staff application'}).toJSON().title.includes('<a:'));
assert.ok(createEmbed({guildId:beta,title:'Staff application'}).toJSON().title.includes('<a:'));
store.set(embedEmojisKey,[{name:'dexzu_gift',id:'bad',animated:true}]);await loadEmbedCrown(client);
assert.equal(createEmbed({guildId:beta,title:'Invite rewards'}).toJSON().title,'<a:dexzu_crown:223456789012345678> Invite rewards');
for(const asset of embedEmojiAssets){const bytes=await readFile(new URL(`../src/assets/${asset.file}`,import.meta.url));assert.match(bytes.subarray(0,6).toString(),/^GIF8[79]a$/);assert.ok(bytes.length<=256*1024);}
console.log('Embed accents passed: routing, deduplication, title limits, guild isolation, animation toggle, invalid registry, asset sizes.');
