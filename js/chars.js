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
  // 期間限定(開催中は限定バナーのみ・初回開催の終了後は恒常入り=v4.9.0)。
  // 限定は同レアの恒常より素の力を1割弱高くする(ただし限定SR < 恒常SSR)
  {id:"c22", face:"☄️", name:"彗星の魔女 ステラ",   rar:4, hp:720, atk:108, def:44, spd:19, limited:true, sk:{n:"彗星落とし",  t:"dmg",  v:0.25}},
  {id:"c23", face:"🌸", name:"桜花の剣姫 サクヤ",   rar:3, hp:580, atk:78, def:36, spd:19, limited:true, sk:{n:"桜吹雪",     t:"dmg",  v:0.18}},
  {id:"c30", face:"🍁", name:"紅葉の狐仙 モミジ",   rar:4, hp:720, atk:104, def:46, spd:18, limited:true, sk:{n:"紅葉狩り",   t:"vamp", v:0.12}},
  {id:"c31", face:"🌾", name:"収穫の精 ミノリ",     rar:3, hp:600, atk:74, def:40, spd:17, limited:true, sk:{n:"豊穣",       t:"gold", v:35}},
  // v4.9.0 追加(枠A第2弾「夏祭りの召喚」8/8〜)
  {id:"c33", face:"🎆", name:"宵闇の花火師 ホムラ", rar:4, hp:740, atk:106, def:45, spd:18, limited:true, sk:{n:"大輪の花火",  t:"boss", v:0.28}},
  {id:"c34", face:"🐠", name:"金魚の精 リンカ",     rar:3, hp:560, atk:76, def:38, spd:18, limited:true, sk:{n:"すくい上げ",  t:"heal", v:0.18}},
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
   v4.6.1: 限定ガチャは恒常とは別に「常時2枠(A/B)」を同時開催する。
   各枠は14日周期で自動更新され、起点(epoch)を1週間ずらしてあるので
   毎週どちらかの枠が入れ替わる(A=7/25起点: 7/25〜8/7, 8/8〜8/21…/
   B=8/1起点: 8/1〜8/14, 8/15〜8/28…)。
   枠の banners にバナーを追加すると、その枠は周期ごとに順番へ内容が切り替わる。
   限定キャラは「初回開催の終了後」に恒常(冒険者召喚)へ収録される(v4.9.0)。
   再登場(周期の巡回)ではピックアップ+率UPの対象として戻ってくる。
   一回きりの特別開催をしたい場合は BANNERS に1行追記(2枠に加えて表示される) */
const LTD_SLOTS=[
  {epoch:"2026-07-25", banners:[
    {id:"ltdA1", name:"☄️ 星降る夜の召喚", chars:["c22","c23"],
     desc:"限定「彗星の魔女 ステラ」(SSR)・「桜花の剣姫 サクヤ」(SR)がピックアップ!"},
    {id:"ltdA2", name:"🎆 夏祭りの召喚", chars:["c33","c34"],
     desc:"限定「宵闇の花火師 ホムラ」(SSR)・「金魚の精 リンカ」(SR)がピックアップ!"},
  ]},
  {epoch:"2026-08-01", banners:[
    {id:"ltdB1", name:"🍁 秋宵の召喚", chars:["c30","c31"],
     desc:"限定「紅葉の狐仙 モミジ」(SSR)・「収穫の精 ミノリ」(SR)がピックアップ!"},
  ]},
];
const BANNERS=[]; // 一回きりの特別開催用(start/end/chars/desc)
/* 日付キー(YYYY-MM-DD)のズレない加算(Date.parseはUTC基準=日数差が正確) */
function addDays(ymd, n){
  const d=new Date(Date.parse(ymd)+n*864e5);
  return d.toISOString().slice(0,10);
}
/* その日にその枠で開催中のバナー(startとendを合成して返す)。テストからも使う純関数 */
function slotBannerAt(slot, t){
  const days=Math.floor((Date.parse(t)-Date.parse(slot.epoch))/864e5);
  if(days<0) return null;
  const idx=Math.floor(days/14);
  const b=slot.banners[idx%slot.banners.length];
  return Object.assign({start:addDays(slot.epoch, idx*14),
                        end:addDays(slot.epoch, idx*14+13)}, b);
}
/* いま開催中の限定バナー一覧(特別開催+2枠) */
function activeBanners(){
  const t=todayKey();
  const list=BANNERS.filter(b=>b.start<=t && t<=b.end).slice();
  LTD_SLOTS.forEach(s=>{ const b=slotBannerAt(s, t); if(b) list.push(b); });
  return list;
}
/* 互換: 「限定が開催中か」を見る場面用(ホームの表示・率UP判定など) */
function activeBanner(){ return activeBanners()[0]||null; }
/* 限定キャラの恒常入り判定(v4.9.0で変更): 開催(枠・特別とも)が一度終わったら
   恒常(冒険者召喚)に収録される。枠のバナーはその後も周期で再登場し、
   その間は率UP+ピックアップの対象になる(恒常入り済みでも「限定」表記は維持) */
