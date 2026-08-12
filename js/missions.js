"use strict";
/* ================= ログインボーナス・任務・実績 ================= */

/* ---- ログインボーナス(7日サイクル) ----
   v3.7.0: 毎日最低🎫1=来るだけで毎日1回はガチャが引ける
   v4.13.0: 7日目に🧊フリーズ1個(連続学習の保険・週1ペースで補充) */
const LOGIN_BONUS=[{t:1,g:200},{t:1,g:300},{t:2},{t:1,g:500},{t:2},{t:1,g:800},{t:3,g:1000,f:1}];
function rewardText(r){
  const p=[];
  if(r.g) p.push("🪙"+r.g);
  if(r.t) p.push("🎫"+r.t);
  if(r.f) p.push("🧊"+r.f);
  return p.join(" ");
}
function grantReward(r){
  if(r.g) G.gold+=r.g;
  if(r.t) G.tickets+=r.t;
  if(r.f) G.frz=Math.min(FRZ_MAX, (G.frz||0)+r.f); // フリーズは上限あり(貯め込み防止)
}

function checkLogin(){
  const k=todayKey();
  const gift=!G.gift10;               // 初回プレゼント(10連分チケット)未受取か
  const newDay=G.login.last!==k;
  if(!gift && !newDay) return;
  if(gift){ G.gift10=1; G.tickets+=10; }
  let r=null;
  if(newDay){
    G.login.last=k;
    G.login.day=(G.login.day%7)+1;
    r=LOGIN_BONUS[G.login.day-1];
    grantReward(r);
  }
  saveG(); refreshHeader();
  openModal('<h3>🎁 '+(newDay?"ログインボーナス":"プレゼント")+'</h3>'+
    (gift? '<div class="giftbox">✨ はじめまして記念<br><b style="font-size:18px">🎫10(10連ガチャ分)</b> をプレゼント!</div>':'')+
    (newDay?
      '<div class="small">'+G.login.day+'日目の報酬: <b style="color:var(--accent)">'+rewardText(r)+'</b></div>'+
      '<div class="lgrid">'+LOGIN_BONUS.map((b,i)=>{
        const day=i+1;
        const cls=day<G.login.day?" got":(day===G.login.day?" now":"");
        return '<div class="lday'+cls+'"><div class="ln">'+day+'日目</div><div class="lr">'+rewardText(b)+'</div></div>';
      }).join("")+'</div>'+
      '<div class="small" style="margin-top:8px">🧊=連続学習フリーズ: 学習できなかった日を自動で埋めて連続記録を守る(いま '+(G.frz||0)+'/'+FRZ_MAX+'個)</div>' : '')+
    '<div class="row" style="justify-content:center"><button class="btn primary" style="flex:1" data-close>受け取る</button></div>');
}

/* ---- 任務定義 ----
   v4.6.0 通貨の分離: 🎫(限定召喚)は学習系の任務・実績だけが源泉。
   冒険・ガチャ系の🎫報酬はすべて🪙(恒常召喚)へ変換し、額も増やした */
