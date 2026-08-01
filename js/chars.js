"use strict";
/* ================= キャラクター & ガチャ ================= */

const CHAR_RAR=["N","R","SR","SSR"];
const CHAR_RAR_CLASS=["rc1","rc2","rc3","rc5"];
const CHARS=[
  {id:"c01", face:"🗡️", name:"見習い剣士 ノア",     rar:1, hp:300, atk:34, def:20, spd:10},
  {id:"c02", face:"🌿", name:"薬草売り メル",       rar:1, hp:340, atk:28, def:24, spd:9},
  {id:"c03", face:"🏹", name:"狩人 ロディ",         rar:1, hp:280, atk:36, def:16, spd:13},
  {id:"c04", face:"🎻", name:"旅芸人 ピノ",         rar:1, hp:310, atk:30, def:20, spd:12},
  {id:"c15", face:"🎣", name:"釣り人 マオ",         rar:1, hp:320, atk:31, def:21, spd:11},
  {id:"c16", face:"🥖", name:"パン職人 コポ",       rar:1, hp:360, atk:26, def:26, spd:8},
  {id:"c05", face:"🪓", name:"傭兵 ガルド",         rar:2, hp:430, atk:46, def:28, spd:11},
  {id:"c06", face:"🔥", name:"魔法学生 リコ",       rar:2, hp:380, atk:52, def:22, spd:13},
  {id:"c07", face:"⚜️", name:"神殿騎士 セレン",     rar:2, hp:470, atk:42, def:34, spd:10},
  {id:"c08", face:"🌪️", name:"風の忍 カゲロウ",     rar:2, hp:390, atk:48, def:24, spd:17},
  {id:"c17", face:"🛡️", name:"盾兵 ドムス",         rar:2, hp:520, atk:36, def:40, spd:8},
  {id:"c18", face:"⚗️", name:"錬金術師 フラン",     rar:2, hp:400, atk:50, def:26, spd:12},
  {id:"c09", face:"🐉", name:"竜騎士 イグナ",       rar:3, hp:580, atk:66, def:38, spd:14},
  {id:"c10", face:"🔮", name:"大魔導士 オルフェ",   rar:3, hp:520, atk:74, def:32, spd:15},
  {id:"c11", face:"🕊️", name:"聖女 アリア",         rar:3, hp:640, atk:58, def:44, spd:12},
  {id:"c19", face:"🦊", name:"妖狐 コハク",         rar:3, hp:540, atk:70, def:34, spd:18},
  {id:"c20", face:"🎭", name:"幻術師 ヴェイル",     rar:3, hp:560, atk:68, def:36, spd:16},
  {id:"c12", face:"⚡", name:"剣聖 ムラクモ",       rar:4, hp:720, atk:92, def:48, spd:18},
  {id:"c13", face:"🌠", name:"星詠みの賢者 ソフィア", rar:4, hp:680, atk:98, def:44, spd:16},
  {id:"c14", face:"👑", name:"冥府の女王 ネレイア",  rar:4, hp:780, atk:88, def:54, spd:15},
  {id:"c21", face:"🌊", name:"大海の王 ネプト",     rar:4, hp:760, atk:90, def:52, spd:16},
  // 期間限定(開催中のバナーからのみ排出)
  {id:"c22", face:"☄️", name:"彗星の魔女 ステラ",   rar:4, hp:700, atk:104, def:42, spd:19, limited:true},
  {id:"c23", face:"🌸", name:"桜花の剣姫 サクヤ",   rar:3, hp:560, atk:76, def:34, spd:19, limited:true},
];
const byChar={}; CHARS.forEach(c=>byChar[c.id]=c);

/* ================= 期間限定バナー =================
   アップデートごとにここへ追記するだけで限定ガチャが開催される。
   期間中: 限定キャラが排出対象になり、該当レア枠の50%が限定(ピックアップ) */
const BANNERS=[
  {id:"b2608", name:"☄️ 星降る夜の召喚", start:"2026-08-01", end:"2026-08-31",
   chars:["c22","c23"],
   desc:"限定「彗星の魔女 ステラ」(SSR)・「桜花の剣姫 サクヤ」(SR)がピックアップ!"},
];
function activeBanner(){
  const t=todayKey();
  return BANNERS.find(b=>b.start<=t && t<=b.end)||null;
}
/* レア度ごとの排出プール。banner指定時は限定キャラも含む */
function gachaPool(rar, banner){
  const normal=CHARS.filter(c=>c.rar===rar && !c.limited);
  if(!banner) return normal;
  const feat=banner.chars.map(id=>byChar[id]).filter(c=>c && c.rar===rar);
  return feat.length? {feat, normal} : normal;
}

/* 初期キャラ配布 */
if(!G.chars.c01 && !Object.keys(G.chars).length){ G.chars.c01={dup:0}; }
if(!G.party.char || !G.chars[G.party.char]) G.party.char=Object.keys(G.chars)[0]||"c01";
if(!G.chars[G.party.char]) G.chars[G.party.char]={dup:0};

