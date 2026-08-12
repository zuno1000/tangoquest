"use strict";
/* ================= 単語のサバイバー(サバイバー系ローグライク・β / v4.20.0) =================
   「クイズを解くこと」がそのまま生存戦術になる新モード。冒険タブから遊ぶ。
   単語の防衛線(TD・v4.14〜4.19)を置き換える形で導入(2026-08-12ユーザー方針)。

   ■ 可逆性の約束(防衛線と同じ):
   既存の学習タブ(quiz.js・quizViewのUI)には一切手を入れない。
   このモードは js/sv.js(本ファイル)+ index.htmlのsvView/svEntryブロック+
   CSSのv4.20.0ブロック+TABSの1行だけで成立しており、それらを消せば元に戻る。
   学習の計上(SRS・日別記録・🎫・XP・カード)は学習タブと同一の帳簿付けを
   行うため、このモードで解いた分も正史の学習記録になる。

   ■ ゲームの形(Vampire Survivors系の文法をクイズ駆動に翻訳):
   ・VS: 敵が全方位から際限なく湧く/武器は自動で撃つ/意思決定はレベルアップの
     3択だけ/時間経過で激化 → すべて採用
   ・VSの「移動して避ける」だけは捨てる: クイズを解きながら移動操作は両立
     できないため、自機は中央固定・敵が全方位から迫るアリーナ型にする
     (殲滅が追いつかないと囲まれて死ぬ=移動回避の緊張感を代替)
   具体像:
   ・自機はフィールド中央。敵は縁から湧いて直進し、間合いに入ると殴り続ける
   ・武器=呪文の節が自動発火(動詞タイプで撃ち方が変わる: 強撃=最近接/
     貫通=直線ビーム/吸収=HPドレイン/連撃=2体)。自動火力だけでは湧きの
     激化に追いつかない係数にしてある(正解とレベルアップが生存の前提)
   ・正解=◆ジェム獲得(コンボで増)+全武器の即時一斉バースト。ミス=コンボ
     リセットのみ(自動攻撃は止まらない)
   ・◆が貯まるとレベルアップ: ゲームを止めて3択(威力/連射/バースト/回復/
     守り/金運)。ランの間だけの一時強化=ローグライクの成長
   ・180秒(論理時間)生き延びるとボス出現。倒せば勝利で🪙
   ・時間は「出題中」だけ流れる: 答え合わせ・3択・タブ移動中は完全停止。
     じっくり考える余地は保証しつつ、考えている間も敵は迫る
   ・倒した敵の🪙は勝っても負けても全額持ち帰り(ローグライトの快感) */

/* ---- 定数(ゲームバランスはここに集約=実機FBごとの調整を速く) ---- */
const SV_TICK=250;              // 論理tick(ms)。描画はCSSトランジションで補間
const SV_STAGE_SEC=180;         // ボス出現までの生存時間(秒・論理時間)
const SV_CX=50, SV_CY=50;       // 自機の座標(フィールドは0〜100の正規化座標)
const SV_REACH=9;               // 敵が足を止めて殴りかかる間合い
const SV_TOUCH_CD=1200;         // 敵の攻撃間隔(ms)
const SV_SPAWN0=3200, SV_SPAWN1=1100; // 湧き間隔(ms): 開始→ボス直前へ線形に短縮
const SV_HPF=0.55;              // 敵HP係数(ダンジョンより軽い=群れで押す)
const SV_BOSS_HPF=1.4;          // ボスHP係数(enemyForのボス補正にさらに乗る)
const SV_AUTO=0.55;             // 自動発火の威力係数(dpt比)
const SV_BURST=2.2;             // 正解バーストの威力係数(dpt比)
const SV_CD={0:2600, 1:4200, 2:3400, 3:3000}; // 動詞タイプ別の自動発火間隔(ms)
const SV_GEM_LV0=4, SV_GEM_STEP=2;  // レベルアップ必要◆: 4, 6, 8, …
const SV_HEAL_CAP=0.08;         // 吸収の回復上限(発射1回あたり最大HP比)
const SV_MAXFOES=28;            // 同時出現数の上限(スマホ描画ガード)
const SV_BEAM_DEG=32;           // 貫通ビームの有効角(度)

