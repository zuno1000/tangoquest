"use strict";
/* ================= 記録タブ(v5.14.0→v5.15.0→v5.21.0で刷新) =================
   実機FB(v5.14.0)「ホーム・学習・記録の3タブに」: ⚙設定・記録に同居していた「記録」をここへ移し、⚙は設定だけにする。
   実機FB(v5.15.0)「UIを洗練・シンプルに。自分の英語の技能が成長していることが直感的に分かるように」:
   数字の表(9行)をやめ、「成長」を主役にした1枚に組み替えた。
   実機FB(v5.21.0)「学習のあゆみなどがいたるところに重複。タイルを押せば詳細(累計の問数・色塗りのカレンダー)を見たい。
   機能は集約しつつ見やすく使いやすく」:
   構成: ①成長のヒーロー=語彙力(見込み語数)・フレーズの2色バー(行のタップで📊学習のあゆみ/📊フレーズのあゆみ)
         ②語彙力の伸び=週ごとの棒グラフ(8週・単語+フレーズ)  ※v5.22.0までは「覚えた」数(下の語彙力の節を参照)
         ③タイル6枚=それぞれタップで詳細
           連続学習・学習した日→📅学習カレンダー(月ごとの色塗り・累計)/累計正解→📊学習のあゆみ(日ごとの解答数・正答率)/
           🏆実績(v5.22.0まで知識XP・idはstatXPのまま)→🏆実績モーダル/今日の英語→📚読んだ・聴いたの記録/にがて→🔥にがてノート
         ④入口は3つ(学習ペース管理・マイ単語・図鑑)
   撤去(重複の解消): 入口7つのうち「あゆみ・フレーズのあゆみ・にがて・読んだ聴いた」(タイル/ヒーローに集約)・
         🏆実績の折りたたみ(知識XPのタイルから開く)・ペース管理モーダルと実戦メニューの「あゆみ」ボタン */

/* ================= 語彙力(v5.22.0・実機FB) =================
   FB「3,200問解いたのに覚えた単語は4語。覚えた数は伸びるまで時間がかかり、かえって逆効果。
   自分の語彙力がどれくらい伸びたか・どのレベルかを直感的に知りたい。取り組むだけで効果を実感したい」
   原因: 「覚えた」はbox5(7日あけた復習に正解)で初めて数える遅行指標(1語あたり最短11日)。
   知識XP/Lvは動くが英語力と結びつかない抽象値だった。
   → 「語彙力」=すべての単語の定着段階に重みをつけた合計(「見込み◯◯語」・単位は語)。
     覚えた=1.0・定着4=0.8・定着3=0.6・定着2=0.4・定着1=0.2・未着手=0。
     1問正解するごとに必ず動き(+0.2語ぶん〜)、既知語は初見正解で定着2(=0.4)に入るのでいまの状態でも数百語台から始まる。
     ミスは復帰先(st[7]=1段下)の段で数えるので1段ぶんしか下がらない(実力の推定として正直・忘れた語は数えたままにしない)。
   レベル=英検1級レベル語彙(WORDS全体)に対するカバー率(%)。作り物のLvではなく「1級語彙の15%」と読める値。
   伸び=日別記録に「その日の始まりの語彙力(v0)」と「最後の語彙力(v)」を残し、今日 +n・今週 +n・週ごとの棒に。
     フレーズも同じ物差し(G.phr・pdays)。知識XP/Lvは🏆実績のモーダルの中だけに退く(実績の報酬としては残る) */
var VOCAB_W=[0, 0.2, 0.4, 0.6, 0.8, 1];
/* 1項目の重み(純関数): 有効な段=いまの定着(st[0])と復帰先(st[7])の大きい方。覚えた(MASTER_BOX以上)=1 */
function vocabWeight(st){
  if(!st) return 0;
  const b=Math.min(MASTER_BOX, Math.max(st[0]||0, st[7]||0));
  return VOCAB_W[b];
}
/* 記録の表(G.words / G.phr)の語彙力=重みの合計(純関数・小数) */
function knowScore(tbl){ let s=0; for(const en in tbl||{}) s+=vocabWeight(tbl[en]); return Math.round(s*10)/10; }
function vocabScore(g){ return knowScore((g||G).words); }
/* 日別記録に語彙力を残す(純関数・rec=days[k]/pdays[k]): v0=その日はじめて解く前の値(一度だけ)・v=最後の値。
   戻り値=100語(step)の節目を越えたら越えた節目(お祝い用)・越えなければ0 */
