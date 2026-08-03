"use strict";
/* ================= キャラクター & ガチャ ================= */

const CHAR_RAR=["N","R","SR","SSR"];
const CHAR_RAR_CLASS=["rc1","rc2","rc3","rc5"];
/* v4.0.0: 全キャラに固有スキル(sk)。タイプは8種のパッシブ:
   dmg=与ダメ+ / boss=ボスへ与ダメ+ / guard=被ダメ- / heal=階クリア回復+
   gold=獲得ゴールド+ / xp=クイズXP+ / spd=素早さ+ / hp=HP+ / vamp=与ダメ回復 */
const CHARS=[
  {id:"c01", face:"🗡️", name:"見習い剣士 ノア",     rar:1, hp:300, atk:34, def:20, spd:10, sk:{n:"剣の心得",     t:"dmg",  v:0.05}},
  {id:"c02", face:"🌿", name:"薬草売り メル",       rar:1, hp:340, atk:28, def:24, spd:9,  sk:{n:"薬草の知識",   t:"heal", v:0.10}},
  {id:"c03", face:"🏹", name:"狩人 ロディ",         rar:1, hp:280, atk:36, def:16, spd:13, sk:{n:"先読みの目",   t:"spd",  v:0.15}},
  {id:"c04", face:"🎻", name:"旅芸人 ピノ",         rar:1, hp:310, atk:30, def:20, spd:12, sk:{n:"旅の唄",       t:"xp",   v:0.05}},
  {id:"c15", face:"🎣", name:"釣り人 マオ",         rar:1, hp:320, atk:31, def:21, spd:11, sk:{n:"商売上手",     t:"gold", v:10}},
  {id:"c16", face:"🥖", name:"パン職人 コポ",       rar:1, hp:360, atk:26, def:26, spd:8,  sk:{n:"焼きたての活力", t:"hp",  v:0.12}},
  {id:"c05", face:"🪓", name:"傭兵 ガルド",         rar:2, hp:430, atk:46, def:28, spd:11, sk:{n:"首狩りの太刀", t:"boss", v:0.15}},
  {id:"c06", face:"🔥", name:"魔法学生 リコ",       rar:2, hp:380, atk:52, def:22, spd:13, sk:{n:"火花の魔導",   t:"dmg",  v:0.08}},
  {id:"c07", face:"⚜️", name:"神殿騎士 セレン",     rar:2, hp:470, atk:42, def:34, spd:10, sk:{n:"聖盾",         t:"guard", v:0.08}},
  {id:"c08", face:"🌪️", name:"風の忍 カゲロウ",     rar:2, hp:390, atk:48, def:24, spd:17, sk:{n:"疾風走り",     t:"spd",  v:0.25}},
  {id:"c17", face:"🛡️", name:"盾兵 ドムス",         rar:2, hp:520, atk:36, def:40, spd:8,  sk:{n:"鉄壁",         t:"guard", v:0.12}},
  {id:"c18", face:"⚗️", name:"錬金術師 フラン",     rar:2, hp:400, atk:50, def:26, spd:12, sk:{n:"金変の術",     t:"gold", v:20}},
  {id:"c09", face:"🐉", name:"竜騎士 イグナ",       rar:3, hp:580, atk:66, def:38, spd:14, sk:{n:"竜殺しの槍",   t:"boss", v:0.25}},
  {id:"c10", face:"🔮", name:"大魔導士 オルフェ",   rar:3, hp:520, atk:74, def:32, spd:15, sk:{n:"大魔法",       t:"dmg",  v:0.14}},
  {id:"c11", face:"🕊️", name:"聖女 アリア",         rar:3, hp:640, atk:58, def:44, spd:12, sk:{n:"祝福の祈り",   t:"heal", v:0.20}},
  {id:"c19", face:"🦊", name:"妖狐 コハク",         rar:3, hp:540, atk:70, def:34, spd:18, sk:{n:"妖気吸収",     t:"vamp", v:0.06}},
  {id:"c20", face:"🎭", name:"幻術師 ヴェイル",     rar:3, hp:560, atk:68, def:36, spd:16, sk:{n:"幻惑",         t:"guard", v:0.15}},
  {id:"c12", face:"⚡", name:"剣聖 ムラクモ",       rar:4, hp:720, atk:92, def:48, spd:18, sk:{n:"剣理の極み",   t:"dmg",  v:0.22}},
  {id:"c13", face:"🌠", name:"星詠みの賢者 ソフィア", rar:4, hp:680, atk:98, def:44, spd:16, sk:{n:"星の叡智",   t:"xp",   v:0.20}},
  {id:"c14", face:"👑", name:"冥府の女王 ネレイア",  rar:4, hp:780, atk:88, def:54, spd:15, sk:{n:"冥府の契約",   t:"vamp", v:0.10}},
  {id:"c21", face:"🌊", name:"大海の王 ネプト",     rar:4, hp:760, atk:90, def:52, spd:16, sk:{n:"大海の加護",   t:"guard", v:0.20}},
  // v3.5.0 追加(恒常)
  {id:"c24", face:"🐚", name:"貝拾い シェリ",       rar:1, hp:330, atk:29, def:22, spd:10, sk:{n:"浜辺の目利き", t:"gold", v:12}},
  {id:"c25", face:"📚", name:"書記官 テオ",         rar:2, hp:410, atk:44, def:30, spd:11, sk:{n:"書き写しの知", t:"xp",   v:0.10}},
  {id:"c26", face:"🐺", name:"狼使い ウルフィ",     rar:2, hp:420, atk:49, def:25, spd:14, sk:{n:"群れの連携",   t:"dmg",  v:0.10}},
  {id:"c27", face:"⚔️", name:"双剣士 レイヴ",       rar:3, hp:550, atk:72, def:33, spd:17, sk:{n:"二刀流",       t:"dmg",  v:0.15}},
  {id:"c28", face:"🌙", name:"月詠の巫女 ツキミ",   rar:3, hp:600, atk:62, def:40, spd:13, sk:{n:"月の導き",     t:"xp",   v:0.15}},
  {id:"c29", face:"🦁", name:"獣王 レオニス",       rar:4, hp:760, atk:94, def:50, spd:14, sk:{n:"王の咆哮",     t:"boss", v:0.35}},
  // v4.0.0 追加(恒常・これで計32体)
  {id:"c32", face:"🧭", name:"星の旅人 アルク",     rar:2, hp:410, atk:47, def:27, spd:13, sk:{n:"道しるべ",     t:"heal", v:0.15}},
  // 期間限定(開催中のバナーからのみ排出)
  {id:"c22", face:"☄️", name:"彗星の魔女 ステラ",   rar:4, hp:700, atk:104, def:42, spd:19, limited:true, sk:{n:"彗星落とし",  t:"dmg",  v:0.25}},
  {id:"c23", face:"🌸", name:"桜花の剣姫 サクヤ",   rar:3, hp:560, atk:76, def:34, spd:19, limited:true, sk:{n:"桜吹雪",     t:"dmg",  v:0.16}},
  {id:"c30", face:"🍁", name:"紅葉の狐仙 モミジ",   rar:4, hp:710, atk:102, def:44, spd:18, limited:true, sk:{n:"紅葉狩り",   t:"vamp", v:0.12}},
  {id:"c31", face:"🌾", name:"収穫の精 ミノリ",     rar:3, hp:590, atk:70, def:38, spd:16, limited:true, sk:{n:"豊穣",       t:"gold", v:35}},
];
const byChar={}; CHARS.forEach(c=>byChar[c.id]=c);