function limitedUnlocked(c, t){
  t=t||todayKey();
  for(const s of LTD_SLOTS){
    for(let i=0;i<s.banners.length;i++){
      if(s.banners[i].chars.indexOf(c.id)<0) continue;
      // バナーiの初回開催=i周目(周期14日)。その終了日を過ぎたら恒常入り
      if(t>addDays(s.epoch, i*14+13)) return true;
    }
  }
  return BANNERS.some(b=>b.chars.indexOf(c.id)>=0 && t>b.end);
}
/* レア度ごとの排出プール。banner指定時はピックアップ(feat)も返す */
function gachaPool(rar, banner){
  const normal=CHARS.filter(c=>c.rar===rar && (!c.limited || limitedUnlocked(c)));
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
const GACHA_RATES=[55,32,10,3];      // 恒常: N/R/SR/SSR %
const GACHA_RATES_LTD=[48,32,15,5];  // 限定開催: SR/SSRが当たりやすい(限定の売り)
const PULL_GOLD=1000;
function gachaRates(banner){ return banner? GACHA_RATES_LTD : GACHA_RATES; }

function rollChar(banner){
  const R=gachaRates(banner);
  let r=Math.random()*100, rar=1;
  // レアリティの高い方から判定: SSR → SR → R → N残り
  if(r<R[3]) rar=4;
  else if(r<R[3]+R[2]) rar=3;
  else if(r<R[3]+R[2]+R[1]) rar=2;
  else rar=1;
  const pool=gachaPool(rar, banner);
  if(pool.feat){ // ピックアップ: 該当レア枠の50%が限定
    const list=Math.random()<0.5? pool.feat : pool.normal;
    return list[Math.floor(Math.random()*list.length)];
  }
  return pool[Math.floor(Math.random()*pool.length)];
}

/* v4.6.0 通貨の分離: 限定召喚=🎫(学習でしか手に入らない)/恒常召喚=🪙(冒険・任務)。
   学習が限定への唯一の道・冒険は恒常をたくさん回せる、という2本柱にする */
function doPull(n, banner){
  if(banner){
    if(G.tickets<n){ toast("チケットが足りない(クイズの正解1問で🎫1)"); return; }
    G.tickets-=n;
  }else{
    const cost=PULL_GOLD*n;
    if(G.gold<cost){ toast("ゴールドが足りない(冒険・任務で入手)"); return; }
    G.gold-=cost;
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
/* 1枚ずつ裏面からめくれて公開(gflip)。重複は「突破+N」ポップの凸演出つき。
   カードの面(枠・背景)は表=.gfr/裏=.gbkが同じ矩形を占める(裏面の余白対策) */
function gresHTML(r, i){
  const dup=(G.chars[r.c.id]&&G.chars[r.c.id].dup)||0;
  return '<div class="gres">'+
    '<div class="gin" style="animation-delay:'+(i*140)+'ms">'+
      '<div class="gbk">⚔</div>'+
      '<div class="gfr bd'+(r.c.rar===4?5:r.c.rar)+(r.c.rar===4?' shine':'')+'">'+
        (r.c.limited?'<div class="ltdmini">限定</div>':"")+
        '<div class="gface">'+charFace(r.c)+'</div>'+
        '<div class="grar '+CHAR_RAR_CLASS[r.c.rar-1]+'">'+CHAR_RAR[r.c.rar-1]+'</div>'+
        '<div class="gname">'+esc(r.c.name)+'</div>'+
        '<div class="gsub">'+(r.isNew? "NEW!" : "突破 +"+(dup>10? 2:6)+"%")+'</div>'+
      '</div>'+
    '</div>'+
    (!r.isNew? '<div class="gdup" style="animation-delay:'+(i*140+480)+'ms">突破+'+dup+'!</div>':"")+
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
      '<div id="packResults" class="gresult'+(results.length===1?" single":"")+' hidden"></div>'+
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

/* ---- カスタムアイコン(v4.13.0) ----
   なかまの顔はプレイヤーが任意の画像に変更できる(G.faces[charId]=dataURL)。
   画像はcanvasで96px四方に縮小して保存(1枚あたり数KB・同期にも載る)。
   dataURL以外の値は無視する(不正値の混入対策) */
function charFace(c){
  const f=G.faces && G.faces[c.id];
  return (f && f.slice(0,11)==="data:image/")? '<img class="cface" src="'+f+'" alt="">' : c.face;
}
/* 画像ファイル→96px正方形のdataURL(中央を正方形に切り出し)。cbに渡す */
function faceDataURL(file, cb, onerr){
  const img=new Image();
  const done=url=>{ URL.revokeObjectURL(img.src); cb(url); };
  img.onload=()=>{
    try{
      const S=96, cv=document.createElement("canvas");
      cv.width=cv.height=S;
      const ctx=cv.getContext("2d");
      const m=Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width-m)/2, (img.height-m)/2, m, m, 0, 0, S, S);
      // 透過が要るPNGはPNGのまま、それ以外はJPEGで軽く。大きすぎたら画質を落とす
      let url=file.type==="image/png"? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.85);
      if(url.length>80000) url=cv.toDataURL("image/jpeg", 0.6);
      done(url);
    }catch(e){ URL.revokeObjectURL(img.src); onerr(); }
  };
  img.onerror=()=>{ URL.revokeObjectURL(img.src); onerr(); };
  img.src=URL.createObjectURL(file);
}

/* ---- なかま詳細モーダル(図鑑・編成のなかまから) ---- */
function charDetailHTML(id){
  const c=byChar[id]; if(!c) return "";
  const dup=(G.chars[id]&&G.chars[id].dup)||0;
  const st=charStats(id);
  return '<div class="bigchar bd'+(c.rar===4?5:c.rar)+dupClass(dup)+'" style="--dupc:'+DUP_RGB[c.rar-1]+'">'+
      (c.limited?'<div class="ltdmini">限定</div>':"")+
      '<div style="font-size:52px">'+charFace(c)+'</div>'+
      '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; margin-top:2px">'+CHAR_RAR[c.rar-1]+
        (dup>=10? ' 👑+'+dup : dup? " +"+dup : "")+'</div>'+
      '<div style="font-weight:800; font-size:16px; margin-top:4px; line-height:1.25">'+esc(c.name)+'</div>'+
      (c.sk? '<div class="bcskill">✦ '+esc(c.sk.n)+'<br><span style="font-weight:700; font-size:11px">'+skillDesc(c.sk)+'</span></div>':"")+
    '</div>'+
    '<table class="stt">'+
      '<tr><td>HP</td><td>'+fmt(st.hp)+'</td></tr>'+
      '<tr><td>攻撃</td><td>'+fmt(st.atk)+'</td></tr>'+
      '<tr><td>防御</td><td>'+fmt(st.def)+'</td></tr>'+
      '<tr><td>素早さ</td><td>'+fmt(st.spd)+'</td></tr>'+
      '<tr><td>突破</td><td>+'+dup+'(能力 ×'+dupMult(dup).toFixed(2)+')</td></tr>'+
    '</table>';
}
/* opts: {select:出撃ボタンを出す, back:"dex"=図鑑へ戻るボタン} */
function openCharModal(id, opts){
  opts=opts||{};
  const c=byChar[id]; if(!c || !G.chars[id]) return;
  openModal('<h3>なかま詳細</h3>'+charDetailHTML(id)+
    '<div class="row" style="margin-top:12px; gap:8px">'+
    (opts.back? '<button class="btn" style="flex:1" id="charBackBtn">◀ 図鑑へ</button>':'')+
    (opts.select? '<button class="btn primary" style="flex:2" id="charSelBtn" '+(G.party.char===id?"disabled":"")+'>'+
      (G.party.char===id? "出撃中" : "⚔ 出撃メンバーにする")+'</button>':'')+
    (!opts.back && !opts.select? '<button class="btn primary" style="flex:1" data-close>OK</button>':'')+
    '</div>'+
    // カスタムアイコン(v4.13.0): 好きな画像をこのなかまの顔にできる
    '<div class="row" style="margin-top:8px; gap:8px">'+
    '<button class="btn" style="flex:1" id="faceBtn">🖼 アイコンを変更</button>'+
    (G.faces[id]? '<button class="btn" style="flex:1" id="faceResetBtn">絵文字に戻す</button>':'')+
    '</div>'+
    '<input type="file" id="faceFile" accept="image/*" style="display:none">');
  const bb=$("charBackBtn");
  if(bb) bb.onclick=()=>openDex("chars");
  const sb=$("charSelBtn");
  if(sb && !sb.disabled) sb.onclick=()=>{
    G.party.char=id; saveG(); closeModal(); renderChars();
    toast(c.name+" を出撃メンバーにした");
  };
  const refreshFaces=()=>{ renderChars(); renderEqChars(); if(!$("homeView").classList.contains("hidden")) renderHome(); };
  $("faceBtn").onclick=()=>$("faceFile").click();
  $("faceFile").onchange=e=>{
    const f=e.target.files && e.target.files[0];
    if(!f) return;
    faceDataURL(f, url=>{
      G.faces[id]=url; saveG();
      toast("アイコンを変更した");
      refreshFaces(); openCharModal(id, opts);
    }, ()=>toast("画像を読み込めなかった"));
  };
  const fr=$("faceResetBtn");
  if(fr) fr.onclick=()=>{
    delete G.faces[id]; saveG();
    toast("絵文字アイコンに戻した");
    refreshFaces(); openCharModal(id, opts);
  };
}

/* ---- なかま一覧 ---- */
/* キャラ単体の「素の戦闘力」(カード・呪文を除いたキャラの力比べ用) */
function charBase(id){
  const st=charStats(id);
  return Math.round(st.hp/6 + st.atk*4 + st.def*3 + st.spd*5);
}
let charSort="rar"; // レア(既定)/pow=力/dup=突破/dex=図鑑順
/* ソート比較関数(なかま一覧と図鑑なかまで共用) */
function charCmp(mode){
  const dupOf=c=>(G.chars[c.id]&&G.chars[c.id].dup)||0;
  const CMP={
    rar:(a,b)=>b.rar-a.rar || charBase(b.id)-charBase(a.id),
    pow:(a,b)=>charBase(b.id)-charBase(a.id),
    dup:(a,b)=>dupOf(b)-dupOf(a) || b.rar-a.rar || charBase(b.id)-charBase(a.id),
    dex:(a,b)=>CHARS.indexOf(a)-CHARS.indexOf(b),
  };
  return CMP[mode]||CMP.dex;
}
function sortedOwnedChars(mode){
  return CHARS.filter(c=>G.chars[c.id]).sort(charCmp(mode||"rar"));
}
/* なかまカードのタイル(なかま一覧・出撃キャラ選択モーダルで共用) */
function charCardEl(c){
  const dup=(G.chars[c.id]&&G.chars[c.id].dup)||0;
  const base=charBase(c.id); // 素の戦闘力
  const d=document.createElement("div");
  d.className="charcard bd"+(c.rar===4?5:c.rar)+dupClass(dup);
  d.style.setProperty("--dupc", DUP_RGB[c.rar-1]);
  d.innerHTML=
    (c.limited?'<div class="ltdmini">限定</div>':"")+
    '<div style="font-size:32px">'+charFace(c)+'</div>'+
    '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; font-size:11px">'+CHAR_RAR[c.rar-1]+
      (dup>=10? ' 👑+'+dup : dup? " +"+dup : "")+'</div>'+
    '<div style="font-size:12px; font-weight:700; margin-top:3px; line-height:1.2">'+esc(c.name)+'</div>'+
    (c.sk? '<div class="cskill">✦ '+esc(c.sk.n)+'</div>':"")+
    '<div class="small" style="margin-top:3px">力 '+fmt(base)+'</div>'+
    (G.party.char===c.id? '<div style="font-size:11px; color:var(--accent); font-weight:800; margin-top:3px">出撃中</div>':"");
  return d;
}
function renderChars(){
  const grid=$("charGrid"); grid.innerHTML="";
  const owned=sortedOwnedChars(charSort);
  if(!owned.length){ grid.innerHTML='<div class="empty" style="grid-column:1/-1">ガチャで冒険者を仲間にしよう</div>'; return; }
  owned.forEach(c=>{
    const d=charCardEl(c);
    d.onclick=()=>openCharModal(c.id, {select:true}); // タップで能力の詳細(出撃もここから)
    grid.appendChild(d);
  });
}
/* 出撃キャラの選択モーダル(呪文画面の「変更」から。タップで即選択) */
function openCharPicker(){
  openModal('<h3>⚔ 出撃キャラを選ぶ</h3><div id="pickCharGrid"></div>');
  const grid=$("pickCharGrid");
  sortedOwnedChars("rar").forEach(c=>{
    const d=charCardEl(c);
    d.onclick=()=>{
      G.party.char=c.id; saveG(); closeModal();
      renderEqChars(); renderEqSlots();
      toast(c.name+" を出撃メンバーにした");
    };
    grid.appendChild(d);
  });
}
/* ソート切替(静的DOMのため一度だけバインド) */
$("charSortSeg").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{
    charSort=b.dataset.s;
    $("charSortSeg").querySelectorAll("button").forEach(x=>x.classList.toggle("active", x===b));
    renderChars();
  };
});


