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

/* 出題(newQuestionから分岐)。phrStartはテストからの直接起動にも使う */
function phrNewQuestion(){
  clearTimeout(phrAutoT);
  if(QUICK.goal && QUICK.done>=QUICK.goal){ openQuickDone(); return; } // サクッと5問はフレーズでも同じ
  phrStart(pickPhrase());
}
function phrStart(p){
  const st=G.phr[p.en];
  phrCur={p, fmt:phrFormat(st), choices:null};
  if(phrCur.fmt==="mc") phrCur.choices=buildPhrChoices(p);
  phrRenderQuestion();
}

function phrRenderQuestion(){
  phrAnswered=false; phrPos=0; phrMiss=0;
  $("resultBar").classList.remove("show");
  $("promptCard").classList.remove("srch");
  const p=phrCur.p, st=G.phr[p.en];
  $("qBadge").textContent=(PHR_CATS[p.c]||"フレーズ")+(st? "" : " ・ 新規");
  $("qBadge").style.color="var(--accent2)";
  refreshQuizCount();
  const pw=$("promptWord");
  pw.textContent=p.ja;
  pw.className="ja";
  $("qStats").innerHTML=qStatsHTML(st);
  const bl=$("phrBuild");
  bl.classList.remove("hidden"); // 文脈行は出題時から常設(答え合わせでレイアウトが動かない)
  const box=$("choices"); box.innerHTML="";
  if(phrCur.fmt==="mc"){
    // 核のクローズ4択(v5.1.0): 文は見せて核だけ空欄。選択肢は核チャンク
    box.className="choices";
    bl.innerHTML=phrCtxHTML(p, false);
    phrCur.choices.forEach(c=>{
      const b=document.createElement("button");
      b.className="choice";
      b.innerHTML=choiceHTML((phrCloze(c)||{key:c.en}).key);
      b.onclick=()=>phrAnswerMC(c,b);
      box.appendChild(b);
    });
    refitChoices("#choices .choice");
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
    b.onclick=phrSpeakReveal;
    box.appendChild(b);
  }
}

/* 口頭ステージ: 答えを開いてから自己判定。🔊お手本(TTS)は答え合わせ後も押せる(シャドーイング用) */
function phrSpeakReveal(){
  if(phrAnswered || !phrCur) return;
  const p=phrCur.p;
  $("phrBuild").innerHTML=phrCtxHTML(p, true);
  const box=$("choices"); box.innerHTML="";
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
  $("resultCard").innerHTML='<span class="poschip phrcat">'+(PHR_CATS[p.c]||"")+'</span>'+
    '<span class="rmeta">🔑 <b class="pkey">'+esc(p.k)+'</b></span>'+
    '<span class="rmeta small"> '+(p.ty==="s"? "🧩 型":"🔗 連語")+' ・ 単語タップで辞書</span>';
  $("resultBar").classList.add("show");
  $("promptCard").classList.add("srch"); // タップで核の語を辞書へ(quiz.js側で分岐)
  saveG(); refreshHeader(); refreshQuizCount();
  if(G.opt && G.opt.autoNext){
    clearTimeout(phrAutoT);
    phrAutoT=setTimeout(()=>{ if(phrAnswered) newQuestion(); }, G.opt.autoNext);
  }
}

/* ---- 学習対象のセグ切替(単語/フレーズ)。好みはG.opt.qtab(端末ローカル優先マージ) ---- */
function phrSyncSeg(){
  const seg=$("quizSeg"); if(!seg) return;
  seg.querySelectorAll("button").forEach(x=>x.classList.toggle("active", x.dataset.q===quizTarget()));
}
$("quizSeg").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{
    if(quizTarget()===b.dataset.q) return; // 同状態への切替は無視(冪等)
    G.opt.qtab=b.dataset.q; saveG();
    phrSyncSeg();
    newQuestion();
  };
});
phrSyncSeg(); // 起動時に保存済みの好みをセグへ反映