function vocabSnap(rec, pre, post, step){
  if(rec.v0==null) rec.v0=pre;
  rec.v=post;
  step=step||100;
  return Math.floor(post/step)>Math.floor(pre/step)? Math.floor(post/step)*step : 0;
}
/* その日の伸び(v-v0)。記録が始まる前の日(v5.22.0より前)は0 */
function dayGain(rec){ return (rec && rec.v!=null && rec.v0!=null)? Math.round((rec.v-rec.v0)*10)/10 : 0; }
/* 今日の伸び(単語=days・フレーズ=pdays) */
function todayGain(g, k){ k=k||todayKey(); return {w:dayGain((g.days||{})[k]), p:dayGain((g.pdays||{})[k])}; }

/* 週ごとの語彙力の伸び(単語 w・フレーズ p)を数える純関数。n週分・古い週が先・最後の要素が今週(今日を末日とする7日の窓)。
   v5.16.0までは「今週覚えて、いまも覚えている語」(st[9])を数えていたが、v5.22.0で日別記録の伸び(dayGain)の合計に。
   覚えた数は遅行指標で棒がほとんど立たなかった(実機FB)。記録はv5.22.0から残るので、それより前の週は0 */
function growthByWeek(g, n, base){
  const out=[]; base=base||new Date();
  const key=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  for(let w=n-1; w>=0; w--){
    let sw=0, sp=0;
    const fd=new Date(base.getFullYear(), base.getMonth(), base.getDate()-(w*7+6));
    for(let i=0;i<7;i++){
      const k=key(new Date(fd.getFullYear(), fd.getMonth(), fd.getDate()+i));
      sw+=dayGain((g.days||{})[k]); sp+=dayGain((g.pdays||{})[k]);
    }
    out.push({from:(fd.getMonth()+1)+"/"+fd.getDate(), w:Math.round(sw*10)/10, p:Math.round(sp*10)/10});
  }
  return out;
}
/* 伸びの表記: 小数は四捨五入・0でも「+0」 */
function gainText(v){ return (v<0? "−":"+")+Math.round(Math.abs(v)); }

/* 月のカレンダー(純関数・v5.21.0): y=年・m=月(1〜12)。cells=月初の曜日ぶんの空白(null)+日ごとの
   {k, d, a:解答, c:正解, t:目安, hit:目安達成, did:学習した, fz:フリーズが守った(学習なし), future, today, rl:{r,l,n}|null}。
   合計: daysN=学習した日・tot=解答・totC=正解・hitN=目安達成の日 */
function calendarMonth(g, y, m, todayK){
  todayK=todayK||todayKey();
  const first=new Date(y, m-1, 1), n=new Date(y, m, 0).getDate();
  const rlDays=rlDoneByDay(g.rl);
  const cells=[]; for(let i=0;i<first.getDay();i++) cells.push(null);
  let daysN=0, tot=0, totC=0, hitN=0;
  for(let d=1; d<=n; d++){
    const k=y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0");
    const r=(g.days||{})[k]||{};
    const a=r.a||0, hit=(r.t||0)>0 && a>=r.t;
    if(a>0){ daysN++; tot+=a; totC+=r.c||0; if(hit) hitN++; }
    cells.push({k, d, a, c:r.c||0, t:r.t||0, hit, did:a>0, fz:!!r.fz && !(a>0), future:k>todayK, today:k===todayK, rl:rlDays[k]||null});
  }
  return {y, m, cells, daysN, tot, totC, hitN};
}

/* タイル(v5.21.0): idがあればタップできるボタン(右上に›)・なければ表示だけ */
function statTile(l, v, sub, id){
  return id
    ? '<button class="stat tap" id="'+id+'"><span class="sl">'+l+'<i>›</i></span><b class="sv">'+v+'</b><span class="ss">'+sub+'</span></button>'
    : '<div class="stat"><span class="sl">'+l+'</span><b class="sv">'+v+'</b><span class="ss">'+sub+'</span></div>';
}

/* 📅 学習カレンダー(v5.21.0): 月ごとの色塗り(金=目安達成・青=学習した日・🧊=フリーズ・📖🎧=今日の英語)+累計。
   off=いまの月から何か月前か。◀は最古の学習記録の月まで。日をタップ=その日の問数と正答率をトースト */
