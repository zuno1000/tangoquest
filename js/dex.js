"use strict";
/* ================= 図鑑(カード・なかま) =================
   ポケポケ観察の応用: 空き枠を「窪み」で見せてコンプリート欲を作る。
   カード図鑑=全単語の取得状況(未取得も単語は見せる=学習アプリなので隠す理由がない)。
   なかま図鑑=未加入はシルエット+???(こちらは出会いの楽しみを残す) */

/* en -> 所持している最高レア度(0=未取得) */
function cardDexMap(){
  const m={};
  for(const k in G.inv){
    const p=parseKey(k);
    m[p.en]=Math.max(m[p.en]||0, p.rar);
  }
  return m;
}
function cardDexStats(){
  const m=cardDexMap();
  let owned=0, mastered=0;
  WORDS.forEach(w=>{
    if(m[w.en]) owned++;
    const st=G.words[w.en];
    if(st && st[0]>=MASTER_BOX) mastered++;
  });
  return {owned, mastered, total:WORDS.length};
}
function charDexStats(){
  let owned=0;
  CHARS.forEach(c=>{ if(G.chars[c.id]) owned++; });
  return {owned, total:CHARS.length};
}

let dexMode="cards", dexPos="all";

function dexProgHTML(cur, total){
  return '<div class="dexprog"><i style="width:'+Math.min(100, Math.round(100*cur/Math.max(1,total)))+'%"></i></div>';
}

function renderDexBody(){
  const box=$("dexBody"); if(!box) return;
  $("dexSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("active", b.dataset.m===dexMode));
  if(dexMode==="cards"){
    const st=cardDexStats(), m=cardDexMap();
    let h='<div class="small" style="margin-top:8px">カード <b style="color:var(--accent2)">'+st.owned+'</b> / '+st.total+
      '種 ・ 覚えた <b style="color:var(--ok)">'+st.mastered+'</b>語</div>'+dexProgHTML(st.owned, st.total)+
      '<div class="seg" id="dexPosSeg">'+["all","n","adj","v","adv"].map(p=>
        '<button data-p="'+p+'" class="'+(p===dexPos?"active":"")+'">'+(p==="all"?"全て":POS_LABEL[p])+'</button>').join("")+'</div>'+
      '<div id="dexGrid">';
    WORDS.forEach(w=>{
      if(dexPos!=="all" && w.pos!==dexPos) return;
      const rar=m[w.en]||0;
      const stw=G.words[w.en], mas=stw && stw[0]>=MASTER_BOX;
      h+= rar
        ? '<div class="dexcell own" data-k="'+esc(keyOf(w.en,rar,0))+'"><div class="den">'+esc(w.en)+'</div>'+
          '<div class="dst rc'+rar+'">'+RAR_STARS[rar-1]+'</div>'+(mas? '<div class="dmas">✓覚えた</div>':'')+'</div>'
        : '<div class="dexcell miss"><div class="den">'+esc(w.en)+'</div>'+(mas? '<div class="dmas">✓覚えた</div>':'')+'</div>';
    });
    h+='</div>';
    box.innerHTML=h;
    $("dexPosSeg").querySelectorAll("button").forEach(b=>{
      b.onclick=()=>{ dexPos=b.dataset.p; renderDexBody(); };
    });
    box.querySelectorAll(".dexcell.own").forEach(el=>{
      el.onclick=()=>openCardModal(el.dataset.k);
    });
  }else{
    const st=charDexStats();
    let h='<div class="small" style="margin-top:8px">なかま <b style="color:var(--accent2)">'+st.owned+'</b> / '+st.total+'体</div>'+
      dexProgHTML(st.owned, st.total)+'<div id="dexCharGrid">';
    CHARS.forEach(c=>{
      const rec=G.chars[c.id];
      const dup=(rec&&rec.dup)||0;
      h+= rec
        ? '<div class="dexchar own" data-id="'+c.id+'">'+(c.limited?'<div class="ltdmini">限定</div>':"")+
          '<div class="dface">'+c.face+'</div>'+
          '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; font-size:10px">'+CHAR_RAR[c.rar-1]+(dup? " +"+dup:"")+'</div>'+
          '<div class="dname">'+esc(c.name)+'</div>'+
          (c.sk? '<div class="cskill">✦ '+esc(c.sk.n)+'</div>':'')+'</div>'
        : '<div class="dexchar miss">'+(c.limited?'<div class="ltdmini">限定</div>':"")+
          '<div class="dface">'+c.face+'</div>'+
          '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; font-size:10px">'+CHAR_RAR[c.rar-1]+'</div>'+
          '<div class="dname">？？？</div></div>';
    });
    h+='</div>';
    box.innerHTML=h;
    box.querySelectorAll(".dexchar.own").forEach(el=>{
      el.onclick=()=>{
        const c=byChar[el.dataset.id];
        if(c && c.sk) toast(c.name+" ─ ✦"+c.sk.n+"("+skillDesc(c.sk)+")");
      };
    });
  }
}

function openDex(mode){
  if(mode) dexMode=mode;
  openModal('<h3>📕 図鑑</h3>'+
    '<div class="seg" id="dexSeg">'+
      '<button data-m="cards">カード</button>'+
      '<button data-m="chars">なかま</button>'+
    '</div>'+
    '<div id="dexBody"></div>');
  $("dexSeg").querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{ dexMode=b.dataset.m; renderDexBody(); };
  });
  renderDexBody();
}
