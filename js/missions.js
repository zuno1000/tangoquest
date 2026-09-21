"use strict";
/* ================= ログインボーナス・任務・実績 ================= */

/* ---- ログインボーナス(7日サイクル) ----
   v3.7.0: 毎日最低🎫1=来るだけで毎日1回はガチャが引ける
   v4.13.0: 7日目に🧊フリーズ1個(連続学習の保険・週1ペースで補充) */
const LOGIN_BONUS=[{t:1,g:200},{t:1,g:300},{t:2},{t:1,g:500},{t:2},{t:1,g:800},{t:3,g:1000,f:1}];
/* 報酬(v5.13.0): ゲーム面オフのときは🪙🎫を知識XPに換算する(🎫1=30XP・🪙25=1XP)。x=XPそのもの */
function rewardXp(r){ return (r.x||0)+(GAME_ENABLED? 0 : (r.t||0)*30+Math.round((r.g||0)/25)); }
function rewardText(r){
  const p=[];
  if(GAME_ENABLED){
    if(r.g) p.push("🪙"+r.g);
    if(r.t) p.push("🎫"+r.t);
  }
  const x=rewardXp(r); if(x) p.push("📖+"+x+"XP");
  if(r.f) p.push("🧊"+r.f);
  return p.join(" ");
}
function grantReward(r){
  if(GAME_ENABLED){
    if(r.g) G.gold+=r.g;
    if(r.t) G.tickets+=r.t;
  }
  const x=rewardXp(r); if(x) G.xp+=x;
  if(r.f) G.frz=Math.min(FRZ_MAX, (G.frz||0)+r.f); // フリーズは上限あり(貯め込み防止)
}

/* v4.26.0: 起動直後にモーダル(灰色オーバーレイ)を開くのをやめた ─ iOSスタンドアロンで
   ステータスバー領域が灰色のまま残る不具合(長期未解決)の根治。報酬の付与はここで従来どおり
   行い、お祝いはトースト+ホームのバナー(タップで7日カレンダー)が担う。
   受け取りの操作は元々なかった(旧モーダルの「受け取る」は閉じるだけ)ため、体験は失われない */
const LOGIN_SEEN_KEY="tq_lgSeen"; // バナーを畳んだ日(端末ローカル・同期対象外)
function checkLogin(){
  const k=todayKey();
  const gift=!G.gift10;               // 初回プレゼント(10連分チケット)未受取か
  const newDay=G.login.last!==k;
  if(!gift && !newDay) return;
  if(gift){ G.gift10=1; if(GAME_ENABLED) G.tickets+=10; }
  let r=null;
  if(newDay){
    G.login.last=k;
    G.login.day=(G.login.day%7)+1;
    r=LOGIN_BONUS[G.login.day-1];
    grantReward(r);
    try{ localStorage.removeItem(LOGIN_SEEN_KEY); }catch(e){} // 新しい日のバナーを出す
  }
  saveG(); refreshHeader();
  toast((gift && GAME_ENABLED? "✨ はじめまして記念 🎫10!":"")+
    (gift&&newDay&&GAME_ENABLED? " ／ ":"")+
    (newDay? "🎁 ログインボーナス"+G.login.day+"日目: "+rewardText(r):""));
  if(!$("homeView").classList.contains("hidden")) renderHome(); // バナーを即時反映
}
/* ホームのログボバナーを出すか: 今日ぶんを受け取り済みで、まだ畳んでいないとき */
function loginBonusBannerNeeded(){
  try{ return G.login.last===todayKey() && localStorage.getItem(LOGIN_SEEN_KEY)!==todayKey(); }
  catch(e){ return false; }
}
/* 7日カレンダー(旧ログボモーダルの表示部分)。ユーザー操作からだけ開く=起動時の灰色を出さない */
function openLoginModal(){
  const r=LOGIN_BONUS[(G.login.day||1)-1];
  openModal('<h3>🎁 ログインボーナス</h3>'+
    '<div class="small">'+G.login.day+'日目の報酬: <b style="color:var(--accent)">'+rewardText(r)+'</b>(受け取り済み)</div>'+
    '<div class="lgrid">'+LOGIN_BONUS.map((b,i)=>{
      const day=i+1;
      const cls=day<G.login.day?" got":(day===G.login.day?" now":"");
      return '<div class="lday'+cls+'"><div class="ln">'+day+'日目</div><div class="lr">'+rewardText(b)+'</div></div>';
    }).join("")+'</div>'+
    '<div class="small" style="margin-top:8px">🧊=連続学習フリーズ: 学習できなかった日を自動で埋めて連続記録を守る(いま '+(G.frz||0)+'/'+FRZ_MAX+'個)</div>'+
    '<div class="row" style="justify-content:center"><button class="btn primary" style="flex:1" data-close>OK</button></div>');
}

