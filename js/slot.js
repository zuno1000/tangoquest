"use strict";
/* ================= ことだまスロット(v4.27.0: 冒険タブのミニゲームに刷新) =================
   サバイバーと同じ「上=ゲーム/下=クイズ」の独立ビュー(#slotView)。冒険ハブから入る。
   v4.26.0の学習タブ内スロット(正解でリールが回る)は実機FBで刷新:
   「リールは常に回り続け、正解が相乗効果(ブースト◆)を注ぐ」方式へ。

   ■ ゲームの形:
   ・リールは約3秒に1回、自動で回り続ける(そのたび掛け金🪙を払う)
   ・素の回転は期待値0.80=ゆるい🪙シンク。迷っている間も回り続けて🪙が減る
   ・正解=ブースト◆+1(コンボ10以上なら+2・最大20)。◆がある回転は「ことだま入り」
     になり当たり率が上がる(期待値1.10)=解く質と速さがそのまま機械の回りになる
   ・時間が流れるのは出題中+答え合わせ中。モーダル・離脱中は停止(svShouldPauseと同一条件)
   ・掛け金はスライダーで自由(🪙10〜2,000)。🪙が掛け金に足りない回転はお休み(減らない)
   ・掛け金は🪙のみ ─ 🎫は「学習だけが限定への道」の経済分離(v4.6.0)を守る
   ■ 帳簿: 解答はsvApplyAnswer(サバイバー=学習タブと同一)で正史の学習記録になる
   ■ 可逆設計: このファイル+index.htmlの#slotViewブロック+CSSブロック+
     TABSの1行+renderAdv(sv.js)の入口パネルで完結(svApplyAnswer/svShouldPause/svFxは
     冒険モード共通の土台として参照する) */

const SLOT_TICK=250;                 // 論理tick(ms)
const SLOT_SPIN_IV=3000;             // リールが結果を出す間隔(ms)
const SLOT_BET_MIN=10, SLOT_BET_MAX=2000, SLOT_BET_DEF=100;
const SLOT_BOOST_MAX=20;             // ブースト◆の持ち越し上限
const SLOT_SYMS=["🪙","📖","🍀"];   // 3つ揃い(通常)の絵柄
const SLOT_PAY={seven:50, gem:15, triple:6, pair:2}; // 配当(掛け金の倍率)

/* 当たり確率(純関数)。ことだま入り(boosted)は全体に上振れ:
   期待値 素=0.80 / ことだま入り=1.10(正解1問が約+30%ぶんの追い風) */
function slotOdds(boosted){
  return boosted
    ? {seven:0.0026, gem:0.012, triple:0.045, pair:0.26}
    : {seven:0.002,  gem:0.01,  triple:0.03,  pair:0.185};
}
function slotEV(boosted){
  const o=slotOdds(boosted);
  return o.seven*SLOT_PAY.seven+o.gem*SLOT_PAY.gem+o.triple*SLOT_PAY.triple+o.pair*SLOT_PAY.pair;
}
/* 正解1問で乗るブースト◆(コンボ10以上は+2=学習との相乗効果) */
function slotBoostGain(combo){ return (combo||0)>=10? 2:1; }

/* 1回転(純関数)。rndは注入可能([0,1)を返す関数)=テストで決定的に検証できる。
   戻り値 {reels:[絵柄×3], win:獲得🪙, kind, boosted} */
function slotSpin(bet, boosted, rnd){
  rnd=rnd||Math.random;
  const o=slotOdds(boosted);
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
  return {reels, kind, boosted:!!boosted,
          win: kind==="lose"? 0 : Math.round(bet*SLOT_PAY[kind])};
}

/* セッション(保存しない)。ses={n:回転数, net:収支, b:ことだま入り回数} */
function slotNewSession(bet){
  return {bet:Math.min(SLOT_BET_MAX, Math.max(SLOT_BET_MIN, bet||SLOT_BET_DEF)),
          t:0, nextAt:SLOT_SPIN_IV, boost:0, ses:{n:0, net:0, b:0}};
}

/* 1回転の精算(純関数寄り: gは{gold}互換)。🪙不足はnull=回らない(減らない)。
   ブースト◆があれば1つ消費して「ことだま入り」の確率で回る */
