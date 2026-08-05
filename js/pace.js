"use strict";
/* ================= 学習ペース管理(v4.7.0) =================
   「いつまでに全単語を覚えるか」(目標日)から、1日に取り組むべき問題数を毎日逆算する。
   推定の材料は直近100問のクイズ結果(G.pace.log)だけ:
   ・新規単語の正答率 → すでに知っている単語の割合(4択の当て推量25%を控除)
   ・復習の正答率     → 記憶の定着力(SRSの階段を何問で登り切れるか)
   数値は保存せず毎回導出するので、毎日の学習・目標日の変更が自動で反映される */

/* 直近100問のクイズ結果を記録する。entry=[新規なら1, 正解なら1] */
function paceLog(isNew, ok){
  if(!G.pace) G.pace={goal:null, log:[]};
  const l=G.pace.log=G.pace.log||[];
  l.push([isNew?1:0, ok?1:0]);
  if(l.length>100) l.splice(0, l.length-100);
}

/* ログから既知語率と復習正答率を推定。各8問未満のうちは標準値(sampled=false) */
function paceEstimates(log){
  let nN=0,cN=0,nR=0,cR=0;
  (log||[]).forEach(e=>{ if(e[0]){ nN++; cN+=e[1]; } else { nR++; cR+=e[1]; } });
  const knownRate = nN>=8? Math.max(0, Math.min(1, (cN/nN-0.25)/0.75)) : 0.15;
  const recall    = nR>=8? Math.max(0.55, Math.min(0.97, cR/nR)) : 0.80;
  return {knownRate, recall, nNew:nN, nRev:nR, sampled:(nN>=8 && nR>=8)};
}

/* k回「連続」正解するまでの期待解答数(ミスでbox0に戻るSRSのコストモデル)。
   E = (1-p^k) / (p^k(1-p))。p=1なら k 問ちょうど */
function expAttempts(k, p){
  if(p>=0.999) return k;
  const pk=Math.pow(p, k);
  return (1-pk)/(pk*(1-p));
}

/* boxから先の復習(維持コスト)が horizonDays 日以内に何回来るか。box7以降は90日周期 */
function upkeepReviews(box, horizonDays){
  let t=0, n=0, i=box;
  while(n<40){
    t+=INTERVALS[Math.min(i, INTERVALS.length-1)]/864e5;
    if(t>horizonDays) break;
    n++; i++;
  }
  return n;
}

/* 目標日までに必要な残り解答数(覚える分+覚えた単語の維持復習)。
   学習中・未着手の単語の維持分は「期間の半ばで覚える」と近似する */
function paceRemaining(g, est, days){
  const R_KNOWN=0.96; // 既に知っている単語の想定正答率
  let seen=0, mastered=0, learn=0, upkeep=0;
  for(const en in g.words){
    const st=g.words[en]; seen++;
    if(st[0]>=MASTER_BOX){
      mastered++;
      upkeep+=upkeepReviews(st[0], days)/est.recall;
    }else{
      learn+=expAttempts(MASTER_BOX-st[0], est.recall);
      upkeep+=upkeepReviews(MASTER_BOX, days/2)/est.recall;
    }
  }
  const unseen=Math.max(0, WORDS.length-seen);
  learn+=unseen*(est.knownRate*expAttempts(MASTER_BOX, R_KNOWN)
               +(1-est.knownRate)*expAttempts(MASTER_BOX, est.recall));
  upkeep+=unseen*upkeepReviews(MASTER_BOX, days/2)/est.recall;
  return {seen, mastered, unseen, attempts:Math.ceil(learn+upkeep)};
}

/* 今日の目安(1日あたりの問題数)。目標未設定ならnull */
function paceQuota(g, now){
  const goal=g.pace && g.pace.goal;
  if(!goal) return null;
  now=now||Date.now();
  const est=paceEstimates(g.pace.log||[]);
  const daysLeft=Math.ceil((new Date(goal+"T23:59:59").getTime()-now)/864e5);
  const days=Math.max(1, daysLeft);
  const rem=paceRemaining(g, est, days);
  return {goal, daysLeft, days, est,
          perDay: Math.max(10, Math.ceil(rem.attempts/days)),
          mastered:rem.mastered, unseen:rem.unseen, attempts:rem.attempts,
          total:WORDS.length,
          done: rem.mastered>=WORDS.length,
          expired: daysLeft<0 && rem.mastered<WORDS.length};
}