function openCalendarModal(off){
  off=Math.max(0, off|0);
  const now=new Date();
  const dt=new Date(now.getFullYear(), now.getMonth()-off, 1), y=dt.getFullYear(), m=dt.getMonth()+1;
  const cal=calendarMonth(G, y, m);
  let oldest=null, daysAll=0, totAll=0, corAll=0;
  for(const k in G.days){ const r=G.days[k]; if((r.a||0)>0){ daysAll++; totAll+=r.a; corAll+=r.c||0; if(!oldest || k<oldest) oldest=k; } }
  const firstK=y+"-"+String(m).padStart(2,"0")+"-01";
  const hasPrev=!!(oldest && oldest<firstK);
  const WD=["日","月","火","水","木","金","土"];
  const cells=cal.cells.map(c=>{
    if(!c) return '<div class="cd blank"></div>';
    const cls=(c.hit?" hit":c.did?" did":c.fz?" fz":"")+(c.today?" today":"")+(c.future?" future":"");
    return '<button class="cd'+cls+'" data-k="'+c.k+'"'+(c.future?' disabled':'')+'>'+
      '<span class="cdn">'+c.d+'</span><span class="cdm">'+(c.fz? "🧊" : rlMarks(c.rl))+'</span></button>';
  }).join("");
  const pctOf=(c,a)=>a? Math.round(100*c/a) : 0;
  openModal('<h3>📅 学習カレンダー '+helpBtn("hlp-cal")+'</h3>'+
    helpNote("hlp-cal", '色のついた日=1問以上解いた日。<b>金</b>=その日の目安を達成・<b>青</b>=学習した日・<b>🧊</b>=フリーズが連続記録を守った日(連続日数には数えない)・'+
      '📖/🎧=今日の英語を読んだ・聴いた日。日をタップするとその日の問数と正答率が出る。'+
      '連続学習は1問以上解いた日が対象で、今日まだ解いていなくても途切れ扱いにしない。日付は端末の時計基準(0時で翌日)')+
    '<div class="row histnav" style="gap:8px; margin-top:6px">'+
      '<button class="btn hnav" id="calPrev"'+(hasPrev?'':' disabled')+'>◀</button>'+
      '<div class="grow" style="text-align:center; font-weight:800">'+y+'年'+m+'月'+
        '<span class="small" style="font-weight:700"> ・ '+cal.daysN+'日 ・ '+fmt(cal.tot)+'問</span></div>'+
      '<button class="btn hnav" id="calNext"'+(off>0?'':' disabled')+'>▶</button></div>'+
    '<div class="calwd">'+WD.map(w=>'<span>'+w+'</span>').join("")+'</div>'+
    '<div class="calgrid">'+cells+'</div>'+
    '<div class="pacefoot"><span class="wlg hit">■</span>目安達成 <span class="wlg did">■</span>学習した日 <span class="wlg">🧊</span>フリーズ <span class="wlg">📖</span>読んだ <span class="wlg">🎧</span>聴いた ・ 日をタップで詳細</div>'+
    '<div class="panel statgrid" style="margin-top:12px">'+
      statTile("🔥 連続学習", studyStreak()+"日", "最長 "+longestStreak(G)+"日"+(G.frz? " ・ 🧊"+G.frz : ""))+
      statTile("📅 学習した日", daysAll+"日", "この月 "+cal.daysN+"日 ・ 目安達成 "+cal.hitN+"日")+
      statTile("🧮 累計解答", fmt(totAll)+"問", "正解 "+fmt(corAll)+"問 ・ 正答率 "+pctOf(corAll,totAll)+"%")+
      statTile("📆 この月の解答", fmt(cal.tot)+"問", "正解 "+fmt(cal.totC)+"問 ・ 正答率 "+pctOf(cal.totC,cal.tot)+"%")+
    '</div>'+
    '<button class="btn rlentry" id="calHist"><span class="grow">📊 日ごとの解答数と正答率</span><span class="hlsub">14日のグラフ ›</span></button>');
  $("calPrev").onclick=()=>{ if(hasPrev) openCalendarModal(off+1); };
  $("calNext").onclick=()=>{ if(off>0) openCalendarModal(off-1); };
  $("calHist").onclick=()=>openHistoryModal(0);
  $("modal").querySelectorAll(".cd[data-k]").forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k, r=G.days[k]||{}, a=r.a||0;
      toast((+k.slice(5,7))+"/"+(+k.slice(8))+": "+(a
        ? a+"問(正解"+(r.c||0)+" ・ "+pctOf(r.c||0,a)+"%)"+(r.t? " ・ 目安"+r.t+(a>=r.t? " 達成🏅":"") : "")+(dayGain(r)? " ・ 語彙力"+gainText(dayGain(r)) : "")
        : r.fz? "🧊 フリーズが連続記録を守った日" : "学習なし"));
    };
  });
}

