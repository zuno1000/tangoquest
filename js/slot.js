"use strict";
/* ================= ことだまスロット(v4.26.0) =================
   学習タブ上部のミニゲーム ─ サバイバーと同じ「クイズが駆動する」文法の最小形。
   可逆設計: このファイル+index.htmlの#slotBoxブロック+CSSブロック+
   quiz.js answer()のフック1行(slotOnCorrect)で完結する。

   ■ 学習との相乗効果(設計):
   ・リールを回すのは「正解」だけ ─ ミスでは掛け金も減らない。学習の質が試行回数になる
   ・連続正解コンボが続くほどペアの当たり率が上がる(+0.5%/連続・上限+10%)
     =コンボを守る集中がそのままスロットの勝率になる
   ・掛け金は🪙のみ ─ 🎫は「学習だけが限定への道」という経済分離(v4.6.0)を守る
   ・期待値は素で0.85(緩やかな🪙シンク=心得と並ぶ🪙の行き先)・コンボ最大で1.05
     (上手いほどわずかに得=射幸のインフレは起きない) */

const SLOT_BETS=[100, 500, 2000];
const SLOT_SYMS=["🪙","📖","🍀"];            // 3つ揃い(通常)の絵柄
const SLOT_PAY={seven:50, gem:15, triple:6, pair:2}; // 配当(掛け金の倍率)

/* 当たり確率(純関数)。コンボでペア率だけが伸びる(+0.5%/連続・上限+10%) */
function slotOdds(combo){
  return {seven:0.002, gem:0.01, triple:0.03,
          pair:0.21+0.005*Math.min(20, combo||0)};
}

/* 1回転(純関数)。rndは注入可能([0,1)を返す関数)=テストで決定的に検証できる。
   戻り値 {reels:[絵柄×3], win:獲得🪙, kind:"seven"|"gem"|"triple"|"pair"|"lose"} */
function slotSpin(bet, combo, rnd){
  rnd=rnd||Math.random;
  const o=slotOdds(combo);
  const r=rnd();
  let kind, reels;
  if(r<o.seven){ kind="seven"; reels=["7️⃣","7️⃣","7️⃣"]; }
  else if(r<o.seven+o.gem){ kind="gem"; reels=["💎","💎","💎"]; }
  else if(r<o.seven+o.gem+o.triple){
    kind="triple";
    const s=SLOT_SYMS[Math.floor(rnd()*SLOT_SYMS.length)];
    reels=[s,s,s];
  }else if(r<o.seven+o.gem+o.triple+o.pair){
    kind="pair";
    const s=SLOT_SYMS[Math.floor(rnd()*SLOT_SYMS.length)];
    const other=SLOT_SYMS[(SLOT_SYMS.indexOf(s)+1)%SLOT_SYMS.length];
    const pos=Math.floor(rnd()*3); // 揃わない1つの場所
    reels=[s,s,s]; reels[pos]=other;
  }else{
    kind="lose";
    // はずれは3つバラバラ(ペアと見分けがつく見た目)
    const a=[...SLOT_SYMS];
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    reels=a.slice(0,3);
  }
  return {reels, kind, win: kind==="lose"? 0 : Math.round(bet*SLOT_PAY[kind])};
}

/* セッション収支(保存しない=遊んでいる間だけの数字。🪙の増減自体はG.goldに乗る) */
var SLOT_SES={n:0, net:0};
let slotFxT=[]; // 演出タイマー(次のスピンが来たら前の演出を打ち切る)

function slotActive(){ return !!(G.opt && G.opt.slotBet>0); }

/* quiz.js answer()の正解時フック。掛け金を払って回し、当たりを🪙に加算して結果を返す
   (🪙不足・スロットを畳んでいるときはnull=何もしない)。saveG/refreshHeaderは呼び元が行う */
function slotOnCorrect(){
  if(!slotActive()) return null;
  const bet=G.opt.slotBet;
  if((G.gold||0)<bet){ slotMsg("🪙が足りない(掛け金を下げよう)"); return null; }
  G.gold-=bet;
  const r=slotSpin(bet, G.combo, Math.random);
  if(r.win) G.gold+=r.win;
  SLOT_SES.n++; SLOT_SES.net+=r.win-bet;
  slotAnimate(r, bet);
  return r;
}