/* ---- 任務定義 ----
   v4.6.0 通貨の分離: 🎫(限定召喚)は学習系の任務・実績だけが源泉。
   冒険・ガチャ系の🎫報酬はすべて🪙(恒常召喚)へ変換し、額も増やした */
const DAILY_DEFS=[
  /* 今日の目安の達成(v4.31.0実機FB): 学習ペース管理の目安をやり切った日の「ドカンと多め」の報酬。
     目標日を設定していないと挑戦できないため bonus:1=デイリー全達成の必須には数えない
     (curは引数のdailyRecではなく、日別学習記録と当日固定済みの目安から判定する) */
  {id:"dp", name:"🎯 今日の目安を達成する(学習ペース管理)", target:1, bonus:1,
   cur:()=>{ const q=paceToday(G), r=dayRec(); return (q && !q.done && r.a>=q.perDay)? 1:0; },
   rew:{t:25, g:3000}},
  {id:"da", name:"クイズに20問答える",        target:20, cur:d=>d.a,     rew:{g:150}},
  {id:"dc", name:"クイズで10問正解する",      target:10, cur:d=>d.c,     rew:{t:1}},
  {id:"dc2",name:"クイズで30問正解する",      target:30, cur:d=>d.c,     rew:{t:2}},
  {id:"dk", name:"カードを5枚入手する",       target:5,  cur:d=>d.card,  rew:{g:200}},
  /* v4.25.0 冒険=サバイバー一本化: run/clearの計上はsv.js(svStart/svFinish)が担う。
     idと計上フィールドは不変=過去の受取記録・同期と互換 */
  {id:"dr", name:"サバイバーに1回挑む",       target:1,  cur:d=>d.run,   rew:{g:300}},
  {id:"dl", name:"サバイバーで1回生還する",   target:1,  cur:d=>d.clear, rew:{g:1000}},
];
/* 全達成ボーナスの必須になる基本デイリー(bonus付きの任務=目安達成は数えない。
   目標日を設定していない人がデイリーを完走できなくなるのを防ぐ) */
const DAILY_CORE=DAILY_DEFS.filter(m=>!m.bonus);
const WEEKLY_DEFS=[
  {id:"wa", name:"クイズに150問答える",       target:150, cur:w=>w.a,     rew:{g:800}},
  {id:"wc", name:"クイズで80問正解する",      target:80,  cur:w=>w.c,     rew:{t:3}},
  {id:"wc2",name:"クイズで300問正解する",     target:300, cur:w=>w.c,     rew:{t:8}},
  {id:"wm", name:"カードを5回重ねる",         target:5,   cur:w=>w.merge, rew:{t:1}},
  {id:"wl", name:"サバイバーで5回生還する",   target:5,   cur:w=>w.clear, rew:{g:2000}},
  {id:"wp", name:"ガチャを3回引く",           target:3,   cur:w=>w.pull,  rew:{g:1000}},
];
/* ---- 学習の実績(v5.13.0・任務の代わり) ----
   ゲーム面オフの既定ではこれだけが「増える数字」の源泉。段階に達したら自動でXPを付与(受け取る操作なし=
   「学習」を押すだけでよい方針)。curはすべてG(学習記録)から導出=保存しない・同期の整合が自動。
   ゲーム面オンのときは従来の実績(GAME_ACH_DEFS)も後ろに続き、従来どおり手動で受け取る */
