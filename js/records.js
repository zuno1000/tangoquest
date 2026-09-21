"use strict";
/* ================= 記録タブ(v5.14.0→v5.15.0で刷新) =================
   実機FB(v5.14.0)「ホーム・学習・記録の3タブに」: ⚙設定・記録に同居していた「記録」をここへ移し、⚙は設定だけにする。
   実機FB(v5.15.0)「UIを洗練・シンプルに。自分の英語の技能が成長していることが直感的に分かるように」:
   数字の表(9行)をやめ、「成長」を主役にした1枚に組み替えた。
   構成: ①成長のヒーロー=覚えた単語・フレーズのバー(全体に対する到達)+今週/先週の伸び
         ②覚えた数の伸び=週ごとの棒グラフ(8週・単語+フレーズ)=右肩上がりがそのまま成長の実感
         ③習慣と累計のタイル(連続・学習した日・累計正解と正答率・知識XP・今日の英語・にがて)
         ④入口(あゆみ・ペース管理・フレーズのあゆみ・にがて・読んだ聴いた・マイ単語・図鑑)
         ⑤🏆実績は折りたたみ(12種×段階の行は長いので、見出しに達成数だけ出す。中身はDOMに常在=テスト互換) */

/* 週ごとに「覚えた」数(単語 w・フレーズ p)を数える純関数。n週分・古い週が先・最後の要素が今週(今日を末日とする7日の窓)。
   「覚えた」=7日あけて思い出せた語(G.days[k].m / G.pdays[k].m はその日に覚えた数) */
