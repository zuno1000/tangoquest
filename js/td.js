"use strict";
/* ================= 単語の防衛線(タワーディフェンス・β / v4.14.0) =================
   「クイズを解くこと」がそのまま戦闘操作になる新モード。冒険タブから遊ぶ。

   ■ 可逆性の約束(2026-08-10ユーザー方針):
   既存の学習タブ(quiz.js・quizViewのUI)には一切手を入れない。
   このモードは js/td.js(本ファイル)+ index.htmlのtdView/tdEntryブロック+
   CSSのv4.14.0ブロック+TABSの1行だけで成立しており、それらを消せば元に戻る。
   学習の計上(SRS・日別記録・🎫・XP・カード)は学習タブと同一の共有関数を
   呼ぶため、このモードで解いた分も正史の学習記録になる(後から消しても記録は残る)。

   ■ ゲームの形(Phase 1):
   ・1レーン8マス。右端から敵が湧き、1問解答するごとに1マス進軍(ボスは2問で1マス)
   ・正解=呪文(現在の編成)が一斉射撃: 先頭の敵にダメージ、倒すと勢い60%で貫通
   ・ミス=沈黙(敵は進む)。左端に達した敵は城に一撃を与えて消える
   ・3ウェーブ(5体/7体/9体+ボス)を守り切れば勝利で🪙
   ・時間制限はない: 焦らせるのは時計ではなく進軍。じっくり思い出す方が得 */

const TD_LANE=8;

/* ---- 純関数(テスト対象) ---- */

/* ダンジョン定義から3ウェーブの敵リストを作る(波が進むほど深い階の敵)。
   v4.14.1: 6/8/10体に増量(実機FB「もう少し難しくてよい」) */
function tdWaves(d){
  const counts=[6,8,10];
  const waves=[];
  for(let w=0;w<3;w++){
    const floor=1+Math.round((d.floors-1)*w/2);
    const list=[];
    for(let i=0;i<counts[w];i++){
      const e=enemyFor(d.tier, floor, d.floors, false, d.names, d.boss, {elem:d.elem, trait:d.trait});
      e.icon=d.eicons[i%d.eicons.length];
      e.hpMax=e.hp;
      list.push(e);
    }
    if(w===2){
      const b=enemyFor(d.tier, d.floors, d.floors, true, d.names, d.boss, {elem:d.elem, trait:d.trait});
      b.icon=d.bossIcon;
      b.hpMax=b.hp;
      list.push(b);
    }
    waves.push(list);
  }
  return waves;
}

/* 呪文スナップショットの整形(v4.15.0): playerStats()の節(clauses)を
   TD用の砲撃リストに落とす。キャラ倍率・セット効果・増幅・スキルは各節のVに
   織り込み済みにする。節がない(呪文が空)ならキャラ攻撃の素の一撃(v2互換と同じ思想) */
function tdSnapshot(P){
  const k=(P.charM||1)*(P.setM||1)*(P.amp||1)*(1+(P.abDmg||0));
  let cls=(P.clauses||[]).filter(c=>c.V>0).map(c=>(
    {V:c.V*k, vt:c.vt||0, w:c.w||1, rep:c.rep||0, name:c.name||null}));
  if(!cls.length) cls=[{V:Math.max(P.dpt||0, P.catk||10), vt:0, w:1, rep:0, name:null}];
  return {cls, hp:P.hp, abBoss:P.abBoss||0, dpt:Math.max(P.dpt||0, P.catk||10)};
}

/* 編成中の野生語のうち復習期限切れの数(=錆び)。TD限定ルール:
   錆びた砲台1つにつき威力-6%(最大-30%)。復習して研ぎ直すと戻る */
function tdRustCount(){
  let n=0;
  equippedEnSet().forEach(en=>{ if(isWild(en) && wildOverdue(en)) n++; });
  return n;
}
function tdRustMult(n){ return Math.max(0.7, 1-0.06*(n||0)); }

/* 戦闘状態の生成。編成の反映は「開始時・ウェーブの合間・戦闘に戻ったとき」
   (tdResnapで再スナップショット) */
function tdNewBattle(d, P, rustN){
  return {id:d.id, name:d.name, icon:d.icon, tier:d.tier, elem:d.elem,
    waves:tdWaves(d), wi:0, si:0,
    enemies:[],
    castle:P.hp, castleMax:P.hp,
    em:elemMatch(P.elems||[], d.elem).dealt, // 属性相性は与ダメに乗る(対策編成が効く)
    rust:rustN||0, rustM:tdRustMult(rustN),
    P:tdSnapshot(P),
    ticks:0, over:false, win:false};
}