/* レベルアップの3択候補(ランの間だけの一時強化) */
const SV_UPGRADES=[
  {id:"pow",  ic:"⚔",  name:"言霊の研磨",   desc:"すべての攻撃の威力 +25%"},
  {id:"rate", ic:"⏩", name:"詠唱加速",     desc:"自動発火の間隔 -18%"},
  {id:"burst",ic:"💥", name:"会心の正解",   desc:"正解バーストの威力 +35%"},
  {id:"heal", ic:"🌿", name:"いやしの言葉", desc:"いますぐHP40%回復 & 最大HP +10%"},
  {id:"guard",ic:"🛡", name:"まもりの言霊", desc:"受けるダメージ -15%"},
  {id:"gold", ic:"💰", name:"金運の言霊",   desc:"獲得ゴールド +30%"},
];

/* ---- 純関数(テスト対象) ---- */

/* 呪文スナップショットの整形(tdSnapshotと同じ思想): playerStats()の節を
   武器リストに落とす。キャラ倍率・セット効果・増幅・スキルは各節のVに織り込み。
   節がない(呪文が空)ならキャラ攻撃の素の一撃(新規プレイヤー保護) */
function svSnapshot(P){
  const k=(P.charM||1)*(P.setM||1)*(P.amp||1)*(1+(P.abDmg||0));
  let cls=(P.clauses||[]).filter(c=>c.V>0).map(c=>(
    {V:c.V*k, vt:c.vt||0, w:c.w||1, rep:c.rep||0, name:c.name||null}));
  if(!cls.length) cls=[{V:Math.max(P.dpt||0, P.catk||10), vt:0, w:1, rep:0, name:null}];
  return {cls, hp:P.hp, abBoss:P.abBoss||0, dpt:Math.max(P.dpt||0, P.catk||10)};
}

/* 編成中の野生語のうち復習期限切れの数(=錆び)。防衛線から継承したルール:
   錆びた言霊1つにつき威力-6%(最大-30%)。復習して研ぎ直すと戻る(出撃時判定) */
function svRustCount(){
  let n=0;
  equippedEnSet().forEach(en=>{ if(isWild(en) && wildOverdue(en)) n++; });
  return n;
}
function svRustMult(n){ return Math.max(0.7, 1-0.06*(n||0)); }

/* 湧き間隔(ms): 経過時間でSV_SPAWN0→SV_SPAWN1へ線形短縮(VS式の激化) */
function svSpawnIv(tMs){
  const p=Math.min(1, tMs/(SV_STAGE_SEC*1000));
  return Math.round(SV_SPAWN0+(SV_SPAWN1-SV_SPAWN0)*p);
}

/* 正解1問の◆ジェム。コンボが乗る(5連続で2個・10連続で3個) */
function svGemGain(ok, combo){
  if(!ok) return 0;
  return (combo||0)>=10? 3 : (combo||0)>=5? 2 : 1;
}
/* 次のレベルに必要な◆: 4, 6, 8, …(1ラン40問正解でLv+5前後になる調整) */
function svXpNext(lv){ return SV_GEM_LV0+SV_GEM_STEP*(lv-1); }
/* ◆を加算し、レベルアップしたらtrue(余りは持ち越し) */
function svAddGems(b, n){
  b.gem+=n;
  const need=svXpNext(b.lv);
  if(b.gem>=need){ b.gem-=need; b.lv++; return true; }
  return false;
}

/* 敵の生成。ダンジョン定義(DUNGEONS)を流用し、経過時間で深い階の敵になる。
   HPは群れ用に軽くする(ボスは逆に重く=ランの締めの長期戦) */
function svFoe(d, tMs, boss){
  const prog=Math.min(1, tMs/(SV_STAGE_SEC*1000));
  const floor=boss? d.floors : 1+Math.round((d.floors-1)*prog);
  const e=enemyFor(d.tier, floor, d.floors, boss, d.names, d.boss, {elem:d.elem, trait:d.trait});
  e.icon=boss? d.bossIcon : d.eicons[Math.floor(Math.random()*d.eicons.length)];
  e.hp=Math.round(e.hp*(boss? SV_BOSS_HPF : SV_HPF));
  e.hpMax=e.hp;
  // 縁のランダムな角度から湧く(全方位)
  const a=Math.random()*2*Math.PI;
  e.x=Math.min(97, Math.max(3, SV_CX+47*Math.cos(a)));
  e.y=Math.min(96, Math.max(4, SV_CY+44*Math.sin(a)));
  e.sp=(3.2+(e.spd||10)*0.14)*(boss? 0.5:1); // 進行速度(正規化座標/秒)
  e.atkCd=SV_TOUCH_CD; // 間合いに入ってから最初の一撃までの猶予
  return e;
}