function charStats(id){
  const c=byChar[id]; if(!c) return {hp:1,atk:1,def:1,spd:1};
  const dup=Math.min((G.chars[id]&&G.chars[id].dup)||0, 10);
  const m=(1+0.06*dup)*lvMult(); // 突破 + 知識レベル(クイズ正解で成長)
  return {hp:Math.round(c.hp*m), atk:Math.round(c.atk*m), def:Math.round(c.def*m), spd:Math.round(c.spd*m)};
}

/* ---- ガチャ ---- */
const GACHA_RATES=[55,32,10,3]; // N/R/SR/SSR %
const PULL_GOLD=1000;

function rollChar(banner){
  let r=Math.random()*100, rar=1;
  // レアリティの高い方から判定: SSR3 → SR10 → R32 → N残り
  if(r<GACHA_RATES[3]) rar=4;
  else if(r<GACHA_RATES[3]+GACHA_RATES[2]) rar=3;
  else if(r<GACHA_RATES[3]+GACHA_RATES[2]+GACHA_RATES[1]) rar=2;
  else rar=1;
  const pool=gachaPool(rar, banner);
  if(pool.feat){ // ピックアップ: 該当レア枠の50%が限定
    const list=Math.random()<0.5? pool.feat : pool.normal;
    return list[Math.floor(Math.random()*list.length)];
  }
  return pool[Math.floor(Math.random()*pool.length)];
}

function doPull(n, useGold, banner){
  if(useGold){
    const cost=PULL_GOLD*n;
    if(G.gold<cost){ toast("ゴールドが足りない"); return; }
    G.gold-=cost;
  }else{
    if(G.tickets<n){ toast("チケットが足りない(ダンジョン・任務で入手)"); return; }
    G.tickets-=n;
  }
  const results=[];
  for(let i=0;i<n;i++){
    const c=rollChar(banner);
    const isNew=!G.chars[c.id];
    if(isNew) G.chars[c.id]={dup:0};
    else G.chars[c.id].dup=Math.min(G.chars[c.id].dup+1, 99);
    results.push({c, isNew});
    track("pull");
  }
  saveG(); refreshHeader(); renderChars();
  openPackCeremony(results, banner);
}

