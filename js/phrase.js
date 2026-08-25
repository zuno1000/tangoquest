"use strict";
/* ================= フレーズ学習(v5.0.0) =================
   「日本語は出てくるが英語が出てこない」の解消: 意図(日本語)→英語の産出訓練。
   可逆設計: js/phrases.js(データ)+このファイル+quizViewのセグ/#phrBuild+CSSブロック+
   quiz.jsの分岐数行で完結(単語学習のロジックは不変)。
   ・SRSはsrsApply/INTERVALS/MASTER_BOXを単語と完全共有(台帳だけG.phrに分離)
   ・経済(🎫/XP/コンボ/任務/5問ボーナス)も共有=どちらで学んでも損得なし
   ・今日の目安・学習のあゆみ・連続学習には計上しない(別カウント=実機FBの決定。日別はG.pdays)
   ・出題形式はSRSの階段と連動(v5.1.0): box0-1=核のクローズ4択 / box2-3=並べ替え / box4〜=口頭自己判定+TTS */

let phrCur=null, phrAnswered=false, phrPos=0, phrMiss=0;
let phrAutoT=null;   // 「自動で次へ」(設定共有)のタイマー
let phrRecent=[];    // 直近3問の再出題回避(単語側と同じ流儀)
function phrNoteRecent(en){ phrRecent.push(en); if(phrRecent.length>3) phrRecent.shift(); }

/* 出題形式の階段(v5.1.0で3段に):
   box0-1 = 核のクローズ4択(文は最初から見え、核だけが空欄=「主語の名詞で選べてしまう」を封じる)
   box2-3 = 並べ替え(文全体の語順を産出)
   box4〜 = 口頭自己判定(意図だけ見て声に出す→答えを見て⭕✖。box5=覚えた は「言えた」だけが進める) */
function phrFormat(st){
  if(st && st[0]>=4) return "sp";
  return (st && st[0]>=2)? "or" : "mc";
}

/* 核(k)の位置を英文から探し、語境界まで広げて返す(v5.1.0)。
   kは辞書形でも良い(seem→seemsのように活用語尾まで空欄が伸びる)。
   データ検査でk⊂enを保証しているためnullは実質出ない(保険のフォールバックだけ残す) */
function phrCloze(p){
  const en=p.en, i=en.toLowerCase().indexOf(p.k.toLowerCase());
  if(i<0) return null;
  let s=i, e=i+p.k.length;
  while(s>0 && /[A-Za-z''-]/.test(en[s-1])) s--;
  while(e<en.length && /[A-Za-z''-]/.test(en[e])) e++;
  return {pre:en.slice(0,s), key:en.slice(s,e), post:en.slice(e)};
}
/* 文脈行(#phrBuild)のHTML: 出題中=核だけ空欄/答え合わせ=核をハイライトした全文。
   出題時から同じ場所に常設するので、答え合わせでレイアウトが動かない
   (v5.0の「答え合わせで全文が後から現れて日本語が押し上がる」実機FBの根治) */
function phrCtxHTML(p, revealed){
  const cz=phrCloze(p);
  if(!cz) return revealed? '<b class="pkey">'+esc(p.en)+'</b>' : "";
  const blank='<span class="pblank">'+"＿".repeat(Math.max(3, Math.min(8, Math.round(cz.key.length/2))))+'</span>';
  return esc(cz.pre)+(revealed? '<b class="pkey">'+esc(cz.key)+'</b>' : blank)+esc(cz.post);
}

/* 出題選択(pickWordの縮約版): 期限が来た復習を忘れかけ度順に優先し、新規を確率で混ぜる。
   フレーズには目安がないので新規導入は固定確率(0.25) */