/* 🏆 実績(v5.21.0): 記録タブの折りたたみから、知識XPのタイルで開くモーダルへ(中身は従来のrenderLearnAch) */
function openAchModal(){
  openModal('<h3>🏆 実績</h3><div id="recAch"></div>');
  renderLearnAch($("recAch"));
}

function renderRecords(){
  const box=$("recBox"); if(!box) return;
  const d=dayRec(), streak=studyStreak();
  const mastered=masteredCount(G), total=WORDS.length, learned=Object.keys(G.words).length;
  let pmas=0; for(const en in G.phr){ if(G.phr[en][0]>=MASTER_BOX) pmas++; }
  const ptotal=allPhrases().length;
  const rlR=Object.keys(G.rl.done||{}).filter(u=>G.rl.done[u].k!=="listen").length;
  const rlL=Object.keys(G.rl.done||{}).filter(u=>G.rl.done[u].k==="listen").length;
  let daysN=0, tot=0, totC=0;
  for(const k in G.days){ const r=G.days[k]; if(r.a>0){ daysN++; tot+=r.a; totC+=r.c||0; } }
  const wk=growthByWeek(G, 8), thisW=wk[7], lastW=wk[6];
  const gsum=wk.reduce((s,x)=>s+x.w+x.p, 0);
  const gmax=Math.max(1, ...wk.map(x=>x.w+x.p));
  const pct=(a,b)=>b? Math.min(100, Math.round(100*a/b)) : 0;
  const pctF=(a,b)=>b? Math.min(100, 100*a/b) : 0; // バーの幅は小数のまま(1語ぶんでも0%に丸めない)
  const mnClaim=claimableCount();
  const s=achSummary();
  // 語彙力(v5.22.0): 定着段階の重みつき合計=「見込み◯◯語」。今日の伸び=日別記録のv-v0
  const vs=vocabScore(G), ps=knowScore(G.phr), tg=todayGain(G);
  box.innerHTML=
    // ① 成長のヒーロー: 語彙力(見込み語数)のバー=濃い色が覚えた・薄い色が見込み。行のタップであゆみ(v5.21.0)
    '<div class="panel growhero">'+
      '<div class="herorow" id="heroWords" role="button" tabindex="0">'+
        '<div class="pacetop"><span>📖 語彙力</span><b>'+fmt(Math.round(vs))+'<span class="ptgt">語 / '+fmt(total)+'語('+pct(vs,total)+'%) ›</span></b></div>'+
        '<div class="pbar dual"><i class="est" style="width:'+pctF(vs,total)+'%"></i><i style="width:'+pctF(mastered,total)+'%"></i></div>'+
        '<div class="pacefoot">今日 <b class="gplus">'+gainText(tg.w)+'</b> ・ 今週 <b class="gplus">'+gainText(thisW.w)+'</b> ・ 先週 '+gainText(lastW.w)+
          '<br>🏅 覚えた '+fmt(mastered)+'語 ・ 学習中 '+fmt(Math.max(0, learned-mastered))+'語</div>'+ // 2行に分けて折り返しの孤立文字を防ぐ(390px)
      '</div>'+
      '<div class="herorow" id="heroPhr" role="button" tabindex="0">'+
        '<div class="pacetop gsub"><span>💬 フレーズ</span><b>'+fmt(Math.round(ps))+'<span class="ptgt"> / '+fmt(ptotal)+' ›</span></b></div>'+
        '<div class="pbar thin dual"><i class="est" style="width:'+pctF(ps,ptotal)+'%"></i><i style="width:'+pctF(pmas,ptotal)+'%"></i></div>'+
        '<div class="pacefoot">今日 <b class="gplus">'+gainText(tg.p)+'</b> ・ 今週 <b class="gplus">'+gainText(thisW.p)+'</b> ・ 先週 '+gainText(lastW.p)+' ・ 🏅 覚えた '+fmt(pmas)+'</div>'+
      '</div>'+
      '<div class="pacefoot vfoot">見込み語数=定着の段階に応じて数える(覚えた1.0・定着4=0.8・3=0.6・2=0.4・1=0.2)。濃い色=覚えた ・ 薄い色=見込み</div>'+
    '</div>'+
    // ② 語彙力の伸び(週ごと・8週=日別記録のv-v0の合計。単語+フレーズ)
    '<div class="panel" id="recGrowth" style="margin-top:12px">'+
      '<div class="pacetop"><span>📈 語彙力の伸び <span class="small" style="font-weight:700">週ごと・8週</span></span><b>'+gainText(gsum)+'</b></div>'+
      '<div class="histchart gchart">'+wk.map((x,i)=>{
        const v=Math.round(x.w+x.p), bh=v>0? Math.max(3, Math.round(56*v/gmax)) : 0;
        return '<div class="hcol"><div class="hval">'+(v? gainText(v) : '')+'</div>'+
          '<div class="hbarw"><div class="hbar'+(i===wk.length-1? ' cur':'')+'" style="height:'+bh+'px"></div></div>'+
          '<div class="hday">'+(i===wk.length-1? '今週' : x.from)+'</div></div>';
      }).join("")+'</div>'+
      '<div class="pacefoot">単語+フレーズ ─ 正解して定着が1段進むごとに約+0.2語ぶん・忘れると1段ぶん下がる(記録はv5.22.0から)</div>'+
    '</div>'+
    // ③ 習慣と累計のタイル(タップで詳細=v5.21.0)
    '<div class="panel statgrid" style="margin-top:12px">'+
      statTile("🔥 連続学習", streak+"日", "最長 "+longestStreak(G)+"日"+(G.frz? " ・ 🧊"+G.frz : ""), "statStreak")+
      statTile("📅 学習した日", daysN+"日", "今日 "+d.a+"問(正解"+d.c+")", "statDays")+
      statTile("✅ 累計正解", fmt(totC)+"問", "正答率 "+(tot? Math.round(100*totC/tot) : 0)+"% ・ 解答 "+fmt(tot)+"問", "statCor")+
      (GAME_ENABLED
        ? statTile("🎫 チケット", fmt(G.tickets), "🪙 "+fmt(G.gold)+" ・ 任務"+(mnClaim? " "+mnClaim+"件 受取":""), "statXP")
        : statTile("🏆 実績", s.done+" / "+s.all, "Lv"+accountLevel()+" ・ "+fmt(G.xp)+" XP", "statXP"))+ // v5.22.0: 知識XPのタイル→実績(Lv/XPは添え書きに)
      statTile("📰 今日の英語", "📖"+rlR+" 🎧"+rlL, "読んだ・聴いた", "statRL")+
      statTile("🔥 にがて", weakWords(G).length+"語", "まだ覚えていない語", "statWeak")+
      '<div class="stathint">タップで詳細 ─ カレンダー・日ごとの記録・実績・一覧</div>'+
    '</div>'+
    // ④ 入口(重複を除いた3つ)
    '<div class="homelinks" style="margin-top:12px">'+
      '<button class="btn" id="paceCfgBtn">🎯 学習ペース管理<span class="hlsub">目標日と1日の目安</span></button>'+
      '<button class="btn" id="mywBtn">📝 マイ単語<span class="hlsub">'+mywList().length+'語'+(mywPending().length? ' ・ 意味待ち'+mywPending().length:'')+'</span></button>'+
      '<button class="btn" id="setDexBtn">📕 図鑑<span class="hlsub">単語・フレーズの一覧</span></button>'+
    '</div>';
  $("heroWords").onclick=()=>openHistoryModal(0);
  $("heroPhr").onclick=()=>openPhrHistoryModal(0);
  $("statStreak").onclick=()=>openCalendarModal(0);
  $("statDays").onclick=()=>openCalendarModal(0);
  $("statCor").onclick=()=>openHistoryModal(0);
  $("statXP").onclick=()=>{ if(GAME_ENABLED) switchTab("mission"); else openAchModal(); };
  $("statRL").onclick=openRLHistory;
  $("statWeak").onclick=openWeakModal;
  $("paceCfgBtn").onclick=openPaceModal;
  $("mywBtn").onclick=openMywList;
  $("setDexBtn").onclick=()=>openDex();
}