function growthByWeek(g, n, base){
  const out=[]; base=base||new Date();
  for(let w=n-1; w>=0; w--){
    let wd=0, pd=0, from="";
    for(let i=6;i>=0;i--){
      const dt=new Date(base.getFullYear(), base.getMonth(), base.getDate()-(w*7+i));
      const k=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
      if(!from) from=(dt.getMonth()+1)+"/"+dt.getDate();
      wd+=(((g.days||{})[k]||{}).m)||0;
      pd+=(((g.pdays||{})[k]||{}).m)||0;
    }
    out.push({from, w:wd, p:pd});
  }
  return out;
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
  const mnClaim=claimableCount();
  const s=achSummary();
  const tile=(l,v,sub)=>'<div class="stat"><span class="sl">'+l+'</span><b class="sv">'+v+'</b><span class="ss">'+sub+'</span></div>';
  box.innerHTML=
    // ① 成長のヒーロー: 全体に対してどこまで来たか+今週の伸び
    '<div class="panel growhero">'+
      '<div class="pacetop"><span>🏅 覚えた単語</span><b>'+fmt(mastered)+' <span class="ptgt">/ '+fmt(total)+'語</span></b></div>'+
      '<div class="pbar"><i style="width:'+pct(mastered,total)+'%"></i></div>'+
      '<div class="pacefoot">今週 <b class="gplus">+'+thisW.w+'語</b> ・ 先週 +'+lastW.w+'語 ・ 学習中 '+fmt(Math.max(0, learned-mastered))+'語</div>'+
      '<div class="pacetop gsub"><span>💬 覚えたフレーズ</span><b>'+fmt(pmas)+' <span class="ptgt">/ '+fmt(ptotal)+'</span></b></div>'+
      '<div class="pbar thin"><i style="width:'+pct(pmas,ptotal)+'%"></i></div>'+
      '<div class="pacefoot">今週 <b class="gplus">+'+thisW.p+'</b> ・ 先週 +'+lastW.p+'</div>'+
    '</div>'+
    // ② 覚えた数の伸び(週ごと・8週)
    '<div class="panel" id="recGrowth" style="margin-top:12px">'+
      '<div class="pacetop"><span>📈 覚えた数の伸び <span class="small" style="font-weight:700">週ごと・8週</span></span><b>+'+fmt(gsum)+'</b></div>'+
      '<div class="histchart gchart">'+wk.map((x,i)=>{
        const v=x.w+x.p, bh=v? Math.max(3, Math.round(56*v/gmax)) : 0;
        return '<div class="hcol"><div class="hval">'+(v? '+'+v : '')+'</div>'+
          '<div class="hbarw"><div class="hbar'+(i===wk.length-1? ' cur':'')+'" style="height:'+bh+'px"></div></div>'+
          '<div class="hday">'+(i===wk.length-1? '今週' : x.from)+'</div></div>';
      }).join("")+'</div>'+
      '<div class="pacefoot">単語+フレーズ ─ 7日あけても思い出せた語が「覚えた」に加わる</div>'+
    '</div>'+
    // ③ 習慣と累計のタイル
    '<div class="panel statgrid" style="margin-top:12px">'+
      tile("🔥 連続学習", streak+"日", "最長 "+longestStreak(G)+"日"+(G.frz? " ・ 🧊"+G.frz : ""))+
      tile("📅 学習した日", daysN+"日", "今日 "+d.a+"問(正解"+d.c+")")+
      tile("✅ 累計正解", fmt(totC)+"問", "正答率 "+(tot? Math.round(100*totC/tot) : 0)+"%")+
      (GAME_ENABLED
        ? tile("🎫 チケット", fmt(G.tickets), "🪙 "+fmt(G.gold))
        : tile("📖 知識XP", "Lv"+accountLevel(), fmt(G.xp)+" XP"))+
      tile("📰 今日の英語", "📖"+rlR+" 🎧"+rlL, "読んだ・聴いた")+
      tile("🔥 にがて", weakWords(G).length+"語", "ミスあり・まだ覚えていない")+
    '</div>'+
    // ④ 入口
    '<div class="homelinks" style="margin-top:12px">'+
      '<button class="btn" id="histBtn">📊 学習のあゆみ<span class="hlsub">日ごとの解答数・目安</span></button>'+
      '<button class="btn" id="paceCfgBtn">🎯 学習ペース管理<span class="hlsub">目標日と1日の目安</span></button>'+
      '<button class="btn" id="phrHistBtn">🗣 フレーズのあゆみ<span class="hlsub">定着の階段</span></button>'+
      '<button class="btn" id="weakBtn">🔥 にがてノート<span class="hlsub">'+weakWords(G).length+'語 ・ 特訓へ</span></button>'+
      '<button class="btn" id="rlHistBtn2">📚 読んだ・聴いた<span class="hlsub">今日の英語の記録</span></button>'+
      '<button class="btn" id="mywBtn">📝 マイ単語<span class="hlsub">'+mywList().length+'語'+(mywPending().length? ' ・ 意味待ち'+mywPending().length:'')+'</span></button>'+
      '<button class="btn" id="setDexBtn">📕 図鑑<span class="hlsub">単語・フレーズの一覧</span></button>'+
      (GAME_ENABLED? '<button class="btn" id="setMissionBtn"><span>📜 任務'+(mnClaim? ' <b style="color:var(--accent)">'+mnClaim+'件 受取</b>':'')+'</span></button>':'')+
    '</div>'+
    // ⑤ 🏆実績(折りたたみ・見出しに達成数)
    foldSec("recAchFold", "🏆 実績 <span class=\"small\" style=\"font-weight:700\">達成 "+s.done+" / "+s.all+"段階</span>",
      '<div class="panel" id="recAch"></div>', false);
  $("histBtn").onclick=openHistoryModal;
  $("paceCfgBtn").onclick=openPaceModal;
  $("phrHistBtn").onclick=()=>openPhrHistoryModal(0);
  $("weakBtn").onclick=openWeakModal;
  $("rlHistBtn2").onclick=openRLHistory;
  $("mywBtn").onclick=openMywList;
  $("setDexBtn").onclick=()=>openDex();
  if($("setMissionBtn")) $("setMissionBtn").onclick=()=>switchTab("mission");
  // 🏆実績: ゲーム面オフ=学習の実績(自動付与)をそのまま並べる/オン=従来の任務タブへの入口
  const ab=$("recAch");
  if(GAME_ENABLED){
    ab.innerHTML='<button class="btn" id="recMissionBtn" style="width:100%">🏆 実績・任務を見る</button>';
    $("recMissionBtn").onclick=()=>switchTab("mission");
  }else renderLearnAch(ab);
}