function pickPhrase(){
  const now=Date.now(); const due=[], unseen=[];
  for(const p of PHRASES){
    const st=G.phr[p.en];
    if(!st) unseen.push(p);
    else if(st[1]<=now) due.push(p);
  }
  const fresh=a=>{ const f=a.filter(p=>!phrRecent.includes(p.en)); return f.length? f : a; };
  const d=fresh(due), u=fresh(unseen);
  if(d.length && (u.length===0 || Math.random()>=0.25)){
    d.sort((a,b)=>reviewUrgency(G.phr[b.en],now)-reviewUrgency(G.phr[a.en],now));
    const pool=d.slice(0, Math.min(8,d.length));
    return pool[Math.floor(Math.random()*pool.length)];
  }
  if(u.length) return u[Math.floor(Math.random()*u.length)];
  // 期限が来たものがない: 弱い順に先取り復習(先取り正解で階段が上がらないのはsrsApplyが担保)
  const seen=fresh(PHRASES.filter(p=>G.phr[p.en]));
  seen.sort((a,b)=>(G.phr[a.en][0]-G.phr[b.en][0]) || (G.phr[a.en][1]-G.phr[b.en][1]));
  const pool=seen.slice(0, Math.min(10,seen.length));
  return pool[Math.floor(Math.random()*pool.length)] || PHRASES[0];
}

/* 4択の誤答は同じカテゴリから(=紛らわしくて学習になる)。足りなければ全体から補う。
   v5.1.0: 選択肢の表示は核チャンクなので、表示が同じになる候補(核の表層形が重複)は除く */
function buildPhrChoices(p){
  const myKey=(phrCloze(p)||{key:p.en}).key.toLowerCase();
  const seen=new Set([myKey]);
  const uniq=x=>{
    const k=(phrCloze(x)||{key:x.en}).key.toLowerCase();
    if(seen.has(k)) return false;
    seen.add(k); return true;
  };
  const same=shuffle(PHRASES.filter(x=>x.c===p.c && x.en!==p.en && !overlaps(x,p)));
  const picks=same.filter(uniq).slice(0,3);
  if(picks.length<3){
    const rest=shuffle(PHRASES.filter(x=>x.c!==p.c && !overlaps(x,p)));
    picks.push(...rest.filter(uniq).slice(0, 3-picks.length));
  }
  return shuffle([p, ...picks]);
}

/* ---- 実戦ドリル(v5.2.0): 英検1級二次の実戦形 ----
   どの定着段階でも「意図→口頭」で出す連続セッション。帳簿は通常のフレーズ学習と完全に同一
   (SRS・🎫・任務・5問ボーナス)=練習した分がそのまま正史の学習記録になる。
   ・PREP: 主張→理由→例→結論のstemを1つずつ声に出す=2分スピーチの骨組みを体で覚える
   ・グラフ描写: 数値・傾向カテゴリを5連続=増減・横ばい・割合の言い回しを反射にする */
