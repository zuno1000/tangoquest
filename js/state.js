"use strict";
/* ================= 状態管理 ================= */
const KEY="tangoquest_v1";

const RAR_MULT=[1, 1.6, 2.5, 3.8, 5.5];
const RAR_STARS=["★","★★","★★★","★★★★","★★★★★"];
const POS_LABEL={v:"動詞", n:"名詞", adj:"形容詞", adv:"副詞"};
const POS_ROLE={v:"攻撃技", n:"装備", adj:"強化", adv:"フィールド"};

let G;
try{ G=JSON.parse(localStorage.getItem(KEY)) }catch(e){ G=null }
if(!G || typeof G!=="object") G={};
G.v=1;
G.mode=G.mode||"e2j";
G.words=G.words||{};   // en -> [box, due, correct, wrong, mastered, wrongStreak, lastCorrectAt]
G.days=G.days||{};     // ymd -> {a,c,m}
G.inv=G.inv||{};       // "en|rar|lv" -> 枚数
G.chars=G.chars||{};   // charId -> {dup}
G.party=G.party||{char:null, equip:{}};
G.party.equip=Object.assign(
  {weapon:null, armor:null, acc:null, buff1:null, buff2:null, field:null, skill1:null, skill2:null, skill3:null},
  G.party.equip||{});
G.gold=G.gold||0;
G.tickets=G.tickets||0;
G.dungeons=G.dungeons||{};   // id -> {clears, lastClearDay}
G.inf=G.inf||{best:0, run:null};
G.daily=G.daily||{};    // ymd -> {a,c,card,merge,run,clear, cl:{missionId:1}}
G.weekly=G.weekly||{};  // weekKey -> {a,c,merge,clear,pull, cl:{}}
G.counters=Object.assign({ans:0,cor:0,cards:0,merges:0,runs:0,clears:0,pulls:0}, G.counters||{});
G.ach=G.ach||{};        // achId -> 受取済みティア数
G.login=G.login||{last:null, day:0};
G.updatedAt=G.updatedAt||0;

function saveG(){
  G.updatedAt=Date.now();
  try{ localStorage.setItem(KEY, JSON.stringify(G)) }catch(e){}
}

function todayKey(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
/* 月曜始まりの週キー */
function weekKey(){
  const d=new Date();
  const day=(d.getDay()+6)%7; // 月=0
  const mon=new Date(d.getFullYear(), d.getMonth(), d.getDate()-day);
  return "w"+mon.getFullYear()+"-"+String(mon.getMonth()+1).padStart(2,"0")+"-"+String(mon.getDate()).padStart(2,"0");
}
function dayRec(){ const k=todayKey(); if(!G.days[k]) G.days[k]={a:0,c:0,m:0}; return G.days[k]; }
function dailyRec(){ const k=todayKey(); if(!G.daily[k]) G.daily[k]={a:0,c:0,card:0,merge:0,run:0,clear:0,cl:{}}; return G.daily[k]; }
function weeklyRec(){ const k=weekKey(); if(!G.weekly[k]) G.weekly[k]={a:0,c:0,merge:0,clear:0,pull:0,cl:{}}; return G.weekly[k]; }

/* 各種イベントの計上(累計・デイリー・ウィークリー) */
function track(ev, n){
  n=n||1;
  const d=dailyRec(), w=weeklyRec();
  switch(ev){
    case "ans":   G.counters.ans+=n;   d.a+=n; w.a+=n; break;
    case "cor":   G.counters.cor+=n;   d.c+=n; w.c+=n; break;
    case "card":  G.counters.cards+=n; d.card+=n; break;
    case "merge": G.counters.merges+=n; d.merge+=n; w.merge+=n; break;
    case "run":   G.counters.runs+=n;  d.run+=n; break;
    case "clear": G.counters.clears+=n; d.clear+=n; w.clear+=n; break;
    case "pull":  G.counters.pulls+=n; w.pull+=n; break;
  }
}

/* 古いデイリー/ウィークリー任務レコードの掃除(学習記録 G.days は残す) */
(function prune(){
  const cut=Date.now()-45*864e5;
  for(const k in G.daily){ const t=new Date(k).getTime(); if(t && t<cut) delete G.daily[k]; }
  for(const k in G.weekly){ const t=new Date(k.slice(1)).getTime(); if(t && t<cut) delete G.weekly[k]; }
})();

const byEn={}; WORDS.forEach(w=>byEn[w.en]=w);