/* 正解の一斉射撃(v4.15.0: 節=砲撃。動詞タイプごとに撃ち方が変わる):
   ・強撃(vt0)= 先頭の敵に一撃
   ・貫通(vt1)= レーンの全敵に50%・防御ほぼ無視(群れ対策)
   ・吸収(vt2)= 先頭に80%+与ダメの45%だけ城を回復(1問あたり最大8%)
   ・連撃(vt3)= 前から2体に60%ずつ
   ・反復(rep)= その節をもう一度(威力×rep)
   multはコンボ倍率。戻り値={hits, heal, beam, multiPop}(演出用) */
function tdFire(b, mult){
  const em=b.em||1, rm=b.rustM||1;
  const hits=[]; let heal=0, beam=false, multiPop=false;
  const alive=()=>b.enemies.filter(e=>e.hp>0).sort((a,c)=>a.pos-c.pos);
  const hit=(e, raw, ignoreDef)=>{
    const eff=Math.max(1, Math.round((raw - (e.def||0)*(ignoreDef? 0.1:0.55))*(e.boss? 1+(b.P.abBoss||0):1)));
    const take=Math.min(e.hp, eff);
    e.hp-=take;
    hits.push({name:e.name, icon:e.icon, take, dead:e.hp<=0, pos:e.pos, boss:!!e.boss});
    return take;
  };
  for(const cl of b.P.cls){
    const casts=cl.rep? 2:1;
    for(let c=0;c<casts;c++){
      const base=cl.V*cl.w*1.75*em*rm*(mult||1)*(c? cl.rep:1);
      const es=alive();
      if(!es.length) break;
      if(cl.vt===1){ beam=true; es.forEach(e=>hit(e, base*0.5, true)); }
      else if(cl.vt===2){ heal+=Math.round(hit(es[0], base*0.8)*0.45); }
      else if(cl.vt===3){
        multiPop=true;
        hit(es[0], base*0.6);
        const es2=alive();
        if(es2.length) hit(es2[0], base*0.6);
      }
      else hit(es[0], base);
    }
  }
  b.enemies=b.enemies.filter(e=>e.hp>0);
  if(heal>0){
    heal=Math.min(heal, Math.round(b.castleMax*0.08));
    b.castle=Math.min(b.castleMax, b.castle+heal);
  }
  return {hits, heal, beam, multiPop};
}

/* 1問ごとの進行: 進軍 → 城への到達処理 → 増援 → ウェーブ/勝敗判定 */
function tdTick(b){
  b.ticks++;
  const ev={leaks:[], spawned:null, wave:0, win:false, lose:false};
  for(const e of b.enemies){
    if(e.boss && b.ticks%2) continue; // ボスは2問に1歩(大物の貫禄+削る猶予)
    e.pos--;
  }
  const rest=[];
  for(const e of b.enemies){
    if(e.pos<0){
      const v=Math.round(e.atk*2.5); // v4.14.1: 2.0→2.5倍(漏らすと痛い)
      b.castle-=v;
      ev.leaks.push({icon:e.icon, name:e.name, dmg:v});
    }else rest.push(e);
  }
  b.enemies=rest;
  const wave=b.waves[b.wi];
  if(wave && b.si<wave.length){
    const e=wave[b.si++];
    e.pos=TD_LANE-1;
    b.enemies.push(e);
    ev.spawned=e;
  }else if(!b.enemies.length && wave){
    b.wi++;
    if(b.wi>=b.waves.length){ b.over=true; b.win=true; ev.win=true; }
    else { b.si=0; ev.wave=b.wi+1; }
  }
  if(b.castle<=0){ b.castle=0; b.over=true; b.win=false; ev.lose=true; }
  return ev;
}

/* 解答の学習計上。quiz.jsのanswer()と同一の帳簿付け(SRS・日別・ペース・🎫・XP・
   カードドロップ)を共有関数で行う ─ 防衛線で解いた1問も学習タブの1問と等価。
   ※quiz.jsを書き換えず複製しているのは可逆性のため(このファイルごと消せる) */
