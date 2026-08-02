"use strict";
/* ================= タブ切替・起動 ================= */

const TABS={
  home:    {view:"homeView",    nav:"navHome",    on:()=>renderHome()},
  quiz:    {view:"quizView",    nav:"navQuiz",    on:()=>refreshInfPill()},
  party:   {view:"partyView",   nav:"navParty",   on:()=>renderParty()},
  adv:     {view:"advView",     nav:"navAdv",     on:()=>renderAdv()},
  gacha:   {view:"gachaView",   nav:"navGacha",   on:()=>renderGacha()},
  mission: {view:"missionView", nav:null,         on:()=>{ renderMissions(); refreshMissionDot(); }},
};
function switchTab(name){
  closeModal();
  for(const k in TABS){
    $(TABS[k].view).classList.toggle("hidden", k!==name);
    if(TABS[k].nav) $(TABS[k].nav).classList.toggle("active", k===name);
  }
  TABS[name].on();
}
$("navHome").onclick=()=>switchTab("home");
$("navQuiz").onclick=()=>switchTab("quiz");
$("navParty").onclick=()=>switchTab("party");
$("navAdv").onclick=()=>switchTab("adv");
$("navGacha").onclick=()=>switchTab("gacha");

/* ---- ホーム画面(各機能へのハブ) ---- */
const NEWS=[
  {d:"2026-08-03", t:"🔔 v3.5.0 お知らせをこのベルに移動! おまかせ編成を強化・連続ミス強化がミスごとに効くように・新しい仲間6人が恒常ガチャに登場"},
  {d:"2026-08-03", t:"🍁 9/1から限定ガチャ第2弾「秋宵の召喚」開催! 限定「紅葉の狐仙 モミジ」(SSR)・「収穫の精 ミノリ」(SR)"},
  {d:"2026-08-02", t:"🔥 v3.4.0 連続学習ボーナス! 続けた日数だけ獲得XPアップ(最大×2)。任務報酬はホームから一括受取"},
  {d:"2026-08-02", t:"🐺 v3.3.0 野生語システム! 語根のない単語は「覚えているほど強くなる」。編成中の単語は優先出題"},
  {d:"2026-08-02", t:"🧬 v3.2.0 語源辞書を大幅拡充! 語根333種・全単語の52%に正確な語源タグ"},
  {d:"2026-08-02", t:"🧬 v3.1.0 語源システム! 同じ語根の単語を並べると「共鳴」で強化。語根から単語を覚えよう"},
  {d:"2026-08-02", t:"📜 v3.0.0 呪文文法システム! カードを「文」に並べてダメージ式を組み立てよう"},
  {d:"2026-08-02", t:"⚔ v2.3.0 属性相性・技タイプ・敵の特性を追加! 敵の弱点に合わせて編成しよう"},
  {d:"2026-08-02", t:"🌤️ v2.2.0 白×青の新デザイン! 初回🎫10プレゼント・任務の一括受取も"},
  {d:"2026-08-02", t:"✨ v2.1.0 UI刷新! パック開封演出・カードのホロ光沢を追加"},
  {d:"2026-08-02", t:"🎉 v2.0.0 「LEXICA」に改名! ホーム画面・人型編成・新ダンジョン6種を追加"},
  {d:"2026-08-02", t:"☄️ 期間限定ガチャ「星降る夜の召喚」開催中(8/31まで)"},
];
function xpNeedFor(lv){ return lv<=1? 0 : Math.ceil(50*Math.pow(lv-1, 1/0.55)); }
function renderHome(){
  const P=playerStats();
  const ch=byChar[G.party.char];
  const d=dayRec();
  const lv=accountLevel();
  const cur=xpNeedFor(lv), next=xpNeedFor(lv+1);
  const pct=Math.min(100, Math.round(100*(G.xp-cur)/Math.max(1, next-cur)));
  const b=activeBanner();
  const run=G.inf.run;
  const stk=studyStreak();
  const mn=claimableCount();
  $("homeBox").innerHTML=
    // ヒーロー(出撃キャラ)
    '<div class="panel hero" data-go="party">'+
      '<div class="heroface">'+(ch?ch.face:"🗡️")+'</div>'+
      '<div class="grow">'+
        '<div style="font-weight:800; font-size:16px">'+(ch?esc(ch.name):"-")+'</div>'+
        '<div class="small" style="margin-top:2px">戦闘力 <b style="color:var(--accent); font-size:15px">'+fmt(P.power)+'</b></div>'+
        '<div class="small" style="margin-top:6px">📖 Lv'+lv+
          (stk>=2? ' <span style="color:var(--accent); font-weight:800">🔥'+stk+'日連続(XP×'+(+streakXpMult().toFixed(2))+')</span>':'')+'</div>'+
        '<div class="mbar" style="margin-top:3px"><i style="width:'+pct+'%"></i></div>'+
      '</div></div>'+
    // 学習CTA
    '<button id="homeStudy" class="studycta shine">📖 学習をはじめる'+
      '<span class="ctasub">今日 '+d.a+'問(正解'+d.c+')</span></button>'+
    // 任務報酬の一括受取(受け取れるものがあるときだけ出す)
    (mn? '<button id="homeClaim" class="claimbtn homeclaim">🎁 任務報酬をすべて受け取る</button>':'')+
    // 同期リマインダー(最終同期3日超+未同期変更ありのときだけ)
    (syncReminderNeeded()?
      '<div class="panel syncnag" id="homeSync">📥 最終同期から'+
        Math.floor((Date.now()-lastSyncAt())/864e5)+'日 ─ タップして同期</div>':'')+
    // ショートカット
    '<div class="tilegrid">'+
      '<div class="tile" data-go="adv"><div class="tic">🗺️</div><div class="tname">冒険</div>'+
        '<div class="tsub">'+(run? "🌀 "+run.floor+"F探索中" : "ダンジョンへ")+'</div></div>'+
      '<div class="tile'+(b?" ltd":"")+'" data-go="gacha"><div class="tic">🔮</div><div class="tname">ガチャ</div>'+
        '<div class="tsub">'+(b? "☄️ 限定開催中!" : "🎫"+fmt(G.tickets))+'</div></div>'+
      '<div class="tile" data-go="party"><div class="tic">📜</div><div class="tname">編成</div>'+
        '<div class="tsub">呪文・カード</div></div>'+
      '<div class="tile'+(mn?" claim":"")+'" data-go="mission"><div class="tic">📜'+(mn?'<span class="dot" style="position:static; display:inline-block; margin-left:4px"></span>':'')+'</div><div class="tname">任務</div>'+
        '<div class="tsub">'+(mn? '<b style="color:var(--accent)">達成'+mn+'件!</b>' : "デイリー・実績")+'</div></div>'+
    '</div>';
  $("homeBox").querySelectorAll("[data-go]").forEach(el=>{
    el.onclick=()=>switchTab(el.dataset.go);
  });
  $("homeStudy").onclick=()=>switchTab("quiz");
  if(mn) $("homeClaim").onclick=()=>{ claimAllCurrent(); renderHome(); };
  const sn=$("homeSync");
  if(sn){ ensureGis(()=>{}); sn.onclick=syncNow; } // GIS事前ロード=タップ時のポップアップブロック防止
}