/* ---- パック開封セレモニー(ポケポケ参考: スライドで切って開ける) ---- */
function gresHTML(r, i){
  return '<div class="gres bd'+(r.c.rar===4?5:r.c.rar)+(r.c.rar===4?' shine':'')+'" style="animation-delay:'+(i*90)+'ms">'+
    (r.c.limited?'<div class="ltdmini">限定</div>':"")+
    '<div style="font-size:32px">'+r.c.face+'</div>'+
    '<div class="'+CHAR_RAR_CLASS[r.c.rar-1]+'" style="font-weight:800; font-size:12px">'+CHAR_RAR[r.c.rar-1]+'</div>'+
    '<div style="font-size:11px; font-weight:700; margin-top:2px; line-height:1.2">'+esc(r.c.name)+'</div>'+
    '<div class="small" style="font-size:10px; margin-top:2px">'+(r.isNew?"NEW!":"突破 +6%")+'</div>'+
  '</div>';
}
function openPackCeremony(results, banner){
  openModal('<h3>'+(banner? banner.name : "🔮 冒険者召喚")+'</h3>'+
    '<div id="packStage">'+
      '<div id="pack" class="shine'+(banner?" ltdpack":"")+'">'+
        '<div class="packTear"></div>'+
        '<div class="packLogo">⚔ LEXICA</div>'+
        '<div class="packIc">'+(banner?"☄️":"🔮")+'</div>'+
        '<div class="packHint">スライドして開封!</div>'+
        '<div class="packCap"></div>'+
      '</div>'+
      '<div id="packResults" class="gresult hidden"></div>'+
    '</div>'+
    '<div class="row" id="packCtrl" style="margin-top:6px">'+
      '<button class="btn" style="flex:1" id="packSkipBtn">スキップ ▶▶</button></div>');
  let flash=document.getElementById("packFlash");
  if(!flash){ flash=document.createElement("div"); flash.id="packFlash"; document.body.appendChild(flash); }

  const hasSSR=results.some(r=>r.c.rar===4);
  let opened=false;
  const reveal=()=>{
    if(opened) return; opened=true;
    const pack=$("pack"); if(!pack) return;
    pack.classList.add("open");
    if(hasSSR){ flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go"); vibe([40,60,100]); }
    else vibe(30);
    setTimeout(()=>{
      if(!$("packResults")) return;
      pack.classList.add("hidden");
      const box=$("packResults");
      box.classList.remove("hidden");
      box.innerHTML=results.map(gresHTML).join("");
      $("packCtrl").innerHTML='<button class="btn primary" style="flex:1" data-close>OK</button>';
      $("packCtrl").querySelector("[data-close]").onclick=closeModal;
    }, 430);
  };
  const pack=$("pack");
  let sx=null;
  pack.onpointerdown=e=>{ sx=e.clientX; try{ pack.setPointerCapture(e.pointerId); }catch(err){} };
  pack.onpointermove=e=>{ if(sx!=null && Math.abs(e.clientX-sx)>70){ sx=null; reveal(); } };
  pack.onpointerup=e=>{ if(sx!=null && Math.abs(e.clientX-sx)<12) reveal(); sx=null; };
  $("packSkipBtn").onclick=reveal;
}

/* ---- なかま一覧 ---- */
function renderChars(){
  const grid=$("charGrid"); grid.innerHTML="";
  const owned=CHARS.filter(c=>G.chars[c.id]);
  if(!owned.length){ grid.innerHTML='<div class="empty" style="grid-column:1/-1">ガチャで冒険者を仲間にしよう</div>'; return; }
  owned.sort((a,b)=>b.rar-a.rar);
  owned.forEach(c=>{
    const st=charStats(c.id), dup=G.chars[c.id].dup||0;
    const base=Math.round(st.hp/6 + st.atk*4 + st.def*3 + st.spd*5); // 素の戦闘力
    const d=document.createElement("div");
    d.className="charcard bd"+(c.rar===4?5:c.rar);
    d.innerHTML=
      (c.limited?'<div class="ltdmini">限定</div>':"")+
      '<div style="font-size:32px">'+c.face+'</div>'+
      '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; font-size:11px">'+CHAR_RAR[c.rar-1]+(dup?" +"+dup:"")+'</div>'+
      '<div style="font-size:12px; font-weight:700; margin-top:3px; line-height:1.2">'+esc(c.name)+'</div>'+
      '<div class="small" style="margin-top:4px">力 '+fmt(base)+'</div>'+
      (G.party.char===c.id? '<div style="font-size:11px; color:var(--accent); font-weight:800; margin-top:3px">出撃中</div>':"");
    d.onclick=()=>{ G.party.char=c.id; saveG(); renderChars(); toast(c.name+" を出撃メンバーにした"); };
    grid.appendChild(d);
  });
}


/* ---- ガチャ画面(開催中の限定バナー+恒常) ---- */
function pullButtonsHTML(which){
  return '<div class="row" style="justify-content:center; gap:8px; margin-top:12px">'+
    '<button class="btn gold" data-pull="'+which+'|1|t">1回 🎫1</button>'+
    '<button class="btn gold" data-pull="'+which+'|10|t">10回 🎫10</button></div>'+
    '<div class="row" style="justify-content:center; gap:8px; margin-top:8px">'+
    '<button class="btn" data-pull="'+which+'|1|g">1回 🪙1000</button>'+
    '<button class="btn" data-pull="'+which+'|10|g">10回 🪙10000</button></div>';
}
function renderGacha(){
  const box=$("gachaBox"); if(!box) return;
  const b=activeBanner();
  let h="";
  if(b){
    const endT=new Date(b.end+"T23:59:59");
    const remain=Math.max(1, Math.ceil((endT-Date.now())/864e5));
    h+='<div class="gbanner limited">'+
      '<div class="ltdtag">期間限定 ─ 残り'+remain+'日</div>'+
      '<div class="gt">'+b.name+'</div>'+
      '<div class="gs">'+b.desc+'</div>'+
      pullButtonsHTML("ltd")+'</div>';
  }
  h+='<div class="gbanner" style="margin-top:12px">'+
    '<div class="gt">🔮 冒険者召喚</div>'+
    '<div class="gs">🎫 や 🪙 で新しい仲間を召喚しよう</div>'+
    pullButtonsHTML("std")+
    '<div class="grates" id="rateInfo">提供割合・突破について ›</div></div>';
  box.innerHTML=h;
  box.querySelectorAll("[data-pull]").forEach(btn=>{
    btn.onclick=()=>{
      const p=btn.dataset.pull.split("|");
      doPull(+p[1], p[2]==="g", p[0]==="ltd"? activeBanner() : null);
    };
  });
  $("rateInfo").onclick=openRates;
}

function openRates(){
  openModal('<h3>提供割合</h3>'+
    '<table class="stt">'+
    '<tr><td class="rc5">SSR</td><td>3%</td></tr>'+
    '<tr><td class="rc3">SR</td><td>10%</td></tr>'+
    '<tr><td class="rc2">R</td><td>32%</td></tr>'+
    '<tr><td class="rc1">N</td><td>55%</td></tr>'+
    '</table>'+
    '<div class="small" style="margin-top:12px; line-height:1.7">'+
    '・同じ冒険者を引くと「突破」となり能力+6%(最大10回)<br>'+
    '・期間限定バナーでは、該当レア度枠の50%がピックアップ(限定)キャラになる。限定キャラは開催期間中のみ入手できる</div>'+
    '<div class="row" style="margin-top:12px"><button class="btn primary" style="flex:1" data-close>OK</button></div>');
}