const DAILY_DEFS=[
  {id:"da", name:"クイズに20問答える",        target:20, cur:d=>d.a,     rew:{g:150}},
  {id:"dc", name:"クイズで10問正解する",      target:10, cur:d=>d.c,     rew:{t:1}},
  {id:"dc2",name:"クイズで30問正解する",      target:30, cur:d=>d.c,     rew:{t:2}},
  {id:"dk", name:"カードを5枚入手する",       target:5,  cur:d=>d.card,  rew:{g:200}},
  {id:"dr", name:"ダンジョンに1回挑む",       target:1,  cur:d=>d.run,   rew:{g:300}},
  {id:"dl", name:"ダンジョンを1回クリアする", target:1,  cur:d=>d.clear, rew:{g:1000}},
];
const WEEKLY_DEFS=[
  {id:"wa", name:"クイズに150問答える",       target:150, cur:w=>w.a,     rew:{g:800}},
  {id:"wc", name:"クイズで80問正解する",      target:80,  cur:w=>w.c,     rew:{t:3}},
  {id:"wc2",name:"クイズで300問正解する",     target:300, cur:w=>w.c,     rew:{t:8}},
  {id:"wm", name:"カードを5回重ねる",         target:5,   cur:w=>w.merge, rew:{t:1}},
  {id:"wl", name:"ダンジョンを5回クリアする", target:5,   cur:w=>w.clear, rew:{g:2000}},
  {id:"wp", name:"ガチャを3回引く",           target:3,   cur:w=>w.pull,  rew:{g:1000}},
];
/* 実績(段階制)。学習系(正解・覚えた・カード)は🎫/冒険・ガチャ系は🪙 */
const ACH_DEFS=[
  {id:"acor", name:"累計正解",       cur:()=>G.counters.cor,
   tiers:[[25,{g:200}],[100,{t:1}],[300,{t:2}],[1000,{t:3}],[3000,{t:5}],[10000,{t:10}]]},
  {id:"amas", name:"覚えた単語",     cur:()=>{let n=0;for(const en in G.words){if(G.words[en][0]>=MASTER_BOX)n++;}return n;},
   tiers:[[10,{g:300}],[50,{t:2}],[150,{t:3}],[400,{t:5}]]},
  {id:"akind",name:"カードの種類",   cur:()=>new Set(Object.keys(G.inv).map(k=>parseKey(k).en)).size,
   tiers:[[10,{g:200}],[50,{t:1}],[200,{t:3}],[500,{t:5}]]},
  {id:"amrg", name:"累計重ね",       cur:()=>G.counters.merges,
   tiers:[[10,{g:300}],[50,{t:2}],[200,{t:4}],[600,{t:6}]]},
  {id:"aclr", name:"ダンジョン累計クリア", cur:()=>G.counters.clears,
   tiers:[[5,{g:500}],[25,{g:2000}],[100,{g:5000}]]},
  /* 単語のサバイバー(β): G.svはsv.jsが管理。モード撤去時もこの実績はcur=0で無害 */
  {id:"asv", name:"サバイバー生還", cur:()=>{let n=0; const c=(G.sv&&G.sv.clears)||{}; for(const k in c) n+=c[k]; return n;},
   tiers:[[1,{g:500}],[5,{g:2000}],[15,{g:5000}],[40,{g:10000}]]},
  {id:"ainf", name:"無限回廊 最深記録", cur:()=>G.inf.best,
   tiers:[[10,{g:500}],[30,{g:2000}],[60,{g:3000}],[100,{g:5000}]]},
  {id:"achr", name:"なかまの数",     cur:()=>Object.keys(G.chars).length,
   tiers:[[3,{g:300}],[6,{g:2000}],[10,{g:3000}],[16,{g:3000}],[24,{g:5000}],[32,{g:10000}]]},
  {id:"apul", name:"累計ガチャ",     cur:()=>G.counters.pulls,
   tiers:[[10,{g:500}],[50,{g:3000}],[150,{g:5000}],[400,{g:8000}],[1000,{g:15000}]]},
  {id:"adup", name:"突破の合計",     cur:()=>{let n=0;for(const id in G.chars)n+=G.chars[id].dup||0;return n;},
   tiers:[[5,{g:500}],[15,{g:2000}],[40,{g:3000}],[100,{g:5000}],[250,{g:10000}]]},
];

/* ---- 未受取があるか(ナビの赤点用) ---- */
function hasClaimable(){
  const d=dailyRec(), w=weeklyRec();
  for(const m of DAILY_DEFS){ if(!d.cl[m.id] && m.cur(d)>=m.target) return true; }
  for(const m of WEEKLY_DEFS){ if(!w.cl[m.id] && m.cur(w)>=m.target) return true; }
  for(const a of ACH_DEFS){
    const done=G.ach[a.id]||0;
    if(done<a.tiers.length && a.cur()>=a.tiers[done][0]) return true;
  }
  return false;
}
/* 受取可能な報酬の件数(ホームの表示用。実績は現時点で受け取れる段階まで数える) */
function claimableCount(){
  let n=0;
  const d=dailyRec();
  DAILY_DEFS.forEach(m=>{ if(!d.cl[m.id] && m.cur(d)>=m.target) n++; });
  if(!d.cl.all && DAILY_DEFS.every(m=>d.cl[m.id])) n++;
  const w=weeklyRec();
  WEEKLY_DEFS.forEach(m=>{ if(!w.cl[m.id] && m.cur(w)>=m.target) n++; });
  if(!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id])) n++;
  ACH_DEFS.forEach(a=>{
    let done=G.ach[a.id]||0;
    while(done<a.tiers.length && a.cur()>=a.tiers[done][0]){ n++; done++; }
  });
  return n;
}
function refreshMissionDot(){
  $("navHomeDot").classList.toggle("hidden", !hasClaimable());
  refreshMissionSegDots();
}

/* ---- 任務タブ描画 ---- */
let missionMode="daily";

function missionRow(name, cur, target, rew, claimed, onClaim){
  const done=cur>=target;
  const row=document.createElement("div");
  row.className="mrow";
  row.innerHTML='<div class="grow"><div class="mname">'+name+'</div>'+
    '<div class="mprog">'+fmt(Math.min(cur,target))+' / '+fmt(target)+'</div>'+
    '<div class="mbar"><i style="width:'+Math.min(100,100*cur/target)+'%"></i></div></div>'+
    '<div class="mrew">'+rewardText(rew)+'</div>'+
    (claimed? '<span class="done">受取済</span>'
     : '<button class="claimbtn" '+(done?"":"disabled")+'>受け取る</button>');
  if(!claimed && done) row.querySelector("button").onclick=onClaim;
  return row;
}