/* 戦闘状態の生成。編成は出発時スナップショットで固定
   (無限回廊と同じ思想: ラン中の装備替えは効かない=放置悪用も防げる) */
function svNewRun(d, P, rustN){
  const b={id:d.id, name:d.name, icon:d.icon, tier:d.tier, elem:d.elem,
    t:0, hp:P.hp, hpMax:P.hp, def:P.def||0,
    P:svSnapshot(P),
    em:elemMatch(P.elems||[], d.elem).dealt,
    emTaken:elemMatch(P.elems||[], d.elem).taken,
    rust:rustN||0, rustM:svRustMult(rustN),
    enemies:[], seq:0, spawnAt:0,
    lv:1, gem:0, kills:0, gold:0,
    up:{pow:1, rate:1, burst:1, guard:1, gold:1},
    bossAt:SV_STAGE_SEC*1000, bossOn:false,
    over:false, win:false};
  b.weapons=b.P.cls.map((cl,i)=>(
    {V:cl.V, vt:cl.vt, w:cl.w, rep:cl.rep, name:cl.name, cd:600+i*700})); // 初弾は時間差
  return b;
}

/* 自機からの距離と角度(度) */
function svDist(e){ const dx=e.x-SV_CX, dy=e.y-SV_CY; return Math.sqrt(dx*dx+dy*dy); }
function svAngle(e){ return Math.atan2(e.y-SV_CY, e.x-SV_CX)*180/Math.PI; }

/* 1つの武器(節)の発射。動詞タイプで撃ち方が変わる(防衛線から継承・radial化):
   ・強撃(vt0)= 最も近い敵に一撃
   ・貫通(vt1)= 最も近い敵の方向へビーム(有効角±16度の全敵に60%・防御ほぼ無視)
   ・吸収(vt2)= 最近接に80%+与ダメの35%だけ自機を回復(1発あたり最大HP8%まで)
   ・連撃(vt3)= 近い2体に60%ずつ
   ・反復(rep)= その節をもう一度(威力×rep)
   powFは威力係数(自動=SV_AUTO/バースト=SV_BURST×強化×コンボ)。out={hits,beams,heal}に追記 */
function svCast(b, w, powF, out){
  const alive=()=>b.enemies.filter(e=>e.hp>0).sort((a,c)=>svDist(a)-svDist(c));
  const hit=(e, raw, ignoreDef)=>{
    const eff=Math.max(1, Math.round((raw-(e.def||0)*(ignoreDef? 0.1:0.55))*(e.boss? 1+(b.P.abBoss||0):1)));
    const take=Math.min(e.hp, eff);
    e.hp-=take;
    out.hits.push({name:e.name, icon:e.icon, take, dead:e.hp<=0, x:e.x, y:e.y, boss:!!e.boss});
    return take;
  };
  const casts=w.rep? 2:1;
  for(let c=0;c<casts;c++){
    const base=w.V*w.w*powF*b.em*b.rustM*(c? w.rep:1);
    const es=alive();
    if(!es.length) break;
    if(w.vt===1){
      const a0=svAngle(es[0]);
      out.beams.push(a0);
      es.forEach(e=>{
        let da=Math.abs(svAngle(e)-a0); if(da>180) da=360-da;
        if(da<=SV_BEAM_DEG/2) hit(e, base*0.6, true);
      });
    }else if(w.vt===2){
      let heal=Math.round(hit(es[0], base*0.8)*0.35);
      heal=Math.min(heal, Math.round(b.hpMax*SV_HEAL_CAP));
      if(heal>0){ b.hp=Math.min(b.hpMax, b.hp+heal); out.heal+=heal; }
    }else if(w.vt===3){
      hit(es[0], base*0.6);
      const es2=alive();
      if(es2.length) hit(es2[0], base*0.6);
    }else hit(es[0], base);
  }
}

/* 撃破の精算: 死んだ敵を除去し、🪙とキル数を加算。ボス撃破=勝利 */
function svReap(b){
  const dead=b.enemies.filter(e=>e.hp<=0);
  b.enemies=b.enemies.filter(e=>e.hp>0);
  for(const e of dead){
    b.kills++;
    b.gold+=Math.round((2+b.tier)*(e.boss? 25:1)*b.up.gold);
    if(e.boss){ b.over=true; b.win=true; b.enemies=[]; }
  }
  return dead.length;
}