let PDRILL=null; // {kind, res:[ok...], used:Set}
const PHR_DRILLS={
  prep:{icon:"🎤", name:"2分スピーチの組み立て",
    desc:"主張→理由→例→結論(PREP型)の順に、意図だけを見て声に出す。スピーチ1本ぶんの流れの練習",
    steps:[
      {t:"① 主張", f:p=>p.c==="op"},
      {t:"② 理由", f:p=>p.c==="rs" && /理由|原因/.test(p.ja)},
      {t:"③ 例",   f:p=>p.c==="rs" && /例/.test(p.ja)},
      {t:"④ 結論", f:p=>p.c==="str" && /まとめ|結論|締め|以上/.test(p.ja)},
    ]},
  graph:{icon:"📈", name:"グラフ・数値の描写",
    desc:"増えた・減った・横ばい・◯割を占める…を口頭で5連続。スピーチやIELTSの数値描写を反射にする",
    steps:[1,2,3,4,5].map(n=>({t:"描写 "+n+"/5", f:p=>p.c==="num"}))},
  /* v5.4.0(実機FB「make/help/forceばかりで子供っぽい」): 添削後の英語の2大パターンを集中練習 */
  verb:{icon:"🔁", name:"大人の動詞に言い換え",
    desc:"make・help・forceに頼らず、enable/prevent/provide…の「動詞の型」で言う。口頭で5連続",
    steps:[1,2,3,4,5].map(n=>({t:"動詞の型 "+n+"/5", f:p=>p.c==="vp"}))},
  inan:{icon:"🏛", name:"無生物主語で言う",
    desc:"「〜のおかげで/せいで/を見ると」を、モノや経験を主語にして言う(This graph shows…型)。口頭で5連続",
    steps:[1,2,3,4,5].map(n=>({t:"無生物主語 "+n+"/5", f:p=>p.c==="ims"}))},
};
function drillPool(step, used){
  const pool=PHRASES.filter(p=>step.f(p) && !used.has(p.en));
  return pool.length? pool : PHRASES.filter(step.f); // 使い切ったら再利用(グラフ5連続などの保険)
}
function openDrillMenu(){
  openModal('<h3>🎤 実戦ドリル '+helpBtn("hlp-drill")+'</h3>'+
    helpNote("hlp-drill", '定着段階に関わらず「意図だけを見て声に出す」実戦形式の連続セッション。'+
      '解いた分はふつうのフレーズ学習として記録される(復習スケジュール・🎫・任務すべて共通)')+
    Object.keys(PHR_DRILLS).map(k=>{
      const d=PHR_DRILLS[k];
      return '<button class="btn drillbtn" data-drill="'+k+'">'+d.icon+' <b>'+d.name+'</b>'+
        '<span class="hlsub">'+d.desc+'</span></button>';
    }).join("")+
    '<button class="btn" id="phrHistBtn2" style="margin-top:12px; width:100%">📊 フレーズのあゆみ(これまでの記録)</button>');
  $("modal").querySelectorAll("[data-drill]").forEach(b=>{ b.onclick=()=>startDrill(b.dataset.drill); });
  $("phrHistBtn2").onclick=()=>openPhrHistoryModal(0);
}
function startDrill(kind){
  if(!PHR_DRILLS[kind]) return;
  closeModal();
  if(quizTarget()!=="p"){ G.opt.qtab="p"; saveG(); phrSyncSeg(); } // ドリルはフレーズ学習の中で走る
  PDRILL={kind, res:[], used:new Set()};
  phrNewQuestion();
}
function openDrillDone(){
  const d=PHR_DRILLS[PDRILL.kind], kind=PDRILL.kind;
  const okN=PDRILL.res.filter(Boolean).length, n=d.steps.length;
  PDRILL=null;
  openModal('<h3>'+d.icon+' '+d.name+' ─ 完了!</h3>'+
    '<div class="giftbox">⭕ 言えた <b style="font-size:18px">'+okN+' / '+n+'</b>'+(okN>=n? ' ─ 完璧! 🎉':'')+
    '<br><span class="small">'+(kind==="prep"
      ? 'この流れ(主張→理由→例→結論)がそのまま2分スピーチの骨組みになる'
      : '数値の言い回しは、考えずに口から出るまで繰り返すのがコツ')+'</span></div>'+
    '<div class="row" style="gap:10px">'+
    '<button class="btn grow" id="drillAgain">'+d.icon+' もう1本</button>'+
    '<button class="btn primary grow" id="drillEnd">フレーズ学習へ</button></div>');
  $("drillAgain").onclick=()=>startDrill(kind);
  $("drillEnd").onclick=()=>{ closeModal(); newQuestion(); };
}

/* 出題(newQuestionから分岐)。phrStartはテスト・ドリルからの直接起動にも使う(fmtで形式を強制できる) */
function phrNewQuestion(){
  clearTimeout(phrAutoT);
  if(PDRILL){
    const d=PHR_DRILLS[PDRILL.kind];
    if(PDRILL.res.length>=d.steps.length){ openDrillDone(); return; }
    const pool=drillPool(d.steps[PDRILL.res.length], PDRILL.used);
    const p=pool[Math.floor(Math.random()*pool.length)];
    PDRILL.used.add(p.en);
    phrStart(p, "sp"); // 実戦=常に口頭
    return;
  }
  if(QUICK.goal && QUICK.done>=QUICK.goal){ openQuickDone(); return; } // サクッと5問はフレーズでも同じ
  phrStart(pickPhrase());
}
function phrStart(p, fmt){
  const st=G.phr[p.en];
  phrCur={p, fmt:fmt||phrFormat(st), choices:null};
  if(phrCur.fmt==="mc") phrCur.choices=buildPhrChoices(p);
  phrRenderQuestion();
}