function masteredCount(g){ let n=0; for(const en in g.words){ if(g.words[en][0]>=MASTER_BOX) n++; } return n; }
const LEARN_ACH_DEFS=[
  {id:"lmas", name:"覚えた単語", unit:"語", cur:()=>masteredCount(G),
   tiers:[[10,{x:100}],[50,{x:200}],[150,{x:400}],[400,{x:800}],[800,{x:1500}],[1500,{x:3000}],[2500,{x:6000}]]},
  {id:"lcor", name:"累計正解", unit:"問", cur:()=>G.counters.cor,
   tiers:[[100,{x:100}],[300,{x:150}],[1000,{x:300}],[3000,{x:600}],[10000,{x:1500}],[30000,{x:4000}]]},
  {id:"lstk", name:"連続学習(最長)", unit:"日", cur:()=>longestStreak(G),
   tiers:[[3,{x:100}],[7,{x:200}],[14,{x:400}],[30,{x:800}],[60,{x:1500}],[100,{x:3000}],[365,{x:10000}]]},
  {id:"ldays", name:"学習した日数", unit:"日", cur:()=>{ let n=0; for(const k in G.days){ if(G.days[k].a>0) n++; } return n; },
   tiers:[[7,{x:100}],[30,{x:300}],[100,{x:800}],[365,{x:3000}]]},
  {id:"lpace", name:"今日の目安を達成した日", unit:"日", cur:()=>{ let n=0; for(const k in G.days){ const r=G.days[k]; if(r.t && r.a>=r.t) n++; } return n; },
   tiers:[[1,{x:100}],[7,{x:300}],[30,{x:800}],[100,{x:2000}]]},
  {id:"lsets", name:"30問セット", unit:"セット", cur:()=>Math.floor((G.counters.ans||0)/SET_N),
   tiers:[[1,{x:50}],[10,{x:150}],[50,{x:400}],[200,{x:1000}],[500,{x:2500}]]},
  {id:"lweak", name:"にがてを克服(ミスしたのに覚えた)", unit:"語", cur:()=>{ let n=0; for(const en in G.words){ const s=G.words[en]; if(s[3]>0 && s[4]) n++; } return n; },
   tiers:[[10,{x:150}],[50,{x:400}],[150,{x:1000}],[400,{x:2500}]]},
  {id:"lpmas", name:"覚えたフレーズ", unit:"件", cur:()=>{ let n=0; for(const en in G.phr){ if(G.phr[en][0]>=MASTER_BOX) n++; } return n; },
   tiers:[[10,{x:100}],[50,{x:300}],[150,{x:800}],[388,{x:3000}]]},
  {id:"lmyw", name:"マイ単語の登録", unit:"語", cur:()=>mywList().length,
   tiers:[[5,{x:50}],[20,{x:150}],[50,{x:400}],[150,{x:1000}]]},
  {id:"lmywm", name:"マイ単語を覚えた", unit:"語", cur:()=>{ let n=0; for(const en in G.words){ if(isMyWord(en) && G.words[en][0]>=MASTER_BOX) n++; } return n; },
   tiers:[[5,{x:150}],[20,{x:400}],[50,{x:1000}]]},
  {id:"lread", name:"今日の英語を読んだ", unit:"本", cur:()=>Object.keys(G.rl.done||{}).filter(u=>G.rl.done[u].k!=="listen").length,
   tiers:[[1,{x:50}],[10,{x:200}],[50,{x:600}],[150,{x:1500}]]},
  {id:"llis", name:"今日の英語を聴いた", unit:"本", cur:()=>Object.keys(G.rl.done||{}).filter(u=>G.rl.done[u].k==="listen").length,
   tiers:[[1,{x:50}],[10,{x:200}],[50,{x:600}],[150,{x:1500}]]},
];
/* 実績の段階に達していれば自動でXPを付与(ゲーム面オフ)。トーストは他の祝いと重ならないよう少し遅らせる。付与した数を返す */
function checkAchievements(){
  if(GAME_ENABLED) return 0;
  const got=[];
  LEARN_ACH_DEFS.forEach(a=>{
    let done=G.ach[a.id]||0;
    const cur=a.cur();
    while(done<a.tiers.length && cur>=a.tiers[done][0]){ grantReward(a.tiers[done][1]); got.push(a.name+" "+a.tiers[done][0]+a.unit+"(📖+"+rewardXp(a.tiers[done][1])+"XP)"); done++; }
    G.ach[a.id]=done;
  });
  if(got.length){
    saveG(); refreshHeader();
    setTimeout(()=>{ toast("🏆 実績達成! "+got.join(" ／ ")); vibe([20,30,40]); }, 1100);
  }
  return got.length;
}
/* 実績の達成状況の集計(⚙設定の行・実績画面の見出し) */
function achSummary(){
  let done=0, all=0;
  LEARN_ACH_DEFS.forEach(a=>{ all+=a.tiers.length; done+=Math.min(G.ach[a.id]||0, a.tiers.length); });
  return {done, all};
}
/* 実績(段階制・ゲーム面)。学習系(正解・覚えた・カード)は🎫/冒険・ガチャ系は🪙。GAME_ENABLED=falseでは使わない */
const GAME_ACH_DEFS=[
  {id:"acor", name:"累計正解",       cur:()=>G.counters.cor,
   tiers:[[25,{g:200}],[100,{t:1}],[300,{t:2}],[1000,{t:3}],[3000,{t:5}],[10000,{t:10}]]},
  {id:"amas", name:"覚えた単語",     cur:()=>{let n=0;for(const en in G.words){if(G.words[en][0]>=MASTER_BOX)n++;}return n;},
   tiers:[[10,{g:300}],[50,{t:2}],[150,{t:3}],[400,{t:5}]]},
  {id:"akind",name:"カードの種類",   cur:()=>new Set(Object.keys(G.inv).map(k=>parseKey(k).en)).size,
   tiers:[[10,{g:200}],[50,{t:1}],[200,{t:3}],[500,{t:5}]]},
  {id:"amrg", name:"累計重ね",       cur:()=>G.counters.merges,
   tiers:[[10,{g:300}],[50,{t:2}],[200,{t:4}],[600,{t:6}]]},
  /* v4.25.0: 旧「ダンジョン累計クリア」を継承(counters.clearsはサバイバーの生還が進める。
     過去のダンジョンクリア分も数に残る=実績を失わない) */
  {id:"aclr", name:"累計生還(冒険)", cur:()=>G.counters.clears,
   tiers:[[5,{g:500}],[25,{g:2000}],[100,{g:5000}]]},
  /* 単語のサバイバー: G.svはsv.jsが管理。モード撤去時もこの実績はcur=0で無害 */
  {id:"asv", name:"サバイバー生還", cur:()=>{let n=0; const c=(G.sv&&G.sv.clears)||{}; for(const k in c) n+=c[k]; return n;},
   tiers:[[1,{g:500}],[5,{g:2000}],[15,{g:5000}],[40,{g:10000}]]},
  /* v4.25.0: 無限回廊の実績を「終わりなき荒野」の生存記録に置き換え(idも新設。
     旧ainfの受取済みティアはG.achに残るだけで無害) */
  {id:"aend", name:"荒野の最長生存(秒)", cur:()=>((G.sv&&G.sv.endless&&G.sv.endless.best)||0),
   tiers:[[60,{g:500}],[180,{g:2000}],[360,{g:3000}],[600,{g:5000}],[900,{g:10000}]]},
  {id:"achr", name:"なかまの数",     cur:()=>Object.keys(G.chars).length,
   tiers:[[3,{g:300}],[6,{g:2000}],[10,{g:3000}],[16,{g:3000}],[24,{g:5000}],[32,{g:10000}]]},
  {id:"apul", name:"累計ガチャ",     cur:()=>G.counters.pulls,
   tiers:[[10,{g:500}],[50,{g:3000}],[150,{g:5000}],[400,{g:8000}],[1000,{g:15000}]]},
  {id:"adup", name:"突破の合計",     cur:()=>{let n=0;for(const id in G.chars)n+=G.chars[id].dup||0;return n;},
   tiers:[[5,{g:500}],[15,{g:2000}],[40,{g:3000}],[100,{g:5000}],[250,{g:10000}]]},
];
/* 手動で受け取る実績の一覧(ゲーム面オンのときだけ=従来の実績。学習の実績は自動付与なのでここには入れない) */
const ACH_DEFS=GAME_ACH_DEFS; // 互換(テスト・旧参照)。実際の判定はachDefs()=ゲーム面オンのときだけ
function achDefs(){ return GAME_ENABLED? GAME_ACH_DEFS : []; }

