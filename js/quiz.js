"use strict";
/* ================= 4択クイズ(tango準拠の忘却曲線SRS + カードドロップ) ================= */
const INTERVALS=[60e3, 10*60e3, 864e5, 3*864e5, 7*864e5, 16*864e5, 35*864e5, 90*864e5];
/* 「覚えた」の基準(v4.13.0で4→5に引き上げ): box5=7日間あけた復習にも正解した単語。
   従来のbox4は「3日後に思い出せた」時点で覚えた扱いになっており、
   忘却曲線的に「週をまたいで思い出せる」ことを確認できていなかった */
const MASTER_BOX=5;

let cur=null, answered=false;
let autoNextT=null; // 「自動で次へ」(v4.26.0設定)のタイマー
/* 30問セット(v5.8.0・実機FB「30単語程度が1回の隙間時間にちょうどいい」):
   学習の単位を「30問=1セット」にし、1日を「セットを何回積むか」で見せる。
   v4.26.0のサクッと5問は廃止(5問は短すぎて達成感がなく、目安との関係も見えなかった)。
   セットの境界は今日の解答数(dayRec().a)の30の倍数=どの入口(学習/サバイバー)で解いても
   同じ物差し(5問ボーナスと同じ思想)。完了モーダルは学習タブでだけ出す(ゲーム中は邪魔)。
   このセットの中身(正解・新規・定着が進んだ数・🎫)はG.set(setRecord)に持つ。
   varはテスト(iframe)からの参照用 */
var SET_N=30;
/* 新規導入の待ったガード(v5.8.0): 期限が来た復習がこの数以上たまっているときは新規を混ぜない。
   復習が遅れる→忘れる→やり直しが増える→さらに遅れる、の悪循環(正答率の低下)を断つ。
   復習が片づけば新規はすぐ再開する(復習が尽きれば無制限=従来どおり) */
var NEW_GUARD=40;
/* ミックス(v5.10.0・実機FB「フレーズを日々の学習に組み込みやすく」): 学習タブの既定モード。
   30問セットのうちMIX_EVERY問目ごと(5・10・…・30問目=6問)がフレーズ、残り24問が単語。
   セットの物差しは「今日の解答数=単語(days)+フレーズ(pdays)の合算」に統一(5問ボーナスと同じ)=
   どのモード(ミックス/単語/フレーズ)で解いてもセットは同じ速さで進む。
   今日の目安(学習ペース管理)は従来どおり単語だけで数える(=単語の習得計画の数字。フレーズは加えない) */
var MIX_EVERY=5;
function mixSlotIsPhrase(total){ return ((total%SET_N)+1)%MIX_EVERY===0; } // total=今日の合算解答数(次が何問目か)
function todayTotal(){ return dayRec().a+pdayRec().a; }
/* 1セットに含まれる単語の数(目安→セット数の換算に使う)。ミックスは24・単語のみは30 */
function wordsPerSet(){ return quizTarget()==="mix"? SET_N-SET_N/MIX_EVERY : SET_N; }
/* いま画面に出ている問題の種類(w=単語/p=フレーズ)。モード(quizTarget)ではなく描画時に決まる */
let qKind="w";
function curKind(){ return qKind; }
/* 直近に出した単語(3問)は再出題しない ─ 1問おきの機械的な往復を防ぐ */
let recentEns=[];
function noteRecent(en){ recentEns.push(en); if(recentEns.length>3) recentEns.shift(); }

/* ---- 取り違えの学習(v5.12.0・「学習」を押すだけで最適な流れになるよう、既定の出題に組み込む) ----
   ①記録: ミスで選んだ誤答の単語を「取り違えペア」としてG.conf(en→{相手:回数}・両方向)に数える
   ②誤答の生成: 4択の誤答は「取り違えた相手」→「同じ語根の語」→ 無作為、の順(=消去法で解けない・弁別を毎回練習)
   ③追い出題: ミスの直後、取り違えた相手を数問以内に出す(pairQueue)=ペアを続けて見比べて区別を固める
   新しいモードやボタンは足さない(にがてノートには「取り違え: 相手」の情報だけ出す) */
/* 追い出題の間隔(v5.16.0・実機FB「すぐ次に出るのは仕様か」): ミスの手がかりで相手の意味を見た直後に出すと数秒前の記憶を写すだけになるため、
   1問おいて出す(PAIR_GAP=1)=10〜20秒あけて本当に思い出す。忘れていれば1分後の再出題に落ちるだけで損はない(結び付きの弱さが分かる) */
