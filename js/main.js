"use strict";
/* ================= タブ切替・起動 ================= */

const TABS={
  quiz:    {view:"quizView",    nav:"navQuiz",    on:()=>refreshInfPill()},
  party:   {view:"partyView",   nav:"navParty",   on:()=>renderParty()},
  adv:     {view:"advView",     nav:"navAdv",     on:()=>renderAdv()},
  gacha:   {view:"gachaView",   nav:"navGacha",   on:()=>{}},
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
$("navParty").onclick=()=>switchTab("party");
$("navAdv").onclick=()=>switchTab("adv");
$("navGacha").onclick=()=>switchTab("gacha");
$("navMission").onclick=()=>switchTab("mission");

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