/* 正解の一斉バースト: 全武器がその場で1回ずつ発火(自動発火のCDは触らない=ボーナス)。
   multはコンボ倍率。戻り値は演出用 {hits, beams, heal} */
function svBurst(b, mult){
  const out={hits:[], beams:[], heal:0};
  const powF=SV_BURST*b.up.pow*b.up.burst*(mult||1);
  for(const w of b.weapons) svCast(b, w, powF, out);
  svReap(b);
  return out;
}

/* 1tickの進行(dtミリ秒)。湧き → 進軍/接敵攻撃 → 自動発火 → 判定。
   戻り値は演出用イベント {spawned, hits, beams, heal, touches, bossIn, win, lose} */
function svTick(b, dt){
  const ev={spawned:[], hits:[], beams:[], heal:0, touches:[], bossIn:false, win:false, lose:false};
  if(b.over) return ev;
  b.t+=dt;
  // ボス出現(以降は通常の湧きを止め、ボスとの決戦に絞る)
  if(!b.bossOn && b.t>=b.bossAt){
    b.bossOn=true;
    const boss=svFoe(b._d||DUNGEONS.find(x=>x.id===b.id), b.t, true);
    boss.uid="eboss";
    b.enemies.push(boss);
    ev.spawned.push(boss); ev.bossIn=true;
  }
  // 通常の湧き(経過時間で間隔が縮む)
  if(!b.bossOn){
    while(b.t>=b.spawnAt){
      b.spawnAt+=svSpawnIv(b.t);
      if(b.enemies.length>=SV_MAXFOES) continue;
      const e=svFoe(b._d||DUNGEONS.find(x=>x.id===b.id), b.t, false);
      e.uid="e"+(++b.seq);
      b.enemies.push(e);
      ev.spawned.push(e);
    }
  }
  // 進軍: 間合いの外なら自機へ直進、間合い内なら足を止めて殴る
  for(const e of b.enemies){
    const dist=svDist(e);
    if(dist>SV_REACH){
      const step=e.sp*dt/1000;
      e.x+=(SV_CX-e.x)/dist*Math.min(step, dist-SV_REACH+0.01);
      e.y+=(SV_CY-e.y)/dist*Math.min(step, dist-SV_REACH+0.01);
      e.atkCd=Math.max(e.atkCd, 300); // 到着直後に即殴らせない
    }else{
      e.atkCd-=dt;
      if(e.atkCd<=0){
        e.atkCd+=SV_TOUCH_CD;
        const dmg=Math.max(1, Math.round((e.atk-b.def*0.55)*b.emTaken*b.up.guard));
        b.hp-=dmg;
        ev.touches.push({dmg, icon:e.icon});
      }
    }
  }
  // 武器の自動発火(それぞれのクールダウンで最近接を撃つ)
  if(b.enemies.length){
    const out={hits:ev.hits, beams:ev.beams, heal:0};
    for(const w of b.weapons){
      w.cd-=dt;
      if(w.cd<=0){
        w.cd+=Math.max(500, SV_CD[w.vt]*b.up.rate);
        svCast(b, w, SV_AUTO*b.up.pow, out);
      }
    }
    ev.heal+=out.heal;
    svReap(b);
    if(b.over && b.win) ev.win=true;
  }else{
    for(const w of b.weapons){ w.cd=Math.max(0, w.cd-dt); } // 敵がいない間は撃たず構える
  }
  if(b.hp<=0){ b.hp=0; b.over=true; b.win=false; ev.lose=true; }
  return ev;
}

/* レベルアップの3択: 候補から3種を重複なしで引く */
function svUpgradeChoices(){
  return shuffle(SV_UPGRADES.slice()).slice(0,3);
}
function svApplyUpgrade(b, id){
  const u=b.up;
  if(id==="pow") u.pow*=1.25;
  else if(id==="rate") u.rate=Math.max(0.4, u.rate*0.82);
  else if(id==="burst") u.burst*=1.35;
  else if(id==="guard") u.guard=Math.max(0.4, u.guard*0.85);
  else if(id==="gold") u.gold*=1.3;
  else if(id==="heal"){
    b.hpMax=Math.round(b.hpMax*1.1);
    b.hp=Math.min(b.hpMax, b.hp+Math.round(b.hpMax*0.4));
  }
}