var PAIR_GAP=1;
let pairQueue=[]; // 追い出題の待ち行列({en, wait}: waitはあと何問おくか)
function noteConfusion(g, en, other){
  if(!en || !other || en===other) return;
  g.conf=g.conf||{};
  (g.conf[en]=g.conf[en]||{})[other]=(g.conf[en][other]||0)+1;
  (g.conf[other]=g.conf[other]||{})[en]=(g.conf[other][en]||0)+1;
}
/* 取り違えの相手(回数の多い順・純関数)。同じ品詞で現存する語だけ */
function confusedWith(g, en, n){
  const c=(g.conf||{})[en]; if(!c) return [];
  const w=byEn[en];
  return Object.keys(c).filter(o=>byEn[o] && (!w || byEn[o].pos===w.pos)).sort((a,b)=>c[b]-c[a]).slice(0, n||2);
}
/* 同じ語根の語(同じ品詞・純関数)。取り違えやすい家族を誤答に混ぜる */
function rootMates(en, n){
  const ids=rootIdsOf(en); if(!ids.length) return [];
  const w=byEn[en], out=[];
  for(const x of WORDS){
    if(x.en===en || x.pos!==w.pos) continue;
    if(rootIdsOf(x.en).some(i=>ids.indexOf(i)>=0)) out.push(x.en);
  }
  return shuffle(out).slice(0, n||1);
}
/* マイ単語の新規導入は1セット(30問)にこの数まで(v5.12.0): 1記事から15語登録した日に復習を押しのけない */
var MYW_PER_SET=6;
function setMyNew(g, total){
  const s=g.set; if(!s || s.d!==todayKey() || s.a0!==Math.floor(total/SET_N)*SET_N) return 0;
  return s.myN||0;
}

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
  // 取り違えた相手の追い出題(v5.12.0): ミスの直後の数問以内に、区別すべき相手を出す
  while(pairQueue.length){
    const q=pairQueue[0];
    if(q.wait>0){ q.wait--; break; } // まだ間をおく(この1問はふつうの出題・v5.16.0)
    pairQueue.shift();
    if(byEn[q.en] && !recentEns.includes(q.en)) return byEn[q.en];
  }
  for(const w of WORDS){
    const st=G.words[w.en];
    if(!st) unseen.push(w);
    else if(st[1]<=now) due.push(w);
  }
  const fresh=a=>{ const f=a.filter(w=>!recentEns.includes(w.en)); return f.length? f : a; };
  const d=fresh(due), u=fresh(unseen);
  /* マイ単語(v5.11.0): 登録した(または内蔵で「学びたい」印を付けた)未出題の語は、新規の中で優先して出す。
     登録した直後に会えるように2問に1問の確率で先取り(復習の渋滞ガードより優先=本人の意思が最優先)。
     1度出れば通常のSRSに乗る(=優先は自然に消える) */
  const mu=fresh(unseen.filter(w=>mywWanted(w.en)));
  if(mu.length && setMyNew(G, todayTotal())<MYW_PER_SET && Math.random()<0.5) return mu[Math.floor(Math.random()*mu.length)];
  /* 新規を混ぜる確率: 目標があれば「1日の新規目安」を消化するまで30%、消化後は復習に専念
     (復習が尽きたら新規は無制限)。目標なしは従来どおり20% */
  let pNew=0.2;
  const q=paceQuota(G);
  if(q){
    const nT=paceNewPerDay(q);
    pNew=(nT>0 && (dayRec().n||0)<nT)? 0.3 : 0;
  }
  if(due.length>=NEW_GUARD) pNew=0; // 復習の渋滞中は新規を待たせる(v5.8.0)
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

/* SRS更新(純関数)。ミスはbox0(1分後に再挑戦)に落とすが、st[7]に「復帰先」を記録し、
   次の正解でそこへ戻る ─ 高い階段を全部登り直させると復習が渋滞し、挫折感も大きい
   (Ankiのlapse運用と同じ発想)。
   v5.8.0(実機FB「100問/日でも1年で1,200語」への回答=覚え切るまでの解答数を減らす):
   ①復帰先は「1段だけ下」(box2以上のミス→box-1。旧=box3以上を半分に)。
     期待解答数のマルコフ連鎖計算(復習正答率60%): 1語28.5問→24.8問。
     忘れた語を1日→3日→7日と全部やり直させるのは、忘却の実態(記憶は一部残る)より厳しすぎた
   ②既知語の早回し(opts.fast・単語だけ): 初見で正解した語は1分/10分の「覚える」段を飛ばして
     box2(1日後)へ。1日後もミスなしで正解ならbox4(7日後)へ。既知語は3問(0日・1日・8日)で
     「覚えた」に到達(旧5問)。当て推量で通ってしまった語は1日後に落ちて通常の階段に戻る。
     フレーズは階段そのものが訓練(並べ替えの粒度=チャンク→単語→思い出してから単語・v5.15.0)なので早回しは使わない
   ①②合わせて正答率60%の語で28.5→20.8問(-27%)・96%の既知語で5.6→3.4問(-39%) */
