"use strict";
/* ================= ことだまスロット(v4.27.0: 冒険タブのミニゲームに刷新) =================
   サバイバーと同じ「上=ゲーム/下=クイズ」の独立ビュー(#slotView)。冒険ハブから入る。
   v4.26.0の学習タブ内スロット(正解でリールが回る)は実機FBで刷新:
   「リールは常に回り続け、正解が相乗効果(ブースト◆)を注ぐ」方式へ。

   ■ ゲームの形(v4.28.0で経済を改修: 「収支がマイナスになり続ける」FBへの回答):
   ・リールは約3秒に1回、自動で回り続ける(そのたび掛け金🪙を払う)
   ・素の回転は期待値0.90=ゆるい🪙シンク。迷っている間も回り続けて🪙が減る
   ・正解=ブースト◆+1(コンボ10以上+2・20以上+3・最大20)。◆がある回転は「ことだま入り」
     になり当たり率が上がる(期待値1.10)+当たりの配当にコンボ倍率(+3%/連続・最大×1.6)
     =解く質と速さがそのまま機械の回りになり、正解が続くほど相乗効果が増していく
   ・📜スロットの心得(永続強化・🪙シンク): 配当/幸運/大当り/守り/込めの5系統・上限なし
     (費用は6段目から×2.5の幾何級数)。効果は「ことだま入り」限定=放置では絶対に儲からない
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
/* 配当(掛け金の倍率)。v4.28.0で増額: 「収支がマイナスになり続ける」FBへの回答。
   7️⃣は77倍のジャックポットに */
const SLOT_PAY={seven:77, gem:20, triple:8, pair:2.5};

/* ---- スロットの心得(v4.28.0): サバイバーの心得と同じ形式の永続強化=🪙シンク ----
   効果はすべて「ことだま入り(◆を消費した回転)」にだけ効く ─ 素回しの期待値0.90は
   どれだけ修めても不変=放置では絶対に儲からず、正解だけがすべての源泉(AFK悪用の封じ込め) */
const SLOT_META=[
  {id:"pay",    ic:"💰", name:"配当の心得", desc:"ことだま入りの配当 +4%/Lv"},
  {id:"luck",   ic:"🍀", name:"幸運の心得", desc:"ことだま入りのあいこ率 +1.2%/Lv"},
  {id:"jack",   ic:"7️⃣", name:"大当りの心得", desc:"ことだま入りの7️⃣・💎率 +6%/Lv"},
  {id:"insure", ic:"🛡", name:"守りの心得", desc:"ことだま入りのはずれで掛け金の4%/Lvが戻る(最大80%)"},
  {id:"charge", ic:"🔮", name:"込めの心得", desc:"正解で乗る◆が10%/Lvの確率で+1(Lv10ごとに確定+1)"},
];
const SLOT_META_COST=[300,900,2500,6000,15000]; // Lv1→5の🪙。6段目以降は×2.5の幾何級数
function slotMetaCost(lv){
  if(lv<SLOT_META_COST.length) return SLOT_META_COST[lv];
  return Math.round(SLOT_META_COST[SLOT_META_COST.length-1]*Math.pow(2.5, lv-SLOT_META_COST.length+1));
}
function slotMetaOf(g){ return (g.slot&&g.slot.meta)||{}; }
function slotBuyMeta(g, id){
  g.slot=g.slot||{}; g.slot.meta=g.slot.meta||{};
  const def=SLOT_META.find(x=>x.id===id);
  const lv=g.slot.meta[id]||0;
  if(!def) return null;
  const cost=slotMetaCost(lv);
  if((g.gold||0)<cost) return null;
  g.gold-=cost;
  g.slot.meta[id]=lv+1;
  return {lv:lv+1, cost};
}
/* 一括で修める(安い順の貪欲=svBuyMetaAllと同じ流儀)。dryRun=見積もりだけ */
function slotBuyMetaAll(g, dryRun){
  const meta=Object.assign({}, slotMetaOf(g));
  let gold=g.gold||0, count=0, spent=0;
  for(;;){
    let best=null;
    for(const m of SLOT_META){
      const cost=slotMetaCost(meta[m.id]||0);
      if(cost<=gold && (!best || cost<best.cost)) best={id:m.id, cost};
    }
    if(!best) break;
    gold-=best.cost; spent+=best.cost; count++;
    meta[best.id]=(meta[best.id]||0)+1;
  }
  if(count && !dryRun){
    g.gold=gold;
    g.slot=g.slot||{};
    g.slot.meta=meta;
  }
  return {count, spent};
}