/* ---- ガチャ画面(常時2枠の限定+恒常) ----
   v4.6.0: 限定は🎫専用・恒常は🪙専用(通貨の分離)
   v4.6.1: 限定は2枠を同時表示。data-pull="<バナー添字|std>|<回数>" */
function renderGacha(){
  const box=$("gachaBox"); if(!box) return;
  const bs=activeBanners();
  let h="";
  bs.forEach((b,i)=>{
    const endT=new Date(b.end+"T23:59:59");
    const remain=Math.max(1, Math.ceil((endT-Date.now())/864e5));
    h+='<div class="gbanner limited"'+(i? ' style="margin-top:12px"':'')+'>'+
      '<div class="ltdtag">期間限定 ─ 残り'+remain+'日</div>'+
      '<div class="gt">'+b.name+'</div>'+
      '<div class="gs">'+b.desc+(i===0? '<br>🎫はクイズの正解で貯まる(1問=🎫1)':'')+'</div>'+
      '<div class="row" style="justify-content:center; gap:8px; margin-top:12px">'+
      '<button class="btn gold" data-pull="'+i+'|1">1回 🎫1</button>'+
      '<button class="btn gold" data-pull="'+i+'|10">10回 🎫10</button></div>'+
      '</div>';
  });
  h+='<div class="gbanner" style="margin-top:12px">'+
    '<div class="gt">🔮 冒険者召喚</div>'+
    '<div class="gs">冒険や任務で集めた🪙で仲間を召喚しよう</div>'+
    '<div class="row" style="justify-content:center; gap:8px; margin-top:12px">'+
    '<button class="btn gold" data-pull="std|1">1回 🪙1000</button>'+
    '<button class="btn gold" data-pull="std|10">10回 🪙10000</button></div>'+
    '<div class="grates" id="rateInfo">提供割合・突破について ›</div></div>';
  box.innerHTML=h;
  box.querySelectorAll("[data-pull]").forEach(btn=>{
    btn.onclick=()=>{
      const p=btn.dataset.pull.split("|");
      doPull(+p[1], p[0]==="std"? null : bs[+p[0]]||null);
    };
  });
  $("rateInfo").onclick=openRates;
}