function phrRenderQuestion(){
  phrAnswered=false; phrPos=0; phrMiss=0;
  $("resultBar").classList.remove("show");
  const pc=$("promptCard");
  pc.classList.remove("srch");
  pc.classList.add("phr"); // フレーズ用レイアウト(上詰め+バッジ行の余白確保=v5.2.0の重なり対策)
  const p=phrCur.p, st=G.phr[p.en];
  /* バッジは定着状態だけ(v5.2.0実機FB: 分類名は長く、複数行の日本語と重なっていた。
     分類は答え合わせの結果バーで見せる)。実戦ドリル中はステップ名(①主張 等)を出す */
  $("qBadge").textContent = PDRILL
    ? PHR_DRILLS[PDRILL.kind].steps[PDRILL.res.length].t
    : (!st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習"));
  $("qBadge").style.color="var(--accent2)";
  refreshQuizCount();
  const pw=$("promptWord");
  pw.textContent=p.ja;
  pw.className="ja";
  $("qStats").innerHTML=qStatsHTML(st);
  const bl=$("phrBuild");
  bl.classList.remove("hidden"); // 文脈行は出題時から常設(答え合わせでレイアウトが動かない)
  const box=$("choices"); box.innerHTML="";
  clearInterval(phrSpkT); phrSpkT=null; // 口頭の制限時間タイマーの残りを掃除
  if(phrCur.fmt==="mc"){
    // 核のクローズ4択(v5.1.0): 文は見せて核だけ空欄。選択肢は核チャンク
    box.className="choices";
    bl.innerHTML=phrCtxHTML(p, false);
    /* 先に思い出すステップ(v5.3.0実機FB): 4択は再認(見覚えの照合)で解けてしまい、
       見ずに言う再生とギャップが生まれる。選択肢を開く前に1回、自力想起を必ず挟む
       (covert retrieval)。テンポ優先の人は設定でオフにできる */
    if(G.opt.preRecall){
      const b=document.createElement("button");
      b.className="choice rcbtn";
      b.id="phrRecallBtn";
      b.innerHTML='🧠 まず自力で思い出す<span class="rcsub">空欄の英語を(心の中で)言ってから、タップで選択肢</span>';
      b.onclick=()=>{ if(!phrAnswered) phrShowChoicesMC(); };
      box.appendChild(b);
    }else phrShowChoicesMC();
  }else if(phrCur.fmt==="or"){
    // 並べ替え: チャンクを正しい順にタップ(語順と結びつきの自動化)
    box.className="choices chunks";
    bl.innerHTML='<span class="pbslot">💬 チャンクを正しい順にタップ</span>';
    shuffle(p.ch.slice()).forEach(t=>{
      const b=document.createElement("button");
      b.className="chunkbtn";
      b.textContent=t;
      b.onclick=()=>phrTapChunk(t,b);
      box.appendChild(b);
    });
  }else{
    // 口頭自己判定(v5.1.0・box4〜): 意図だけ見て声に出す→答えを見て⭕✖(採点は自分に正直に)
    box.className="choices";
    bl.innerHTML='<span class="pbslot">🎙 思い出して、声に出して言おう(答えを見る前に)</span>';
    const b=document.createElement("button");
    b.className="choice spshow";
    b.id="phrSpkShow";
    b.textContent="💬 答えを見る";
    b.onclick=()=>phrSpeakReveal(false);
    box.appendChild(b);
    /* 制限時間(v5.3.0設定・0=オフ): 流暢さ=想起の速さの訓練。カウントダウンして
       時間切れで自動的に答えを開く(判定は従来どおり自分で) */
    if(G.opt.spkSec){
      phrSpkLeft=Math.round(G.opt.spkSec/1000);
      b.textContent="💬 答えを見る(あと"+phrSpkLeft+"秒)";
      phrSpkT=setInterval(phrSpkTick, 1000);
    }
  }
}

/* ---- 口頭の制限時間(v5.3.0) ---- */
let phrSpkT=null, phrSpkLeft=0;
function spkSecCycle(v){ return {0:5000, 5000:8000, 8000:12000, 12000:0}[v||0]||0; }
function spkSecLabel(v){ return {0:"オフ", 5000:"5秒", 8000:"8秒", 12000:"12秒"}[v||0]||"オフ"; }
function phrSpkTick(){
  const b=$("phrSpkShow");
  if(!b || phrAnswered){ clearInterval(phrSpkT); phrSpkT=null; return; } // 画面が変わっていたら自壊
  phrSpkLeft--;
  if(phrSpkLeft<=0){ clearInterval(phrSpkT); phrSpkT=null; phrSpkTimeUp(); return; }
  b.textContent="💬 答えを見る(あと"+phrSpkLeft+"秒)";
}
function phrSpkTimeUp(){
  if(phrAnswered || !phrCur || phrCur.fmt!=="sp" || !$("phrSpkShow")) return;
  phrSpeakReveal(true);
}

/* クローズ4択の選択肢を開く(v5.3.0: 「先に思い出す」ステップの後、または設定オフなら即時) */
function phrShowChoicesMC(){
  const box=$("choices"); box.innerHTML=""; box.className="choices";
  phrCur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.innerHTML=choiceHTML((phrCloze(c)||{key:c.en}).key);
    b.onclick=()=>phrAnswerMC(c,b);
    box.appendChild(b);
  });
  refitChoices("#choices .choice");
}