/* 今日の目安は「その日はじめて計算した値」で固定する(v4.9.0)。
   表示のたびに再計算すると、ミスで残り問題数が増えて目安が途中で膨らみ
   やる気を削ぐため。翌日の最初の表示で昨日までの結果を織り込んで引き直す。
   目標を設定/解除した瞬間だけは即時に引き直す(qd=nullにして呼ぶ) */
function paceToday(g, now){
  const q=paceQuota(g, now);
  if(!q || q.done) return q;
  const d=todayKey();
  if(!g.pace.qd || g.pace.qd.d!==d) g.pace.qd={d, per:q.perDay};
  q.perDay=g.pace.qd.per;
  return q;
}

/* 1日に導入する新規単語数: 最後に始める単語にも覚え切る猶予(10日)を残して逆算 */
function paceNewPerDay(q){
  if(!q || q.unseen<=0) return 0;
  return Math.ceil(q.unseen/Math.max(1, q.days-10));
}

/* ---- UI: 今日のメーター ---- */
function paceMsg(done, target){
  if(done>=target){
    const over=done-target;
    return over>0? "🎉 目安達成! +"+over+"問の前倒し ─ 明日がラクになる"
                 : "🎉 今日の目安を達成! おつかれさま";
  }
  const remain=target-done, pct=100*done/target;
  if(done===0) return "さあ、今日の1問目から! 目安は"+target+"問";
  if(pct<25)  return "スタートよし! あと"+remain+"問";
  if(pct<50)  return "いい調子! あと"+remain+"問";
  if(pct<75)  return "半分を超えた! あと"+remain+"問";
  return "ラストスパート🔥 あと"+remain+"問";
}

/* ペースパネルの中身を描く(ホーム #homePace)。
   学習画面には置かない: 縦に要素を足すと選択肢が押し出されて構成が崩れる(v4.7.1)。
   学習中の進捗は promptCard の「今日 X/Y問」表記(高さ増なし)が担う */
function fillPaceEl(el){
  if(!el) return;
  const q=paceToday(G);
  if(!q){
    el.innerHTML='<div class="pacetop"><span>🎯 学習ペース管理</span>'+
      '<b style="color:var(--accent2); font-size:13px">目標日を設定 ›</b></div>'+
      '<div class="pacemsg">「いつまでに全部覚えるか」から1日の目安を逆算する</div>';
  }else if(q.done){
    el.innerHTML='<div class="pacetop"><span>🏆 全'+fmt(q.total)+'語 制覇!</span><b>🎊</b></div>'+
      '<div class="pacemsg">おめでとう! 復習を続けて記憶を守ろう</div>';
  }else{
    const done=dayRec().a, target=q.perDay;
    const pct=Math.min(100, Math.round(100*done/target));
    el.innerHTML=
      '<div class="pacetop"><span>🎯 今日の目安</span>'+
        '<b class="'+(done>=target?"pgold":"")+'">'+done+' <span class="ptgt">/ '+target+'問</span></b></div>'+
      '<div class="pbar'+(done>=target?" full":"")+'"><i style="width:'+pct+'%"></i></div>'+
      '<div class="pacemsg'+(done>=target?" pdone":"")+'">'+paceMsg(done, target)+'</div>'+
      '<div class="pacefoot">'+(q.expired
        ? '⚠️ 目標日を過ぎている ─ タップして立て直そう'
        : '目標 '+q.goal.replace(/-/g,"/")+' まで残り'+q.daysLeft+'日 ・ 覚えた '+fmt(q.mastered)+'/'+fmt(q.total)+'語')+'</div>';
  }
  el.onclick=openPaceModal;
}