/* ---- 編成タブ(そうび / カード / なかま) ---- */
let partyMode="equip";
function setPartyMode(m){
  partyMode=m;
  $("partySeg").querySelectorAll("button").forEach(x=>x.classList.toggle("active", x.dataset.p===m));
}
function renderParty(){
  $("pEquip").classList.toggle("hidden", partyMode!=="equip");
  $("pCards").classList.toggle("hidden", partyMode!=="cards");
  $("pChars").classList.toggle("hidden", partyMode!=="chars");
  if(partyMode==="equip"){ renderEqChars(); renderEqSlots(); }
  else if(partyMode==="cards") renderCards();
  else renderChars();
}
$("partySeg").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{ setPartyMode(b.dataset.p); renderParty(); };
});

function refreshHeader(){
  $("resLv").textContent="Lv"+accountLevel();
  $("resGold").textContent=fmt(G.gold);
  $("resTicket").textContent=fmt(G.tickets);
  refreshMissionDot();
}

/* ---- お知らせ(ヘッダーの🔔にまとめる・未読は赤点) ---- */
const NEWS_SEEN_KEY="tq_newsSeen";
function refreshBellDot(){
  $("bellDot").classList.toggle("hidden", (+localStorage.getItem(NEWS_SEEN_KEY)||0)>=NEWS.length);
}
function openNews(){
  try{ localStorage.setItem(NEWS_SEEN_KEY, String(NEWS.length)); }catch(e){}
  refreshBellDot();
  openModal('<h3>🔔 お知らせ</h3>'+
    '<div class="panel">'+NEWS.map(n=>
      '<div class="newsrow"><span class="small" style="flex:0 0 auto">'+n.d.slice(5)+'</span>'+
      '<span style="font-size:13px">'+n.t+'</span></div>').join("")+'</div>');
}
$("bellBtn").onclick=openNews;

/* ---- 定期処理: 無限回廊の進行・ピル更新 ---- */
setInterval(()=>{
  infTick();
  refreshInfPill();
  if(!$("advView").classList.contains("hidden")) renderInfPanel();
}, 5000);

/* ---- 起動 ---- */
refreshHeader();
refreshBellDot();
newQuestion();          // 学習タブを開いた瞬間に出題できるよう先に準備
infTick();              // 放置分の探索を反映
refreshInfPill();
renderHome();           // ホームがランディング
checkLogin();           // ログインボーナス
saveG();

/* PWAを閉じずに日をまたいだ場合: 復帰時に日付が変わっていたらログインボーナスを付与 */
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden && G.login.last!==todayKey()){
    checkLogin();
    refreshHeader();
  }
});

if("serviceWorker" in navigator && location.protocol==="https:"){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}

/* セルフテスト(tests/)用: let/const宣言はwindowに載らないため明示公開 */
window.G=G; window.WORDS=WORDS; window.DUNGEONS=DUNGEONS; window.BANNERS=BANNERS; window.CHARS=CHARS;
window.ROOT_DEFS=ROOT_DEFS; window.PREFIX_DEFS=PREFIX_DEFS;