function slotSesText(){
  if(!SLOT_SES.n) return "";
  const net=SLOT_SES.net;
  return SLOT_SES.n+"回転 ・ 収支 <b style=\"color:"+(net>=0? "var(--ok)":"var(--ng)")+"\">"+
    (net>=0? "+":"")+fmt(net)+"</b>";
}
function slotMsg(html){
  const el=$("slotMsg");
  if(el) el.innerHTML=html;
}

/* リール演出: 回転(ぼかし+絵柄の入れ替え)→左から順に止まる→結果表示。
   全体で約650ms=「自動で次へ(最短1秒)」より先に終わる */
function slotAnimate(r, bet){
  const reels=[...document.querySelectorAll("#slotReels .sreel")];
  if(!reels.length) return; // 画面がなくても回転自体は成立している(state更新済み)
  slotFxT.forEach(clearTimeout); slotFxT=[];
  slotMsg("");
  const pool=SLOT_SYMS.concat(["💎","7️⃣"]);
  reels.forEach((el,i)=>{
    el.classList.add("sspin");
    el.textContent=pool[Math.floor(Math.random()*pool.length)];
    slotFxT.push(setTimeout(()=>{
      el.classList.remove("sspin");
      el.textContent=r.reels[i];
    }, 200+i*150));
  });
  slotFxT.push(setTimeout(()=>{
    const ses=$("slotSes");
    if(ses) ses.innerHTML=slotSesText();
    if(r.kind==="lose") slotMsg('<span style="color:var(--sub)">はずれ… −🪙'+fmt(bet)+'</span>');
    else{
      const label={seven:"7️⃣ジャックポット!!", gem:"💎大当たり!", triple:"3つ揃い!", pair:"あいこ!"}[r.kind];
      slotMsg('<b style="color:var(--accent)">'+label+' +🪙'+fmt(r.win)+'</b>');
      if(r.kind==="seven"||r.kind==="gem"){ toast("🎰 "+label+" 🪙"+fmt(r.win)+"を獲得!"); vibe([40,60,120]); }
    }
    refreshHeader(); // 当たりぶんをヘッダーに反映(掛け金はanswer側のsaveGで反映済み)
    saveG();
  }, 620));
}

/* パネルの描画。掛け金(G.opt.slotBet)が唯一の状態: 0=チップだけ(たたむ)/>0=展開+稼働 */
function renderSlot(){
  const box=$("slotBox"); if(!box) return;
  if(!slotActive()){
    box.innerHTML='<div class="slotrow"><button class="slotchip" id="slotOpenBtn">🎰 スロットであそぶ</button></div>';
    $("slotOpenBtn").onclick=()=>{ G.opt.slotBet=SLOT_BETS[0]; saveG(); renderSlot(); };
    return;
  }
  box.innerHTML='<div class="panel slotpanel">'+
    '<div class="row">'+
      '<b style="font-size:13px; flex:0 0 auto">🎰 ことだまスロット '+helpBtn("hlp-slot")+'</b>'+
      '<span class="small grow" style="text-align:right" id="slotSes">'+slotSesText()+'</span>'+
      '<button class="slotchip" id="slotCloseBtn">やめる</button></div>'+
    helpNote("hlp-slot", '<b>正解するたび</b>に掛け金🪙を払ってリールが回る(ミスでは回らない=掛け金も減らない)。'+
      '<b>連続正解コンボが続くほど当たりやすくなる</b>。配当: あいこ2つ=2倍 ・ 3つ揃い=6倍 ・ 💎=15倍 ・ 7️⃣=50倍。'+
      '掛け金は🪙のみ(🎫は使わない)。サバイバー中は回らない ─ 学習タブ専用のおたのしみ')+
    '<div id="slotReels">'+
      '<span class="sreel">❔</span><span class="sreel">❔</span><span class="sreel">❔</span>'+
      '<span id="slotMsg" class="small">正解でリールが回る!</span></div>'+
    '<div class="row slotbets"><span class="small" style="flex:0 0 auto">掛け金</span>'+
      SLOT_BETS.map(b=>'<button class="btn sbet'+(G.opt.slotBet===b?" active":"")+'" data-bet="'+b+'">🪙'+fmtShort(b)+'</button>').join("")+
    '</div></div>';
  $("slotCloseBtn").onclick=()=>{ G.opt.slotBet=0; saveG(); renderSlot(); };
  document.querySelectorAll("#slotBox .sbet").forEach(btn=>{
    btn.onclick=()=>{ G.opt.slotBet=+btn.dataset.bet; saveG(); renderSlot(); };
  });
}
renderSlot();
