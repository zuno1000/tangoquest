"use strict";
/* ================= 4択クイズ(tango準拠の忘却曲線SRS + カードドロップ) ================= */
const INTERVALS=[60e3, 10*60e3, 864e5, 3*864e5, 7*864e5, 16*864e5, 35*864e5, 90*864e5];
/* 「覚えた」の基準(v4.13.0で4→5に引き上げ): box5=7日間あけた復習にも正解した単語。
   従来のbox4は「3日後に思い出せた」時点で覚えた扱いになっており、
   忘却曲線的に「週をまたいで思い出せる」ことを確認できていなかった */
const MASTER_BOX=5;

let cur=null, answered=false;
let autoNextT=null; // 「自動で次へ」(v4.26.0設定)のタイマー
/* サクッと5問(v4.26.0): 隙間時間の小さなセッション。varはテスト(iframe)からの参照用。
   保存しない=アプリを閉じれば消える一時状態(帳簿はすべて通常の学習計上に乗る) */
var QUICK={goal:0, done:0, cor:0};
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
    /* 期限前の正解では階段を上がらない(v4.13.0): 出題対象が尽きたときの
       先取り復習(pickWordのフォールバック)で同じ日に何度も正解しても、
       実時間の間隔をあけて思い出せたことにはならない。忘却曲線の検証は
       期限が来た出題での正解だけが担う(正解・ミスの回数は通常どおり数える) */
    if(st[1]>now && (st[2]+st[3])>0){ st[2]++; st[5]=0; st[6]=now; return st; }
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

/* 日別記録への計上(純関数)。a/c=合計解答・正解、n=新規着手数(導入ペースの消化判定)、
   na/nc・ra/rc=新規/復習別の解答・正解 ─ v4.12.0から記録開始。
   「学習のあゆみ」の全期間の新規/復習別正答率に使う(それ以前の日は内訳なし) */
function recordDayAnswer(d, wasNew, ok){
  d.a++; if(ok) d.c++;
  if(wasNew){
    d.n=(d.n||0)+1;
    d.na=(d.na||0)+1; if(ok) d.nc=(d.nc||0)+1;
  }else{
    d.ra=(d.ra||0)+1; if(ok) d.rc=(d.rc||0)+1;
  }
}

/* 定着ステップの表示(v4.13.0): 「あとどのくらいで覚えたことになるのか」を見せる。
   box=覚えるまでの階段(0〜MASTER_BOX)。覚えた後は✓だけ出す */
function masteryHTML(st){
  if(!st) return "";
  if(st[0]>=MASTER_BOX) return ' ・ <span class="qmas">✓覚えた</span>';
  return ' ・ <span class="qstep">定着 '+st[0]+'/'+MASTER_BOX+'</span>';
}
/* 出題ヘッダの統計行。解答直後にも呼び直して定着ステップの変化を見せる */
function qStatsHTML(st){
  if(!st) return "";
  return 'これまで <span class="qo">正解 '+st[2]+'</span> ・ <span class="qx">ミス '+st[3]+'</span>'+
    masteryHTML(st)+
    ((st[5]||0)>=3? ' <span class="qfire">🔥連続ミス'+st[5]+'(正解で強カード!)</span>':"");
}

/* 「今日 X/Y問」の共通表記(学習タブ#qCount・サバイバー#svCountで共用)。
   v4.26.0: qCountの値は出題時に固定されていたため、サバイバー(荒野含む)で解いた分が
   学習タブへ戻ったとき反映されない不具合があった → タブ切替時にrefreshQuizCountで引き直す */
function todayCountText(){
  const d=dayRec(), q=paceToday(G);
  return ((G.combo||0)>=3? "⚡"+G.combo+"連続 ・ ":"")+
    "今日 "+d.a+(q&&!q.done? "/"+q.perDay:"")+"問";
}
function refreshQuizCount(){
  const el=$("qCount"); if(!el) return;
  el.textContent=(QUICK.goal? "⚡"+Math.min(QUICK.done,QUICK.goal)+"/"+QUICK.goal+"問 ・ ":"")+todayCountText();
}

/* ---- サクッと5問(v4.26.0): 「5問だけならやろう」の背中押し ---- */
/* 完了ボーナス(v4.30.0・実機FB「報酬を上げて取り組む意欲を」): 完了ごとに🎫3・1日3回まで。
   完了回数は日別記録d.qkに残す(同期はa/c等と同じmaxマージ)。🎫は「学習だけが源泉」の
   限定通貨なので学習ボーナスとして経済の筋が通り、1回の完了に5解答が必要=放置では稼げない。
   varはテスト(iframe)からの参照用 */