/* デイリー・ウィークリー・実績を横断してすべて受け取る */
function claimAllCurrent(){
  const got={g:0,t:0}; let n=0;
  const add=r=>{ got.g+=r.g||0; got.t+=r.t||0; n++; grantReward(r); };
  const d=dailyRec();
  DAILY_DEFS.forEach(m=>{ if(!d.cl[m.id] && m.cur(d)>=m.target){ d.cl[m.id]=1; add(m.rew); } });
  if(!d.cl.all && DAILY_DEFS.every(m=>d.cl[m.id])){ d.cl.all=1; add({t:1}); }
  const w=weeklyRec();
  WEEKLY_DEFS.forEach(m=>{ if(!w.cl[m.id] && m.cur(w)>=m.target){ w.cl[m.id]=1; add(m.rew); } });
  if(!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id])){ w.cl.all=1; add({t:3}); }
  ACH_DEFS.forEach(a=>{
    let done=G.ach[a.id]||0;
    while(done<a.tiers.length && a.cur()>=a.tiers[done][0]){ add(a.tiers[done][1]); done++; }
    G.ach[a.id]=done;
  });
  if(!n) return;
  saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
  toast("すべて受け取った: "+rewardText(got));
}
/* グループごとの受取可能判定(セグメントの通知バッジ用) */
function claimableDaily(){
  const d=dailyRec();
  return DAILY_DEFS.some(m=>!d.cl[m.id] && m.cur(d)>=m.target) ||
    (!d.cl.all && DAILY_DEFS.every(m=>d.cl[m.id]));
}
function claimableWeekly(){
  const w=weeklyRec();
  return WEEKLY_DEFS.some(m=>!w.cl[m.id] && m.cur(w)>=m.target) ||
    (!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id]));
}
function claimableAch(){
  return ACH_DEFS.some(a=>{
    const done=G.ach[a.id]||0;
    return done<a.tiers.length && a.cur()>=a.tiers[done][0];
  });
}
function refreshMissionSegDots(){
  if(!$("segDotD")) return;
  $("segDotD").classList.toggle("hidden", !claimableDaily());
  $("segDotW").classList.toggle("hidden", !claimableWeekly());
  $("segDotA").classList.toggle("hidden", !claimableAch());
}

function renderMissions(){
  refreshMissionSegDots();
  const box=$("missionList"); box.innerHTML="";
  if(hasClaimable()){
    const r=document.createElement("div");
    r.style.cssText="padding:4px 0 10px; border-bottom:1px solid var(--line)";
    r.innerHTML='<button class="claimbtn" style="width:100%" id="claimAllBtn">✨ すべて受け取る(3タブ分)</button>';
    r.querySelector("button").onclick=claimAllCurrent;
    box.appendChild(r);
  }
  if(missionMode==="daily"){
    const d=dailyRec();
    DAILY_DEFS.forEach(m=>{
      box.appendChild(missionRow(m.name, m.cur(d), m.target, m.rew, !!d.cl[m.id], ()=>{
        d.cl[m.id]=1; grantReward(m.rew); saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
        toast(rewardText(m.rew)+" を受け取った");
      }));
    });
    // 全達成ボーナス
    const all=DAILY_DEFS.every(m=>d.cl[m.id]);
    box.appendChild(missionRow("デイリー全達成ボーナス",
      DAILY_DEFS.filter(m=>d.cl[m.id]).length, DAILY_DEFS.length, {t:1}, !!d.cl.all, ()=>{
        d.cl.all=1; grantReward({t:1}); saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
        toast("🎫1 を受け取った");
      }));
  }else if(missionMode==="weekly"){
    const w=weeklyRec();
    WEEKLY_DEFS.forEach(m=>{
      box.appendChild(missionRow(m.name, m.cur(w), m.target, m.rew, !!w.cl[m.id], ()=>{
        w.cl[m.id]=1; grantReward(m.rew); saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
        toast(rewardText(m.rew)+" を受け取った");
      }));
    });
    box.appendChild(missionRow("ウィークリー全達成ボーナス",
      WEEKLY_DEFS.filter(m=>w.cl[m.id]).length, WEEKLY_DEFS.length, {t:3}, !!w.cl.all, ()=>{
        w.cl.all=1; grantReward({t:3}); saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
        toast("🎫3 を受け取った");
      }));
  }else{
    ACH_DEFS.forEach(a=>{
      const done=G.ach[a.id]||0;
      const cur=a.cur();
      if(done>=a.tiers.length){
        box.appendChild(missionRow(a.name+" (全段階達成)", 1, 1, {}, true, null));
        return;
      }
      const [target, rew]=a.tiers[done];
      box.appendChild(missionRow(a.name+" "+RAR_STARS[Math.min(done,4)]+"", cur, target, rew, false, ()=>{
        if(cur<target) return;
        G.ach[a.id]=done+1; grantReward(rew); saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
        toast(rewardText(rew)+" を受け取った");
      }));
    });
  }
}

$("missionSeg").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{
    $("missionSeg").querySelectorAll("button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); missionMode=b.dataset.m; renderMissions();
  };
});
