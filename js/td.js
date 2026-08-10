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

/* ダンジョン定義から3ウェーブの敵リストを作る(波が進むほど深い階の敵) */
function tdWaves(d){
  const counts=[5,7,9];
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

/* 戦闘状態の生成。PはplayerStats()のスナップショット(無限回廊と同じ思想:
   出発時の編成で確定=途中の装備替えは効かない) */
function tdNewBattle(d, P){
  return {id:d.id, name:d.name, icon:d.icon, tier:d.tier, elem:d.elem,
    waves:tdWaves(d), wi:0, si:0,
    enemies:[],
    castle:P.hp, castleMax:P.hp,
    em:elemMatch(P.elems||[], d.elem).dealt, // 属性相性は与ダメに乗る(対策編成が効く)
    // 呪文が空でもキャラの攻撃力で最低限撃てる(simBattleのv2互換と同じ思想)
    P:{dpt:Math.max(P.dpt||0, P.catk||10), hp:P.hp, abBoss:P.abBoss||0},
    ticks:0, over:false, win:false};
}

/* 正解の一斉射撃: 先頭の敵からダメージ。倒すと勢いの60%で次の敵へ貫通。
   multはコンボ倍率。戻り値は演出用のヒット一覧 */
function tdFire(b, mult){
  let dmg=Math.round(2*b.P.dpt*(b.em||1)*(mult||1));
  const hits=[];
  const es=b.enemies.slice().sort((a,c)=>a.pos-c.pos);
  for(const e of es){
    if(dmg<1) break;
    const eff=Math.max(1, Math.round((dmg - (e.def||0)*0.55)*(e.boss? 1+(b.P.abBoss||0):1)));
    const take=Math.min(e.hp, eff);
    e.hp-=take;
    hits.push({name:e.name, icon:e.icon, take, dead:e.hp<=0});
    if(e.hp>0) break;
    dmg=Math.round(dmg*0.6);
  }
  b.enemies=b.enemies.filter(e=>e.hp>0);
  return hits;
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
      const v=Math.round(e.atk*2);
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
  TD=tdNewBattle(d, playerStats());
  tdTick(TD); // 最初の1体を送り込む
  closeModal();
  switchTab("td");
  $("tdTitle").textContent="⚔ 防衛線: "+d.name;
  $("tdLog").innerHTML='<div>'+d.icon+' 敵の群れが迫っている ─ 正解で呪文が火を噴く!</div>';
  tdQuestion();
  renderTDField([]);
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
  let hits=[];
  if(ok) hits=tdFire(TD, 1+0.04*Math.min(Math.max((G.combo||0)-1,0), 15)); // コンボで威力UP
  const ev=tdTick(TD);
  renderTDField(hits, ev, ok);
  saveG(); refreshHeader();
  if(TD.over){ setTimeout(tdFinish, 700); return; }
  if(ok) setTimeout(()=>{ if(TD && !TD.over && tdAnswered) tdQuestion(); }, 900);
  else $("tdNextBtn").classList.remove("hidden"); // ミスは正解を見届けてから進む
}

function renderTDField(hits, ev, ok){
  if(!TD) return;
  const pct=Math.max(0, Math.round(100*TD.castle/TD.castleMax));
  $("tdCastleHp").textContent=fmt(TD.castle)+" / "+fmt(TD.castleMax);
  const bar=$("tdCastleBar");
  bar.style.width=pct+"%";
  bar.style.background=pct>50? "var(--ok)" : pct>25? "var(--accent)" : "var(--ng)";
  // レーン(左=城側)。同じマスの敵はまとめて表示
  const byPos={};
  TD.enemies.forEach(e=>{ (byPos[e.pos]=byPos[e.pos]||[]).push(e); });
  let lane="";
  for(let p=0;p<TD_LANE;p++){
    const es=byPos[p]||[];
    lane+='<div class="tdcell">'+es.slice(0,2).map(e=>
      '<div class="te'+(e.boss?" tb":"")+'">'+e.icon+'</div>'+
      '<div class="thp"><i style="width:'+Math.max(4, Math.round(100*e.hp/(e.hpMax||e.hp)))+'%"></i></div>'
    ).join("")+(es.length>2? '<div class="tn">+'+(es.length-2)+'</div>':'')+'</div>';
  }
  $("tdLane").innerHTML=lane;
  const wave=TD.waves[TD.wi];
  const remain=TD.enemies.length+(wave? wave.length-TD.si : 0);
  $("tdInfo").innerHTML="WAVE "+Math.min(TD.wi+1,3)+"/3 ・ 敵のこり "+remain+
    " ・ ⚔ 一斉射撃 約"+fmt(Math.round(2*TD.P.dpt*TD.em))+(TD.em!==1? "(属性×"+TD.em+")":"");
  // ログ(直近の出来事)
  const lines=[];
  (hits||[]).forEach(h=>lines.push("💥 "+h.icon+" "+esc(h.name)+"に "+fmt(h.take)+(h.dead? " ─ 撃破!":"")));
  if(ev){
    if(ok===false) lines.push("💨 呪文は沈黙した…敵が迫る");
    ev.leaks.forEach(l=>lines.push("🏰 "+l.icon+" "+esc(l.name)+"が城に "+fmt(l.dmg)+" ダメージ!"));
    if(ev.wave) lines.push("🚩 WAVE "+ev.wave+" 開始!");
    if(ev.win) lines.push("🎉 すべてのウェーブを守り切った!");
    if(ev.lose) lines.push("💔 城が陥落した…");
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
    '解いた分は<b>ふつうの学習として記録される</b>(今日の目安・🎫・カードすべて)。'+
    '砲撃の威力はいまの呪文(編成)で決まる。</div>';
  if(TD && !TD.over){
    h+='<button class="btn primary" id="tdResumeBtn" style="margin-top:10px; width:100%">▶ 戦闘に戻る('+esc(TD.name)+')</button>';
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
  if(rb) rb.onclick=()=>{ closeModal(); switchTab("td"); };
  $("tdStageList").querySelectorAll(".tdstage").forEach(b=>{
    b.onclick=()=>tdStart(DUNGEONS[+b.dataset.i]);
  });
}

/* ---- 静的DOMへのバインド ---- */
$("tdEntry").onclick=openTDSelect;
$("tdBack").onclick=()=>switchTab("adv"); // 戦闘は保持(入口から「戦闘に戻る」)
$("tdNextBtn").onclick=tdQuestion;
