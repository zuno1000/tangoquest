"use strict";
/* ================= マイ単語(v5.11.0) =================
   実機FB「英語長文読解をしていてわからなかった単語を簡単に登録できる仕組みが欲しい
   (日本語の意味などは後から自動で追加されているとなお良い)」への回答。

   設計:
   ・登録=単語を貼るだけ(1行1語・カンマ区切りも可)。「単語 — 日本語」と書けば意味も同時に登録。
     意味が無い語は「意味待ち」として登録し、あとから自動で埋める(端末が取りに行く)。
   ・意味の自動取得=無料の翻訳エンドポイント(Google翻訳の辞書拡張用→MyMemory)に単語だけを送る。
     取れない日は「意味待ち」のまま残り、次回起動・オンライン復帰・登録画面を開いたときに再挑戦。
     LLMに頼む道も用意(意味待ちの語を「単語 — 品詞 — 日本語」で返してもらい貼り付ける)。
   ・品詞=語尾からの推定(タップで変更)。4択の誤答は内蔵の同じ品詞から自動生成=手間ゼロ。
   ・学習への統合=WORDS/byEnへの合流(内蔵語と同じSRS・カード・図鑑・ペース計算に乗る)。
     未出題のマイ単語は新規の中で優先して出す(登録した直後に会える)。
   ・内蔵の2,500語に同じ語があるときは「優先出題の印」だけを付ける(ref:1)。
   ・保存=G.myw(en→{ja,pos,at}/削除は{del:1,at}/内蔵参照は{ref:1,at})。同期は項目ごとの操作時刻LWW
     (マイフレーズと同じ型)。部分リセットでも残す(ユーザーの資産)。
   可逆設計: このファイル+pickWordの優先1点+入口(➕/今日の英語/設定)で完結 */

const MYW_MAX_WORDS=6; // 句動詞・慣用表現(at the end of the day 等)も許す上限
const MYW_POS_CYCLE=["v","n","adj","adv"];

