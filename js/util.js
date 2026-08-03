"use strict";
/* ================= 汎用ユーティリティ ================= */
const $=id=>document.getElementById(id);

function esc(s){ return String(s).replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }

/* FNV-1a: 単語から決定的にカード性能を導く */
function hashStr(s){
  let h=2166136261;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}

function fmt(n){ return Math.round(n).toLocaleString("ja-JP"); }

/* ---- toast ---- */
let toastTimer=null;
function toast(msg){
  const t=$("toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"), 1800);
}

/* ---- tap ----
   iOSはスクロールの減速中などにタップのclickが発火しないことがある(タップが
   「スクロールを止める操作」として消費される)。pointerupでも拾い、指の移動が
   小さいときだけタップとみなす。clickと二重に発火し得るため、呼び出し側は
   同じ状態への切替を無視するなど冪等にしておくこと */
function bindTap(el, fn){
  let sx=0, sy=0;
  el.addEventListener("pointerdown", e=>{ sx=e.clientX; sy=e.clientY; });
  el.addEventListener("pointerup", e=>{
    if(Math.abs(e.clientX-sx)<12 && Math.abs(e.clientY-sy)<12) fn(e);
  });
}

/* ---- modal ---- */
function openModal(html){
  const m=$("modal");
  m.innerHTML='<button class="mclose">✕</button>'+html;
  m.querySelector(".mclose").onclick=closeModal;
  m.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeModal);
  $("overlay").classList.add("show");
}
function closeModal(){ $("overlay").classList.remove("show"); $("modal").innerHTML=""; }
$("overlay").addEventListener("click", e=>{ if(e.target.id==="overlay") closeModal(); });
