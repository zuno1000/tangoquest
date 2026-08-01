"use strict";
/* ================= 4択クイズ(tango準拠の忘却曲線SRS + カードドロップ) ================= */
const INTERVALS=[60e3, 10*60e3, 864e5, 3*864e5, 7*864e5, 16*864e5, 35*864e5, 90*864e5];
const MASTER_BOX=4;

let lastEn=null, cur=null, answered=false;

/* word state: [box, due, correct, wrong, mastered, wrongStreak, lastCorrectAt] */
function pickWord(){
  const now=Date.now(); const due=[], unseen=[];
  for(const w of WORDS){
    const st=G.words[w.en];
    if(!st) unseen.push(w);
    else if(st[1]<=now) due.push(w);
  }
  const notLast=a=>a.length>1? a.filter(w=>w.en!==lastEn) : a;
  const d=notLast(due), u=notLast(unseen);
  if(d.length && (u.length===0 || Math.random()<0.8)){
    d.sort((a,b)=>G.words[a.en][1]-G.words[b.en][1]);
    const pool=d.slice(0, Math.min(8,d.length));
    return pool[Math.floor(Math.random()*pool.length)];
  }
  if(u.length) return u[Math.floor(Math.random()*u.length)];
  const seen=WORDS.filter(w=>G.words[w.en] && w.en!==lastEn);
  seen.sort((a,b)=>(G.words[a.en][0]-G.words[b.en][0]) || (G.words[a.en][1]-G.words[b.en][1]));
  const pool=seen.slice(0, Math.min(10,seen.length));
  return pool[Math.floor(Math.random()*pool.length)] || WORDS[0];
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
  const w=cur.word, e2j=G.mode==="e2j";
  const st=G.words[w.en];
  $("qBadge").textContent = !st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習");
  $("qBadge").style.color = !st? "var(--accent2)" : (st[0]>=MASTER_BOX? "var(--ok)" : "var(--accent)");
  const d=dayRec(); $("qCount").textContent="今日 "+d.a+"問";
  const pw=$("promptWord");
  pw.textContent = e2j? w.en : w.ja;
  pw.className = e2j? "" : "ja";
  $("promptHint").textContent = e2j? "この単語の意味は？" : "この意味の英単語は？";
  $("qStats").innerHTML = !st
    ? '<span>初めて出題される単語</span>'
    : 'これまで <span class="qo">正解 '+st[2]+'</span> ・ <span class="qx">ミス '+st[3]+'</span>'+
      ((st[5]||0)>=3? ' <span style="color:var(--accent)">🔥連続ミス'+st[5]+'(正解で強カード!)</span>':"");
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
  if(!st) st=G.words[w.en]=[0,0,0,0,0,0,0];
  const preSt=st.slice(); // ドロップ判定は解答前の状態で
  if(ok) st[0]=Math.min(st[0]+1, INTERVALS.length-1); else st[0]=0;
  st[1]=now+INTERVALS[st[0]];
  if(ok){ st[2]++; st[5]=0; st[6]=now; } else { st[3]++; st[5]=(st[5]||0)+1; }
  const d=dayRec(); d.a++; if(ok) d.c++;
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; d.m++; justMastered=true; }
  track("ans"); if(ok) track("cor");
  lastEn=w.en;

  // 知識XP: 正解が直接キャラの強さになる
  let xpGain=0, lvUp=0;
  if(ok){
    const l0=accountLevel();
    xpGain=10+(justMastered?40:0);
    G.xp+=xpGain;
    const l1=accountLevel();
    if(l1>l0){ lvUp=l1; }
  }

  // 結果表示 + カードドロップ(文言は簡潔に・縦を圧縮)
  const head=$("resultHead");
  head.textContent = ok? "⭕ 正解" : "❌ "+w.en;
  head.className = ok? "ok" : "ng";
  const rc=$("resultCard");
  if(ok){
    const rar=dropRarity(preSt);
    const key=addCard(w.en, rar);
    const c=cardOf(key);
    const gain=equipGainFor(key);
    rc.innerHTML='<span class="dropchip bd'+rar+'" id="dropChip">'+c.icon+
      ' <span class="rc'+rar+'">'+RAR_STARS[rar-1]+'</span> '+esc(w.en)+'</span>'+
      ' <span class="small">+'+xpGain+'XP'+
        (lvUp? ' <b style="color:var(--accent)">Lv'+lvUp+'!</b>':'')+'</span>'+
      (gain>0? '<div style="margin-top:5px"><button class="minibtn" id="eqNowBtn">⬆ 装備 (+'+fmt(gain)+')</button></div>':'');
    $("dropChip").onclick=()=>openCardModal(key);
    const eb=$("eqNowBtn");
    if(eb) eb.onclick=()=>{
      if(!quickEquip(key)) return;
      eb.disabled=true; eb.textContent="装備した!";
      toast("戦闘力 "+fmt(playerStats().power)+" になった");
      refreshHeader();
    };
    if(lvUp){ toast("📖 レベルアップ! Lv"+lvUp+" ─ 全ステータス強化"); vibe(40); }
    else if(rar>=3) vibe(30);
  }else{
    rc.innerHTML='<span class="small">'+esc(w.ja)+
      ((st[5]||0)>=2? ' <span style="color:var(--accent)">🔥ミス'+st[5]+'</span>':'')+'</span>';
  }
  $("resultBar").classList.add("show");
  saveG();
  refreshHeader();
}

$("nextBtn").onclick=()=>newQuestion();
