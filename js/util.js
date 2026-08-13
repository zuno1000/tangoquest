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
/* ヘッダーなど幅が限られる場所用の短縮表記: 30万・1.2万・9,999 */
function fmtShort(n){
  n=Math.round(n);
  if(n>=1e8) return +( (n/1e8).toFixed(1) )+"億";
  if(n>=1e4) return +( (n/1e4).toFixed(n<1e5?1:0) )+"万";
  return n.toLocaleString("ja-JP");
}

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

/* ---- 説明の丸?ボタン(v4.23.0・todaybgm v0.9.1と同じ流儀) ----
   注釈は常時表示せず、hidden属性の.help-noteに格納して?のタップで開閉する。
   モーダル・ホームのどこにでも現れるため、ハンドラはdocumentに1本だけ委譲で張る */
function helpBtn(id){ return '<button class="help-btn" data-help="'+id+'" aria-expanded="false">?</button>'; }
function helpNote(id, html){ return '<div class="help-note" id="'+id+'" hidden>'+html+'</div>'; }
document.addEventListener("click", e=>{
  const b=e.target && e.target.closest && e.target.closest(".help-btn");
  if(!b) return;
  const n=document.getElementById(b.dataset.help);
  if(!n) return;
  n.hidden=!n.hidden;
  b.setAttribute("aria-expanded", n.hidden? "false":"true");
});

/* ---- modal ---- */
function openModal(html){
  const m=$("modal");
  /* ✕は高さ0のsticky帯(.mctop)に載せてレイアウトから外す。
     floatだと直下のgrid/flex(独立整形コンテキスト)がフロートを避けて
     右側だけ36px縮み、中身が左に偏る(v4.5.1で修正) */
  m.innerHTML='<div class="mctop"><button class="mclose">✕</button></div>'+html;
  m.querySelector(".mclose").onclick=closeModal;
  m.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeModal);
  $("overlay").classList.add("show");
}
function closeModal(){ $("overlay").classList.remove("show"); $("modal").innerHTML=""; }
$("overlay").addEventListener("click", e=>{ if(e.target.id==="overlay") closeModal(); });