/* 口頭ステージ: 答えを開いてから自己判定。🔊お手本(TTS)は答え合わせ後も押せる(シャドーイング用)。
   timedOut=制限時間切れで自動的に開いた(v5.3.0) */
function phrSpeakReveal(timedOut){
  if(phrAnswered || !phrCur) return;
  clearInterval(phrSpkT); phrSpkT=null;
  const p=phrCur.p;
  $("phrBuild").innerHTML=phrCtxHTML(p, true);
  const box=$("choices"); box.innerHTML="";
  if(timedOut){
    const n=document.createElement("div");
    n.className="small sptimeup";
    n.textContent="⏰ 時間切れ ─ 本番なら沈黙。言えていたかで正直に判定しよう";
    box.appendChild(n);
  }
  const mk=(id, cls, label, fn)=>{
    const b=document.createElement("button");
    b.className="choice "+cls; b.id=id; b.textContent=label; b.onclick=fn;
    box.appendChild(b); return b;
  };
  const judge=ok=>{
    if(phrAnswered) return;
    $("phrSpkOk").disabled=$("phrSpkNg").disabled=true;
    $("phrSpkOk").classList.toggle("correct", ok);
    $("phrSpkNg").classList.toggle("wrong", !ok);
    phrFinish(ok);
  };
  mk("phrSpkOk", "spok", "⭕ 言えた", ()=>judge(true));
  mk("phrSpkNg", "spng", "✖ まだ言えない", ()=>judge(false));
  if("speechSynthesis" in window)
    mk("phrTts", "sptts", "🔊 お手本を聞く(そのまま声に出そう)", ()=>phrSay(p.en));
}
function phrSay(en){
  try{
    const u=new SpeechSynthesisUtterance(en);
    u.lang="en-US"; u.rate=0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){}
}

/* 並べ替えのタップ: 正しい次のチャンクなら確定、違えばミスとして数える(1ミスでも不正解扱い)。
   タップは常にどれかが正解なので詰まない=降参ボタン不要 */
function phrTapChunk(t,b){
  if(phrAnswered || !phrCur) return;
  const p=phrCur.p;
  if(t===p.ch[phrPos]){
    b.disabled=true; b.classList.add("used");
    phrPos++;
    $("phrBuild").innerHTML='<b>'+esc(p.ch.slice(0,phrPos).join(" "))+'</b>'+
      (phrPos<p.ch.length? ' <span class="pbslot">▁</span>':'');
    if(phrPos>=p.ch.length) phrFinish(phrMiss===0);
  }else{
    phrMiss++;
    b.classList.add("wrong");
    setTimeout(()=>b.classList.remove("wrong"), 350);
  }
}