/* スキル説明の生成(タイプ+数値から) */
const SKILL_T={
  dmg:  v=>"与ダメージ+"+Math.round(v*100)+"%",
  boss: v=>"ボスへの与ダメージ+"+Math.round(v*100)+"%",
  guard:v=>"受けるダメージ-"+Math.round(v*100)+"%",
  heal: v=>"階クリア後の回復+"+Math.round(v*100)+"%",
  gold: v=>"獲得ゴールド+"+v+"%",
  xp:   v=>"クイズの獲得XP+"+Math.round(v*100)+"%",
  spd:  v=>"素早さ+"+Math.round(v*100)+"%",
  hp:   v=>"HP+"+Math.round(v*100)+"%",
  vamp: v=>"与ダメージの"+Math.round(v*100)+"%を回復",
};
function skillDesc(sk){ return sk && SKILL_T[sk.t]? SKILL_T[sk.t](sk.v) : ""; }
function charSkill(id){ const c=byChar[id]; return (c&&c.sk)||null; }
/* 出撃キャラのクイズXPスキル(quiz.jsから参照) */
function abilityXpMult(){
  const sk=charSkill(G.party.char);
  return sk && sk.t==="xp"? 1+sk.v : 1;
}

/* ================= 期間限定バナー =================
   アップデートごとにここへ追記するだけで限定ガチャが開催される。
   期間中: 限定キャラが排出対象になり、該当レア枠の50%が限定(ピックアップ) */
