"use strict";
/* ================= 4択クイズ(tango準拠の忘却曲線SRS + カードドロップ) ================= */
const INTERVALS=[60e3, 10*60e3, 864e5, 3*864e5, 7*864e5, 16*864e5, 35*864e5, 90*864e5];
const MASTER_BOX=4;

let cur=null, answered=false;
/* 直近に出した単語(3問)は再出題しない ─ 1問おきの機械的な往復を防ぐ */
let recentEns=[];
function noteRecent(en){ recentEns.push(en); if(recentEns.length>3) recentEns.shift(); }

/* 復習の緊急度=「忘れかけ度」: 期限をどれだけ過ぎたかを、その単語の記憶間隔で割った比。
   間隔1日を半日超過(0.5)は、間隔35日を1日超過(0.03)よりずっと危ない。
   連続ミス中の単語はさらに優先して早めに立て直す */
function reviewUrgency(st, now){
  const iv=INTERVALS[Math.min(st[0], INTERVALS.length-1)];
  let u=(now-st[1])/iv;
  if((st[5]||0)>=2) u+=0.5;
  return u;
}

/* word state: [box, due, correct, wrong, mastered, wrongStreak, lastCorrectAt, lapseBack] */
function pickWord(){
  const now=Date.now(); const due=[], unseen=[];
  for(const w of WORDS){
    const st=G.words[w.en];
    if(!st) unseen.push(w);
    else if(st[1]<=now) due.push(w);
  }
  const fresh=a=>{ const f=a.filter(w=>!recentEns.includes(w.en)); return f.length? f : a; };
  const d=fresh(due), u=fresh(unseen);
  /* 新規を混ぜる確率: 目標があれば「1日の新規目安」を消化するまで30%、消化後は復習に専念
     (復習が尽きたら新規は無制限)。目標なしは従来どおり20% */
  let pNew=0.2;
  const q=paceQuota(G);
  if(q){
    const nT=paceNewPerDay(q);
    pNew=(nT>0 && (dayRec().n||0)<nT)? 0.3 : 0;
  }
  if(d.length && (u.length===0 || Math.random()>=pNew)){
    // 編成中の単語が復習期限なら優先出題(野生語の記憶Lv維持ループ)
    const eqEn=equippedEnSet();
    const ed=d.filter(w=>eqEn.has(w.en));
    const src=ed.length? ed : d;
    src.sort((a,b)=>reviewUrgency(G.words[b.en],now)-reviewUrgency(G.words[a.en],now));
    const pool=src.slice(0, Math.min(8,src.length));
    return pool[Math.floor(Math.random()*pool.length)];
  }
  if(u.length) return u[Math.floor(Math.random()*u.length)];
  // 期限が来た単語がない: 弱い(boxが低い)順に先取り復習
  const seen=fresh(WORDS.filter(w=>G.words[w.en]));
  seen.sort((a,b)=>(G.words[a.en][0]-G.words[b.en][0]) || (G.words[a.en][1]-G.words[b.en][1]));
  const pool=seen.slice(0, Math.min(10,seen.length));
  return pool[Math.floor(Math.random()*pool.length)] || WORDS[0];
}

/* SRS更新(純関数)。ミスはbox0(1分後に再挑戦)に落とすが、box3以上で覚えていた単語は
   st[7]に「復帰先=半分のbox」を記録し、次の正解でそこへ戻る ─ 高い階段を全部
   登り直させると復習が渋滞し、挫折感も大きい(Ankiのlapse運用と同じ発想) */
function srsApply(st, ok, now){
  if(ok){
    st[0]=Math.min(Math.max(st[0]+1, st[7]||0), INTERVALS.length-1);
    st[7]=0;
    st[2]++; st[5]=0; st[6]=now;
  }else{
    if(st[0]>=3) st[7]=Math.max(1, Math.floor(st[0]/2));
    st[0]=0;
    st[3]++; st[5]=(st[5]||0)+1;
  }
  st[1]=now+INTERVALS[st[0]];
  return st;
}

function jaTokens(s){ return s.split(/[、。・（）()／\/\s～~]+/).filter(t=>t.length>=2); }
function overlaps(a,b){
  const ta=jaTokens(a.ja), tb=new Set(jaTokens(b.ja));
  return ta.some(t=>tb.has(t));
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function buildChoices(word){
  const pool=WORDS.filter(c=>c.pos===word.pos && c.en!==word.en && !overlaps(c,word));
  shuffle(pool);
  return shuffle([word, ...pool.slice(0,3)]);
}

function renderQuestion(){
  answered=false;
  $("resultBar").classList.remove("show");
  $("promptCard").classList.remove("srch"); // 辞書リンクは正誤確認中だけ
  const w=cur.word, e2j=G.mode==="e2j";
  const st=G.words[w.en];
  $("qBadge").textContent = !st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習");
  $("qBadge").style.color = !st? "var(--accent2)" : (st[0]>=MASTER_BOX? "var(--ok)" : "var(--accent)");
  const d=dayRec();
  const q=paceToday(G);
  // 「今日 X/Y問」は右端に固定。連続正解は必要なときだけ左側に付く(連続日数は出さない)
  $("qCount").textContent=((G.combo||0)>=3? "⚡"+G.combo+"連続 ・ ":"")+
    "今日 "+d.a+(q&&!q.done? "/"+q.perDay:"")+"問";
  const pw=$("promptWord");
  pw.textContent = e2j? w.en : w.ja;
  pw.className = e2j? "" : "ja";
  $("qStats").innerHTML = !st
    ? ''
    : 'これまで <span class="qo">正解 '+st[2]+'</span> ・ <span class="qx">ミス '+st[3]+'</span>'+
      ((st[5]||0)>=3? ' <span class="qfire">🔥連続ミス'+st[5]+'(正解で強カード!)</span>':"");
  const box=$("choices"); box.innerHTML="";
  cur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent = e2j? c.ja : c.en;
    b.onclick=()=>answer(c,b);
    box.appendChild(b);
  });
}

