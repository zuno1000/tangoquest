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

let dexMode="cards", dexPos="all", dexLearn="all", dexQ="", dexCharSort="dex"; // 図鑑の絞り込み状態

function dexProgHTML(cur, total){
  return '<div class="dexprog"><i style="width:'+Math.min(100, Math.round(100*cur/Math.max(1,total)))+'%"></i></div>';
}

/* カード図鑑の絞り込み(v4.13.0): 品詞×習得状態×英字検索。純関数=テスト可能 */
function dexWordMatch(w, pos, learn, q){
  if(pos!=="all" && w.pos!==pos) return false;
  if(q && w.en.toLowerCase().indexOf(q)<0) return false;
  if(learn!=="all"){
    const st=G.words[w.en];
    if(learn==="mas")   return !!st && st[0]>=MASTER_BOX;
    if(learn==="learn") return !!st && st[0]<MASTER_BOX;  // 取り組んでいる(着手済み・未習得)
    if(learn==="new")   return !st;                        // まだ出題されていない
  }
  return true;
}

function renderDexBody(){
  const box=$("dexBody"); if(!box) return;
  $("dexSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("active", b.dataset.m===dexMode));
  if(dexMode==="cards"){
    const st=cardDexStats(), m=cardDexMap();
    /* グリッドだけを作る(検索入力のたびに呼ぶ=入力欄を作り直さずフォーカスを保つ) */
    const buildGrid=()=>{
      let g="", n=0;
      WORDS.forEach(w=>{
        if(!dexWordMatch(w, dexPos, dexLearn, dexQ)) return;
        n++;
        const rar=m[w.en]||0;
        const stw=G.words[w.en], mas=stw && stw[0]>=MASTER_BOX;
        g+= rar
          ? '<div class="dexcell own" data-k="'+esc(keyOf(w.en,rar,0))+'"><div class="den">'+esc(w.en)+'</div>'+
            '<div class="dst rc'+rar+'">'+RAR_STARS[rar-1]+'</div>'+(mas? '<div class="dmas">✓覚えた</div>':'')+'</div>'
          : '<div class="dexcell miss"><div class="den">'+esc(w.en)+'</div>'+(mas? '<div class="dmas">✓覚えた</div>':'')+'</div>';
      });
      return {g: g||'<div class="empty" style="grid-column:1/-1">該当する単語がない</div>', n};
    };
    let h='<div class="small" style="margin-top:8px">カード <b style="color:var(--accent2)">'+st.owned+'</b> / '+st.total+
      '種 ・ 覚えた <b style="color:var(--ok)">'+st.mastered+'</b>語</div>'+dexProgHTML(st.owned, st.total)+
      '<input id="dexSearch" class="dexsearch" type="search" autocomplete="off" '+
        'placeholder="🔍 単語を検索(英字)" value="'+esc(dexQ)+'">'+
      '<div class="seg" id="dexPosSeg">'+["all","n","adj","v","adv"].map(p=>
        '<button data-p="'+p+'" class="'+(p===dexPos?"active":"")+'">'+(p==="all"?"全て":POS_LABEL[p])+'</button>').join("")+'</div>'+
      '<div class="seg" id="dexLearnSeg">'+[["all","全て"],["mas","✓覚えた"],["learn","学習中"],["new","未学習"]].map(([k,l])=>
        '<button data-l="'+k+'" class="'+(k===dexLearn?"active":"")+'">'+l+'</button>').join("")+'</div>'+
      '<div class="small" id="dexCount" style="margin:2px 4px"></div>'+
      '<div id="dexGrid"></div>';
    box.innerHTML=h;
    const upd=()=>{
      const r=buildGrid();
      $("dexGrid").innerHTML=r.g;
      // 絞り込み中だけ件数を出す(全件表示では冗長)
      $("dexCount").textContent=(dexQ || dexLearn!=="all" || dexPos!=="all")? '該当 '+r.n+'語' : '';
    };
    upd();
    $("dexSearch").oninput=e=>{ dexQ=e.target.value.trim().toLowerCase(); upd(); };
    $("dexPosSeg").querySelectorAll("button").forEach(b=>{
      const set=()=>{ if(dexPos!==b.dataset.p){ dexPos=b.dataset.p; renderDexBody(); } };
      b.onclick=set; bindTap(b, set); // pointerup併用: スクロール直後でも1タップで切り替わる
    });
    $("dexLearnSeg").querySelectorAll("button").forEach(b=>{
      const set=()=>{ if(dexLearn!==b.dataset.l){ dexLearn=b.dataset.l; renderDexBody(); } };
      b.onclick=set; bindTap(b, set);
    });
    // クリックは委譲1本(セルごとのリスナー2,500個を作らない=軽量化)
    $("dexGrid").onclick=e=>{
      const cell=e.target.closest(".dexcell.own");
      if(cell) openCardModal(cell.dataset.k);
    };
  }else{
    const st=charDexStats();
    let h='<div class="small" style="margin-top:8px">なかま <b style="color:var(--accent2)">'+st.owned+'</b> / '+st.total+'体</div>'+
      dexProgHTML(st.owned, st.total)+
      '<div class="seg" id="dexCharSortSeg">'+[["dex","図鑑順"],["rar","レア"],["pow","力"],["dup","突破"]].map(([k,l])=>
        '<button data-s="'+k+'" class="'+(k===dexCharSort?"active":"")+'">'+l+'</button>').join("")+'</div>'+
      '<div id="dexCharGrid">';
    CHARS.slice().sort(charCmp(dexCharSort)).forEach(c=>{
      const rec=G.chars[c.id];
      const dup=(rec&&rec.dup)||0;
      h+= rec
        ? '<div class="dexchar own" data-id="'+c.id+'">'+(c.limited?'<div class="ltdmini">限定</div>':"")+
          '<div class="dface">'+charFace(c)+'</div>'+
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
    $("dexCharSortSeg").querySelectorAll("button").forEach(b=>{
      const set=()=>{ if(dexCharSort!==b.dataset.s){ dexCharSort=b.dataset.s; renderDexBody(); } };
      b.onclick=set; bindTap(b, set);
    });
    $("dexCharGrid").onclick=e=>{
      const cell=e.target.closest(".dexchar.own");
      if(cell) openCharModal(cell.dataset.id, {back:true}); // 能力の詳細(図鑑へ戻れる)
    };
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
    const set=()=>{ if(dexMode!==b.dataset.m){ dexMode=b.dataset.m; renderDexBody(); } };
    b.onclick=set; bindTap(b, set); // pointerup併用: スクロール直後でも1タップで切り替わる
  });
  renderDexBody();
}