/* 単語の正規化(記録キー): 小文字・前後の記号を落とす・空白は1つに。単語でなければ "" */
function mywNorm(s){
  s=String(s||"").toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g," ").trim()
    .replace(/^[^a-z]+|[^a-z]+$/g,"");
  if(!s || !/^[a-z][a-z' -]*$/.test(s)) return "";
  if(s.split(" ").length>MYW_MAX_WORDS) return "";
  return s;
}
/* 複数語の表現(句動詞・慣用句)の品詞推定(v5.11.1実機FB「what if / in tandem のような句動詞も登録したい」)。
   このアプリの品詞は v/n/adj/adv の4つ(カードの役割・4択の誤答プール)なので、表現の「文中での働き」で振り分ける:
   ・動詞+小辞/前置詞(put up with・look into・take for granted)=v  … 先頭が句動詞によくある動詞
   ・前置詞句・副詞句(in tandem・by and large・at stake・on the fly)=adv … 先頭が前置詞
   ・接続・疑問の表現(what if・as if・even though・no matter what)=adv … 文をつなぐ働き=副詞の枠
   ・名詞句(rule of thumb・red tape・a blessing in disguise)=n … 上記以外の既定
   ・形容詞的(state of the art・up to date・well off)は語尾で拾えないので既定のn→タップで変更 */
const MYW_PREP=new Set("in on at by out off over under with without for from to of up down beyond behind across against along among around before between into through throughout till until upon within above below after".split(" "));
const MYW_CONJ=new Set("what as even if so no not that whether how why when where while though although whatever whenever wherever however once unless lest".split(" "));
const MYW_VERB_HEADS=new Set(("put take get go come look make give turn bring call carry set run hold keep break pull back bear stand fall figure work pick cut hand let live pass pay play point rule see show sort stick tell think throw try wear wind do drop end face fill find hang head lay lead leave lie move own phase rely resort sign step talk tear walk wrap zero account add boil catch check close count deal die dwell opt pin press push read reach roll settle shrug single speak spell stem tie touch weigh write "+
  "act bank bring brush build burn buy chip clear cling cool crack crop draw drift ease eat fend fit fold follow gear grow hit hold iron jump kick knock lash latch lay live log lose map mull narrow nod open pan pare pass peter piece play plow pore prop rack ramp rein rope rub scale scrape screw seal shake shell shoot shut sit size slip smooth snap spring square stack stamp stave stir string strip stumble tag tamper tap tease tide tip toe top toss track trade trail trip tune usher wade ward wash water wave weed whip win wipe work zone").split(" "));
function mywGuessPosMulti(en){
  const ws=en.split(" "), first=ws[0], last=ws[ws.length-1];
  // 「X of Y」(rule of thumb・state of the art・piece of cake)は名詞句。ただし get rid of / take care of は動詞
  if(ws.length>=3 && ws[1]==="of" && !/^(get|take|make|have|be|keep|lose|run)$/.test(first)) return "n";
  if(MYW_VERB_HEADS.has(first)) return "v";
  if(/^(be|being|get|make|take|have|keep|go|come|put|set|turn|give|bring|let|call|hold|look)$/.test(first)) return "v";
  if(/(ate|ize|ise|ify)$/.test(first) && first.length>5) return "v";   // alleviate the pressure 等
  if(MYW_PREP.has(first)) return "adv";                                   // 前置詞句(in tandem・at stake)
  if(MYW_CONJ.has(first)) return "adv";                                   // 接続・疑問の表現(what if・as if)
  if(/^(a|an|the)$/.test(first)) return "n";                              // 名詞句(a blessing in disguise)
  if(ws.length===2 && /(ly)$/.test(first) && first.length>4) return "adj"; // 副詞+形容詞(highly regarded)
  if(ws.length===2 && MYW_PREP.has(last)) return "v";                    // 動詞+小辞(pore over 等・先頭が辞書外でも)
  return "n";
}
/* 品詞の推定(語尾)。分からなければ名詞 */
function mywGuessPos(en){
  const w=en.split(" ")[0];
  if(en.indexOf(" ")>0) return mywGuessPosMulti(en); // 句動詞・慣用表現(v5.11.1)
  if(/ly$/.test(w) && w.length>4) return "adv";
  if(/(ate|ize|ise|ify|fy|en|ish)$/.test(w) && w.length>5) return "v";
  if(/(ous|ive|al|ful|less|ic|ical|able|ible|ant|ent|ary|ory|ish|like|some)$/.test(w)) return "adj";
  if(/(tion|sion|ment|ness|ity|ance|ence|ship|hood|ism|ist|er|or|age|ure|dom|cy)$/.test(w)) return "n";
  return "n";
}
/* 品詞の表記ゆれ→記号 */
function mywPosOf(t){
  t=String(t||"").toLowerCase().replace(/[()（）\.]/g,"").trim();
  if(/^(v|vt|vi|verb|動詞|動)$/.test(t)) return "v";
  if(/^(n|noun|名詞|名)$/.test(t)) return "n";
  if(/^(adj|a|adjective|形容詞|形)$/.test(t)) return "adj";
  if(/^(adv|adverb|副詞|副)$/.test(t)) return "adv";
  return "";
}
/* 貼り付けテキストの解析(純関数): 1行1語(またはカンマ・セミコロン区切り)。
   「単語 — 日本語」「単語: 日本語」「単語 (v) 日本語」「単語 — 動詞 — 日本語」を読み取る。
   先頭の番号・記号(1. / - / ・)は落とす。戻り値=[{en, ja, pos}](enが取れた行だけ・重複は最初の1つ) */
function mywParse(text){
  const out=[], seen={};
  String(text||"").split(/\n+/).forEach(line=>{
    line=line.replace(/\*\*|__|`/g,"").replace(/^\s*(?:[-*・•●]|\d+[.)、]|\(\d+\))\s*/,"").trim();
    if(!line) return;
    // 区切りが「意味」を伴わない行(単語だけの列挙)はカンマ・セミコロン・スラッシュで分ける
    const hasJa=/[぀-ヿ一-鿿]/.test(line);
    const parts=hasJa? [line] : line.split(/[,;／/]+/);
    parts.forEach(part=>{
      part=part.trim(); if(!part) return;
      let en="", ja="", pos="", ex="";
      // 区切り: — – : ： = → タブ、または空白に挟まれた -(well-beingのような語中のハイフンは区切らない)
      const m=part.match(/^([A-Za-z][A-Za-z' -]{0,40}?)\s*(?:[—–:：=→\t]+|\s-+\s|(?=[（(])|(?=[぀-ヿ一-鿿]))\s*(.*)$/);
      if(m && m[2]!==undefined && (hasJa || /[（(]/.test(part))){
        en=m[1]; let rest=m[2].trim();
        // 品詞のかっこ書き/区切り: "(v)" "動詞 —" "adj:"
        const pm=rest.match(/^[（(]?\s*([A-Za-z]+\.?|動詞|名詞|形容詞|副詞|動|名|形|副)\s*[)）]?\s*(?:[—–\-:：=]+)?\s*(.*)$/);
        if(pm && mywPosOf(pm[1])){ pos=mywPosOf(pm[1]); rest=pm[2].trim(); }
        rest=rest.replace(/^[—–\-:：=\s]+/,"").trim();
        // 「単語 — 日本語 — 用例(英文)」(v5.12.0): 区切りの後ろの区画から、日本語=意味・英語3語以上=用例
        const segs=rest.split(/\s*(?:[—–|]|\t)\s*/).map(s=>s.trim()).filter(Boolean);
        ja=segs.find(s=>/[぀-ヿ一-鿿]/.test(s))||"";
        ex=segs.find(s=>s!==ja && (s.match(/[A-Za-z]+/g)||[]).length>=3)||"";
      }else{
        en=part;
      }
      en=mywNorm(en);
      if(!en || seen[en]) return;
      seen[en]=1;
      out.push({en, ja, pos:pos||mywGuessPos(en), ex});
    });
  });
  return out;
}

/* ---- 台帳 ---- */
function mywActive(){ return Object.keys(G.myw||{}).filter(en=>{ const m=G.myw[en]; return m && !m.del; }); }
function mywList(){ // 自分で定義した語(内蔵参照は含まない)。新しい順
  return mywActive().filter(en=>!G.myw[en].ref).map(en=>Object.assign({en}, G.myw[en])).sort((a,b)=>(b.at||0)-(a.at||0));
}
function mywPending(){ return mywList().filter(m=>!m.ja); } // 意味待ち
function isMyWord(en){ const m=G.myw && G.myw[en]; return !!(m && !m.del && !m.ref); }
function mywWanted(en){ const m=G.myw && G.myw[en]; return !!(m && !m.del); } // 優先出題の対象(自作+内蔵参照)
/* WORDS/byEnへの合流(意味のある語だけ)。冪等 */
function mywMount(en){
  const m=G.myw[en]; if(!m || m.del || m.ref || !m.ja) return false;
  if(byEn[en]){ byEn[en].ja=m.ja; byEn[en].pos=m.pos||"n"; byEn[en].my=1; return true; }
  const w={en, ja:m.ja, pos:m.pos||"n", my:1};
  WORDS.push(w); byEn[en]=w;
  return true;
}
function mywUnmount(en){
  const w=byEn[en]; if(!w || !w.my) return;
  const i=WORDS.indexOf(w); if(i>=0) WORDS.splice(i,1);
  delete byEn[en];
}
function mywApply(){ mywActive().forEach(mywMount); }
/* 登録の本体(UIとテストの共用)。ex=出会った文(任意・v5.12.0)/src=出典の題名(任意)。戻り値={en, ref?, pending?} か {err} */
function mywAdd(en, ja, pos, ex, src){
  en=mywNorm(en); ja=String(ja||"").replace(/\s+/g," ").trim();
  ex=String(ex||"").replace(/\s+/g," ").trim().slice(0,200); src=String(src||"").trim().slice(0,80);
  pos=MYW_POS_CYCLE.indexOf(pos)>=0? pos : mywGuessPos(en);
  if(!en) return {err:"英単語として読み取れない"};
  G.myw=G.myw||{};
  const cur=G.myw[en];
  if(byEn[en] && !byEn[en].my){ // 内蔵に同じ語=優先出題の印だけ
    if(cur && !cur.del && cur.ref) return {err:en+" は登録済み(内蔵の語・優先出題中)"};
    G.myw[en]={ref:1, at:Date.now()}; saveG();
    return {en, ref:1};
  }
  if(cur && !cur.del){
    if(cur.ja || !ja) return {err:en+" はすでに登録済み"};
    cur.ja=ja; cur.pos=pos; cur.at=Date.now(); if(ex) cur.ex=ex; if(src && !cur.src) cur.src=src; mywMount(en); saveG(); // 意味待ちを埋める
    return {en};
  }
  G.myw[en]={ja, pos, at:Date.now()};
  if(ex) G.myw[en].ex=ex;
  if(src) G.myw[en].src=src;
  if(ja) mywMount(en);
  saveG();
  return {en, pending:!ja};
}
/* 意味・品詞の手直し */
function mywUpdate(en, ja, pos){
  const m=G.myw[en]; if(!m || m.del || m.ref) return false;
  ja=String(ja||"").replace(/\s+/g," ").trim();
  if(ja) m.ja=ja;
  if(MYW_POS_CYCLE.indexOf(pos)>=0) m.pos=pos;
  m.at=Date.now();
  if(m.ja) mywMount(en);
  saveG(); return true;
}
/* 削除(トンボストーン=同期で他端末にも伝播)。SRS記録・カード・編成からも外す */
function mywDelete(en){
  const m=G.myw[en]; if(!m) return;
  G.myw[en]={del:1, at:Date.now()};
  if(!m.ref){
    mywUnmount(en);
    delete G.words[en];
    for(const k in G.inv){ if(k.split("|")[0]===en) delete G.inv[k]; }
    if(G.party && Array.isArray(G.party.sentence)) G.party.sentence=G.party.sentence.filter(k=>!(k && String(k).split("|")[0]===en));
  }
  saveG();
}
/* 未出題のマイ単語(優先出題の候補・純関数寄り) */
function mywUnseen(g){
  return mywActive().filter(en=>byEn[en] && !g.words[en]).map(en=>byEn[en]);
}

/* ---- 意味の自動取得(無料・単語だけを送る) ----
   1) Google翻訳の辞書拡張用エンドポイント(CORS可・キー不要): ["軽減する"]
   2) MyMemory(CORS可・匿名は1日5,000文字): {responseData:{translatedText}}
   どちらも「日本語が返らない/英語のまま」は失敗扱い */
const MYW_ENDPOINTS=[
  {name:"google", url:en=>"https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=ja&q="+encodeURIComponent(en),
    pick:j=>Array.isArray(j)? (typeof j[0]==="string"? j[0] : (Array.isArray(j[0])? j[0][0] : "")) : ""},
  {name:"mymemory", url:en=>"https://api.mymemory.translated.net/get?q="+encodeURIComponent(en)+"&langpair=en|ja",
    pick:j=>(j && j.responseData && j.responseData.translatedText)||""},
];
function mywJaOk(ja, en){
  ja=String(ja||"").trim();
  if(!ja || ja.length>40) return "";
  if(!/[぀-ヿ一-鿿]/.test(ja)) return "";
  if(ja.toLowerCase()===String(en).toLowerCase()) return "";
  return ja;
}
async function mywFetchJa(en){
  for(const ep of MYW_ENDPOINTS){
    try{
      const ctrl=("AbortController" in window)? new AbortController() : null;
      const tm=ctrl? setTimeout(()=>ctrl.abort(), 8000) : null;
      const r=await fetch(ep.url(en), ctrl? {signal:ctrl.signal} : {});
      if(tm) clearTimeout(tm);
      if(!r.ok) continue;
      const ja=mywJaOk(ep.pick(await r.json()), en);
      if(ja) return ja;
    }catch(e){ /* 次のエンドポイントへ */ }
  }
  return "";
}
let mywFilling=false;
/* 意味待ちの語を順に埋める(1回に最大20語・直列)。done(n)=埋まった数 */
function mywFillPending(done){
  if(mywFilling || !navigator.onLine){ if(done) done(0); return; }
  const list=mywPending().slice(0, 20);
  if(!list.length){ if(done) done(0); return; }
  mywFilling=true;
  (async()=>{
    let n=0;
    for(const m of list){
      const ja=await mywFetchJa(m.en);
      const cur=G.myw[m.en];
      if(ja && cur && !cur.del && !cur.ja){ cur.ja=ja; cur.auto=1; mywMount(m.en); n++; }
    }
    if(n){ saveG(); toast("📝 マイ単語 "+n+"語の意味を取り込んだ(学習に混ざる)"); }
    mywFilling=false;
    if(done) done(n);
  })();
}
/* 意味待ちの語をLLMに頼む依頼文(貼り付けて戻すだけで登録できる形式を指定) */
function mywPromptText(list){
  return "次の英単語・表現(句動詞や慣用句を含む)について、英検1級レベルの学習者向けに「日本語の意味」と「品詞」を教えてください。\n"+
    "出力は1行1語で、必ず次の形式だけにしてください(アプリにそのまま貼り付けて登録します):\n"+
    "単語 — 品詞 — 日本語の意味(簡潔に、区切りは「、」)\n品詞は v / n / adj / adv のいずれか(句動詞は v、前置詞句・つなぎの表現は adv、名詞句は n)。\n\n"+
    list.map(m=>m.en).join("\n");
}

/* ---- UI ---- */
const POS_SHORT={v:"動", n:"名", adj:"形", adv:"副"};
/* ➕の入口: 単語/フレーズの切替セグ(両モーダルの先頭に置く) */
function addSegHTML(active){
  return '<div class="seg metaseg" id="addSeg"><button data-a="w"'+(active==="w"?' class="active"':'')+'>📝 単語</button>'+
    '<button data-a="p"'+(active==="p"?' class="active"':'')+'>💬 フレーズ</button></div>';
}
function bindAddSeg(){
  const s=$("addSeg"); if(!s) return;
  s.querySelectorAll("button").forEach(b=>{ b.onclick=()=>{ if(b.dataset.a==="w") openMywAdd(); else openMyphrAdd(); }; });
}
function openMywAdd(prefill, src){
  const pend=mywPending().length;
  openModal('<h3>📝 マイ単語登録 '+helpBtn("hlp-myw")+'</h3>'+
    helpNote("hlp-myw", '記事を読んでいて分からなかった単語を、自分専用の単語として登録する。<b>単語を貼るだけ</b>(1行1語・カンマ区切りでも可)。'+
      '意味は<b>あとから自動で取り込む</b>(無料の翻訳エンドポイントに単語だけを送る。取れない日は「意味待ち」として残り、次に開いたとき再挑戦)。'+
      '「単語 — 日本語」と書けば意味も同時に登録でき、LLMの語彙一覧(今日の英語のプロンプト)をそのまま貼るとまとめて登録できる。'+
      '「単語 — 日本語 — 出会った英文」と3つ目に文を添えると、答え合わせのときにその文が出る(文脈つきの方が覚えやすい)。<br><br>'+
      '登録した語は内蔵の単語と同じ復習・カード・図鑑に乗り、<b>未出題のうちは新規の中で優先して出る</b>。内蔵の2,500語に同じ語があれば、その語を優先出題にする。'+
      '<b>句動詞・慣用表現も登録できる</b>(put up with・in tandem・what if・rule of thumb など6語まで)。品詞は語尾や先頭の語から推定'+
      '(動詞+小辞=動詞/前置詞句・つなぎの表現=副詞/名詞句=名詞。4択の誤答は同じ品詞の内蔵語から自動生成)。タップで変更できる。<br><br>'+
      '<b>プライバシー</b>: 登録内容はこの端末と、同期を使う場合はあなた自身のGoogleドライブの非公開領域にだけ保存される。意味の取得で外部に送るのは単語だけ')+
    addSegHTML("w")+
    '<textarea id="mywText" class="myta" rows="4" placeholder="単語を1行ずつ(例: abate)\n意味も書くなら「abate — 和らぐ」">'+esc(prefill||"")+'</textarea>'+
    '<button class="btn" id="mywPaste" style="margin-top:8px; width:100%">📋 クリップボードから貼り付け</button>'+
    '<div id="mywPrev" style="margin-top:10px"></div>'+
    '<div class="row" style="gap:10px; margin-top:12px">'+
    '<button class="btn" id="mywListBtn">📚 登録済み '+mywList().length+'語'+(pend? '<span class="hlsub">意味待ち '+pend+'</span>':'')+'</button>'+
    '<button class="btn primary grow" id="mywSave" disabled>登録する</button></div>');
  bindAddSeg();
  const ta=$("mywText");
  let items=[];
  const renderPrev=()=>{
    const box=$("mywPrev");
    if(!items.length){ box.innerHTML=""; $("mywSave").disabled=true; return; }
    box.innerHTML='<div class="small" style="margin-bottom:4px">'+items.length+'語 ─ 品詞はタップで変更(動/名/形/副)</div>'+
      '<div class="panel">'+items.map((it,i)=>{
        const m=G.myw && G.myw[it.en], bi=byEn[it.en];
        let note;
        if(bi && !bi.my) note='<span class="qmas">内蔵にある → 優先出題に</span>'+(G.words[it.en]? ' ・ 定着 '+G.words[it.en][0]+'/'+MASTER_BOX : '');
        else if(m && !m.del) note='<span class="small">登録済み'+(m.ja? '':'(意味待ち)')+'</span>';
        else note=(it.ja? esc(it.ja) : '<span style="color:var(--accent2)">意味は自動で取得</span>')+(it.ex? '<br><span class="myexs">📝 '+esc(it.ex)+'</span>':'');
        return '<div class="myrow"><button class="wchip poschip pos'+it.pos+' mywpos" data-i="'+i+'"'+((bi&&!bi.my)?' disabled':'')+'>'+POS_SHORT[it.pos]+'</button>'+
          '<div class="grow"><b style="font-size:14px">'+esc(it.en)+'</b><br><span class="small">'+note+'</span></div></div>';
      }).join("")+'</div>';
    box.querySelectorAll(".mywpos").forEach(b=>{
      b.onclick=()=>{ const it=items[+b.dataset.i]; it.pos=MYW_POS_CYCLE[(MYW_POS_CYCLE.indexOf(it.pos)+1)%MYW_POS_CYCLE.length]; renderPrev(); };
    });
    $("mywSave").disabled=false;
  };
  const reparse=()=>{ items=mywParse(ta.value); renderPrev(); };
  ta.oninput=reparse;
  if(prefill) reparse();
  $("mywPaste").onclick=()=>{
    if(!navigator.clipboard || !navigator.clipboard.readText){ toast("この環境では手動で貼り付けてください"); return; }
    navigator.clipboard.readText().then(t=>{ ta.value=(ta.value? ta.value+"\n":"")+t; reparse(); })
      .catch(()=>toast("貼り付けが許可されなかった ─ 長押しで貼り付けてください"));
  };
  $("mywListBtn").onclick=openMywList;
  $("mywSave").onclick=()=>{
    let added=0, ref=0, pend2=0, errs=[];
    items.forEach(it=>{
      const r=mywAdd(it.en, it.ja, it.pos, it.ex, src);
      if(r.err){ errs.push(r.err); return; }
      if(r.ref) ref++; else { added++; if(r.pending) pend2++; }
    });
    const parts=[];
    if(added) parts.push("📝 "+added+"語を登録"+(pend2? "(意味は自動で取得中)":""));
    if(ref) parts.push(ref+"語は内蔵にあり優先出題に");
    if(errs.length) parts.push(errs[0]+(errs.length>1? " ほか"+(errs.length-1)+"件":""));
    toast(parts.join(" ・ ")||"登録できる語がない");
    ta.value=""; items=[]; renderPrev();
    const lb=$("mywListBtn"); if(lb) lb.innerHTML="📚 登録済み "+mywList().length+"語"+(mywPending().length? '<span class="hlsub">意味待ち '+mywPending().length+'</span>':'');
    if(pend2) mywFillPending(()=>{ const l2=$("mywListBtn"); if(l2) l2.innerHTML="📚 登録済み "+mywList().length+"語"+(mywPending().length? '<span class="hlsub">意味待ち '+mywPending().length+'</span>':''); });
  };
}
function openMywList(){
  const list=mywList(), pend=mywPending();
  const refs=mywActive().filter(en=>G.myw[en].ref && byEn[en]);
  openModal('<h3>📚 マイ単語('+list.length+'語)</h3>'+
    '<div class="small">この端末(と本人のDrive)にだけ保存 ─ 誰にも共有されない。意味・品詞はタップで手直しできる</div>'+
    (pend.length
      ? '<div class="panel" style="margin-top:8px"><b>⏳ 意味待ち '+pend.length+'語</b><div class="small" style="margin-top:4px">自動取得に失敗した語。もう一度取りに行くか、LLMに頼んだ答えを貼り付けて登録する</div>'+
        '<div class="row" style="gap:8px; margin-top:8px"><button class="btn grow" id="mywRetry">🔄 もう一度取得</button>'+
        '<button class="btn grow" id="mywLLM">📋 LLMに頼む</button></div></div>':'')+
    (list.length
      ? '<div class="panel" style="margin-top:8px">'+list.map(m=>{
          const st=G.words[m.en];
          return '<div class="myrow"><button class="wchip poschip pos'+(m.pos||"n")+' mywpos2" data-en="'+esc(m.en)+'">'+POS_SHORT[m.pos||"n"]+'</button>'+
            '<div class="grow"><b style="font-size:14px">'+esc(m.en)+'</b> '+
            '<button class="mywja" data-en="'+esc(m.en)+'">'+(m.ja? esc(m.ja) : '<span style="color:var(--accent2)">意味待ち ─ タップで入力</span>')+'</button><br>'+
            '<span class="small">'+(st? '定着 '+st[0]+'/'+MASTER_BOX+(st[3]? ' ・ <span class="qx">ミス '+st[3]+'</span>':'') : (m.ja? '未出題(優先して出る)':'意味が入ると出題される'))+(m.auto? ' ・ 自動取得':'')+(m.src? ' ・ 📰'+esc(m.src.slice(0,24)):'')+'</span>'+
            (m.ex? '<br><span class="small myexs">📝 '+esc(m.ex)+'</span>':'')+'</div>'+
            '<button class="btn mydel wdict" data-en="'+esc(m.en)+'">🔍</button><button class="btn mydel mywdel" data-en="'+esc(m.en)+'">🗑</button></div>';
        }).join("")+'</div>'
      : '<div class="empty">まだ無い ─ 読んでいて分からなかった単語を貼り付けて登録しよう</div>')+
    (refs.length? '<div class="small" style="margin-top:8px">内蔵の語を優先出題に: '+refs.slice(0,20).map(esc).join("・")+(refs.length>20? ' ほか'+(refs.length-20)+'語':'')+'</div>':'')+
    '<div class="row" style="margin-top:12px"><button class="btn primary grow" id="mywAddBtn">➕ 登録する</button></div>');
  const m=$("modal");
  m.querySelectorAll(".mywdel").forEach(b=>{ b.onclick=()=>{ mywDelete(b.dataset.en); toast("削除した(同期で他の端末にも反映)"); openMywList(); }; });
  m.querySelectorAll(".wdict").forEach(b=>{ b.onclick=()=>window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(b.dataset.en), "_blank", "noopener"); });
  m.querySelectorAll(".mywpos2").forEach(b=>{
    b.onclick=()=>{ const cur=G.myw[b.dataset.en]; const p=MYW_POS_CYCLE[(MYW_POS_CYCLE.indexOf(cur.pos||"n")+1)%MYW_POS_CYCLE.length]; mywUpdate(b.dataset.en, "", p); openMywList(); };
  });
  m.querySelectorAll(".mywja").forEach(b=>{
    b.onclick=()=>{
      const cur=G.myw[b.dataset.en];
      const v=prompt(b.dataset.en+" の日本語の意味", cur.ja||"");
      if(v===null) return;
      if(mywUpdate(b.dataset.en, v, "")) openMywList();
    };
  });
  if($("mywRetry")) $("mywRetry").onclick=()=>{ toast("取得中…"); mywFillPending(n=>{ if(!n) toast("取れなかった ─ 通信か翻訳の都合。LLMに頼む道もある"); if($("mywAddBtn")) openMywList(); }); };
  if($("mywLLM")) $("mywLLM").onclick=()=>openMywPrompt(pend);
  $("mywAddBtn").onclick=()=>openMywAdd();
}
/* 今日の英語から開くときの出典(いま出ている記事/番組の題名)。無ければ空 */
function rlCurrentTitle(kind){
  const st=(typeof rlState!=="undefined") && rlState[kind];
  const it=st && st.items? rlChoose(st.items, G.rl) : null;
  return it? it.t : "";
}
/* 意味待ちの語をLLMに頼む(コピー→答えを貼り付けて登録) */
function openMywPrompt(list){
  openModal('<h3>📋 意味をLLMに頼む</h3>'+
    '<div class="small" style="margin-bottom:6px">コピーしてLLMに貼る → 返ってきた一覧を「📝 貼り付けて登録」に貼るだけで意味が入る</div>'+
    '<textarea id="mywpText" class="myta" rows="9">'+esc(mywPromptText(list))+'</textarea>'+
    '<div class="row" style="gap:10px; margin-top:12px">'+
    '<button class="btn" id="mywpBack">◀ 戻る</button>'+
    '<button class="btn" id="mywpPaste">📝 貼り付けて登録</button>'+
    '<button class="btn primary grow" id="mywpCopy">📋 コピー</button></div>');
  $("mywpCopy").onclick=()=>rlCopy($("mywpText").value, $("mywpText"));
  $("mywpBack").onclick=openMywList;
  $("mywpPaste").onclick=()=>openMywAdd();
}

/* 起動時: 定義をWORDSへ合流し、意味待ちがあれば少し待ってから取りに行く。オンライン復帰でも再挑戦 */
mywApply();
setTimeout(()=>mywFillPending(), 2500);
window.addEventListener("online", ()=>setTimeout(()=>mywFillPending(), 1500));