/* 当たり確率(純関数)。ことだま入り(boosted)は全体に上振れ+心得(幸運/大当り)が乗る。
   期待値 素=0.90 / ことだま入り=1.10(さらにコンボ・心得で伸びる)。
   あいこ率は0.6で頭打ち=無限に修めても壊れない受け皿 */
function slotOdds(boosted, meta){
  if(!boosted) return {seven:0.002, gem:0.008, triple:0.0245, pair:0.156};
  meta=meta||{};
  const jm=1+0.06*(meta.jack||0);
  return {seven:0.0025*jm, gem:0.009*jm, triple:0.0325,
          pair:Math.min(0.6, 0.187+0.012*(meta.luck||0))};
}
function slotEV(boosted, meta){
  const o=slotOdds(boosted, meta);
  return o.seven*SLOT_PAY.seven+o.gem*SLOT_PAY.gem+o.triple*SLOT_PAY.triple+o.pair*SLOT_PAY.pair;
}
/* コンボの相乗効果(v4.28.0): ことだま入りの当たりはコンボで配当が伸びる(+3%/連続・最大×1.6)
   =正解を続けるほど「同じ◆」が強くなる */
function slotComboM(combo){ return 1+0.03*Math.min(20, combo||0); }
/* 正解1問で乗るブースト◆: コンボ10以上は+2・20以上は+3(v4.28.0で段階拡大)。
   込めの心得(chargeLv)は10%/Lvの確率で+1(Lv10ごとに確定+1)。rndは注入可能 */
function slotBoostGain(combo, chargeLv, rnd){
  let g=(combo||0)>=20? 3 : (combo||0)>=10? 2 : 1;
  const ex=0.1*(chargeLv||0);
  g+=Math.floor(ex);
  rnd=rnd||Math.random;
  if(rnd()<ex-Math.floor(ex)) g++;
  return g;
}

/* 1回転(純関数)。rndは注入可能([0,1)を返す関数)=テストで決定的に検証できる。
   opts={combo, meta}: ことだま入りの配当にコンボ倍率と配当の心得が乗る。
   戻り値 {reels:[絵柄×3], win:獲得🪙, kind, boosted, comboM} */
function slotSpin(bet, boosted, rnd, opts){
  rnd=rnd||Math.random;
  opts=opts||{};
  const meta=opts.meta||{};
  const o=slotOdds(boosted, meta);
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
  const comboM=boosted? slotComboM(opts.combo) : 1;
  const payM=boosted? (1+0.04*(meta.pay||0))*comboM : 1;
  return {reels, kind, boosted:!!boosted, comboM,
          win: kind==="lose"? 0 : Math.round(bet*SLOT_PAY[kind]*payM)};
}

/* セッション(保存しない)。ses={n:回転数, net:収支, b:ことだま入り回数} */
function slotNewSession(bet){
  return {bet:Math.min(SLOT_BET_MAX, Math.max(SLOT_BET_MIN, bet||SLOT_BET_DEF)),
          t:0, nextAt:SLOT_SPIN_IV, boost:0, ses:{n:0, net:0, b:0}};
}

/* 1回転の精算(純関数寄り: gは{gold}互換)。🪙不足はnull=回らない(減らない)。
   ブースト◆があれば1つ消費して「ことだま入り」の確率・配当で回る。
   opts={combo, meta}: 守りの心得=ことだま入りのはずれで掛け金の一部が戻る */