/* 時間停止の条件(純関数): 答え合わせ中・タブ非表示・別画面・モーダル(3択含む)中 */
function svShouldPause(answered, hidden, viewHidden, modalOpen){
  return !!(answered || hidden || viewHidden || modalOpen);
}

/* 解答の学習計上。quiz.jsのanswer()と同一の帳簿付け(SRS・日別・ペース・🎫・XP・
   カードドロップ)を行う ─ サバイバーで解いた1問も学習タブの1問と等価。
   ※quiz.jsを書き換えず複製しているのは可逆性のため(このファイルごと消せる) */
function svApplyAnswer(w, ok){
  const now=Date.now();
  let st=G.words[w.en];
  const wasNew=!st;
  if(!st) st=G.words[w.en]=[0,0,0,0,0,0,0];
  const preSt=st.slice();
  srsApply(st, ok, now);
  const d=dayRec(); recordDayAnswer(d, wasNew, ok);
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; d.m++; justMastered=true; }
  track("ans"); if(ok) track("cor");
  paceLog(wasNew, ok);
  noteRecent(w.en);
  if(ok){
    G.combo=(G.combo||0)+1;
    G.tickets+=corTicketGain();
    const l0=accountLevel();
    G.xp+=Math.round((10+(justMastered?40:0))*streakXpMult()*comboXpMult()*abilityXpMult());
    let rar=dropRarity(preSt);
    if(Math.random()<comboDropBonus()) rar=Math.min(5, rar+1);
    const drop=addCard(w.en, rar);
    if(justMastered){ toast("🏅 "+w.en+" を覚えた! 7日あけても思い出せた"); vibe([30,40,60]); }
    else if(accountLevel()>l0){ toast("📖 レベルアップ! Lv"+accountLevel()+" ─ 全ステータス強化"); vibe(40); }
    else if(drop.rarUp){ toast("🎉 "+w.en+" のカードが★"+drop.rar+"にランクアップ!"); }
  }else{
    G.combo=0;
  }
  const pq=paceToday(G);
  if(pq && !pq.done && d.a===pq.perDay){ toast("🎉 今日の目安 "+pq.perDay+"問を達成!"); vibe(40); }
  return {ok, wasNew, justMastered};
}

/* ---- 画面(svView) ---- */
var SV=null, svCur=null, svAnswered=false, svLoop=null;

function svRec(){ G.sv=G.sv||{clears:{}}; return G.sv; }

/* CSSアニメを確実に再発火させる(クラスを付け直す) */
function svFx(el, cls){
  if(!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

function svStart(d){
  if(svLoop){ clearInterval(svLoop); svLoop=null; }
  SV=svNewRun(d, playerStats(), svRustCount());
  SV._d=d;
  closeModal();
  switchTab("sv");
  $("svField").innerHTML=""; // 前のランのスプライトを一掃
  svQuestion();
  svTick(SV, SV_TICK);       // 最初の1体を湧かせて即座に見せる
  renderSVField(null);
  svCutinShow('<div class="ci3">'+d.icon+' '+esc(d.name)+' ─ 生きのびろ!</div>', 1100);
  svLoop=setInterval(svFrame, SV_TICK);
}

/* 論理tickの駆動。時間が流れるのは「出題中」だけ:
   答え合わせ・レベルアップ3択・タブ非表示・別画面のときは完全停止 */
function svFrame(){
  if(!SV || SV.over) return;
  if(svShouldPause(svAnswered, document.hidden,
      $("svView").classList.contains("hidden"),
      $("overlay").classList.contains("show"))) return;
  const ev=svTick(SV, SV_TICK);
  renderSVField(ev);
  if(SV.over) setTimeout(svFinish, 700);
}

/* 後片付け(テスト・退出用): ループを止めてランを破棄する */
function svCleanup(){
  if(svLoop){ clearInterval(svLoop); svLoop=null; }
  SV=null;
}

/* カットイン(ボス・開始の告知) */
function svCutinShow(html, ms){
  const ci=$("svCutin");
  if(!ci) return;
  ci.innerHTML=html;
  ci.classList.remove("hidden");
  svFx(ci, "go");
  setTimeout(()=>{ if($("svCutin")) $("svCutin").classList.add("hidden"); }, ms||1500);
}

function svQuestion(){
  if(!SV || SV.over) return;
  svAnswered=false;
  $("svNextBtn").style.visibility="hidden";
  const w=pickWord();
  svCur={word:w, choices:buildChoices(w)};
  const st=G.words[w.en], e2j=G.mode==="e2j";
  // 学習タブと同じヘッダ表記: バッジ・「今日 X/Y問」・「これまで/定着」
  $("svBadge").textContent = !st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習");
  const d=dayRec(), q=paceToday(G);
  $("svCount").textContent=((G.combo||0)>=3? "⚡"+G.combo+"連続 ・ ":"")+
    "今日 "+d.a+(q&&!q.done? "/"+q.perDay:"")+"問";
  $("svStats").innerHTML=qStatsHTML(st);
  $("svWord").textContent = e2j? w.en : w.ja;
  const box=$("svChoices"); box.innerHTML="";
  svCur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent = e2j? c.ja : c.en;
    b.onclick=()=>svAnswer(c, b);
    box.appendChild(b);
  });
}