function srsApply(st, ok, now, opts){
  if(ok){
    /* 期限前の正解では階段を上がらない(v4.13.0): 出題対象が尽きたときの
       先取り復習(pickWordのフォールバック)で同じ日に何度も正解しても、
       実時間の間隔をあけて思い出せたことにはならない。忘却曲線の検証は
       期限が来た出題での正解だけが担う(正解・ミスの回数は通常どおり数える) */
    if(st[1]>now && (st[2]+st[3])>0){ st[2]++; st[5]=0; st[6]=now; return st; }
    const clean=(st[3]||0)===0; // まだ一度もミスしていない
    if(opts && opts.fast && clean && st[2]===0 && st[0]===0) st[0]=2;      // 初見正解→1日後
    else if(opts && opts.fast && clean && st[2]===1 && st[0]===2) st[0]=4; // 1日後も正解→7日後
    else st[0]=Math.min(Math.max(st[0]+1, st[7]||0), INTERVALS.length-1);
    st[7]=0;
    st[2]++; st[5]=0; st[6]=now;
  }else{
    st[7]=st[0]>=2? st[0]-1 : 0; // 復帰先=1段下(v5.8.0)
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
    ((st[5]||0)>=3? ' <span class="qfire">🔥連続ミス'+st[5]+(GAME_ENABLED? '(正解で強カード!)':'')+'</span>':"");
}

/* 「今日 X/Y問」の共通表記(学習タブ#qCount・サバイバー#svCountで共用)。
   v4.26.0: qCountの値は出題時に固定されていたため、サバイバー(荒野含む)で解いた分が
   学習タブへ戻ったとき反映されない不具合があった → タブ切替時にrefreshQuizCountで引き直す */
function todayCountText(){
  const d=dayRec(), q=paceToday(G);
  // セットの進みは単語+フレーズの合算(v5.10.0)。「今日◯/◯問」は目安の分母=単語だけ
  const tail=quizTarget()==="p"
    ? "フレーズ 今日 "+pdayRec().a+"問"
    : "今日 "+d.a+(q&&!q.done? "/"+q.perDay:"")+"問";
  return ((G.combo||0)>=3? "⚡"+G.combo+"連続 ・ ":"")+
    "セット "+(todayTotal()%SET_N)+"/"+SET_N+" ・ "+tail;
}
function refreshQuizCount(){
  const el=$("qCount"); if(!el) return;
  // 実戦ドリル中(v5.2.0)は進行を出す(PDRILL/phrAnsweredはphrase.jsが後から定義)
  if(typeof PDRILL!=="undefined" && PDRILL){
    const d=PHR_DRILLS[PDRILL.kind];
    el.textContent=d.icon+" 実戦 "+Math.min(d.steps.length, PDRILL.res.length+(phrAnswered?0:1))+"/"+d.steps.length;
    return;
  }
  // にがて特訓中(v5.10.0)は進行を出す
  if(FOCUS){ el.textContent="🔥 にがて "+Math.min(FOCUS.list.length, FOCUS.res.length+(answered?0:1))+"/"+FOCUS.list.length; return; }
  el.textContent=todayCountText();
}

/* 5問ごとのボーナス(v4.31.0・実機FB): 今日の解答数(d.a)が5の倍数に達するたび🎫5・上限なし。
   v4.30.0の「サクッと完了ボーナス(🎫3・1日3回)」を置き換え ─
   ①上限廃止=1日に何度でも気軽にチャレンジできる
   ②d.aは学習タブ/サバイバーの全入口で共通=入口による損得の歪みがない
   (どこで解いても5問ごとに同じだけもらえる)
   ③額も🎫3→🎫5に増額。🎫は「学習だけが源泉」の限定通貨=学習ボーナスとして経済の筋が通り、
   1回の付与に5解答が必要なので放置では稼げない。varはテスト(iframe)からの参照用 */
var ANS_BONUS_EVERY=5, ANS_BONUS_T=5;
/* v5.0.0: 単語(d.a)+フレーズ(pdays)の合算で判定 ─ 目安は別カウントでも、
   5問ボーナスまで分けるとフレーズ学習だけ損になるため。どちらの解答も合計を1ずつ進めるので
   5の倍数の境界はちょうど1回ずつ踏む */
function ansBonus(){
  const t=dayRec().a + pdayRec().a;
  if(t>0 && t%ANS_BONUS_EVERY===0){ G.tickets+=ANS_BONUS_T; return ANS_BONUS_T; }
  return 0;
}
/* 学習タブの対象(mix=ミックス/w=単語/p=フレーズ・v5.10.0)。セグ(quizSeg)とG.opt.qtabが好みを持つ */
function quizTarget(){ const t=G.opt && G.opt.qtab; return (t==="p"||t==="w"||t==="mix")? t : "mix"; }
/* ---- 30問セット(v5.8.0) ---- */
/* このセットの帳簿(純関数・G.setを更新)。total=今日の解答数(単語+フレーズの合算・この1問を計上済み)。
   セットの境界=totalが30の倍数。a0(セット開始時の解答数)か日付が変わっていたら新しいセットに。
   up=定着の階段が上がった/mas=覚えた/tk=このセットで得た🎫/phr=フレーズだった(v5.10.0)。
   戻り値=このセットが完了した瞬間か */
function setRecord(g, total, info){
  const a0=Math.floor((total-1)/SET_N)*SET_N, k=todayKey();
  let s=g.set;
  if(!s || s.d!==k || s.a0!==a0) s=g.set={d:k, a0, n:0, cor:0, newN:0, up:0, mas:0, tk:0, phr:0, miss:[]};
  s.n++;
  if(info.ok) s.cor++;
  if(info.wasNew) s.newN++;
  if(info.my) s.myN=(s.myN||0)+1; // マイ単語の新規導入(1セットの上限に使う・v5.12.0)
  if(info.up) s.up++;
  if(info.mas) s.mas++;
  if(info.phr) s.phr=(s.phr||0)+1;
  s.tk+=info.tk||0;
  // このセットでミスした単語(にがて特訓の入口に使う)
  if(!info.ok && info.en && !info.phr){ s.miss=s.miss||[]; if(s.miss.indexOf(info.en)<0) s.miss.push(info.en); }
  return total%SET_N===0;
}
/* 今日のセット数の見え方: done=完了したセット数・cur=進行中のセットの問数・
   target=目安から換算したセット数(目標未設定・達成後はnull)。
   v5.10.0: 進みは単語+フレーズの合算。目安(単語数)→セット数の換算は「1セットに含まれる単語の数」で割る
   (ミックス=24語/セット・単語のみ=30語/セット) */
/* v5.14.0(実機FB「113問の目安に5セットは仕様か」): 目安は問数で厳密に。targetQ=目安に相当する今日の合算問数
   (ミックスは単語24問ごとにフレーズ6問が混ざるので 目安×30/24)。target=そのセット数(端数は切り上げ)、
   last=最後のセットに必要な問数(0<last<30なら端数のセット=●○バーで短く描く)。達成判定は a>=targetQ(セット数ではない) */
function setProgress(g){
  const t=todayTotal(), q=paceToday(g);
  const targetQ=(q && !q.done)? Math.max(1, Math.ceil(q.perDay*SET_N/wordsPerSet())) : null;
  const target=targetQ? Math.ceil(targetQ/SET_N) : null;
  const last=targetQ? (targetQ%SET_N || SET_N) : SET_N;
  // 達成=目安(単語の問数)に届いたか。セット換算(targetQ)は描画用で、端数の丸めで1〜2問ずれるため判定には単語数を使う
  const hit=!!targetQ && (dayRec().a>=q.perDay || t>=targetQ);
  return {done:Math.floor(t/SET_N), cur:t%SET_N, target, targetQ, last, a:t, hit};
}
/* セットの●○表示(done=完了・cur=進行中の問数・target=目安のセット数・last=最後のセットの問数)。
   目安なし=完了分+進行中(あれば)だけ。目安ありで超過した分は金の●で足す。最後のセットが端数なら幅を問数に比例させる */
function setDotsHTML(p){
  const n=p.target? Math.max(p.target, p.done+(p.cur?1:0)) : p.done+(p.cur?1:0);
  let h='<div class="setdots">';
  for(let i=0;i<n;i++){
    const isLast=p.target && i===p.target-1 && p.last<SET_N;
    const need=isLast? p.last : SET_N;
    const st=isLast? ' style="width:calc(var(--sdw,26px)*'+(need/SET_N).toFixed(2)+')" title="あと'+need+'問のセット"' : '';
    if(i<p.done) h+='<i class="sd on'+(p.target && i>=p.target? ' over':'')+'"'+st+'></i>';
    else if(i===p.done && p.cur) h+='<i class="sd cur"'+st+'><b style="width:'+Math.min(100, Math.round(100*p.cur/need))+'%"></b></i>';
    else h+='<i class="sd"'+st+'></i>';
  }
  return h+'</div>';
}
let setDonePending=false; // 30問目の答え合わせのあと、「次へ」で完了モーダルを出す
function openSetDone(){
  const s=G.set||{n:SET_N, cor:0, newN:0, up:0, mas:0, tk:0, phr:0, miss:[]};
  const p=setProgress(G);
  const full=s.cor>=s.n;
  const line=p.target
    ? (p.hit
        ? '🏅 今日の目安('+p.targetQ+'問)達成! ここからは前倒し'
        : '今日の目安まで あと'+(p.targetQ-p.a)+'問'+(p.targetQ-p.a>SET_N? '(約'+Math.ceil((p.targetQ-p.a)/SET_N)+'セット)':''))
    : '今日 '+p.done+'セット目を積み上げた';
  const missN=(s.miss||[]).length;
  /* v5.10.0: セットの締めに「次の一手」を並べる ─ ミスがあれば🔥にがて特訓(このセットのミスから)、
     🎯今日の実戦ドリル(日替わり・選択式5問)。フレーズが混ざったセットはその数も出す */
  const drillK=(typeof todayDrillKind==="function")? todayDrillKind(todayKey(), myphrList().length>0) : null;
  openModal('<h3>🧩 セット完了! <span class="small">今日 '+p.done+'セット目</span></h3>'+
    '<div class="giftbox">正解 <b style="font-size:20px">'+s.cor+' / '+s.n+'</b>'+(full? ' ─ 全問正解! 🎉':'')+
      '<div class="setstats">'+
        '<span>🆕 はじめて <b>'+s.newN+'</b></span>'+
        '<span>⬆ 定着が進んだ <b>'+s.up+'</b></span>'+
        '<span>🏅 覚えた <b>'+s.mas+'</b></span>'+
        (s.phr? '<span>💬 フレーズ <b>'+s.phr+'</b>問</span>':'')+'</div>'+
      (GAME_ENABLED? '<div style="font-weight:800; color:var(--accent2); margin-top:8px">🎫 このセットで +'+s.tk+'</div>':'')+
      setDotsHTML(p)+
      '<div class="small" style="margin-top:6px">'+line+'</div></div>'+
    (missN? '<button class="btn setnext2" id="setWeak"><span>🔥 このセットのミス <b>'+missN+'</b>語をすぐ立て直す</span><span class="hlsub">にがて特訓 ─ 正解の選択肢タップでサクサク進める</span></button>':'')+
    (drillK? '<button class="btn setnext2" id="setDrill"><span>'+PHR_DRILLS[drillK].icon+' 今日の実戦ドリル: <b>'+PHR_DRILLS[drillK].name+'</b></span><span class="hlsub">選択式で5問 ─ フレーズを実戦の型で</span></button>':'')+
    syncBtnHTML()+ // 区切りで同期(v5.16.0・実機FB)
    '<div class="row" style="gap:10px; margin-top:10px">'+
    '<button class="btn grow" id="setHome">ひと休み(ホームへ)</button>'+
    '<button class="btn primary grow" id="setNext">🧩 次のセットへ</button></div>');
  bindSyncBtn();
  $("setNext").onclick=()=>{ closeModal(); newQuestion(); };
  $("setHome").onclick=()=>{ closeModal(); switchTab("home"); };
  if(missN) $("setWeak").onclick=()=>{ closeModal(); startFocus(s.miss.slice()); };
  if(drillK) $("setDrill").onclick=()=>startDrill(drillK);
}

/* ---- にがて(ミスした単語)の立て直し(v5.10.0・実機FB「間違えた問題を覚えやすくする仕組み」) ----
   ①ミスの直後: 結果バーに「選んだ誤答の単語」(取り違えた相手を名指し=弁別の手がかり)と
     「同じ語根の覚えた仲間」(既知の語に結びつける=記憶の足場)を出す
   ②正解の選択肢をタップで次へ(正解を「押して確かめる」動作が想起の締めになる+片手で進める)
   ③にがてノート: ミスがあってまだ覚えていない語を、連続ミス・ミス回数の多い順に並べる
   ④にがて特訓: そのリスト(またはセットのミス)だけを連続で出す短いセッション。
     解答はふつうの学習として計上(SRSは期限前の先取り=階段は上がらないが、想起の回数が増える) */
var FOCUS=null; // {list:[en], i, res:[ok...]}
/* にがてリスト(純関数): ミス1回以上でまだ覚えていない語。
   並び(sort・v5.11.0実機FB「基準が分かりにくい」→画面で選べる明示の基準に):
   miss=ミス回数が多い順(既定)/streak=いま連続でミス中の語から/box=定着が低い順/due=次の復習が近い順。
   同点の決着はどれも「ミス回数→連続ミス→期限の近さ」 */
var WEAK_SORTS={miss:"ミスが多い", streak:"連続ミス中", box:"定着が低い", due:"復習が近い"};
function weakWords(g, sort){
  const out=[];
  for(const en in g.words){
    const st=g.words[en];
    if(!st || !(st[3]>0) || st[0]>=MASTER_BOX || !byEn[en]) continue;
    out.push(en);
  }
  sort=WEAK_SORTS[sort]? sort : "miss";
  const tie=(x,y)=>(y[3]-x[3]) || ((y[5]||0)-(x[5]||0)) || (x[1]-y[1]);
  out.sort((a,b)=>{
    const x=g.words[a], y=g.words[b];
    if(sort==="streak") return ((y[5]||0)-(x[5]||0)) || tie(x,y);
    if(sort==="box") return (x[0]-y[0]) || tie(x,y);
    if(sort==="due") return (x[1]-y[1]) || tie(x,y);
    return tie(x,y);
  });
  return out;
}
/* 並びの基準になっている値を、各行の先頭に太字で見せる(=なぜこの順かが読める) */
function weakKeyText(st, sort, now){
  if(sort==="streak") return "🔥連続ミス "+(st[5]||0);
  if(sort==="box") return "定着 "+st[0]+"/"+MASTER_BOX;
  if(sort==="due"){ const h=(st[1]-now)/36e5; return "復習 "+(h<=0? "期限切れ" : h<24? "あと"+Math.ceil(h)+"時間" : "あと"+Math.ceil(h/24)+"日"); }
  return "ミス "+st[3]+"回";
}
/* 同じ語根を持つ「学習ずみ(定着2以上)」の仲間(純関数・最大n語)。定着の高い語を先に */
function rootKin(g, en, n){
  const ids=rootIdsOf(en); if(!ids.length) return [];
  const kin=[];
  for(const w of WORDS){
    if(w.en===en) continue;
    const st=g.words[w.en]; if(!st || st[0]<2) continue;
    if(rootIdsOf(w.en).some(i=>ids.indexOf(i)>=0)) kin.push(w.en);
  }
  kin.sort((a,b)=>(g.words[b][0]-g.words[a][0]));
  return kin.slice(0, n||2);
}
/* ミスの直後の手がかり(結果バーのチップ)。「選んだのは〜」はv5.11.0で誤答の選択肢そのものに移した(markWrongChoice) */
function missHintHTML(g, w, chosen, e2j){
  const h=[];
  const kin=rootKin(g, w.en, 2);
  if(kin.length) h.push('<span class="rmeta kin">🧬 覚えた仲間: '+kin.map(esc).join("・")+'</span>');
  return h.join(" ");
}
var FOCUS_N=10;
function startFocus(list){
  list=(list && list.length)? list.filter(en=>byEn[en]) : weakWords(G, G.opt.weakSort).slice(0, FOCUS_N); // 特訓はノートの並びに従う
  if(!list.length){ toast("いま立て直す「にがて」はない ─ いい調子!"); return; }
  closeModal();
  if(typeof PDRILL!=="undefined") PDRILL=null;
  FOCUS={list:list.slice(0, 30), i:0, res:[]};
  if($("quizView").classList.contains("hidden")) switchTab("quiz");
  newQuestion();
}
function focusNext(){
  if(FOCUS.i>=FOCUS.list.length){ openFocusDone(); return; }
  const w=byEn[FOCUS.list[FOCUS.i++]];
  cur={word:w, choices:buildChoices(w)};
  renderQuestion();
  $("qBadge").textContent="🔥 にがて"; $("qBadge").style.color="var(--ng)";
}
function openFocusDone(){
  const f=FOCUS; FOCUS=null;
  const okN=f.res.filter(Boolean).length, n=f.res.length;
  const still=f.list.filter((en,i)=>!f.res[i]);
  openModal('<h3>🔥 にがて特訓 ─ 完了!</h3>'+
    '<div class="giftbox">正解 <b style="font-size:20px">'+okN+' / '+n+'</b>'+(okN>=n? ' ─ 全部立て直した! 🎉':'')+
      (still.length? '<br><span class="small">まだ手ごわい: '+still.map(esc).join("・")+'</span>':'')+
      '<br><span class="small">ミスした語は1分後・10分後にまた出る ─ 今日のうちに2回思い出せれば明日につながる</span></div>'+
    syncBtnHTML()+ // 区切りで同期(v5.16.0・実機FB)
    '<div class="row" style="gap:10px; margin-top:10px">'+
    (still.length? '<button class="btn grow" id="focusAgain">🔥 まだ手ごわい'+still.length+'語をもう一度</button>':'')+
    '<button class="btn primary grow" id="focusEnd">学習にもどる</button></div>');
  bindSyncBtn();
  const a=$("focusAgain"); if(a) a.onclick=()=>startFocus(still);
  $("focusEnd").onclick=()=>{ closeModal(); newQuestion(); };
}
/* にがてノート(⚙設定・記録から): リストの上位と、特訓の入口 */
function openWeakModal(){
  const sort=WEAK_SORTS[G.opt.weakSort]? G.opt.weakSort : "miss";
  const list=weakWords(G, sort), now=Date.now();
  openModal('<h3>🔥 にがてノート '+helpBtn("hlp-weak")+'</h3>'+
    helpNote("hlp-weak", 'ミスしたことがあり、まだ「覚えた」に届いていない単語。<b>並びは上のボタンで選ぶ</b>: '+
      'ミスが多い(累計のミス回数)/連続ミス中(直近で続けて外している数)/定着が低い(忘却曲線の段)/復習が近い(次の期限)。'+
      '各行の先頭の太字が、その並びの基準の値。同点は「ミス回数→連続ミス→期限」で決める。<br>'+
      '「にがて特訓」はいまの並びの上位'+FOCUS_N+'語を連続で出す短いセッション(解答はふつうの学習として記録'+(GAME_ENABLED? '・🎫も入る':'')+')。'+
      'ミスの直後には誤答の選択肢に「その意味の単語」、結果バーに「同じ語根の覚えた仲間」が手がかりとして出る')+
    '<div class="seg weakseg" id="weakSeg">'+Object.keys(WEAK_SORTS).map(k=>'<button data-s="'+k+'"'+(k===sort?' class="active"':'')+'>'+WEAK_SORTS[k]+'</button>').join("")+'</div>'+
    '<div class="small">'+list.length+'語 ─ '+WEAK_SORTS[sort]+'順</div>'+
    (list.length
      ? '<div class="panel" style="margin-top:8px">'+list.slice(0, 30).map(en=>{
          const w=byEn[en], st=G.words[en];
          return '<div class="myrow weakrow"><div class="grow"><b style="font-size:14px">'+esc(en)+'</b>'+
            ' <span class="small">'+esc(w.ja)+'</span><br><span class="small">'+
            '<span class="wkey">'+weakKeyText(st, sort, now)+'</span>'+
            (sort!=="miss"? ' ・ <span class="qx">ミス '+st[3]+'</span>':'')+
            (sort!=="streak" && (st[5]||0)>=2? ' ・ 🔥連続'+st[5]:'')+
            (sort!=="box"? ' ・ 定着 '+st[0]+'/'+MASTER_BOX:'')+
            (rootText(en)? ' ・ 🧬'+esc(rootText(en)):'')+
            (confusedWith(G, en, 1).length? ' ・ ⇄ 取り違え: '+esc(confusedWith(G, en, 1)[0]):'')+'</span></div>'+
            '<button class="btn mydel wdict" data-en="'+esc(en)+'">🔍</button></div>';
        }).join("")+(list.length>30? '<div class="small" style="margin-top:6px">…ほか'+(list.length-30)+'語</div>':'')+'</div>'
      : '<div class="empty">いま立て直す「にがて」はない ─ いい調子!</div>')+
    '<div class="row" style="margin-top:12px"><button class="btn primary grow" id="weakGo"'+(list.length?'':' disabled')+'>🔥 にがて特訓(上位'+Math.min(FOCUS_N, list.length)+'語)</button></div>');
  $("weakSeg").querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{ G.opt.weakSort=b.dataset.s; saveG(); openWeakModal(); };
  });
  $("modal").querySelectorAll(".wdict").forEach(b=>{
    b.onclick=()=>window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(b.dataset.en), "_blank", "noopener");
  });
  $("weakGo").onclick=()=>startFocus(null);
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
/* 4択の誤答(v5.12.0): 取り違えた相手(最大2)→同じ語根の語(最大1)→無作為、の順で3つ。
   いつも同じ顔ぶれにならないよう、取り違え・語根の枠は1/4の確率で空ける */