function newQuestion(){
  const w=pickWord();
  cur={word:w, choices:buildChoices(w)};
  renderQuestion();
}

function answer(chosen, btn){
  if(answered) return;
  answered=true;
  const w=cur.word, ok=chosen.en===w.en, e2j=G.mode==="e2j";
  document.querySelectorAll(".choice").forEach(b=>{
    b.disabled=true;
    const isCorrect = b.textContent === (e2j? w.ja : w.en);
    if(isCorrect) b.classList.add("correct");
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  // SRS更新
  const now=Date.now();
  let st=G.words[w.en];
  const wasNew=!st;
  if(!st) st=G.words[w.en]=[0,0,0,0,0,0,0];
  const preSt=st.slice(); // ドロップ判定は解答前の状態で
  srsApply(st, ok, now);
  const d=dayRec(); d.a++; if(ok) d.c++;
  if(wasNew) d.n=(d.n||0)+1; // 今日はじめて着手した単語数(新規導入ペースの消化判定)
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; d.m++; justMastered=true; }
  track("ans"); if(ok) track("cor");
  paceLog(wasNew, ok); // 学習ペース推定の材料(直近100問)
  noteRecent(w.en);

  // 連続正解コンボ(XPボーナス・ドロップ★率UP)と、正解ごとの🎫(v4.6.0: 1問=🎫1)
  let tkGain=0;
  if(ok){
    G.combo=(G.combo||0)+1;
    tkGain=corTicketGain();
    if(tkGain) G.tickets+=tkGain;
  }else{
    G.combo=0;
  }

  // 知識XP: 正解が直接キャラの強さになる(連続学習日数+コンボ+キャラスキルでボーナス)
  let xpGain=0, lvUp=0;
  if(ok){
    const l0=accountLevel();
    xpGain=Math.round((10+(justMastered?40:0))*streakXpMult()*comboXpMult()*abilityXpMult());
    G.xp+=xpGain;
    const l1=accountLevel();
    if(l1>l0){ lvUp=l1; }
  }

  // 結果表示: 品詞と語源・野生語だけを見せる(正誤は選択肢の色で伝わる)
  // 語源タグは1つずつinline-blockのチップにする=タグの途中で改行されない
  const rc=$("resultCard");
  const rt=rootText(w.en), meta=[];
  if(rt) rt.split("・").forEach((tag,i)=>meta.push('<span class="rmeta">'+(i? '':'🧬 ')+esc(tag)+'</span>'));
  if(isWild(w.en)) meta.push('<span class="rmeta wildm">🐺 野生語 Lv'+memBox(w.en)+'</span>');
  if(ok){
    let rar=dropRarity(preSt);
    if(Math.random()<comboDropBonus()) rar=Math.min(5, rar+1); // コンボ中は★+1のチャンス
    const drop=addCard(w.en, rar);
    if(lvUp){ toast("📖 レベルアップ! Lv"+lvUp+" ─ 全ステータス強化"); vibe(40); }
    else if(drop.rarUp){ toast("🎉 "+w.en+" のカードが★"+drop.rar+"にランクアップ!"); vibe(30); }
    else if(rar>=3) vibe(30);
    // 🎫は毎正解なのでトースト・結果バー表示は出さない(残高はガチャ画面で確認)
  }
  rc.innerHTML='<span class="poschip pos'+w.pos+'">'+POS_LABEL[w.pos]+'</span>'+meta.join(' ');
  $("resultBar").classList.add("show");
  $("promptCard").classList.add("srch"); // 単語タップで辞書へ(意味の裏取り)
  // 今日の目安にちょうど到達した瞬間だけ祝う(毎問出る表示はノイズ=v4.6.2の知見)
  const pq=paceToday(G);
  if(pq && !pq.done && d.a===pq.perDay){ toast("🎉 今日の目安 "+pq.perDay+"問を達成!"); vibe(40); }
  saveG();
  refreshHeader();
}

$("nextBtn").onclick=()=>newQuestion();

/* 正誤確認中は上部の単語カードのタップで辞書(Weblio)を開き、意味を自分で確かめられる。
   出題中は誤タップ防止のため無効(srchクラスで見た目も切り替え) */
$("promptCard").onclick=()=>{
  if(!answered || !cur) return;
  window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(cur.word.en), "_blank", "noopener");
};
