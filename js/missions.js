"use strict";
/* ================= ログインボーナス・任務・実績 ================= */

/* ---- ログインボーナス(7日サイクル) ---- */
const LOGIN_BONUS=[{g:100},{t:1},{g:200},{t:1},{g:300},{t:2},{g:500,t:3}];
function rewardText(r){ return (r.g? "🪙"+r.g:"")+(r.g&&r.t?" ":"")+(r.t? "🎫"+r.t:""); }
function grantReward(r){ if(r.g) G.gold+=r.g; if(r.t) G.tickets+=r.t; }

function checkLogin(){
  const k=todayKey();
  if(G.login.last===k) return;
  G.login.last=k;
  G.login.day=(G.login.day%7)+1;
  const r=LOGIN_BONUS[G.login.day-1];
  grantReward(r);
  saveG(); refreshHeader();
  openModal('<h3>🎁 ログインボーナス</h3>'+
    '<div class="small">'+G.login.day+'日目の報酬: <b style="color:var(--accent)">'+rewardText(r)+'</b></div>'+
    '<div class="lgrid">'+LOGIN_BONUS.map((b,i)=>{
      const day=i+1;
      const cls=day<G.login.day?" got":(day===G.login.day?" now":"");
      return '<div class="lday'+cls+'"><div class="ln">'+day+'日目</div><div class="lr">'+rewardText(b)+'</div></div>';
    }).join("")+'</div>'+
    '<div class="row" style="justify-content:center"><button class="btn primary" data-close>受け取る</button></div>');
}

/* ---- 任務定義 ---- */
const DAILY_DEFS=[
  {id:"da", name:"クイズに20問答える",        target:20, cur:d=>d.a,     rew:{g:100}},
  {id:"dc", name:"クイズで10問正解する",      target:10, cur:d=>d.c,     rew:{t:1}},
  {id:"dk", name:"カードを5枚入手する",       target:5,  cur:d=>d.card,  rew:{g:150}},
  {id:"dr", name:"ダンジョンに1回挑む",       target:1,  cur:d=>d.run,   rew:{g:100}},
  {id:"dl", name:"ダンジョンを1回クリアする", target:1,  cur:d=>d.clear, rew:{t:1}},
];
const WEEKLY_DEFS=[
  {id:"wa", name:"クイズに150問答える",       target:150, cur:w=>w.a,     rew:{g:500}},
  {id:"wc", name:"クイズで80問正解する",      target:80,  cur:w=>w.c,     rew:{t:2}},
  {id:"wm", name:"カードを5回合成する",       target:5,   cur:w=>w.merge, rew:{t:1}},
  {id:"wl", name:"ダンジョンを5回クリアする", target:5,   cur:w=>w.clear, rew:{t:2}},
  {id:"wp", name:"ガチャを3回引く",           target:3,   cur:w=>w.pull,  rew:{g:500}},
];
/* 実績(段階制) */
const ACH_DEFS=[
  {id:"acor", name:"累計正解",       cur:()=>G.counters.cor,
   tiers:[[25,{g:200}],[100,{t:1}],[300,{t:2}],[1000,{t:3}],[3000,{t:5}]]},
  {id:"amas", name:"覚えた単語",     cur:()=>{let n=0;for(const en in G.words){if(G.words[en][0]>=MASTER_BOX)n++;}return n;},
   tiers:[[10,{g:300}],[50,{t:2}],[150,{t:3}],[400,{t:5}]]},
  {id:"akind",name:"カードの種類",   cur:()=>new Set(Object.keys(G.inv).map(k=>parseKey(k).en)).size,
   tiers:[[10,{g:200}],[50,{t:1}],[200,{t:3}],[500,{t:5}]]},
  {id:"amrg", name:"累計合成",       cur:()=>G.counters.merges,
   tiers:[[10,{g:300}],[50,{t:2}],[200,{t:4}]]},
  {id:"aclr", name:"ダンジョン累計クリア", cur:()=>G.counters.clears,
   tiers:[[5,{g:300}],[25,{t:2}],[100,{t:5}]]},
  {id:"ainf", name:"無限回廊 最深記録", cur:()=>G.inf.best,
   tiers:[[10,{g:300}],[30,{t:2}],[60,{t:3}],[100,{t:5}]]},
  {id:"achr", name:"なかまの数",     cur:()=>Object.keys(G.chars).length,
   tiers:[[3,{g:300}],[6,{t:2}],[10,{t:3}]]},
  {id:"apul", name:"累計ガチャ",     cur:()=>G.counters.pulls,
   tiers:[[10,{g:500}],[50,{t:3}]]},
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
function refreshMissionDot(){
  $("missionDot").classList.toggle("hidden", !hasClaimable());
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

/* 現在のタブ内で受け取れる報酬をまとめて受取 */
function claimAllCurrent(){
  const got={g:0,t:0}; let n=0;
  const add=r=>{ got.g+=r.g||0; got.t+=r.t||0; n++; grantReward(r); };
  if(missionMode==="daily"){
    const d=dailyRec();
    DAILY_DEFS.forEach(m=>{ if(!d.cl[m.id] && m.cur(d)>=m.target){ d.cl[m.id]=1; add(m.rew); } });
    if(!d.cl.all && DAILY_DEFS.every(m=>d.cl[m.id])){ d.cl.all=1; add({t:1}); }
  }else if(missionMode==="weekly"){
    const w=weeklyRec();
    WEEKLY_DEFS.forEach(m=>{ if(!w.cl[m.id] && m.cur(w)>=m.target){ w.cl[m.id]=1; add(m.rew); } });
    if(!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id])){ w.cl.all=1; add({t:2}); }
  }else{
    ACH_DEFS.forEach(a=>{
      let done=G.ach[a.id]||0;
      while(done<a.tiers.length && a.cur()>=a.tiers[done][0]){ add(a.tiers[done][1]); done++; }
      G.ach[a.id]=done;
    });
  }
  if(!n) return;
  saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
  toast("まとめて受取: "+rewardText(got));
}
function claimableInMode(){
  if(missionMode==="daily"){
    const d=dailyRec();
    return DAILY_DEFS.some(m=>!d.cl[m.id] && m.cur(d)>=m.target) ||
      (!d.cl.all && DAILY_DEFS.every(m=>d.cl[m.id]));
  }
  if(missionMode==="weekly"){
    const w=weeklyRec();
    return WEEKLY_DEFS.some(m=>!w.cl[m.id] && m.cur(w)>=m.target) ||
      (!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id]));
  }
  return ACH_DEFS.some(a=>{
    const done=G.ach[a.id]||0;
    return done<a.tiers.length && a.cur()>=a.tiers[done][0];
  });
}

function renderMissions(){
  const box=$("missionList"); box.innerHTML="";
  if(claimableInMode()){
    const r=document.createElement("div");
    r.style.cssText="padding:4px 0 10px; border-bottom:1px solid var(--line)";
    r.innerHTML='<button class="claimbtn" style="width:100%" id="claimAllBtn">✨ まとめて受取</button>';
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
      WEEKLY_DEFS.filter(m=>w.cl[m.id]).length, WEEKLY_DEFS.length, {t:2}, !!w.cl.all, ()=>{
        w.cl.all=1; grantReward({t:2}); saveG(); refreshHeader(); renderMissions(); refreshMissionDot();
        toast("🎫2 を受け取った");
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
