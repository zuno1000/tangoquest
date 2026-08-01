"use strict";
/* ================= キャラクター & ガチャ ================= */

const CHAR_RAR=["N","R","SR","SSR"];
const CHAR_RAR_CLASS=["rc1","rc2","rc3","rc5"];
const CHARS=[
  {id:"c01", face:"🗡️", name:"見習い剣士 ノア",     rar:1, hp:300, atk:34, def:20, spd:10},
  {id:"c02", face:"🌿", name:"薬草売り メル",       rar:1, hp:340, atk:28, def:24, spd:9},
  {id:"c03", face:"🏹", name:"狩人 ロディ",         rar:1, hp:280, atk:36, def:16, spd:13},
  {id:"c04", face:"🎻", name:"旅芸人 ピノ",         rar:1, hp:310, atk:30, def:20, spd:12},
  {id:"c05", face:"🪓", name:"傭兵 ガルド",         rar:2, hp:430, atk:46, def:28, spd:11},
  {id:"c06", face:"🔥", name:"魔法学生 リコ",       rar:2, hp:380, atk:52, def:22, spd:13},
  {id:"c07", face:"⚜️", name:"神殿騎士 セレン",     rar:2, hp:470, atk:42, def:34, spd:10},
  {id:"c08", face:"🌪️", name:"風の忍 カゲロウ",     rar:2, hp:390, atk:48, def:24, spd:17},
  {id:"c09", face:"🐉", name:"竜騎士 イグナ",       rar:3, hp:580, atk:66, def:38, spd:14},
  {id:"c10", face:"🔮", name:"大魔導士 オルフェ",   rar:3, hp:520, atk:74, def:32, spd:15},
  {id:"c11", face:"🕊️", name:"聖女 アリア",         rar:3, hp:640, atk:58, def:44, spd:12},
  {id:"c12", face:"⚡", name:"剣聖 ムラクモ",       rar:4, hp:720, atk:92, def:48, spd:18},
  {id:"c13", face:"🌠", name:"星詠みの賢者 ソフィア", rar:4, hp:680, atk:98, def:44, spd:16},
  {id:"c14", face:"👑", name:"冥府の女王 ネレイア",  rar:4, hp:780, atk:88, def:54, spd:15},
];
const byChar={}; CHARS.forEach(c=>byChar[c.id]=c);

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

function rollChar(){
  let r=Math.random()*100, rar=1;
  // レアリティの高い方から判定: SSR3 → SR10 → R32 → N残り
  if(r<GACHA_RATES[3]) rar=4;
  else if(r<GACHA_RATES[3]+GACHA_RATES[2]) rar=3;
  else if(r<GACHA_RATES[3]+GACHA_RATES[2]+GACHA_RATES[1]) rar=2;
  else rar=1;
  const pool=CHARS.filter(c=>c.rar===rar);
  return pool[Math.floor(Math.random()*pool.length)];
}

function doPull(n, useGold){
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
    const c=rollChar();
    const isNew=!G.chars[c.id];
    if(isNew) G.chars[c.id]={dup:0};
    else G.chars[c.id].dup=Math.min(G.chars[c.id].dup+1, 99);
    results.push({c, isNew});
    track("pull");
  }
  saveG(); refreshHeader(); renderChars();
  if(results.some(r=>r.c.rar===4)) vibe([40,60,100]); // SSR演出
  openModal(
    '<h3>召喚結果</h3>'+
    '<div class="gresult">'+results.map((r,i)=>
      '<div class="gres bd'+(r.c.rar===4?5:r.c.rar)+'" style="animation-delay:'+(i*90)+'ms">'+
        '<div style="font-size:32px">'+r.c.face+'</div>'+
        '<div class="'+CHAR_RAR_CLASS[r.c.rar-1]+'" style="font-weight:800; font-size:12px">'+CHAR_RAR[r.c.rar-1]+'</div>'+
        '<div style="font-size:11px; font-weight:700; margin-top:2px; line-height:1.2">'+esc(r.c.name)+'</div>'+
        '<div class="small" style="font-size:10px; margin-top:2px">'+(r.isNew?"NEW!":"突破 +6%")+'</div>'+
      '</div>').join("")+
    '</div>'+
    '<div class="row" style="justify-content:center"><button class="btn primary" style="flex:1" data-close>OK</button></div>');
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
      '<div style="font-size:32px">'+c.face+'</div>'+
      '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; font-size:11px">'+CHAR_RAR[c.rar-1]+(dup?" +"+dup:"")+'</div>'+
      '<div style="font-size:12px; font-weight:700; margin-top:3px; line-height:1.2">'+esc(c.name)+'</div>'+
      '<div class="small" style="margin-top:4px">力 '+fmt(base)+'</div>'+
      (G.party.char===c.id? '<div style="font-size:11px; color:var(--accent); font-weight:800; margin-top:3px">出撃中</div>':"");
    d.onclick=()=>{ G.party.char=c.id; saveG(); renderChars(); toast(c.name+" を出撃メンバーにした"); };
    grid.appendChild(d);
  });
}

/* ---- 提供割合モーダル ---- */
$("rateInfo").onclick=()=>{
  openModal('<h3>提供割合</h3>'+
    '<table class="stt">'+
    '<tr><td class="rc5">SSR</td><td>3%</td></tr>'+
    '<tr><td class="rc3">SR</td><td>10%</td></tr>'+
    '<tr><td class="rc2">R</td><td>32%</td></tr>'+
    '<tr><td class="rc1">N</td><td>55%</td></tr>'+
    '</table>'+
    '<div class="small" style="margin-top:12px; line-height:1.7">同じ冒険者を引くと「突破」となり、能力が +6% ずつ強化される(最大10回)。</div>'+
    '<div class="row" style="margin-top:12px"><button class="btn primary" style="flex:1" data-close>OK</button></div>');
};

$("pull1").onclick=()=>doPull(1,false);
$("pull10").onclick=()=>doPull(10,false);
$("pullG1").onclick=()=>doPull(1,true);
$("pullG10").onclick=()=>doPull(10,true);
