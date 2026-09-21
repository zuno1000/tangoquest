"use strict";
/* ================= 記録タブ(v5.14.0) =================
   実機FB「ホーム・学習・記録の3タブに」。⚙設定・記録に同居していた「記録」(今日の数字・あゆみ・にがて・読んだ聴いた・
   マイ単語・図鑑・実績)をここへ移し、⚙は設定(出題・演出・同期・更新・リセット)だけにする。
   構成: ①数字の表(今日/覚えた/フレーズ/今日の英語/連続/XP) ②入口(あゆみ・ペース管理・にがて・読んだ聴いた・マイ単語・図鑑)
         ③🏆実績(ゲーム面オフでは自動付与の達成状況をそのまま並べる=別画面に飛ばない) */
function renderRecords(){
  const box=$("recBox"); if(!box) return;
  const d=dayRec(), streak=studyStreak();
  const mastered=masteredCount(G);
  let pmas=0; for(const en in G.phr){ if(G.phr[en][0]>=MASTER_BOX) pmas++; }
  const rlR=Object.keys(G.rl.done||{}).filter(u=>G.rl.done[u].k!=="listen").length;
  const rlL=Object.keys(G.rl.done||{}).filter(u=>G.rl.done[u].k==="listen").length;
  const mnClaim=claimableCount();
  box.innerHTML=
    '<div class="panel"><table class="stt">'+
    '<tr><td>今日の解答</td><td>'+d.a+'問(正解'+d.c+')</td></tr>'+
    '<tr><td>覚えた単語</td><td>'+mastered+' / '+WORDS.length+'(学習した '+Object.keys(G.words).length+'語)</td></tr>'+
    '<tr><td>覚えたフレーズ</td><td>'+pmas+' / '+allPhrases().length+'(今日 '+pdayRec().a+'問)</td></tr>'+
    '<tr><td>📰 今日の英語</td><td>📖 '+rlR+'本 ・ 🎧 '+rlL+'本</td></tr>'+
    '<tr><td>連続学習</td><td>'+streak+'日(最長 '+longestStreak(G)+'日 ・ XP×'+(+streakXpMult().toFixed(2))+' ・ 🧊'+(G.frz||0)+'/'+FRZ_MAX+')</td></tr>'+
    (GAME_ENABLED
      ? '<tr><td>🎫 チケット</td><td>'+fmt(G.tickets)+'(限定召喚用・学習で入手)</td></tr>'+
        '<tr><td>🪙 ゴールド</td><td>'+fmt(G.gold)+'(恒常召喚用・冒険で入手)</td></tr>'
      : '<tr><td>📖 知識XP</td><td>'+fmt(G.xp)+'(Lv'+accountLevel()+' ・ 正解と実績で増える)</td></tr>')+
    '</table></div>'+
    '<div class="homelinks" style="margin-top:10px">'+
      '<button class="btn" id="histBtn">📊 学習のあゆみ</button>'+
      '<button class="btn" id="paceCfgBtn">🎯 学習ペース管理</button>'+
      '<button class="btn" id="phrHistBtn">🗣 フレーズのあゆみ</button>'+
      '<button class="btn" id="weakBtn">🔥 にがてノート<span class="hlsub">'+weakWords(G).length+'語 ・ 特訓へ</span></button>'+
      '<button class="btn" id="rlHistBtn2">📚 読んだ・聴いた<span class="hlsub">今日の英語の記録</span></button>'+
      '<button class="btn" id="mywBtn">📝 マイ単語<span class="hlsub">'+mywList().length+'語'+(mywPending().length? ' ・ 意味待ち'+mywPending().length:'')+'</span></button>'+
      '<button class="btn" id="setDexBtn">📕 図鑑</button>'+
      (GAME_ENABLED? '<button class="btn" id="setMissionBtn"><span>📜 任務'+(mnClaim? ' <b style="color:var(--accent)">'+mnClaim+'件 受取</b>':'')+'</span></button>':'')+
    '</div>'+
    '<div class="panel" id="recAch" style="margin-top:12px"></div>';
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