function svAnswer(chosen, btn){
  if(svAnswered || !SV || SV.over) return;
  svAnswered=true;
  const w=svCur.word, ok=chosen.en===w.en, e2j=G.mode==="e2j";
  document.querySelectorAll("#svChoices .choice").forEach(b=>{
    b.disabled=true;
    const isCorrect = b.textContent === (e2j? w.ja : w.en);
    if(isCorrect) b.classList.add("correct");
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  svApplyAnswer(w, ok);
  $("svStats").innerHTML=qStatsHTML(G.words[w.en]); // 定着ステップの変化を見せる
  saveG(); refreshHeader();
  if(ok){
    // 一斉バースト(コンボで威力UP)+◆ジェム(コンボで増)
    const mult=1+0.04*Math.min(Math.max((G.combo||0)-1,0), 15);
    const fire=svBurst(SV, mult);
    const lvup=svAddGems(SV, svGemGain(true, G.combo));
    renderSVField(fire);
    const f=$("svField");
    ["svfire","svfire2","svfire3"].forEach(c=>f.classList.remove(c));
    svFx(f, (G.combo||0)>=10? "svfire3" : (G.combo||0)>=5? "svfire2" : "svfire");
    vibe(fire.hits.some(h=>h.dead)? 25 : 12);
    if(SV.over){ setTimeout(svFinish, 700); return; }
    // 次の問題へ自動で進む(その間は時間停止=演出を見る間だけ)
    setTimeout(()=>{ if(SV && !SV.over && svAnswered) svQuestion(); }, 620);
    if(lvup) setTimeout(()=>{ if(SV && !SV.over) svOpenUpgrade(); }, 700);
  }else{
    renderSVField(null);
    $("svNextBtn").style.visibility="visible"; // ミスは正解を見届けてから(その間は時間停止)
  }
}

/* レベルアップの3択モーダル(表示中はゲーム完全停止=じっくり選べる) */
function svOpenUpgrade(){
  const cs=svUpgradeChoices();
  openModal('<h3>✨ レベルアップ! Lv'+SV.lv+'</h3>'+
    '<div class="small">言霊のちからを1つ選ぶ(このランの間だけ有効)</div>'+
    cs.map(c=>'<button class="btn svup" data-up="'+c.id+'">'+
      '<span class="svupic">'+c.ic+'</span><span class="grow" style="text-align:left">'+
      '<b>'+c.name+'</b><br><span class="small">'+c.desc+'</span></span></button>').join("")+
    '<div class="small" style="margin-top:8px">✕で閉じると見送り(選び直しはできない)</div>');
  $("modal").querySelectorAll(".svup").forEach(b=>{
    b.onclick=()=>{
      if(!SV) return;
      svApplyUpgrade(SV, b.dataset.up);
      closeModal();
      renderSVField(null);
      toast("✨ "+SV_UPGRADES.find(u=>u.id===b.dataset.up).name+" を得た");
    };
  });
}

function renderSVField(ev){
  if(!SV) return;
  // ヘッダー: HPバー+ステージ名+残り時間/BOSS+キル数
  const pct=Math.max(0, Math.round(100*SV.hp/SV.hpMax));
  $("svHpTxt").textContent=fmtShort(Math.max(0,SV.hp));
  const bar=$("svHpBar");
  bar.style.width=pct+"%";
  bar.style.background=pct>50? "var(--ok)" : pct>25? "var(--accent)" : "var(--ng)";
  const remain=Math.max(0, Math.ceil((SV.bossAt-SV.t)/1000));
  $("svTitle").innerHTML="💫 "+esc(SV.name)+"<br>"+
    (SV.bossOn? '<span style="color:var(--ng)">👑 ボス戦!</span>' : "⏱ "+Math.floor(remain/60)+":"+String(remain%60).padStart(2,"0"))+
    " ・ 💀"+SV.kills+
    (SV.rust? ' ・ <span style="color:var(--ng)">⏳-'+Math.round((1-SV.rustM)*100)+'%</span>':'');
  // メーター行: Lv・◆ゲージ・🪙
  $("svLv").textContent="Lv"+SV.lv;
  $("svXpBar").style.width=Math.min(100, Math.round(100*SV.gem/svXpNext(SV.lv)))+"%";
  $("svGold").textContent="🪙"+fmt(SV.gold);
  // フィールド: 自機は中央固定・敵はuid差分更新(CSSトランジションでなめらかに迫る)
  const f=$("svField");
  let me=f.querySelector("#svMe");
  if(!me){
    me=document.createElement("div");
    me.id="svMe";
    me.innerHTML='<span class="svface">'+charFace(byChar[G.party.char]||CHARS[0])+'</span>';
    f.appendChild(me);
  }
  const seen=new Set();
  SV.enemies.forEach(e=>{
    let el=f.querySelector('[data-k="'+e.uid+'"]');
    if(!el){
      el=document.createElement("div");
      el.className="sve"+(e.boss?" svb":"");
      el.dataset.k=e.uid;
      el.innerHTML='<div class="te">'+e.icon+'</div><div class="svhpb"><i></i></div>';
      f.appendChild(el);
    }
    el.style.left=e.x+"%"; el.style.top=e.y+"%";
    el.querySelector(".svhpb i").style.width=Math.max(4, Math.round(100*e.hp/(e.hpMax||e.hp)))+"%";
    seen.add(e.uid);
  });
  [...f.querySelectorAll("[data-k]")].forEach(el=>{ if(!seen.has(el.dataset.k)) el.remove(); });
  if(!ev) return;
  // 一時演出(ダメージポップ・撃破の爆発・ビーム・被弾)は追加して時間で消す
  const fx=(cls, x, y, html, ms)=>{
    const s=document.createElement("div");
    s.className=cls; s.style.left=x+"%"; s.style.top=y+"%"; s.innerHTML=html;
    f.appendChild(s);
    setTimeout(()=>s.remove(), ms);
  };
  (ev.hits||[]).forEach((h,i)=>{
    fx("svpopw", h.x, h.y, '<span class="svpop" style="animation-delay:'+(Math.min(i,4)*90)+'ms">-'+fmt(h.take)+'</span>', 950);
    if(h.dead) fx("sve svboom"+(h.boss?" svb":""), h.x, h.y, '<div class="te">'+h.icon+'</div>', 600);
  });
  (ev.beams||[]).forEach(a=>{
    const bm=document.createElement("div");
    bm.className="svbeam";
    bm.style.transform="rotate("+Math.round(a)+"deg)";
    f.appendChild(bm);
    setTimeout(()=>bm.remove(), 550);
  });
  (ev.touches||[]).forEach(tc=>{
    fx("svpopw", SV_CX, SV_CY+9, '<span class="svpop svhit">-'+fmt(tc.dmg)+'</span>', 950);
  });
  if(ev.touches && ev.touches.length){ svFx($("svHead"), "svshake"); }
  if(ev.heal>0) svFx($("svHpWrap"), "svheal");
  if(ev.bossIn){
    const boss=SV.enemies.find(e=>e.boss);
    if(boss) svCutinShow('<div class="ci1">─ BOSS ─</div><div class="ci2">'+boss.icon+'</div>'+
      '<div class="ci3">'+esc(boss.name)+'</div>', 1500);
    vibe([40,60,120]);
  }
}

function svFinish(){
  if(!SV) return;
  if(svLoop){ clearInterval(svLoop); svLoop=null; }
  const rec=svRec();
  let html;
  const survived=Math.min(SV_STAGE_SEC, Math.round(SV.t/1000));
  if(SV.win){
    const first=!(rec.clears[SV.id]>0);
    const bonus=Math.round(60*SV.tier*SV.tier)+(first? 1000:0);
    rec.clears[SV.id]=(rec.clears[SV.id]||0)+1;
    G.gold+=SV.gold+bonus;
    html='<h3>🎉 生還!</h3>'+
      '<div class="small" style="text-align:center; margin-top:6px">'+SV.icon+' '+esc(SV.name)+' ─ ボスを討ち取った(💀'+SV.kills+'体)</div>'+
      '<div class="giftbox" style="margin-top:10px">報酬 <b>🪙'+fmt(SV.gold+bonus)+'</b>'+
      (first? '<br><span class="small">はじめての生還ボーナス +🪙1000!</span>':'')+'</div>';
  }else{
    G.gold+=SV.gold;
    html='<h3>💔 力尽きた…</h3>'+
      '<div class="small" style="line-height:1.7; margin-top:6px">'+SV.icon+' '+esc(SV.name)+' ─ '+survived+'秒・💀'+SV.kills+'体まで戦い抜いた。<br>'+
      '倒した分の <b>🪙'+fmt(SV.gold)+'</b> と、解いた分の🎫・XP・カードはすべて持ち帰っている。<br>'+
      '編成を強くするか、正答率を上げてもう一度!</div>';
  }
  saveG(); refreshHeader();
  openModal(html+
    '<div class="row" style="margin-top:12px; gap:8px">'+
    '<button class="btn" style="flex:1" id="svRetryBtn">もう一度</button>'+
    '<button class="btn primary" style="flex:1" id="svExitBtn">冒険へ戻る</button></div>');
  const d=DUNGEONS.find(x=>x.id===SV.id);
  $("svRetryBtn").onclick=()=>svStart(d);
  $("svExitBtn").onclick=()=>{ svCleanup(); closeModal(); switchTab("adv"); };
}

/* ステージ選択(冒険タブの入口パネルから)。解放条件は冒険のダンジョンと共通 */
function openSVSelect(){
  const rec=svRec();
  let h='<h3>💫 単語のサバイバー(β)</h3>'+
    '<div class="small" style="line-height:1.7">全方位から押し寄せる敵をしのぐ<b>サバイバー系ローグライク</b>。'+
    'あなたは中央で呪文を自動詠唱し続ける ─ 動詞で撃ち方が変わる(強撃=一点/貫通=ビーム/吸収=HP回復/連撃=2体)。<br>'+
    '<b>正解=全武器の一斉バースト+◆ジェム</b>(コンボで威力・獲得数UP)。◆が貯まると<b>レベルアップの3択</b>で、このランの間だけ強くなる。<br>'+
    '時間が流れるのは<b>問題を考えている間だけ</b>(答え合わせ・3択中は完全停止)。'+SV_STAGE_SEC+'秒生きのびるとボスが出現、倒せば勝利!<br>'+
    '倒した敵の🪙は<b>勝っても負けても全額持ち帰り</b>。解いた分は<b>ふつうの学習として記録される</b>(今日の目安・🎫・カードすべて)。<br>'+
    '編成は出撃時のスナップショットで固定。⏳復習期限切れの野生語は言霊が錆びる(-6%/枚)。</div>';
  if(SV && !SV.over){
    h+='<button class="btn primary" id="svResumeBtn" style="margin-top:10px; width:100%">▶ 戦闘に戻る('+esc(SV.name)+')</button>'+
      '<div class="small" style="margin-top:4px">離れている間、時間は止まっている</div>';
  }
  h+='<div style="margin-top:10px" id="svStageList">';
  DUNGEONS.forEach((d,i)=>{
    if(!dgUnlocked(i)) return;
    const n=rec.clears[d.id]||0;
    h+='<button class="btn svstage" data-i="'+i+'" style="width:100%; margin-top:8px; text-align:left">'+
      d.icon+' '+esc(d.name)+' <span class="small">tier'+d.tier+' ・ 推奨 '+fmt(recPower(d))+
      (n? ' ・ ✓'+n : '')+'</span></button>';
  });
  h+='</div>';
  openModal(h);
  const rb=$("svResumeBtn");
  if(rb) rb.onclick=()=>{ closeModal(); switchTab("sv"); renderSVField(null); };
  $("svStageList").querySelectorAll(".svstage").forEach(b=>{
    b.onclick=()=>{
      if(SV && !SV.over) svCleanup(); // 進行中のランは破棄して新しく始める
      svStart(DUNGEONS[+b.dataset.i]);
    };
  });
}

/* ---- 静的DOMへのバインド ---- */
$("svEntry").onclick=openSVSelect;
$("svBack").onclick=()=>switchTab("adv"); // ランは保持(時間停止・入口から「戦闘に戻る」)
$("svNextBtn").onclick=svQuestion;