function slotResolveSpin(sl, g, rnd){
  if((g.gold||0)<sl.bet) return null;
  const boosted=sl.boost>0;
  if(boosted) sl.boost--;
  const r=slotSpin(sl.bet, boosted, rnd);
  g.gold+=r.win-sl.bet;
  sl.ses.n++; sl.ses.net+=r.win-sl.bet; if(boosted) sl.ses.b++;
  return r;
}

/* ---- 画面(slotView) ---- */
var SL=null, slCur=null, slAnswered=false, slLoop=null;
var slAutoNextT=null;
let slFxT=[];
const SLOT_FLICK=SLOT_SYMS.concat(["💎","7️⃣"]);
const SLOT_RM=!!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

function openSlotGame(){
  if(!SL) SL=slotNewSession(G.opt && G.opt.slotBet);
  closeModal();
  switchTab("slot");
  $("slBet").value=SL.bet;
  slQuestion();
  renderSlotHud();
  slotMsg("リールは回り続ける ─ 正解のことだまを乗せろ");
  if(!slLoop) slLoop=setInterval(slFrame, SLOT_TICK);
}
/* 後片付け(テスト・完全退出用)。「←」では呼ばない=戻っても続きから遊べる(時間は停止) */
function slotCleanup(){
  if(slLoop){ clearInterval(slLoop); slLoop=null; }
  clearTimeout(slAutoNextT);
  slFxT.forEach(clearTimeout); slFxT=[];
  SL=null;
}

/* 論理tick。停止条件はサバイバーと同一(svShouldPause=タブ非表示・別画面・モーダル)。
   出題中も答え合わせ中も回り続ける=「常に回るリール」 */
function slFrame(){
  if(!SL) return;
  if(svShouldPause(document.hidden,
      $("slotView").classList.contains("hidden"),
      $("overlay").classList.contains("show"))) return;
  // 回転中の絵柄ちらつき(常に回っている感)。reduced-motionでは止め絵
  if(!SLOT_RM) document.querySelectorAll("#slReels .sreel.sspin").forEach(el=>{
    el.textContent=SLOT_FLICK[Math.floor(Math.random()*SLOT_FLICK.length)];
  });
  SL.t+=SLOT_TICK;
  if(SL.t>=SL.nextAt){
    SL.nextAt+=SLOT_SPIN_IV;
    const r=slotResolveSpin(SL, G, Math.random);
    if(r){
      saveG(); refreshHeader();
      slotAnimate(r);
    }else slotMsg('<span style="color:var(--ng)">🪙が掛け金に足りない ─ お休み(掛け金を下げよう)</span>');
    renderSlotHud();
  }
}

function slotMsg(html){ const el=$("slMsg"); if(el) el.innerHTML=html; }

function renderSlotHud(){
  if(!SL) return;
  const net=SL.ses.net;
  $("slSes").innerHTML=SL.ses.n
    ? "回転"+SL.ses.n+"(◆入り"+SL.ses.b+") ・ 収支 <b style=\"color:"+(net>=0? "var(--ok)":"var(--ng)")+"\">"+(net>=0? "+":"")+fmt(net)+"</b>"
    : "解きながら回すミニゲーム";
  const bc=$("slBoost");
  bc.textContent="◆"+SL.boost;
  bc.classList.toggle("on", SL.boost>0);
  $("slBetVal").textContent="🪙"+fmt(SL.bet);
  $("slMachine").classList.toggle("slfever", SL.boost>0);
}

/* 結果の見せ方: 左から順にリールが止まり、少し見せてからまた回り出す */
function slotAnimate(r){
  const reels=[...document.querySelectorAll("#slReels .sreel")];
  if(!reels.length) return;
  slFxT.forEach(clearTimeout); slFxT=[];
  reels.forEach((el,i)=>{
    slFxT.push(setTimeout(()=>{ el.classList.remove("sspin"); el.textContent=r.reels[i]; }, i*140));
  });
  slFxT.push(setTimeout(()=>{
    const tag=r.boosted? '<span class="slbtag">◆ことだま入り</span> ':'';
    if(r.kind==="lose") slotMsg(tag+'<span style="color:var(--sub)">はずれ… −🪙'+fmt(SL.bet)+'</span>');
    else{
      const label={seven:"7️⃣ジャックポット!!", gem:"💎大当たり!", triple:"3つ揃い!", pair:"あいこ!"}[r.kind];
      slotMsg(tag+'<b style="color:var(--accent)">'+label+' +🪙'+fmt(r.win)+'</b>');
      if(r.kind==="seven"||r.kind==="gem"){ toast("🎰 "+label+" 🪙"+fmt(r.win)+"を獲得!"); vibe([40,60,120]); }
      svFx($("slMachine"), "slwin");
    }
  }, 460));
  slFxT.push(setTimeout(()=>{
    reels.forEach(el=>el.classList.add("sspin"));
  }, 2100));
}