var QUICK_BONUS_T=3, QUICK_BONUS_N=3;
function quickBonusLeft(){ return Math.max(0, QUICK_BONUS_N-(dayRec().qk||0)); }
function startQuick(n){
  QUICK={goal:n||5, done:0, cor:0};
  switchTab("quiz");
  refreshQuizCount();
  toast("⚡ サクッと"+QUICK.goal+"問 ─ 気軽にどうぞ!");
}
function openQuickDone(){
  const d=dayRec(), q=paceToday(G);
  const g=QUICK.goal, c=QUICK.cor;
  // 完了ボーナス(v4.30.0): 🎫は付与してから回数を刻む(1日QUICK_BONUS_N回まで)
  const bonus=quickBonusLeft()? QUICK_BONUS_T : 0;
  d.qk=(d.qk||0)+1;
  if(bonus){ G.tickets+=bonus; }
  saveG(); refreshHeader();
  QUICK={goal:0, done:0, cor:0}; // ✕で閉じても通常学習として続けられる
  openModal('<h3>⚡ '+g+'問 おつかれさま!</h3>'+
    '<div class="giftbox">正解 <b style="font-size:18px">'+c+' / '+g+'</b>'+(c>=g? ' ─ 全問正解! 🎉':'')+
    (bonus? '<br><span style="font-weight:800; color:var(--accent2)">🎁 完了ボーナス 🎫+'+bonus+'</span>'+
      '<span class="small">'+(quickBonusLeft()? '(今日あと'+quickBonusLeft()+'回)':'(今日の分はこれで全部)')+'</span>'
      : '<br><span class="small">完了ボーナスはまた明日(1日'+QUICK_BONUS_N+'回まで)</span>')+
    '<br><span class="small">今日 '+d.a+(q&&!q.done? "/"+q.perDay:"")+'問'+
    (q&&!q.done&&d.a>=q.perDay? ' ─ 目安達成! 🏅':'')+'</span></div>'+
    '<div class="row" style="gap:10px">'+
    '<button class="btn grow" id="quickMore">⚡ もう5問</button>'+
    '<button class="btn primary grow" id="quickHome">ホームへ</button></div>');
  $("quickMore").onclick=()=>{ closeModal(); startQuick(5); newQuestion(); };
  $("quickHome").onclick=()=>{ closeModal(); switchTab("home"); };
}

/* 「自動で次へ」(v4.26.0)の設定値: 0=オフ→1秒→1.5秒→2秒を巡回 */
function autoNextCycle(v){ return {0:1000, 1000:1500, 1500:2000, 2000:0}[v||0]||0; }
function autoNextLabel(v){ return {0:"オフ", 1000:"1秒", 1500:"1.5秒", 2000:"2秒"}[v||0]||"オフ"; }

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

/* 長い訳語の選択肢は1行に収まるまで文字をわずかに縮める(最小13px・v4.23.0)。
   harbor「（感情を）心に抱く、（犯人を）かくまう」等は17pxだと折り返して
   文末の1文字だけが2行目に落ちていた(実機FB)。最小まで縮めても収まらない長文だけ
   2行を許し、折り返し位置はchoiceHTMLの「かたまり」境界(読点)が決める
   (旧text-wrap:balanceは語中の早い改行の原因だったためv4.30.0で撤去) */
function fitChoiceFont(b){
  b.style.fontSize="";
  if(!b.clientWidth) return; // 非表示タブでは測れない(表示時にrefitChoicesが再実行)
  b.classList.add("fitmeasure");
  let fs=parseFloat(getComputedStyle(b).fontSize)||17;
  while(b.scrollWidth>b.clientWidth && fs>13){
    fs=Math.max(13, fs-0.5);
    b.style.fontSize=fs+"px";
  }
  b.classList.remove("fitmeasure");
}
function refitChoices(sel){ document.querySelectorAll(sel).forEach(fitChoiceFont); }

/* 選択肢の訳語は読点(、)・全文区切り(。／)ごとにinline-blockの「かたまり」にする(v4.30.0)。
   text-wrap:balanceは2行を均等に割ろうとして「取り除く」の語中(取|り)など、右に余白が
   あっても不自然な位置で早めに折り返していた(pounceの実機FB)→ balanceを廃止し、
   折り返しは、かたまりの境界(=意味の切れ目)でだけ起きるようにする。
   文字は一切変えないのでtextContentは原文のまま=answerの正誤判定(textContent比較)に影響しない。
   .choiceはflexなので、かたまり全体を1つの.ctxtに包んで単一のflexアイテムに保つ */
function choiceHTML(t){
  const seg=String(t).match(/[^、。／]*[、。／]|[^、。／]+/g)||[String(t)];
  return '<span class="ctxt">'+seg.map(s=>'<span class="cseg">'+esc(s)+'</span>').join("")+'</span>';
}

