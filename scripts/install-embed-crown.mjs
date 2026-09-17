import {REST,Routes} from 'discord.js';
import {readFile} from 'node:fs/promises';
import {initializeDatabase,db} from '../src/utils/database/wrapper.js';
import {pgDb} from '../src/utils/postgresDatabase.js';
import {writeCommunityValue} from '../src/services/communityBetaService.js';
import {embedCrownKey} from '../src/services/embedCrownService.js';
if(process.env.GUILD_ID!=='1533088766821007390'||process.env.BETA_GUILD_ID!=='1486680755869323388')throw Error('Expected the configured DexzuBot servers.');
try {
 await initializeDatabase();
 const rest=new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
 const app=await rest.get(Routes.oauth2CurrentApplication());
 if(app.id!==process.env.CLIENT_ID)throw Error('Application mismatch');
 const {items}=await rest.get(Routes.applicationEmojis(app.id));
 const matches=items.filter(e=>e.name==='dexzu_crown');if(matches.length>1)throw Error('Duplicate crown emoji names');
 const image=await readFile(new URL('../src/assets/dexzu-blue-crown.gif',import.meta.url));
 if(image.length>256*1024||!/^GIF8[79]a$/.test(image.subarray(0,6).toString()))throw Error('Expected an emoji GIF under 256 KiB');
 const emoji=matches[0]||await rest.post(Routes.applicationEmojis(app.id),{body:{name:'dexzu_crown',image:`data:image/gif;base64,${image.toString('base64')}`}});
 if(!emoji.animated)throw Error('Existing crown is not animated');
 await writeCommunityValue({db},embedCrownKey,{id:emoji.id,name:emoji.name,animated:true});
 console.log(JSON.stringify({id:emoji.id,name:emoji.name,animated:emoji.animated,reused:!!matches.length}));
}finally{await pgDb.disconnect();}