function openRates(){
  const row=(i)=>'<tr><td class="'+["rc1","rc2","rc3","rc5"][i]+'">'+CHAR_RAR[i]+'</td>'+
    '<td>'+GACHA_RATES[i]+'%</td><td>'+GACHA_RATES_LTD[i]+'%</td></tr>';
  openModal('<h3>提供割合</h3>'+
    '<table class="stt">'+
    '<tr><td></td><td style="font-weight:800">恒常</td><td style="font-weight:800">限定開催</td></tr>'+
    row(3)+row(2)+row(1)+row(0)+
    '</table>'+
    '<div class="small" style="margin-top:12px; line-height:1.7">'+
    '・限定召喚は🎫専用。🎫はクイズの正解(1問=🎫1)など学習でだけ手に入る<br>'+
    '・恒常召喚は🪙専用。🪙は冒険・任務でたくさん手に入る<br>'+
    '・期間限定は常時2バナーを開催。それぞれ2週間ごとに更新される<br>'+
    '・限定バナーはSSR/SRが当たりやすく、該当レア度枠の50%がピックアップ(限定)キャラになる<br>'+
    '・限定キャラは恒常には入らない(次の開催を待てば必ずまた出会える)<br>'+
    '・同じ冒険者を引くと「突破」となり能力+6%(11回目からは+2%・上限なし)<br>'+
    '・冒険者はそれぞれ固有スキル(✦)を持つ。出撃中の1人のスキルが効果を発揮する</div>'+
    '<div class="row" style="margin-top:12px"><button class="btn primary" style="flex:1" data-close>OK</button></div>');
}