/* ---- UI: 目標設定モーダル ---- */
function openPaceModal(){
  const est=paceEstimates((G.pace&&G.pace.log)||[]);
  const logN=((G.pace&&G.pace.log)||[]).length;
  let mastered=0; for(const en in G.words){ if(G.words[en][0]>=MASTER_BOX) mastered++; }
  const total=WORDS.length, pct=Math.round(100*mastered/total);
  const today=todayKey();
  const cur=(G.pace&&G.pace.goal)||addDays(today,180);
  openModal('<h3>🎯 学習ペース管理</h3>'+
    '<div class="small">目標日を決めると、全'+fmt(total)+'語を覚え切るのに必要な「1日の問題数」を毎日逆算して案内する。</div>'+
    '<div class="panel" style="margin-top:10px">'+
      '<div class="row"><div class="grow small">覚えた単語</div><b>'+fmt(mastered)+' / '+fmt(total)+'語</b></div>'+
      '<div class="mbar" style="margin-top:6px"><i style="width:'+pct+'%"></i></div></div>'+
    '<h3 style="margin-top:14px">いつまでに覚える?</h3>'+
    '<input type="date" id="goalDate" class="pdate" min="'+addDays(today,1)+'" value="'+cur+'">'+
    '<div class="row" style="gap:8px; margin-top:8px">'+
      '<button class="btn ppre" data-d="90">3ヶ月後</button>'+
      '<button class="btn ppre" data-d="180">半年後</button>'+
      '<button class="btn ppre" data-d="365">1年後</button></div>'+
    '<div class="panel" id="paceCalc" style="margin-top:12px"></div>'+
    '<div class="small" style="margin-top:10px">📊 直近'+logN+'問の分析: '+
      (est.sampled
        ? 'すでに知っていそうな単語 約'+Math.round(est.knownRate*100)+'%・復習の正答率 '+Math.round(est.recall*100)+'%'
        : 'まだ分析中(新規・復習をそれぞれ8問以上解くと精度が上がる。いまは標準値で計算)')+
      ' ─ 学習を進めるほど目安は自動で更新される</div>'+
    '<div class="row" style="gap:10px; margin-top:14px">'+
      ((G.pace&&G.pace.goal)? '<button class="btn" id="goalClear">目標を解除</button>':'')+
      '<button class="btn primary grow" id="goalSave">この目標で進める</button></div>');
  const upd=()=>{
    const v=$("goalDate").value, box=$("paceCalc");
    if(!v || v<=today){ box.innerHTML='<div class="small">明日以降の日付を選ぶと計算結果が出る</div>'; return; }
    const days=Math.max(1, Math.ceil((new Date(v+"T23:59:59").getTime()-Date.now())/864e5));
    const rem=paceRemaining(G, est, days);
    const per=Math.max(10, Math.ceil(rem.attempts/days));
    box.innerHTML='<div class="small">残り約'+fmt(rem.attempts)+'問(復習の繰り返しを含む)÷ '+days+'日</div>'+
      '<div style="font-size:18px; font-weight:800; margin-top:4px">1日 <span style="color:var(--accent2)">'+fmt(per)+'問</span> が目安</div>'+
      (per>300? '<div class="small" style="color:var(--ng); margin-top:4px">⚠️ かなり挑戦的なペース。目標日を延ばす選択も</div>':'');
  };
  upd();
  $("goalDate").onchange=upd;
  $("modal").querySelectorAll(".ppre").forEach(b=>{
    b.onclick=()=>{ $("goalDate").value=addDays(today, +b.dataset.d); upd(); };
  });
  $("goalSave").onclick=()=>{
    const v=$("goalDate").value;
    if(!v || v<=today){ toast("明日以降の日付を選んでください"); return; }
    G.pace.goal=v; G.pace.setAt=Date.now();
    G.pace.qd=null; // 新しい目標で今日の目安を即引き直す
    saveG();
    closeModal(); toast("🎯 目標を設定! 今日から逆算スタート");
    paceRefreshViews();
  };
  const gc=$("goalClear");
  if(gc) gc.onclick=()=>{
    G.pace.goal=null; G.pace.setAt=Date.now(); G.pace.qd=null; saveG();
    closeModal(); toast("目標を解除した");
    paceRefreshViews();
  };
}
function paceRefreshViews(){
  if(!$("homeView").classList.contains("hidden")) renderHome();
}