function buildChoices(word){
  const okc=c=>c && c.en!==word.en && c.pos===word.pos && !overlaps(c,word);
  const picks=[], has=en=>picks.some(p=>p.en===en);
  const add=en=>{ const c=byEn[en]; if(okc(c) && !has(en) && picks.length<3) picks.push(c); };
  /* 熟語(v5.18.0・enに空白を含む)の誤答は熟語から、単語の誤答は単語から選ぶ(形が違うと消去法で解けてしまう)。語根の枠は熟語では使わない */
  const multi=word.en.indexOf(" ")>=0;
  if(Math.random()<0.75) confusedWith(G, word.en, 2).forEach(add);
  if(!multi && Math.random()<0.75) rootMates(word.en, 1).forEach(add);
  let pool=WORDS.filter(c=>okc(c) && !has(c.en) && (c.en.indexOf(" ")>=0)===multi);
  if(pool.length<3) pool=WORDS.filter(c=>okc(c) && !has(c.en));
  shuffle(pool);
  while(picks.length<3 && pool.length) picks.push(pool.pop());
  return shuffle([word, ...picks]);
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
  answered=false; qKind="w";
  $("resultBar").classList.remove("show");
  $("promptCard").classList.remove("srch"); // 辞書リンクは正誤確認中だけ
  // フレーズ学習(v5.0.0)の描画残りを片づける(並べ替えの組み立て行・チャンク用レイアウト・上詰めカード)
  const pb=$("phrBuild");
  if(pb){ pb.classList.add("hidden"); pb.innerHTML=""; }
  $("promptCard").classList.remove("phr");
  $("choices").className="choices";
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
  /* 先に思い出すステップ(v5.12.0・単語の復習にも): 4択は再認で解けてしまうので、復習(一度出た語)は
     選択肢を開く前に1回の自力想起を挟む。新規は思い出すものがないので即4択。フレーズと同じ設定(preRecall)で
     オフにできる。にがて特訓・サバイバーは対象外(特訓はテンポ優先・サバイバーは時間駆動) */
  if(st && G.opt.preRecall && !FOCUS){
    const b=document.createElement("button");
    b.className="choice rcbtn"; b.id="wordRecallBtn";
    b.innerHTML='🧠 まず自力で思い出す<span class="rcsub">'+(e2j? "意味を" : "英語を")+'(心の中で)言ってから、タップで選択肢</span>';
    b.onclick=()=>{ if(!answered) wordShowChoices(); };
    box.appendChild(b);
  }else wordShowChoices();
}
function wordShowChoices(){
  const e2j=G.mode==="e2j";
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
/* マイ単語の用例(v5.12.0): 答え合わせのあと、出会った文を単語カードの下に出す(単語は太字) */
function mywExampleHTML(en){
  const m=G.myw && G.myw[en]; if(!m || m.del || !m.ex) return "";
  const re=new RegExp("("+en.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/ /g,"\\s+")+"\\w*)","i");
  return '<span class="myex">📝 '+esc(m.ex).replace(re, "<b>$1</b>")+'</span>';
}