/* ---- クイズ(svViewと同じ流儀・帳簿はsvApplyAnswerで完全共有) ---- */
function slQuestion(){
  const w=pickWord();
  slCur={word:w, choices:buildChoices(w)};
  slRenderQuestion();
}
function slRenderQuestion(){
  if(!slCur) return;
  slAnswered=false;
  $("slNextBtn").style.visibility="hidden";
  $("slPrompt").classList.remove("srch");
  const w=slCur.word, st=G.words[w.en], e2j=G.mode==="e2j";
  $("slBadge").textContent = !st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習");
  $("slCount").textContent=todayCountText();
  $("slStats").innerHTML=qStatsHTML(st);
  $("slWord").textContent = e2j? w.en : w.ja;
  const box=$("slChoices"); box.innerHTML="";
  slCur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent = e2j? c.ja : c.en;
    b.onclick=()=>slAnswer(c, b);
    box.appendChild(b);
  });
  refitChoices("#slChoices .choice");
}
function slAnswer(chosen, btn){
  if(slAnswered || !SL) return;
  slAnswered=true;
  const w=slCur.word, ok=chosen.en===w.en, e2j=G.mode==="e2j";
  document.querySelectorAll("#slChoices .choice").forEach(b=>{
    b.disabled=true;
    const isCorrect = b.textContent === (e2j? w.ja : w.en);
    if(isCorrect) b.classList.add("correct");
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  svApplyAnswer(w, ok); // 学習計上はサバイバー・学習タブと同一
  $("slStats").innerHTML=qStatsHTML(G.words[w.en]);
  $("slCount").textContent=todayCountText();
  $("slPrompt").classList.add("srch");
  saveG(); refreshHeader();
  if(ok){
    // 相乗効果: 正解のことだまがリールに乗る(コンボ10以上は+2)
    const gain=slotBoostGain(G.combo);
    SL.boost=Math.min(SLOT_BOOST_MAX, SL.boost+gain);
    slotMsg('<b style="color:var(--accent)">◆ことだま+'+gain+'!</b> 次の回転に乗る(いま◆'+SL.boost+')');
    svFx($("slMachine"), "slwin");
    vibe(12);
  }else{
    slotMsg('<span style="color:var(--sub)">ミス ─ ことだまは乗らなかった…</span>');
  }
  renderSlotHud();
  $("slNextBtn").style.visibility="visible";
  // 自動で次へ(v4.26.0設定・学習/サバイバーと共通)
  if(G.opt && G.opt.autoNext){
    clearTimeout(slAutoNextT);
    slAutoNextT=setTimeout(()=>{ if(slAnswered) slNext(); }, G.opt.autoNext);
  }
}
function slNext(){
  clearTimeout(slAutoNextT);
  if(!SL) return;
  slQuestion();
}

/* ---- 静的DOMへのバインド ---- */
$("slBack").onclick=()=>switchTab("adv"); // セッションは保持(時間停止・ハブの「つづける」で再開)
$("slNextBtn").onclick=slNext;
$("slBet").oninput=()=>{
  if(!SL) return;
  SL.bet=+$("slBet").value;
  G.opt.slotBet=SL.bet; saveG(); // 掛け金の好みは端末に記憶
  renderSlotHud();
};
/* 正誤確認中は単語タップで辞書へ(学習タブ・サバイバーと同じ流儀) */
$("slPrompt").onclick=()=>{
  if(!slAnswered || !slCur) return;
  window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(slCur.word.en), "_blank", "noopener");
};