function phrAnswerMC(chosen, btn){
  if(phrAnswered || !phrCur) return;
  const p=phrCur.p, ok=chosen.en===p.en;
  const key=(phrCloze(p)||{key:p.en}).key; // 選択肢の表示は核チャンク(v5.1.0)
  document.querySelectorAll("#choices .choice").forEach(b=>{
    b.disabled=true;
    if(b.textContent===key) b.classList.add("correct"); // csegはtextContentを変えない(v4.30.0)
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  phrFinish(ok);
}

/* 帳簿(単語のanswer()と同じ骨格): SRS→フレーズ日別→経済(共有)→結果表示 */
function phrFinish(ok){
  phrAnswered=true;
  const p=phrCur.p, now=Date.now();
  let st=G.phr[p.en];
  const wasNew=!st;
  if(!st) st=G.phr[p.en]=[0,0,0,0,0,0,0];
  srsApply(st, ok, now);
  const pd=pdayRec(); pd.a++; if(ok) pd.c++;   // 目安・あゆみとは別台帳(G.pdays)
  const bonus5=ansBonus();                      // 5問ボーナスは単語+フレーズの合算
  track("ans"); if(ok) track("cor");            // 任務・実績のクイズ系は共有
  phrNoteRecent(p.en);
  if(PDRILL) PDRILL.res.push(ok); // 実戦ドリルの進行(v5.2.0)
  if(QUICK.goal){ QUICK.done++; if(ok) QUICK.cor++; }
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; pd.m++; justMastered=true; }
  let bigT=false;
  if(ok){
    G.combo=(G.combo||0)+1;
    G.tickets+=corTicketGain();
    const l0=accountLevel();
    G.xp+=Math.round((10+(justMastered?40:0))*streakXpMult()*comboXpMult()*abilityXpMult());
    const l1=accountLevel();
    if(justMastered){ toast("🏅 フレーズを覚えた! 7日あけても出てきた"); vibe([30,40,60]); bigT=true; }
    else if(l1>l0){ toast("📖 レベルアップ! Lv"+l1+" ─ 全ステータス強化"); vibe(40); bigT=true; }
  }else{
    G.combo=0;
  }
  if(bonus5 && !bigT) toast("🎁 5問ごとのボーナス 🎫+"+bonus5);
  /* 答え合わせ: 常設の文脈行の空欄を核で埋める(核はハイライト)。
     v5.0の「青字の全文を後から差し込む」は廃止 ─ 要素が増えないのでレイアウトが動かない */
  $("phrBuild").innerHTML=phrCtxHTML(p, true);
  $("qStats").innerHTML=qStatsHTML(st);
  /* pt(型の一般形・v5.4.0)があれば核の代わりに型を見せる: 1文の暗記を
     「enable 人 to do」のような使い回せる型の獲得につなげる */
  $("resultCard").innerHTML='<span class="poschip phrcat">'+(PHR_CATS[p.c]||"")+'</span>'+
    (p.pt
      ? '<span class="rmeta">🧩 <b class="pkey">'+esc(p.pt)+'</b></span>'
      : '<span class="rmeta">🔑 <b class="pkey">'+esc(p.k)+'</b></span>'+
        '<span class="rmeta small"> '+(p.ty==="s"? "🧩 型":"🔗 連語")+' ・ 単語タップで辞書</span>');
  $("resultBar").classList.add("show");
  $("promptCard").classList.add("srch"); // タップで核の語を辞書へ(quiz.js側で分岐)
  saveG(); refreshHeader(); refreshQuizCount();
  if(G.opt && G.opt.autoNext){
    clearTimeout(phrAutoT);
    phrAutoT=setTimeout(()=>{ if(phrAnswered) newQuestion(); }, G.opt.autoNext);
  }
}

/* ---- フレーズのあゆみ(v5.3.0): 日別グラフ+定着の階段の分布 ----
   単語の「学習のあゆみ」のフレーズ版(台帳はG.pdays=目安と別カウント)。
   導線は⚙設定・記録と🎤実戦メニューの2か所 */
function pdayHistory(g, n, offset){
  const out=[], base=new Date(), off=offset||0;
  for(let i=n-1+off;i>=off;i--){
    const dt=new Date(base.getFullYear(), base.getMonth(), base.getDate()-i);
    const k=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
    const r=(g.pdays||{})[k]||{};
    out.push({k, md:(dt.getMonth()+1)+"/"+dt.getDate(), day:dt.getDate(), a:r.a||0, c:r.c||0, m:r.m||0});
  }
  return out;
}
function openPhrHistoryModal(page){
  page=+page; if(!isFinite(page) || page<0) page=0; // onclick直結でイベントが渡っても0扱い
  const h=pdayHistory(G, 14, page*14);
  const max=Math.max(1, ...h.map(x=>x.a));
  const H=56;
  const bars=h.map(x=>{
    const bh=x.a? Math.max(3, Math.round(H*x.a/max)) : 0;
    return '<div class="hcol"><div class="hval">'+(x.a||"")+'</div>'+
      '<div class="hbarw"><div class="hbar" style="height:'+bh+'px"></div></div>'+
      '<div class="hday">'+x.day+'</div></div>';
  }).join("");
  let oldest=null;
  for(const k in G.pdays){ if((G.pdays[k].a||0)>0 && (!oldest || k<oldest)) oldest=k; }
  const hasPrev=!!(oldest && oldest<h[0].k);
  let daysN=0, tot=0, totC=0;
  for(const k in G.pdays){ const r=G.pdays[k]; if(r.a>0){ daysN++; tot+=r.a; totC+=r.c||0; } }
  // 定着の階段の分布: どの出題形式の層に何フレーズいるか(=次に何をすれば進むかが見える)
  let s0=0,s1=0,s2=0,s3=0,s4=0;
  PHRASES.forEach(p=>{
    const st=G.phr[p.en];
    if(!st) s0++;
    else if(st[0]>=MASTER_BOX) s4++;
    else if(st[0]>=4) s3++;
    else if(st[0]>=2) s2++;
    else s1++;
  });
  openModal('<h3>📊 フレーズのあゆみ '+helpBtn("hlp-phist")+'</h3>'+
    helpNote("hlp-phist", 'フレーズは単語の「今日の目安」とは別カウント(このグラフが専用の記録)。'+
      '出題は定着の階段と連動する: 🧠クローズ4択(定着0-1)→🧩並べ替え(2-3)→🎙口頭(4)→'+
      '⭕口頭で言えたら「✓覚えた」(定着5)。忘却曲線・復習間隔は単語と同じ')+
    '<div class="row histnav" style="gap:8px; margin-top:6px">'+
      '<button class="btn hnav" id="phrHistPrev"'+(hasPrev?'':' disabled')+'>◀</button>'+
      '<div class="grow" style="text-align:center; font-weight:800">'+h[0].md+' 〜 '+h[13].md+
        '<span class="small" style="font-weight:700"> ・ '+fmt(h.reduce((s,x)=>s+x.a,0))+'問</span></div>'+
      '<button class="btn hnav" id="phrHistNext"'+(page>0?'':' disabled')+'>▶</button></div>'+
    '<div class="histchart">'+bars+'</div>'+
    '<div class="small" style="margin-top:6px">バー=その日のフレーズ解答数</div>'+
    '<table class="stt" style="margin-top:12px">'+
      '<tr><td>累計解答(全期間)</td><td>'+fmt(tot)+'問(正答率 '+(tot? Math.round(100*totC/tot):0)+'%)</td></tr>'+
      '<tr><td>学習した日数</td><td>'+daysN+'日</td></tr>'+
      '<tr><td>覚えたフレーズ</td><td>'+fmt(s4)+' / '+fmt(PHRASES.length)+'</td></tr>'+
    '</table>'+
    '<h2 style="margin-top:12px">🪜 定着の階段(いまの分布)</h2>'+
    '<table class="stt">'+
      '<tr><td>🧠 クローズ4択(定着0-1)</td><td>'+fmt(s1)+'</td></tr>'+
      '<tr><td>🧩 並べ替え(定着2-3)</td><td>'+fmt(s2)+'</td></tr>'+
      '<tr><td>🎙 口頭チェック(定着4)</td><td>'+fmt(s3)+'</td></tr>'+
      '<tr><td>✓ 覚えた(口頭で言えた)</td><td>'+fmt(s4)+'</td></tr>'+
      '<tr><td>未学習</td><td>'+fmt(s0)+'</td></tr>'+
    '</table>');
  $("phrHistPrev").onclick=()=>{ if(hasPrev) openPhrHistoryModal(page+1); };
  $("phrHistNext").onclick=()=>{ if(page>0) openPhrHistoryModal(page-1); };
}

/* ---- 学習対象のセグ切替(単語/フレーズ)。好みはG.opt.qtab(端末ローカル優先マージ) ---- */
function phrSyncSeg(){
  const seg=$("quizSeg"); if(!seg) return;
  seg.querySelectorAll("button").forEach(x=>x.classList.toggle("active", x.dataset.q===quizTarget()));
}
$("quizSeg").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{
    if(b.dataset.q==="dr"){ openDrillMenu(); return; } // 実戦は「入口」(モードではない=v5.2.0)
    PDRILL=null; // 単語/フレーズへの切替でドリルは中断
    if(quizTarget()===b.dataset.q) return; // 同状態への切替は無視(冪等)
    G.opt.qtab=b.dataset.q; saveG();
    phrSyncSeg();
    newQuestion();
  };
});
phrSyncSeg(); // 起動時に保存済みの好みをセグへ反映