function renderQuestion(){
  answered=false;
  $("resultBar").classList.remove("show");
  $("promptCard").classList.remove("srch"); // 辞書リンクは正誤確認中だけ
  const w=cur.word, e2j=G.mode==="e2j";
  const st=G.words[w.en];
  $("qBadge").textContent = !st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習");
  $("qBadge").style.color = !st? "var(--accent2)" : (st[0]>=MASTER_BOX? "var(--ok)" : "var(--accent)");
  // 「今日 X/Y問」は右端に固定。連続正解は必要なときだけ左側に付く(連続日数は出さない)
  refreshQuizCount();
  const pw=$("promptWord");
  pw.textContent = e2j? w.en : w.ja;
  pw.className = e2j? "" : "ja";
  $("qStats").innerHTML = qStatsHTML(st);
  const box=$("choices"); box.innerHTML="";
  cur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.innerHTML=choiceHTML(e2j? c.ja : c.en); // かたまり単位の折り返し(textContentは原文のまま)
    b.onclick=()=>answer(c,b);
    box.appendChild(b);
  });
  refitChoices("#choices .choice");
}

function newQuestion(){
  clearTimeout(autoNextT); // 手動の「次へ」と自動進行タイマーの二重発火を断つ
  if(QUICK.goal && QUICK.done>=QUICK.goal){ openQuickDone(); return; } // サクッと5問の完了
  const w=pickWord();
  cur={word:w, choices:buildChoices(w)};
  renderQuestion();
}

function answer(chosen, btn){
  if(answered) return;
  answered=true;
  const w=cur.word, ok=chosen.en===w.en, e2j=G.mode==="e2j";
  /* 学習タブの選択肢(#choices)だけを対象にする。documentグローバルだと、
     時間停止で保持中のサバイバーの選択肢まで無効化+半透明化してしまい
     「戦闘に戻ると押せない」バグになる(v4.22.0で根治・2026-08-13特定) */
  document.querySelectorAll("#choices .choice").forEach(b=>{
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
  const d=dayRec(); recordDayAnswer(d, wasNew, ok);
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; d.m++; justMastered=true; }
  track("ans"); if(ok) track("cor");
  paceLog(wasNew, ok); // 学習ペース推定の材料(直近100問)
  noteRecent(w.en);
  if(QUICK.goal){ QUICK.done++; if(ok) QUICK.cor++; } // サクッと5問の進捗(帳簿は通常と同一)

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
    // 「覚えた」の瞬間がいちばん大事なお祝い(v4.13.0)。次点でレベルアップ・★アップ
    if(justMastered){ toast("🏅 "+w.en+" を覚えた! 7日あけても思い出せた"); vibe([30,40,60]); }
    else if(lvUp){ toast("📖 レベルアップ! Lv"+lvUp+" ─ 全ステータス強化"); vibe(40); }
    else if(drop.rarUp){ toast("🎉 "+w.en+" のカードが★"+drop.rar+"にランクアップ!"); vibe(30); }
    else if(rar>=3) vibe(30);
    // 🎫は毎正解なのでトースト・結果バー表示は出さない(残高はガチャ画面で確認)
  }
  $("qStats").innerHTML=qStatsHTML(st); // 定着ステップの変化(上がった/戻った)を見せる
  rc.innerHTML='<span class="poschip pos'+w.pos+'">'+POS_LABEL[w.pos]+'</span>'+meta.join(' ');
  $("resultBar").classList.add("show");
  $("promptCard").classList.add("srch"); // 単語タップで辞書へ(意味の裏取り)
  // 今日の目安にちょうど到達した瞬間だけ祝う(毎問出る表示はノイズ=v4.6.2の知見)
  const pq=paceToday(G);
  if(pq && !pq.done && d.a===pq.perDay){ toast("🎉 今日の目安 "+pq.perDay+"問を達成!"); vibe(40); }
  saveG();
  refreshHeader();
  refreshQuizCount(); // 解答数・サクッと5問の進捗を即時反映
  /* 自動で次へ(v4.26.0設定): タイマー発火時にまだ確認中(answered)のときだけ進む。
     手動の「次へ」はnewQuestion冒頭のclearTimeoutで先取りされる */
  if(G.opt && G.opt.autoNext){
    clearTimeout(autoNextT);
    autoNextT=setTimeout(()=>{ if(answered) newQuestion(); }, G.opt.autoNext);
  }
}

$("nextBtn").onclick=()=>newQuestion();

/* 正誤確認中は上部の単語カードのタップで辞書(Weblio)を開き、意味を自分で確かめられる。
   出題中は誤タップ防止のため無効(srchクラスで見た目も切り替え) */
$("promptCard").onclick=()=>{
  if(!answered || !cur) return;
  window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(cur.word.en), "_blank", "noopener");
};