function newQuestion(){
  clearTimeout(autoNextT); // 手動の「次へ」と自動進行タイマーの二重発火を断つ
  const drill=(typeof PDRILL!=="undefined") && PDRILL;
  // 30問セットの完了(v5.8.0)。ドリル・にがて特訓の途中では割り込まず、終わってから出す
  if(setDonePending && !drill && !FOCUS){ setDonePending=false; openSetDone(); return; }
  if(drill){ phrNewQuestion(); return; }   // 実戦ドリル(v5.2.0)はモードに関係なく続く
  if(FOCUS){ focusNext(); return; }        // にがて特訓(v5.10.0)
  const m=quizTarget();
  // フレーズ学習(v5.0.0・phrase.jsが後から定義)。ミックス(v5.10.0)は5問目ごとにフレーズ
  if(m==="p" || (m==="mix" && mixSlotIsPhrase(todayTotal()))){ phrNewQuestion(); return; }
  const w=pickWord();
  cur={word:w, choices:buildChoices(w)};
  renderQuestion();
}
/* 正誤確認中: 正解の選択肢は押せるまま残し、タップで次へ(v5.10.0実機FB)。
   単語・フレーズ・サバイバーで共用。onNext=次へ進む関数 */
function armCorrectNext(sel, onNext){
  document.querySelectorAll(sel+" .choice.correct").forEach(b=>{
    b.disabled=false; b.classList.add("gonext");
    b.onclick=()=>onNext();
  });
}