/* ---- 未受取があるか(ナビの赤点用) ---- */
function hasClaimable(){
  if(!GAME_ENABLED) return false; // 任務は廃止・学習の実績は自動付与(v5.13.0)
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
  if(!GAME_ENABLED) return 0;
  let n=0;
  const d=dailyRec();
  DAILY_DEFS.forEach(m=>{ if(!d.cl[m.id] && m.cur(d)>=m.target) n++; });
  if(!d.cl.all && DAILY_CORE.every(m=>d.cl[m.id])) n++;
  const w=weeklyRec();
  WEEKLY_DEFS.forEach(m=>{ if(!w.cl[m.id] && m.cur(w)>=m.target) n++; });
  if(!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id])) n++;
  achDefs().forEach(a=>{
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
  if(!d.cl.all && DAILY_CORE.every(m=>d.cl[m.id])){ d.cl.all=1; add({t:1}); }
  const w=weeklyRec();
  WEEKLY_DEFS.forEach(m=>{ if(!w.cl[m.id] && m.cur(w)>=m.target){ w.cl[m.id]=1; add(m.rew); } });
  if(!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id])){ w.cl.all=1; add({t:3}); }
  achDefs().forEach(a=>{
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
    (!d.cl.all && DAILY_CORE.every(m=>d.cl[m.id]));
}
function claimableWeekly(){
  const w=weeklyRec();
  return WEEKLY_DEFS.some(m=>!w.cl[m.id] && m.cur(w)>=m.target) ||
    (!w.cl.all && WEEKLY_DEFS.every(m=>w.cl[m.id]));
}
function claimableAch(){
  return achDefs().some(a=>{
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

/* 学習の実績の画面(ゲーム面オフ・v5.13.0): 段階ごとに達成✓/次の段階の進み。受け取る操作はない(自動付与) */
function renderLearnAch(box){
  const s=achSummary();
  const head=document.createElement("div");
  head.className="achhead";
  head.innerHTML='<div class="pacetop"><span>🏆 実績 <span class="small">達成した段階</span></span><b>'+s.done+' <span class="ptgt">/ '+s.all+'</span></b></div>'+
    '<div class="small" style="margin-top:4px">段階に達すると自動で📖XPが入る(受け取る操作はない)。数字はすべて学習の記録から</div>';
  box.appendChild(head);
  LEARN_ACH_DEFS.forEach(a=>{
    const done=G.ach[a.id]||0, cur=a.cur();
    const row=document.createElement("div");
    row.className="mrow"+(done>=a.tiers.length? " adone":"");
    const next=done<a.tiers.length? a.tiers[done] : null;
    row.innerHTML='<div class="grow"><div class="mname">'+a.name+
        ' <span class="achstars">'+a.tiers.map((t,i)=>'<i class="'+(i<done?"on":"")+'" title="'+t[0]+a.unit+'"></i>').join("")+'</span></div>'+
      (next
        ? '<div class="mprog">'+fmt(Math.min(cur,next[0]))+' / '+fmt(next[0])+a.unit+' <span class="small">─ 次の段階で '+rewardText(next[1])+'</span></div>'+
          '<div class="mbar"><i style="width:'+Math.min(100,100*cur/next[0])+'%"></i></div>'
        : '<div class="mprog">'+fmt(cur)+a.unit+' ─ 全段階達成 🎊</div>')+
      '</div>'+
      '<div class="mrew">'+(done? '<span class="done">'+done+'段階</span>':'')+'</div>';
    box.appendChild(row);
  });
}
function renderMissions(){
  refreshMissionSegDots();
  const box=$("missionList"); box.innerHTML="";
  // セグは.hiddenクラスで消す(hidden属性は.segのdisplay:flexに負ける)
  $("missionSeg").classList.toggle("hidden", !GAME_ENABLED);
  if(!GAME_ENABLED){ renderLearnAch(box); return; }
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
    // 全達成ボーナス(bonus付きの目安任務は必須に数えない)
    box.appendChild(missionRow("デイリー全達成ボーナス",
      DAILY_CORE.filter(m=>d.cl[m.id]).length, DAILY_CORE.length, {t:1}, !!d.cl.all, ()=>{
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
    achDefs().forEach(a=>{
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
