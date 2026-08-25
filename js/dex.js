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
let dexPhrLearn="all", dexPhrCat="all", dexPhrQ=""; // フレーズ図鑑の絞り込み(v5.7.0)

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

/* フレーズ図鑑の絞り込み(v5.7.0): カテゴリ×習得状態×検索(英字は小文字化・日本語はそのまま)。純関数 */
function dexPhrMatch(p, cat, learn, q){
  if(cat!=="all" && p.c!==cat) return false;
  if(q && p.en.toLowerCase().indexOf(q)<0 && p.ja.indexOf(q)<0) return false;
  if(learn!=="all"){
    const st=G.phr[p.en];
    if(learn==="mas")   return !!st && st[0]>=MASTER_BOX;
    if(learn==="learn") return !!st && st[0]<MASTER_BOX;
    if(learn==="new")   return !st;
  }
  return true;
}
/* フレーズ詳細(図鑑から)。核のハイライト・型・定着・お手本と辞書 */
function openPhrDexModal(en){
  const p=allPhrases().find(x=>x.en===en); if(!p) return;
  const st=G.phr[p.en];
  openModal('<h3>'+(p.c==="my"? "📝":"🗣")+' フレーズ詳細</h3>'+
    '<div class="panel" style="margin-top:8px; font-size:15px; font-weight:700; line-height:1.7">'+phrCtxHTML(p, true)+'</div>'+
    '<div class="small" style="margin-top:6px">'+esc(p.ja)+'</div>'+
    '<div style="margin-top:8px"><span class="poschip phrcat">'+(PHR_CATS[p.c]||"")+'</span>'+
      (p.pt? '<span class="rmeta">🧩 <b class="pkey">'+esc(p.pt)+'</b></span>'
           : '<span class="rmeta">🔑 <b class="pkey">'+esc(p.k)+'</b></span>')+'</div>'+
    '<table class="stt" style="margin-top:10px">'+
      '<tr><td>定着</td><td>'+(st? (st[0]>=MASTER_BOX? "✓覚えた(口頭で言えた)" : st[0]+" / "+MASTER_BOX) : "未学習")+'</td></tr>'+
      (st? '<tr><td>これまで</td><td>正解 '+st[2]+' ・ ミス '+st[3]+'</td></tr>':'')+
    '</table>'+
    '<div class="row" style="margin-top:12px; gap:8px">'+
    '<button class="btn" style="flex:1" id="pdBack">◀ 図鑑へ</button>'+
    ("speechSynthesis" in window? '<button class="btn" style="flex:1" id="pdTts">🔊 お手本</button>':'')+
    '<button class="btn" style="flex:1" id="pdDict">🔍 辞書</button></div>');
  $("pdBack").onclick=()=>openDex("phr");
  const t=$("pdTts"); if(t) t.onclick=()=>phrSay(p.en);
  $("pdDict").onclick=()=>window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(p.k), "_blank", "noopener");
}

function renderDexBody(){
  const box=$("dexBody"); if(!box) return;
  $("dexSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("active", b.dataset.m===dexMode));
  if(dexMode==="phr"){
    /* フレーズ図鑑(v5.7.0): 全フレーズ(内蔵+マイ📝)の一覧と習得状況。
       カード図鑑と同じ流儀=未学習も隠さず見せる・行はcontent-visibilityで軽量化・クリックは委譲1本 */
    const list=allPhrases();
    let pmas=0; list.forEach(p=>{ const st=G.phr[p.en]; if(st && st[0]>=MASTER_BOX) pmas++; });
    const buildList=()=>{
      let g="", n=0;
      list.forEach(p=>{
        if(!dexPhrMatch(p, dexPhrCat, dexPhrLearn, dexPhrQ)) return;
        n++;
        const st=G.phr[p.en], mas=st && st[0]>=MASTER_BOX;
        g+='<div class="phrrow'+(st? "":" miss")+'" data-en="'+esc(p.en)+'">'+
          '<div class="grow"><div class="pen">'+(p.c==="my"? "📝 ":"")+esc(p.en)+'</div>'+
          '<div class="small pja">'+esc(p.ja)+'</div></div>'+
          '<div class="pst">'+(mas? '<span class="pstm">✓覚えた</span>'
            : st? '<span class="pstl">定着'+st[0]+'/'+MASTER_BOX+'</span>'
            : '<span class="pstn">未学習</span>')+'</div></div>';
      });
      return {g: g||'<div class="empty">該当するフレーズがない</div>', n};
    };
    box.innerHTML=
      '<div class="small" style="margin-top:8px">フレーズ 全<b style="color:var(--accent2)">'+list.length+'</b>件'+
        (myphrList().length? '(📝マイ '+myphrList().length+')':'')+' ・ 覚えた <b style="color:var(--ok)">'+pmas+'</b>件</div>'+
      dexProgHTML(pmas, list.length)+
      '<input id="dexPhrSearch" class="dexsearch" type="search" autocomplete="off" '+
        'placeholder="🔍 フレーズを検索(英語・日本語)" value="'+esc(dexPhrQ)+'">'+
      '<select id="dexPhrCat" class="dexsel"><option value="all">全カテゴリ</option>'+
        Object.keys(PHR_CATS).map(c=>'<option value="'+c+'"'+(c===dexPhrCat?" selected":"")+'>'+PHR_CATS[c]+'</option>').join("")+'</select>'+
      '<div class="seg" id="dexPhrLearnSeg">'+[["all","全て"],["mas","✓覚えた"],["learn","学習中"],["new","未学習"]].map(([k,l])=>
        '<button data-l="'+k+'" class="'+(k===dexPhrLearn?"active":"")+'">'+l+'</button>').join("")+'</div>'+
      '<div class="small" id="dexPhrCount" style="margin:2px 4px"></div>'+
      '<div id="dexPhrList"></div>';
    const upd=()=>{
      const r=buildList();
      $("dexPhrList").innerHTML=r.g;
      $("dexPhrCount").textContent=(dexPhrQ || dexPhrLearn!=="all" || dexPhrCat!=="all")? '該当 '+r.n+'件' : '';
    };
    upd();
    $("dexPhrSearch").oninput=e=>{ dexPhrQ=e.target.value.trim().toLowerCase(); upd(); };
    $("dexPhrCat").onchange=e=>{ dexPhrCat=(e&&e.target? e.target.value : $("dexPhrCat").value); upd(); };
    $("dexPhrLearnSeg").querySelectorAll("button").forEach(b=>{
      const set=()=>{ if(dexPhrLearn!==b.dataset.l){ dexPhrLearn=b.dataset.l; renderDexBody(); } };
      b.onclick=set; bindTap(b, set);
    });
    $("dexPhrList").onclick=e=>{
      const row=e.target.closest(".phrrow");
      if(row) openPhrDexModal(row.dataset.en);
    };
    return;
  }
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
      '<button data-m="phr">フレーズ</button>'+
    '</div>'+
    '<div id="dexBody"></div>');
  $("dexSeg").querySelectorAll("button").forEach(b=>{
    const set=()=>{ if(dexMode!==b.dataset.m){ dexMode=b.dataset.m; renderDexBody(); } };
    b.onclick=set; bindTap(b, set); // pointerup併用: スクロール直後でも1タップで切り替わる
  });
  renderDexBody();
}