function tdApplyAnswer(w, ok){
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

/* ---- 画面(tdView) ---- */
var TD=null, tdCur=null, tdAnswered=false;

function tdStart(d){
  TD=tdNewBattle(d, playerStats(), tdRustCount());
  tdTick(TD); // 最初の1体を送り込む
  closeModal();
  switchTab("td");
  $("tdLog").innerHTML='<div>'+d.icon+' 敵の群れが迫る! 一斉射撃 約'+
    fmt(Math.round(1.75*TD.P.dpt*TD.em*TD.rustM))+(TD.em!==1? '(属性×'+TD.em+')':'')+
    (TD.rust? ' <span style="color:var(--ng)">⏳錆びた野生語×'+TD.rust+'(威力'+Math.round((1-TD.rustM)*100)+'%減) ─ 復習で研ぎ直せる</span>':'')+
    ' ─ 正解で呪文が火を噴く</div>';
  tdQuestion();
  renderTDField(null);
}

/* 現在の編成を戦闘に反映し直す(ウェーブの合間・戦闘に戻ったとき) */
function tdResnap(){
  if(!TD || TD.over) return;
  const P=playerStats();
  TD.P=tdSnapshot(P);
  TD.em=elemMatch(P.elems||[], TD.elem).dealt;
  TD.rust=tdRustCount();
  TD.rustM=tdRustMult(TD.rust);
}

/* CSSアニメを確実に再発火させる(クラスを付け直す) */
function tdFx(el, cls){
  if(!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

function tdQuestion(){
  if(!TD || TD.over) return;
  tdAnswered=false;
  $("tdNextBtn").classList.add("hidden");
  const w=pickWord();
  tdCur={word:w, choices:buildChoices(w)};
  const st=G.words[w.en], e2j=G.mode==="e2j";
  $("tdBadge").textContent = (!st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習"))+
    ((G.combo||0)>=3? " ・ ⚡"+G.combo+"連続" : "");
  $("tdWord").textContent = e2j? w.en : w.ja;
  const box=$("tdChoices"); box.innerHTML="";
  tdCur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent = e2j? c.ja : c.en;
    b.onclick=()=>tdAnswer(c, b);
    box.appendChild(b);
  });
}

function tdAnswer(chosen, btn){
  if(tdAnswered || !TD || TD.over) return;
  tdAnswered=true;
  const w=tdCur.word, ok=chosen.en===w.en, e2j=G.mode==="e2j";
  document.querySelectorAll("#tdChoices .choice").forEach(b=>{
    b.disabled=true;
    const isCorrect = b.textContent === (e2j? w.ja : w.en);
    if(isCorrect) b.classList.add("correct");
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  tdApplyAnswer(w, ok);
  saveG(); refreshHeader();
  if(ok){
    // 2段階演出: まず射撃(敵はその場でヒット・撃破の爆発)→少し置いて進軍
    const fire=tdFire(TD, 1+0.04*Math.min(Math.max((G.combo||0)-1,0), 15)); // コンボで威力UP
    renderTDField(fire, null, true);
    // 閃光はコンボ数で強くなる(3段階)
    const lane=$("tdLane");
    ["tdfire","tdfire2","tdfire3"].forEach(c=>lane.classList.remove(c));
    tdFx(lane, (G.combo||0)>=10? "tdfire3" : (G.combo||0)>=5? "tdfire2" : "tdfire");
    vibe(fire.hits.some(h=>h.dead)? 25 : 12);
    setTimeout(()=>{
      if(!TD) return;
      const ev=tdTick(TD);
      if(ev.wave) tdResnap(); // ウェーブの合間に現在の編成を反映
      renderTDField(null, ev, true);
      if(TD.over){ setTimeout(tdFinish, 700); return; }
      setTimeout(()=>{ if(TD && !TD.over && tdAnswered) tdQuestion(); }, 520);
    }, 430);
  }else{
    const ev=tdTick(TD);
    if(ev.wave) tdResnap();
    renderTDField(null, ev, false);
    if(TD.over){ setTimeout(tdFinish, 700); return; }
    $("tdNextBtn").classList.remove("hidden"); // ミスは正解を見届けてから進む
  }
}

function renderTDField(fire, ev, ok){
  if(!TD) return;
  const hits=(fire&&fire.hits)||[];
  const pct=Math.max(0, Math.round(100*TD.castle/TD.castleMax));
  $("tdCastleHp").textContent=fmtShort(TD.castle);
  const bar=$("tdCastleBar");
  bar.style.width=pct+"%";
  bar.style.background=pct>50? "var(--ok)" : pct>25? "var(--accent)" : "var(--ng)";
  // ヘッダー1行: ステージ・WAVE・敵のこり(パネルを置かずクイズUIを最大化)
  const wave=TD.waves[TD.wi];
  const remain=TD.enemies.length+(wave? wave.length-TD.si : 0);
  $("tdTitle").innerHTML="⚔ "+esc(TD.name)+"<br>WAVE "+Math.min(TD.wi+1,3)+"/3 ・ 敵のこり "+remain;
  // レーン(左=城側)。同じマスの敵はまとめ、ヒットはダメージポップ・撃破は爆発で見せる
  const byPos={};
  TD.enemies.forEach(e=>{ (byPos[e.pos]=byPos[e.pos]||[]).push(e); });
  const hitByPos={};
  hits.forEach(h=>{ (hitByPos[h.pos]=hitByPos[h.pos]||[]).push(h); });
  let lane="";
  for(let p=0;p<TD_LANE;p++){
    const es=byPos[p]||[];
    const hs=hitByPos[p]||[];
    lane+='<div class="tdcell">'+
      // ヒットごとにポップを重ねて時間差で出す(連撃・複数節の手数が見える)
      hs.slice(0,3).map((h,i)=>'<span class="tdpop" style="animation-delay:'+(i*130)+'ms">-'+fmt(h.take)+'</span>').join("")+
      es.slice(0,2).map(e=>
        '<div class="te'+(e.boss?" tb":"")+'">'+e.icon+'</div>'+
        '<div class="thp"><i style="width:'+Math.max(4, Math.round(100*e.hp/(e.hpMax||e.hp)))+'%"></i></div>'
      ).join("")+
      hs.filter(h=>h.dead).map(h=>'<div class="te tdboom'+(h.boss?" tb":"")+'">'+h.icon+'</div>').join("")+
      (es.length>2? '<div class="tn">+'+(es.length-2)+'</div>':'')+'</div>';
  }
  $("tdLane").innerHTML=lane;
  // 貫通ビーム(レーンを貫く一閃)
  if(fire && fire.beam){
    const beam=document.createElement("div");
    beam.className="tdbeam";
    $("tdLane").appendChild(beam);
  }
  // 吸収の城回復(バーが緑に瞬く)
  if(fire && fire.heal>0) tdFx($("tdCastleWrap"), "tdheal");
  // ログ(直近の出来事)
  const lines=[];
  hits.forEach(h=>lines.push("💥 "+h.icon+" "+esc(h.name)+"に "+fmt(h.take)+(h.dead? " ─ 撃破!":"")));
  if(fire && fire.heal>0) lines.push("💚 【吸収】城が "+fmt(fire.heal)+" 回復!");
  if(ev){
    if(ok===false) lines.push("💨 呪文は沈黙した…敵が迫る");
    ev.leaks.forEach(l=>lines.push("🏰 "+l.icon+" "+esc(l.name)+"が城に "+fmt(l.dmg)+" ダメージ!"));
    if(ev.spawned && ev.spawned.boss){
      lines.push("⚠️ ボス『"+esc(ev.spawned.name)+"』が現れた!");
      const ci=$("tdCutin");
      ci.innerHTML='<div class="ci1">─ BOSS ─</div><div class="ci2">'+ev.spawned.icon+'</div>'+
        '<div class="ci3">'+esc(ev.spawned.name)+'</div>';
      ci.classList.remove("hidden");
      tdFx(ci, "go");
      vibe([40,60,120]);
      setTimeout(()=>{ if($("tdCutin")) $("tdCutin").classList.add("hidden"); }, 1500);
    }
    if(ev.wave){
      lines.push("🚩 WAVE "+ev.wave+" 開始! 編成の変更はここで反映"+
        (TD.rust? "(⏳錆び×"+TD.rust+")":""));
    }
    if(ev.win) lines.push("🎉 すべてのウェーブを守り切った!");
    if(ev.lose) lines.push("💔 城が陥落した…");
    if(ev.leaks.length){ tdFx($("tdHead"), "tdshake"); vibe([20,30,40]); }
  }
  if(lines.length) $("tdLog").innerHTML=lines.slice(-3).map(s=>"<div>"+s+"</div>").join("");
}

function tdFinish(){
  if(!TD) return;
  G.td=G.td||{clears:{}};
  let html;
  if(TD.win){
    const first=!(G.td.clears[TD.id]>0);
    const gold=Math.round(50*TD.tier*TD.tier)+(first? 1000:0);
    G.td.clears[TD.id]=(G.td.clears[TD.id]||0)+1;
    G.gold+=gold;
    html='<h3>🎉 防衛成功!</h3>'+
      '<div class="small" style="text-align:center; margin-top:6px">'+TD.icon+' '+esc(TD.name)+' を守り切った('+TD.ticks+'問)</div>'+
      '<div class="giftbox" style="margin-top:10px">報酬 <b>🪙'+fmt(gold)+'</b>'+(first? '<br><span class="small">はじめての防衛ボーナス +🪙1000!</span>':'')+'</div>';
  }else{
    html='<h3>💔 城が陥落した…</h3>'+
      '<div class="small" style="line-height:1.7; margin-top:6px">'+TD.icon+' '+esc(TD.name)+' ─ '+TD.ticks+'問けん命に防衛した。<br>'+
      '解いた分の🎫・XP・カードはすべて持ち帰っている。<br>編成を強くするか、正答率を上げてもう一度!</div>';
  }
  saveG(); refreshHeader();
  openModal(html+
    '<div class="row" style="margin-top:12px; gap:8px">'+
    '<button class="btn" style="flex:1" id="tdRetryBtn">もう一度</button>'+
    '<button class="btn primary" style="flex:1" id="tdExitBtn">冒険へ戻る</button></div>');
  const d=DUNGEONS.find(x=>x.id===TD.id);
  $("tdRetryBtn").onclick=()=>tdStart(d);
  $("tdExitBtn").onclick=()=>{ TD=null; closeModal(); switchTab("adv"); };
}

/* ステージ選択(冒険タブの入口パネルから)。解放条件は冒険のダンジョンと共通 */
function openTDSelect(){
  G.td=G.td||{clears:{}};
  let h='<h3>⚔ 単語の防衛線(β)</h3>'+
    '<div class="small" style="line-height:1.7">4択クイズの<b>正解が呪文の一斉射撃</b>になるタワーディフェンス。'+
    '1問ごとに敵は1マス進む(ボスは2問で1マス)。ミスすると呪文は沈黙。'+
    '城を守って3ウェーブしのげば勝利!<br>'+
    '解いた分は<b>ふつうの学習として記録される</b>(今日の目安・🎫・カードすべて)。<br>'+
    '砲撃はいまの呪文(編成)で決まり、<b>動詞で撃ち方が変わる</b>: '+
    '強撃=一点 ／ 貫通=レーン全体 ／ 吸収=城を回復 ／ 連撃=前2体。'+
    '編成の変更はウェーブの合間(と戦闘に戻ったとき)に反映。'+
    '⏳復習期限切れの野生語は錆びて威力が下がる(-6%/枚)。</div>';
  if(TD && !TD.over){
    h+='<button class="btn primary" id="tdResumeBtn" style="margin-top:10px; width:100%">▶ 戦闘に戻る('+esc(TD.name)+')</button>'+
      '<div class="small" style="margin-top:4px">いまの編成を反映して再開する(呪文を整えてから戻るのもアリ)</div>';
  }
  h+='<div style="margin-top:10px" id="tdStageList">';
  DUNGEONS.forEach((d,i)=>{
    if(!dgUnlocked(i)) return;
    const n=G.td.clears[d.id]||0;
    h+='<button class="btn tdstage" data-i="'+i+'" style="width:100%; margin-top:8px; text-align:left">'+
      d.icon+' '+esc(d.name)+' <span class="small">tier'+d.tier+' ・ 推奨 '+fmt(recPower(d))+
      (n? ' ・ ✓'+n : '')+'</span></button>';
  });
  h+='</div>';
  openModal(h);
  const rb=$("tdResumeBtn");
  if(rb) rb.onclick=()=>{ tdResnap(); closeModal(); switchTab("td"); renderTDField(null); };
  $("tdStageList").querySelectorAll(".tdstage").forEach(b=>{
    b.onclick=()=>tdStart(DUNGEONS[+b.dataset.i]);
  });
}

/* ---- 静的DOMへのバインド ---- */
$("tdEntry").onclick=openTDSelect;
$("tdBack").onclick=()=>switchTab("adv"); // 戦闘は保持(入口から「戦闘に戻る」)
$("tdNextBtn").onclick=tdQuestion;
