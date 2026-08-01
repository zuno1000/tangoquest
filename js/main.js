"use strict";
/* ================= タブ切替・起動 ================= */

const TABS={
  quiz:    {view:"quizView",    nav:"navQuiz",    on:()=>refreshInfPill()},
  cards:   {view:"cardsView",   nav:"navCards",   on:()=>renderCards()},
  adv:     {view:"advView",     nav:"navAdv",     on:()=>renderAdv()},
  gacha:   {view:"gachaView",   nav:"navGacha",   on:()=>renderChars()},
  mission: {view:"missionView", nav:"navMission", on:()=>{ renderMissions(); refreshMissionDot(); }},
};
function switchTab(name){
  closeModal();
  for(const k in TABS){
    $(TABS[k].view).classList.toggle("hidden", k!==name);
    $(TABS[k].nav).classList.toggle("active", k===name);
  }
  TABS[name].on();
}
$("navQuiz").onclick=()=>switchTab("quiz");
$("navCards").onclick=()=>switchTab("cards");
$("navAdv").onclick=()=>switchTab("adv");
$("navGacha").onclick=()=>switchTab("gacha");
$("navMission").onclick=()=>switchTab("mission");

function refreshHeader(){
  $("resGold").textContent=fmt(G.gold);
  $("resTicket").textContent=fmt(G.tickets);
  refreshMissionDot();
}

/* ---- 定期処理: 無限回廊の進行・ピル更新 ---- */
setInterval(()=>{
  infTick();
  refreshInfPill();
  if(!$("advView").classList.contains("hidden")) renderInfPanel();
}, 5000);

/* ---- 起動 ---- */
refreshHeader();
newQuestion();          // 開いた瞬間に出題
infTick();              // 放置分の探索を反映
refreshInfPill();
checkLogin();           // ログインボーナス
saveG();

if("serviceWorker" in navigator && location.protocol==="https:"){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}

/* セルフテスト(tests/)用: let/const宣言はwindowに載らないため明示公開 */
window.G=G; window.WORDS=WORDS;
