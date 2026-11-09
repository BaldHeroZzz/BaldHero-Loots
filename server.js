const express=require("express"),fs=require("fs"),path=require("path");
const {Client,GatewayIntentBits,Partials}=require("discord.js");
const app=express(),PORT=process.env.PORT||3000,DATA_DIR=process.env.DATA_DIR||path.join(__dirname,"data"),DATA_FILE=path.join(DATA_DIR,"drops.json");
fs.mkdirSync(DATA_DIR,{recursive:true});if(!fs.existsSync(DATA_FILE))fs.writeFileSync(DATA_FILE,"[]");
app.use(express.json({limit:"2mb"}));app.use(express.static(path.join(__dirname,"public")));
function readDrops(){try{const x=JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));return Array.isArray(x)?x:[]}catch(e){console.error(e);return[]}}
function writeDrops(rows){const tmp=DATA_FILE+".tmp";fs.writeFileSync(tmp,JSON.stringify(rows.slice(0,20000),null,2));fs.renameSync(tmp,DATA_FILE)}
const clean=s=>String(s||"").replace(/\u0000/g,"").trim();
function parseMessage(msg){
 const result=[];
 for(const e of (msg.embeds||[])){
  const fields=(e.fields||[]).map(f=>clean(f.name)+"\n"+clean(f.value)).join("\n");
  const text=[clean(e.title),clean(e.description),fields].filter(Boolean).join("\n");
  if(!/dungeon|drop|boss|session/i.test(text))continue;
  const dungeon=(text.match(/Dungeon\s*[:：]\s*([^\n]+)/i)||[])[1]||"";
  const boss=(text.match(/Boss\s*[:：]\s*([^\n]+)/i)||[])[1]||"";
  const accounts=Number((text.match(/Accounts?\s*[:：]\s*(\d+)/i)||[])[1]||0);
  const items=[],re=/(?:[🟣🟢🔵⚪🟡🔴]\s*)?([^,\n]+?),\s*(Ultimate|Legendary|Epic|Rare|Uncommon|Common)\s*[×x]\s*(\d+)(?:,\s*pot\s*([\d.]+\s*[KMBT]?)\s*(spell|physical)\s*\((\d+)%\))?/gi;
  let m;while((m=re.exec(text))!==null){const name=clean(m[1]).replace(/^[^\p{L}\p{N}]+/u,"");if(name)items.push({name,rarity:m[2],quantity:Math.max(1,Number(m[3])||1),potential:m[4]?m[4].replace(/\s+/g,"")+" "+m[5].toLowerCase():"",percent:m[6]?Number(m[6]):null})}
  if(!items.length&&!dungeon&&!boss)continue;
  result.push({id:msg.id+"-"+result.length,discordMessageId:msg.id,author:msg.author?.username||"Discord",timestamp:msg.createdAt?.toISOString?.()||new Date().toISOString(),title:clean(e.title)||"Dungeon Quest drops",dungeon,boss,accounts:accounts||null,items,cleared:(text.match(/(\d+\/\d+\s*cleared\s*\(\d+%\))/i)||[])[1]||"",bossWins:(text.match(/([^\n]*\d+\/\d+\s*won\s*\(\d+%\))/i)||[])[1]||"",rawText:text,sourceUrl:`https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.id}`});
 }
 return result;
}
app.get("/api/health",(_,res)=>res.json({ok:true,service:"DQR Drops 2"}));
app.get("/api/drops",(_,res)=>res.json(readDrops()));
app.listen(PORT,()=>console.log("DQR Drops 2 listening on "+PORT));
if(process.env.DISCORD_TOKEN&&process.env.DISCORD_CHANNEL_ID){
 const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],partials:[Partials.Channel,Partials.Message]});
 async function ingest(msg){try{const fresh=parseMessage(msg);if(!fresh.length)return;const old=readDrops(),ids=new Set(old.map(x=>x.id)),add=fresh.filter(x=>!ids.has(x.id));if(add.length){writeDrops([...add,...old]);console.log("Stored "+add.length+" records from "+msg.id)}}catch(e){console.error("Ingest error",e)}}
 client.once("ready",async()=>{console.log("Discord bot ready: "+client.user.tag);try{const ch=await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);if(!ch||!ch.isTextBased())throw Error("Channel unavailable");const history=await ch.messages.fetch({limit:100});for(const msg of [...history.values()].reverse())await ingest(msg);console.log("Backfill checked "+history.size+" messages")}catch(e){console.error("Channel read error",e.message)}});
 client.on("messageCreate",m=>{if(m.channelId===process.env.DISCORD_CHANNEL_ID)ingest(m)});
 client.on("messageUpdate",(_,m)=>{if(m.channelId===process.env.DISCORD_CHANNEL_ID)ingest(m)});
 client.login(process.env.DISCORD_TOKEN).catch(e=>console.error("Discord login failed",e.message));
}else console.log("Discord listener disabled: configure DISCORD_TOKEN and DISCORD_CHANNEL_ID");