function slotResolveSpin(sl, g, rnd, opts){
  opts=opts||{};
  if((g.gold||0)<sl.bet) return null;
  const boosted=sl.boost>0;
  if(boosted) sl.boost--;
  const r=slotSpin(sl.bet, boosted, rnd, opts);
  const meta=opts.meta||{};
  if(r.kind==="lose" && boosted && meta.insure){
    r.refund=Math.round(sl.bet*Math.min(0.8, 0.04*meta.insure));
  }
  const delta=r.win+(r.refund||0)-sl.bet;
  g.gold+=delta;
  sl.ses.n++; sl.ses.net+=delta; if(boosted) sl.ses.b++;
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
    const r=slotResolveSpin(SL, G, Math.random, {combo:G.combo, meta:slotMetaOf(G)});
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
    const tag=r.boosted? '<span class="slbtag">◆ことだま入り'+(r.comboM>1? ' ×'+(+r.comboM.toFixed(2)):'')+'</span> ':'';
    if(r.kind==="lose") slotMsg(tag+'<span style="color:var(--sub)">はずれ… −🪙'+fmt(SL.bet)+
      ((r.refund||0)>0? '</span> <span style="color:var(--ok)">🛡+🪙'+fmt(r.refund)+'</span>':'</span>'));
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
    // 相乗効果: 正解のことだまがリールに乗る(コンボ10で+2・20で+3・込めの心得でさらに)
    const gain=slotBoostGain(G.combo, slotMetaOf(G).charge, Math.random);
    SL.boost=Math.min(SLOT_BOOST_MAX, SL.boost+gain);
    const cm=slotComboM(G.combo);
    slotMsg('<b style="color:var(--accent)">◆ことだま+'+gain+'!</b> '+
      (cm>1? '配当×'+(+cm.toFixed(2))+'で':'')+'次の回転に乗る(いま◆'+SL.boost+')');
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

/* ---- スロットの心得(永続強化)の購入モーダル。svOpenMetaと同じ流儀 ---- */
function slotOpenMeta(){
  const meta=slotMetaOf(G);
  let h=metaTabs("slot")+'<h3>📜 スロットの心得 '+helpBtn("hlp-slmeta")+'</h3>'+
    helpNote("hlp-slmeta", '🪙で修めるスロットの永続強化。効果はすべて<b>◆ことだま入りの回転にだけ</b>効く'+
      '(素回しの期待値は変わらない=正解だけがすべての源泉)。'+
      '<b>上限なし</b> ─ 何段でも修められる(6段目からは費用が段ごとに×2.5)。'+
      '「一括で修める」は安い順に買えるだけ買う');
  SLOT_META.forEach(m=>{
    const lv=meta[m.id]||0;
    const cost=slotMetaCost(lv);
    h+='<div class="row svmeta">'+
      '<span class="svupic">'+m.ic+'</span>'+
      '<span class="grow"><b>'+m.name+'</b> <span class="small">Lv'+lv+'</span>'+
      '<br><span class="small">'+m.desc+'</span></span>'+
      '<button class="btn" data-slmeta="'+m.id+'" '+(G.gold<cost? "disabled":"")+'>🪙'+fmtShort(cost)+'</button>'+
      '</div>';
  });
  const est=slotBuyMetaAll(G, true);
  if(est.count)
    h+='<button class="btn primary" id="slMetaAll" style="margin-top:12px; width:100%">'+
      '一括で修める(+'+est.count+'段 ・ 🪙'+fmt(est.spent)+')</button>';
  h+='<div class="small" style="margin-top:10px">所持 🪙'+fmt(G.gold)+'</div>';
  openModal(h); bindMetaTabs();
  $("modal").querySelectorAll("[data-slmeta]").forEach(btn=>{
    btn.onclick=()=>{
      const r=slotBuyMeta(G, btn.dataset.slmeta);
      if(!r){ toast("🪙が足りない(サバイバー・スロットで稼ごう)"); return; }
      saveG(); refreshHeader();
      toast("📜 心得を修めた(Lv"+r.lv+")");
      slotOpenMeta();
    };
  });
  const all=$("slMetaAll");
  if(all) all.onclick=()=>{
    const r=slotBuyMetaAll(G);
    if(!r.count) return;
    saveG(); refreshHeader();
    toast("📜 心得を+"+r.count+"段 修めた(🪙"+fmt(r.spent)+")");
    slotOpenMeta();
  };
}

/* ---- 静的DOMへのバインド ---- */
$("slBack").onclick=()=>switchTab("adv"); // セッションは保持(時間停止・ハブの「つづける」で再開)
$("slMetaBtn").onclick=slotOpenMeta;      // 心得はプレイ中も開ける(モーダル中は時間停止)
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