/* 選んだ誤答の選択肢に「その意味を持つ単語」を右端に出す(v5.11.0実機FB)。
   正解側の「次へ ▶」と同じ位置・流儀=取り違えた相手をその場で名指しする。
   EN→日本語では誤答(訳)の英単語、日本語→ENでは誤答(英単語)の訳。CSSの::after(data-said)で描く */
function markWrongChoice(b, chosen, e2j){
  b.classList.add("wrong");
  const said=e2j? chosen.en : String(chosen.ja||"").split(/[、。／]/)[0];
  if(said){ b.classList.add("said"); b.dataset.said=said; }
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
    else if(b===btn) markWrongChoice(b, chosen, e2j);
    else b.classList.add("dim");
  });
  // SRS更新
  const now=Date.now();
  let st=G.words[w.en];
  const wasNew=!st;
  if(!st) st=G.words[w.en]=[0,0,0,0,0,0,0];
  const preSt=st.slice(); // ドロップ判定は解答前の状態で
  srsApply(st, ok, now, {fast:true}); // 単語は既知語の早回しあり(v5.8.0)
  st[8]=now; // 最後に解いた時刻(v5.16.0・同期は新しい方が勝つ)
  const d=dayRec(); recordDayAnswer(d, wasNew, ok);
  const bonus5=ansBonus(); // 5問ごとの🎫ボーナス(v4.31.0・上限なし・全入口共通/v5.0.0からフレーズと合算)
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; st[9]=now; d.m++; justMastered=true; }
  track("ans"); if(ok) track("cor");
  paceLog(wasNew, ok, preSt[0]); // 学習ペース推定の材料(直近100問・boxで間隔ありの復習と1分/10分の再挑戦を区別)
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
  // 30問セットの帳簿(v5.8.0)。境界に達したら「次へ」で完了モーダル(進みは単語+フレーズの合算=v5.10.0)
  if(setRecord(G, todayTotal(), {ok, wasNew, up:ok && st[0]>preSt[0], mas:justMastered, tk:tkGain+bonus5, en:w.en, my:wasNew && isMyWord(w.en)})) setDonePending=true;
  if(FOCUS) FOCUS.res.push(ok); // にがて特訓の進行(v5.10.0)
  // 取り違えの記録と追い出題(v5.12.0): 選んだ誤答の単語を相手として数え、数問以内に出す
  if(!ok && chosen.en!==w.en){ noteConfusion(G, w.en, chosen.en); if(!FOCUS && !pairQueue.some(q=>q.en===chosen.en)) pairQueue.push({en:chosen.en, wait:PAIR_GAP}); }
  // マイ単語の用例(v5.12.0): 出会った文があれば単語カードの下に
  const exh=mywExampleHTML(w.en);
  if(exh){ const pb=$("phrBuild"); pb.innerHTML=exh; pb.classList.remove("hidden"); }

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
  if(isMyWord(w.en)) meta.push('<span class="rmeta myw">📝 マイ単語</span>'); // 自分で登録した語(v5.11.0)
  let bigT=false; // 大事なお祝いのトーストを出したか(5問ボーナスの通知で上書きしない)
  if(ok){
    let rar=dropRarity(preSt);
    if(Math.random()<comboDropBonus()) rar=Math.min(5, rar+1); // コンボ中は★+1のチャンス
    const drop=addCard(w.en, rar); // カードの記録はゲーム面オフでも続ける(戻したとき欠けない・演出だけ隠す=v5.13.0)
    // 「覚えた」の瞬間がいちばん大事なお祝い(v4.13.0)。次点でレベルアップ・★アップ
    if(justMastered){ toast("🏅 "+w.en+" を覚えた! 7日あけても思い出せた"); vibe([30,40,60]); bigT=true; }
    else if(lvUp){ toast("📖 レベルアップ! Lv"+lvUp+(GAME_ENABLED? " ─ 全ステータス強化":"")); vibe(40); bigT=true; }
    else if(GAME_ENABLED && drop.rarUp){ toast("🎉 "+w.en+" のカードが★"+drop.rar+"にランクアップ!"); vibe(30); bigT=true; }
    else if(GAME_ENABLED && rar>=3) vibe(30);
    // 🎫は毎正解なのでトースト・結果バー表示は出さない(残高は設定・記録とガチャ画面で確認)
  }
  // 5問ごとのボーナスの通知(v4.31.0)。より大事なお祝いがあるときは譲る
  if(GAME_ENABLED && bonus5 && !bigT) toast("🎁 5問ごとのボーナス 🎫+"+bonus5);
  $("qStats").innerHTML=qStatsHTML(st); // 定着ステップの変化(上がった/戻った)を見せる
  // ミスの直後は手がかり(選んだ誤答・同じ語根の覚えた仲間)を先頭に出す(v5.10.0)
  if(!ok) meta.unshift(missHintHTML(G, w, chosen, e2j));
  rc.innerHTML='<span class="poschip pos'+w.pos+'">'+POS_LABEL[w.pos]+'</span>'+meta.filter(Boolean).join(' ');
  $("resultBar").classList.add("show");
  armCorrectNext("#choices", newQuestion); // 正解の選択肢タップでも次へ(v5.10.0)
  $("promptCard").classList.add("srch"); // 単語タップで辞書へ(意味の裏取り)
  // 今日の目安にちょうど到達した瞬間だけ祝う(毎問出る表示はノイズ=v4.6.2の知見)
  const pq=paceToday(G);
  if(pq && !pq.done && d.a===pq.perDay){ toast("🎉 今日の目安 "+pq.perDay+"問を達成!"+(GAME_ENABLED? " 任務でドカンと報酬を受け取ろう":"")); vibe(40); }
  saveG();
  refreshHeader();
  refreshQuizCount(); // 解答数・セットの進捗を即時反映
  checkAchievements(); // 学習の実績(v5.13.0・自動付与)
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
  // フレーズ学習中は核の語(🔑)を辞書へ(v5.0.0)。判定は画面の種類(qKind)で=ミックスでも正しく分岐(v5.10.0)
  if(qKind==="p"){
    if(!phrAnswered || !phrCur) return;
    window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(phrCur.p.k), "_blank", "noopener");
    return;
  }
  if(!answered || !cur) return;
  window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(cur.word.en), "_blank", "noopener");
};
