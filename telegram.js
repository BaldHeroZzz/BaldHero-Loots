"use strict";
const fs = require("fs");
const path = require("path");
const PHT = "Asia/Manila";
const minutes = Math.max(1, Number(process.env.TELEGRAM_REPORT_MINUTES || 5));
const idleMinutes = Math.max(1, Number(process.env.TELEGRAM_NO_DROP_MINUTES || 10));
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const stamp = d => new Intl.DateTimeFormat("en-PH",{timeZone:PHT,month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(d || Date.now()));
const gild = i => /gildenscale/i.test((i.name || "") + " " + (i.rarity || ""));
const rare = i => gild(i) || ["ultimate","legendary"].includes(String(i.rarity || "").toLowerCase());
const emoji = i => { const r=String(i.rarity||"").toLowerCase(); if(r==="ultimate")return "🟥"; if(r==="legendary")return "🟨"; if(gild(i)){const n=(i.name||"").toLowerCase();return n.includes("mage")?"🟦":n.includes("warrior")?"🟥":n.includes("guardian")?"🟩":"🟪";} return ({epic:"🟣",rare:"🟦",uncommon:"🟩",common:"⬜"})[r]||"📦"; };
const flatten = rows => rows.flatMap(record => (record.items || []).map(item => ({...item,record,timestamp:record.timestamp || new Date().toISOString()})));
function createTelegramReporter({readDrops,dataDir}) {
  const token=process.env.TELEGRAM_BOT_TOKEN, chat=process.env.TELEGRAM_CHAT_ID;
  if(!token || !chat) return null;
  const statePath=path.join(dataDir,"telegram-state.json");
  let state={lastReportAt:Date.now(),noDropAlerted:false,dailyDate:null};
  try { if(fs.existsSync(statePath)) state={...state,...JSON.parse(fs.readFileSync(statePath,"utf8"))}; } catch(e){console.error("Telegram state:",e.message);}
  let offset=0, polling=false;
  const save=()=>{try{const tmp=statePath+".tmp";fs.writeFileSync(tmp,JSON.stringify(state,null,2));fs.renameSync(tmp,statePath);}catch(e){console.error("Telegram state save:",e.message);}};
  async function api(method,payload){const r=await fetch("https://api.telegram.org/bot"+token+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.description||"Telegram API error");return j.result;}
  async function send(text){try{await api("sendMessage",{chat_id:chat,text,parse_mode:"HTML",disable_web_page_preview:true});}catch(e){console.error("Telegram send:",e.message);}}
  function rareText(record,item){const label=gild(item)?"GILDENSCALE":String(item.rarity||"RARE").toUpperCase();return [emoji(item)+" <b>"+label+" DROP DETECTED</b> "+emoji(item),"","<b>"+esc(item.name)+"</b>",item.category?"<i>"+esc(item.category)+"</i>":"",item.potential?"⚡ Power: <b>"+esc(item.potential)+"</b>":"",item.percent!=null?"🎯 Roll: <b>"+esc(item.percent)+"%</b>":"", "🏰 Dungeon: <b>"+esc(record.dungeon||"Unknown")+"</b>","🕒 "+esc(stamp(record.timestamp)),Number(item.quantity)>1?"📦 Quantity: <b>x"+Number(item.quantity)+"</b>":"",record.sourceUrl?'<a href="'+esc(record.sourceUrl)+'">Open Discord source</a>':""].filter(Boolean).join("\n");}
  async function notifyRecord(record){for(const item of record.items||[])if(rare(item))await send(rareText(record,item));state.noDropAlerted=false;save();}
  function counts(items){const c={ultimate:0,legendary:0,gildenscale:0,epic:0,rare:0,uncommon:0,common:0,total:0};for(const i of items){const q=Math.max(1,Number(i.quantity)||1);c.total+=q;if(gild(i))c.gildenscale+=q;else if(Object.prototype.hasOwnProperty.call(c,String(i.rarity||"common").toLowerCase()))c[String(i.rarity||"common").toLowerCase()]+=q;}return c;}
  function report(rows,title,from,to){const a=flatten(rows),c=counts(a);return "📊 <b>"+title+"</b>\n<i>"+esc(stamp(from))+" – "+esc(stamp(to))+" (PHT)</i>\n\n🏰 Dungeon records: <b>"+rows.length+"</b>\n📦 Total item drops: <b>"+c.total+"</b>\n💎 Rare drops: <b>"+(c.ultimate+c.legendary+c.gildenscale)+"</b>\n\n<b>DROP BREAKDOWN</b>\n🟥 Ultimate: "+c.ultimate+"\n🟨 Legendary: "+c.legendary+"\n🟪 Gildenscale: "+c.gildenscale+"\n🟣 Epic: "+c.epic+"\n🟦 Rare: "+c.rare+"\n🟩 Uncommon: "+c.uncommon+"\n⬜ Common: "+c.common;}
  async function tick(){const now=Date.now(),last=Number(state.lastReportAt||now);if(now-last>=minutes*60000){const rows=readDrops().filter(r=>{const t=new Date(r.timestamp||0).getTime();return t>last&&t<=now;});await send(report(rows,"DUNGEON ACTIVITY REPORT",last,now));state.lastReportAt=now;save();}
    const rows=readDrops(),items=flatten(rows);const newest=items.reduce((a,b)=>!a||new Date(b.timestamp)>new Date(a.timestamp)?b:a,null);if(!newest)return;
    if(now-new Date(newest.timestamp).getTime()>=idleMinutes*60000&&!state.noDropAlerted){await send("🚨 <b>DROP ACTIVITY WARNING</b>\n\nNo drops detected for <b>"+idleMinutes+" minutes</b>.\n🕒 Last drop: <b>"+esc(stamp(newest.timestamp))+"</b>\n⏱️ Time since last drop: <b>"+Math.floor((now-new Date(newest.timestamp).getTime())/60000)+" minutes</b>\n\nMonitoring continues.");state.noDropAlerted=true;save();}
    const day=new Intl.DateTimeFormat("en-CA",{timeZone:PHT,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const hour=Number(new Intl.DateTimeFormat("en-US",{timeZone:PHT,hour:"2-digit",hourCycle:"h23"}).format(new Date()));const min=Number(new Intl.DateTimeFormat("en-US",{timeZone:PHT,minute:"2-digit"}).format(new Date()));
    if(hour===0&&min<2&&state.dailyDate!==day){const todays=rows.filter(r=>new Intl.DateTimeFormat("en-CA",{timeZone:PHT,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(r.timestamp||0))===day);await send(report(todays,"DAILY LOOT SUMMARY",new Date(),new Date()));state.dailyDate=day;save();}
  }
  async function command(text){const cmd=text.trim().split(/\s+/)[0],rows=readDrops(),items=flatten(rows),c=counts(items);if(cmd==="/help"||cmd==="/start")return send("<b>⚔️ BALDHERO LOOT TRACKER</b>\n/stats — Overall statistics\n/drops — Latest drops\n/history — Recent dungeon runs\n/top — Most collected items\n/help — Commands");
    if(cmd==="/stats")return send("📊 <b>LOOT STATISTICS</b>\n🏰 Runs: <b>"+rows.length+"</b>\n📦 Items: <b>"+c.total+"</b>\n🟥 Ultimate: "+c.ultimate+"\n🟨 Legendary: "+c.legendary+"\n🟪 Gildenscale: "+c.gildenscale+"\n🟣 Epic: "+c.epic+"\n🟦 Rare: "+c.rare+"\n🟩 Uncommon: "+c.uncommon+"\n⬜ Common: "+c.common);
    if(cmd==="/drops")return send("<b>📦 LATEST DROPS</b>\n\n"+(items.slice(0,12).map(i=>emoji(i)+" "+esc(i.name)+" ×"+(i.quantity||1)+" — "+esc(stamp(i.timestamp))).join("\n")||"No drops yet."));
    if(cmd==="/history")return send("<b>🧾 RECENT DUNGEON HISTORY</b>\n\n"+(rows.slice(0,10).map(r=>"🏰 "+esc(r.dungeon||"Unknown")+" • "+esc(stamp(r.timestamp))+" • "+(r.items||[]).reduce((n,i)=>n+(Number(i.quantity)||1),0)+" items").join("\n")||"No history yet."));
    if(cmd==="/top"){const map=new Map();items.forEach(i=>map.set(i.name,(map.get(i.name)||0)+(Number(i.quantity)||1)));return send("<b>🏆 MOST COLLECTED ITEMS</b>\n\n"+([...map].sort((a,b)=>b[1]-a[1]).slice(0,10).map((x,i)=>(i+1)+". "+esc(x[0])+" ×"+x[1]).join("\n")||"No drops yet."));}
  }
  async function poll(){if(polling)return;polling=true;try{const updates=await api("getUpdates",{offset,timeout:0,allowed_updates:["message"]});for(const u of updates||[]){offset=Math.max(offset,u.update_id+1);if(u.message&&String(u.message.chat.id)===String(chat)&&u.message.text)await command(u.message.text);}}catch(e){console.error("Telegram polling:",e.message);}finally{polling=false;}}
  setInterval(()=>tick().catch(e=>console.error("Telegram tick:",e.message)),30000).unref();setInterval(()=>poll(),4000).unref();
  console.log("Telegram loot reporter enabled.");return {notifyRecord,send};
}
module.exports={createTelegramReporter};