const BANNERS=[
  {id:"b2608", name:"☄️ 星降る夜の召喚", start:"2026-08-01", end:"2026-08-31",
   chars:["c22","c23"],
   desc:"限定「彗星の魔女 ステラ」(SSR)・「桜花の剣姫 サクヤ」(SR)がピックアップ!"},
  {id:"b2609", name:"🍁 秋宵の召喚", start:"2026-09-01", end:"2026-09-30",
   chars:["c30","c31"],
   desc:"限定「紅葉の狐仙 モミジ」(SSR)・「収穫の精 ミノリ」(SR)がピックアップ!"},
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

/* 突破段階の装飾クラス: +3=淡彩+内枠 / +6=濃彩+光沢 / +10=フォイル(MAX)。
   彩色はレアリティ色(N白銀/R緑/SR青/SSR金)を --dupc で渡す。
   v4.0.0: 「暗く見える」FBを受けて白ベースの明るいフォイルに(色も明るめに調整) */
const DUP_RGB=["198,208,226","46,196,122","82,148,255","244,176,26"]; // 白銀/R緑/SR青/SSR金
function dupClass(dup){
  return dup>=10? " dup10 shine" : dup>=6? " dup6 shine" : dup>=3? " dup3" : "";
}

/* 突破ボーナス: +10までは+6%/回、11回目からは+2%/回で上限なし(v4.0.0) */
function dupMult(dup){
  dup=dup||0;
  return 1+0.06*Math.min(dup,10)+0.02*Math.max(0,dup-10);
}
function charStats(id){
  const c=byChar[id]; if(!c) return {hp:1,atk:1,def:1,spd:1};
  const dup=(G.chars[id]&&G.chars[id].dup)||0;
  const m=dupMult(dup)*lvMult(); // 突破 + 知識レベル(クイズ正解で成長)
  const s={hp:c.hp*m, atk:c.atk*m, def:c.def*m, spd:c.spd*m};
  const sk=c.sk; // ステータス型スキルはここで効く
  if(sk){
    if(sk.t==="hp")  s.hp*=(1+sk.v);
    if(sk.t==="spd") s.spd*=(1+sk.v);
  }
  return {hp:Math.round(s.hp), atk:Math.round(s.atk), def:Math.round(s.def), spd:Math.round(s.spd)};
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
    else G.chars[c.id].dup=Math.min(G.chars[c.id].dup+1, 999); // 突破に上限なし(保存上の安全弁のみ)
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
    '<div class="gface">'+r.c.face+'</div>'+
    '<div class="grar '+CHAR_RAR_CLASS[r.c.rar-1]+'">'+CHAR_RAR[r.c.rar-1]+'</div>'+
    '<div class="gname">'+esc(r.c.name)+'</div>'+
    '<div class="gsub">'+(r.isNew? "NEW!" : "突破 +"+(((G.chars[r.c.id]&&G.chars[r.c.id].dup)||0)>10? 2:6)+"%")+'</div>'+
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
    d.className="charcard bd"+(c.rar===4?5:c.rar)+dupClass(dup);
    d.style.setProperty("--dupc", DUP_RGB[c.rar-1]);
    d.innerHTML=
      (c.limited?'<div class="ltdmini">限定</div>':"")+
      '<div style="font-size:32px">'+c.face+'</div>'+
      '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; font-size:11px">'+CHAR_RAR[c.rar-1]+
        (dup>=10? ' 👑+'+dup : dup? " +"+dup : "")+'</div>'+
      '<div style="font-size:12px; font-weight:700; margin-top:3px; line-height:1.2">'+esc(c.name)+'</div>'+
      (c.sk? '<div class="cskill">✦ '+esc(c.sk.n)+'</div>':"")+
      '<div class="small" style="margin-top:3px">力 '+fmt(base)+'</div>'+
      (G.party.char===c.id? '<div style="font-size:11px; color:var(--accent); font-weight:800; margin-top:3px">出撃中</div>':"");
    d.onclick=()=>{
      G.party.char=c.id; saveG(); renderChars();
      toast(c.name+" を出撃 ─ ✦"+(c.sk? c.sk.n+"("+skillDesc(c.sk)+")" : ""));
    };
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
    '・同じ冒険者を引くと「突破」となり能力+6%(11回目からは+2%・上限なし)<br>'+
    '・冒険者はそれぞれ固有スキル(✦)を持つ。出撃中の1人のスキルが効果を発揮する<br>'+
    '・期間限定バナーでは、該当レア度枠の50%がピックアップ(限定)キャラになる。限定キャラは開催期間中のみ入手できる</div>'+
    '<div class="row" style="margin-top:12px"><button class="btn primary" style="flex:1" data-close>OK</button></div>');
}
