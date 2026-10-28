"use strict";
/* ================= 📝 分からなかった・言えなかった(v5.25.0→v5.26.0) =================
   実機FB(v5.25.0)「レッスン中に言えなかったことの振り返りと学習、言えなかったことを表現できるようになることが目的。
   スピーキングを日々強化。ただし複雑にしない」→ v5.26.0「英会話に限らず普遍的に。①意味が分からなかった英単語 ②日本語で
   思いついたが英語で言えなかったこと ③意味は分かるが話すとき出てこなかったフレーズ、の3つを、入力箇所は1つで簡単に仕分けて
   登録したい(マイ単語登録と言えなかったことを統一)。メモはLLMに送る前に個別に書き直せるように」

   設計(入口=ホームの📝パネル・学習タブの➕・今日の英語の📝):
   ・入力は1つのテキストエリア(1行1つ・英単語/英語のフレーズ/日本語を混ぜてよい)。行ごとに自動で仕分け(sayClassify):
       w=単語(英語・3語以内・文末記号なし)  → その場でマイ単語(myword.js mywAdd・意味は自動取得)=学習の4択に出る
       p=フレーズ(英語・4語以上か文)         → 「英文 — 日本語」なら即マイフレーズ/日本語が無ければ英訳待ちメモ(G.say)
       j=日本語(言えなかったこと)            → 英訳待ちメモ(G.say)
     仕分けは追加前のプレビューでチップをタップして変えられる(単語⇄フレーズ)。
   ・英訳待ちメモ: 個別に✎で書き直し・🗑・「→単語」で仕分け直し。📋依頼文をLLMに貼る(日本語→英語1文/英語の単語・表現→それを含む会話の例文1文+日本語訳・v5.26.1)→
     返ってきた「英文 — 日本語」を貼り戻す(sayImport)とマイフレーズ(G.myphr・c:"my")に登録 → ミックスの5問目ごとのフレーズに
     2回に1回優先して混ざる(phrase.js pickPhrase) = 「言えなかった」が毎日の学習で「言える」に変わる。翻訳・生成はアプリではしない
   ・v5.27.0(実機FB「フレーズだけ学習したいときは学習タブのフレーズを選ぶので、フレーズ5問は不要」): フレーズ特訓(warm)と「使えた」の振り返りは廃止。
     マイフレーズはミックス/フレーズの並べ替えで(期限が来た/未着手のものは2回に1回優先)。
   記録: G.say=id→{ja:メモ本文, t:"j"|"p", at, done?, en?}(削除は{del:1,at})。同期は操作時刻LWW(sync.js) */

const SAY_JA=/[぀-ヿ一-鿿]/;
const SAY_SEP=/\s*(?:—|–|\s-\s|\s:\s|：)\s*/; // v5.26.2: 「ー」(長音)は区切りにしない
/* 1行の仕分け(純関数): {t:"w"|"p"|"j", en, ja}。en/jaは「英文 — 日本語」の形なら分けて入れる */
function sayClassify(line){
  line=String(line||"").trim().replace(/^[\d０-９]+[.)．、]\s*|^[・\-*•]\s*/, "");
  if(!line) return null;
  let en="", ja="";
  const parts=line.split(SAY_SEP).map(s=>s.trim()).filter(Boolean);
  if(parts.length>=2 && /[A-Za-z]/.test(parts[0]) && !SAY_JA.test(parts[0]) && SAY_JA.test(parts[1])){ en=parts[0]; ja=parts.slice(1).join(" — "); }
  else if(parts.length>=2 && SAY_JA.test(parts[0]) && /[A-Za-z]/.test(parts[1]) && !SAY_JA.test(parts[1])){ ja=parts[0]; en=parts.slice(1).join(" "); }
  else if(SAY_JA.test(line) && (line.match(/[A-Za-z]/g)||[]).length<line.replace(/\s/g,"").length*0.5){ return {t:"j", en:"", ja:line}; }
  else en=line;
  en=en.replace(/\s+/g," ").trim();
  if(!/[A-Za-z]/.test(en)) return {t:"j", en:"", ja:line};
  const words=en.split(" ").length, sentence=/[.!?]$/.test(en) || /^(I|You|We|They|He|She|It|Could|Would|Can|Let|Please|What|How|Why|Do|Does|Is|Are|Should)\b/.test(en);
  const t=(words<=3 && !sentence)? "w" : "p";
  /* v5.29.0(実機FB「メモから登録した単語が正しい品詞か・既に登録済みかを確認できない」): 単語には品詞の推定(myword.js)を添える=プレビューのチップで直せる */
  const pos=(t==="w" && typeof mywGuessPos==="function")? mywGuessPos(mywNorm(en)||en) : "";
  return pos? {t, en, ja, pos} : {t, en, ja};
}
/* ---- 辞書引き(v5.35.0・実機FB「分からない単語や、日本語で思いついた語の英語をGoogleで調べてから、あらためて登録するのが億劫」) ----
   入力欄に1行だけ書いたとき、その場で引く(myword.js mywDictLookup):
     英語の単語・表現 → 和訳の候補をチップで(第一候補を選択済み=「＋ 追加」で意味つきで登録。タップで選び直し・複数可)
     日本語の短い語句 → 英語の候補を行で(品詞・意味つき。➕のワンタップでマイ単語に。入力欄は空に・候補は残る=続けて別の語も)
   文(=英訳待ちのメモ・LLMへ)・2行以上(貼り付け)・内蔵/登録済みの語(意味はプレビューのmywPrevNoteが出す)には引かない */
const SAY_LOOK_JA_MAX=14;  // 日本語はこの字数まで(単語・短い表現。それより長い文は従来どおり英訳待ちのメモ)
const SAY_LOOK_DELAY=450;  // 打ち終わりを待つms
/* 引く対象(純関数): {dir:"en"|"ja", q} か null */
function sayLookTarget(items){
  if(!items || items.length!==1 || !items[0]) return null;
  const it=items[0];
  if(it.t==="w" && !it.ja){
    const en=mywNorm(it.en); if(!en) return null;
    const m=G.myw && G.myw[en];
    if(byEn[en] || (m && !m.del)) return null;
    return {dir:"en", q:en};
  }
  if(it.t==="j"){
    const q=String(it.ja||"").trim();
    if(!q || q.length>SAY_LOOK_JA_MAX || /[。、！？!?]/.test(q) || /言いたかった|言えなかった/.test(q)) return null;
    return {dir:"ja", q};
  }
  return null;
}
/* 結果のHTML: 英→日=訳のチップ(sel=選んだ番号)/日→英=候補の行(posOv=タップで直した品詞・➕で登録) */
/* 自分で意味を書く欄(v5.36.0・実機FB「検索画面で自ら意味を入力して追加できるように」): 選んだ候補のあとに「、」でつないで登録の意味に入る。候補が無くても書ける */
function sayOwnHTML(own){ return '<input id="sayOwn" class="pdate" value="'+esc(own||"")+'" placeholder="✎ 自分の言葉で意味を書く(候補と一緒に登録できる)">'; }
function sayLookHTML(tgt, d, sel, posOv, own){
  if(tgt.dir==="en"){
    const c=mywJaCands(d);
    return '<div class="panel saylook"><div class="small">🔍 <b>'+esc(tgt.q)+'</b> の意味 ─ タップで選ぶ(複数可)→「＋ 追加」</div>'+
      '<div class="mywords" style="margin-top:6px">'+c.map((x,i)=>'<button class="wchip sayja'+(sel.indexOf(i)>=0? " ksel":"")+'" data-i="'+i+'">'+
        (x.pos? '<span class="sayjp">'+POS_SHORT[x.pos]+'</span>':'')+esc(x.ja)+'</button>').join("")+'</div>'+sayOwnHTML(own)+'</div>';
  }
  const c=mywEnCands(d, tgt.q);
  return '<div class="panel saylook"><div class="small">🔍 <b>'+esc(tgt.q)+'</b> の英語 ─ ➕でそのままマイ単語に</div>'+
    c.map((x,i)=>{
      const w=mywPrevNote({en:x.en, ja:x.ja, pos:posOv[i]||x.pos}), m=G.myw && G.myw[x.en], done=!!(m && !m.del);
      return '<div class="myrow"><button class="wchip poschip pos'+w.pos+' saycpos" data-i="'+i+'" title="品詞(タップで変更)"'+(w.builtin||done? ' disabled':'')+'>'+POS_SHORT[w.pos]+'</button>'+
        '<div class="grow small"><b style="color:var(--ink)">'+esc(x.en)+'</b><br><span class="small">'+(w.builtin? w.note : done? '<span class="qmas">登録済み</span> ─ '+esc(m.ja||x.ja) : esc(x.ja))+'</span></div>'+
        '<button class="btn sayreg'+(done? ' ok':'')+'" data-i="'+i+'"'+(done? ' disabled':'')+'>'+(done? '✓':'➕')+'</button></div>';
    }).join("")+'</div>';
}
let sayLookSeq=0, sayLookTimer=null; // 引き直しの世代(入力が変わったら古い結果は捨てる)

/* 追加(v5.26.0): 仕分けどおりに振り分ける。items=[{t,en,ja}]。戻り={w:マイ単語, p:即マイフレーズ, pend:英訳待ち, errs[]} */
function sayIntake(items){
  const r={w:0, p:0, pend:0, errs:[]}; const now=Date.now();
  const have=new Set(sayList().map(x=>x.ja));
  (items||[]).forEach((it,i)=>{
    if(!it) return;
    if(it.t==="w"){
      const pw=(typeof mywParse==="function"? mywParse(it.en+(it.ja? " — "+it.ja : ""))[0] : null)||{en:it.en, ja:it.ja, pos:"n", ex:""};
      const x=mywAdd(pw.en, pw.ja, it.pos||pw.pos, pw.ex, "メモ"); // 品詞はプレビューのチップで直した値を優先(v5.29.0)
      if(x.err) r.errs.push(x.err); else r.w++;
      return;
    }
    if(it.t==="p" && it.ja){ const x=myphrAdd(it.en, it.ja, ""); if(x.err) r.errs.push(x.err); else r.p++; return; }
    const memo=it.t==="j"? it.ja : it.en;
    if(!memo || have.has(memo)) return;
    G.say["s"+(now+i)]={ja:memo, t:it.t==="j"? "j":"p", at:now+i}; have.add(memo); r.pend++;
  });
  if(r.w+r.p+r.pend) saveG();
  return r;
}
/* テキストをまとめて追加(自動仕分け)。扱えた件数(単語+フレーズ+メモ)を返す */
function sayAdd(text){
  const items=String(text||"").split(/\n+/).map(sayClassify).filter(Boolean);
  const r=sayIntake(items);
  return r.w+r.p+r.pend;
}
function sayList(){ // 英訳待ちのメモ。古い順
  return Object.keys(G.say||{}).map(id=>Object.assign({id}, G.say[id]))
    .filter(x=>!x.del && !x.done && x.ja).sort((a,b)=>a.at-b.at);
}
function sayDoneList(){ return Object.keys(G.say||{}).filter(id=>G.say[id] && !G.say[id].del && G.say[id].done).length; }
function sayDelete(id){ if(G.say[id]){ G.say[id]={del:1, at:Date.now()}; saveG(); } }
/* メモの書き直し(v5.26.0・実機FB「LLMに送る前に個別に書き直したい」)。言語が変われば仕分けも変わる */
function sayEdit(id, text){
  const x=G.say[id]; text=String(text||"").trim();
  if(!x || x.del || !text) return false;
  const c=sayClassify(text)||{t:"j", en:"", ja:text};
  x.ja=c.t==="j"? c.ja : (c.ja? c.en+" — "+c.ja : c.en); x.t=c.t==="j"? "j":"p"; x.at=Date.now(); saveG();
  return true;
}
/* 「→単語」: 英語のメモをマイ単語として登録し直す(仕分け直し) */
function sayToWord(id){
  const x=G.say[id]; if(!x || x.del || x.done || x.t==="j") return {err:"日本語のメモは単語にできない"};
  const c=sayClassify(x.ja); const r=mywAdd(c? c.en : x.ja, c? c.ja : "", undefined, "", "メモ");
  if(r.err) return r;
  G.say[id]=Object.assign({}, x, {done:1, w:1, at:Date.now()}); saveG();
  return r;
}
/* LLMへの依頼文(コピー用): 出力を『英文 — 日本語』の1行1つに固定=貼り戻しで自動登録できる */
function sayPromptText(items){
  return "英語学習のメモです。日本語のメモは「言いたかったのに英語で言えなかったこと」、英語のメモは「意味は分かるのに話すとき出てこなかった単語・句動詞・表現」です。\n"+
    "・日本語のメモ → 会話でそのまま口に出せる自然な英語1文に(8〜12語・話し言葉として自然に。メモの内容を表す「覚えたい表現」(英検1級を目指す学習者向けに簡単すぎない言い回し)を1つ含め、それ以外の部分はやさしい語で短く)\n"+
    "・英語のメモ → その表現をそのまま含む、会話でそのまま口に出せる自然な英文1文(8〜12語・それ以外の部分はやさしい語で)を作り、日本語訳を付ける(例: wipe out → 「A sudden crisis could wipe out all our savings.」のように、私が自分の話で使えそうな場面で。メモがすでに文なら、ぎこちなければ自然に直す)\n"+
    "・出力は1行につき「英文 — 日本語 — 覚えたい表現」だけ(3つ目は英文の中にそのまま含まれる連続した語句・1〜5語。英語のメモならその表現)。メモと同じ順で1行ずつ。番号・記号・説明・空行は入れないでください(単語帳アプリにそのまま貼り付けます)\n\n"+
    items.map(x=>"・"+x.ja).join("\n");
}
/* 貼り戻しの解析(純関数): 「英文 — 日本語 — 覚えたい表現」の行を{en, ja, key}に(v5.26.2: 3列目=核の候補。2列でもよい)。
   英文だけの行も通す(jaは空)。日本語だけの行は捨てる。「ー」(長音)は区切りにしない */
function sayParse(text){
  const out=[];
  String(text||"").split(/\n+/).map(s=>s.trim().replace(/^[\d０-９]+[.)．、]\s*|^[・\-*•]\s*/, "")).filter(Boolean).forEach(l=>{
    const m=l.match(/^(.*?[A-Za-z][^—–]*?)\s*(?:—|–|\s-\s|\s:\s)\s*(.*)$/);
    let en=m? m[1].trim() : l, rest=m? m[2].trim() : "";
    if(!/[A-Za-z]/.test(en) || (en.match(/[A-Za-z]/g)||[]).length<en.replace(/\s/g,"").length*0.5) return;
    const segs=rest.split(/\s*[—–]\s*|\s-\s/).map(s=>s.trim()).filter(Boolean);
    out.push({en:en.replace(/\s+/g," "), ja:segs[0]||"", key:segs[1]||""});
  });
  return out;
}
/* 貼り戻し→マイフレーズ登録。メモとの対応: 日本語のメモ=日本語が一致/英語のメモ=英文が一致、無ければ上から順。{added, errs[]} */
function sayImport(text){
  const lines=sayParse(text), pend=sayList(); const errs=[]; let added=0;
  const norm=s=>String(s||"").toLowerCase().replace(/[\s。．、,.!?！？'’"”]/g,"");
  const like=(a,b)=>{ a=norm(a); b=norm(b); return !!a && !!b && (a===b || a.indexOf(b)>=0 || b.indexOf(a)>=0); };
  lines.forEach(ln=>{
    const hit=pend.find(x=>!x._used && x.t!=="j" && like(x.ja, ln.en))
          || pend.find(x=>!x._used && ln.ja && like(x.ja, ln.ja))
          || pend.filter(x=>!x._used)[0];
    const ja=ln.ja || (hit && hit.t==="j"? hit.ja : "");
    if(!ja){ errs.push(ln.en.slice(0,30)+": 日本語がない"); return; }
    /* 核(🔑=覚えたい部分): ①LLMが返した3列目(英文にそのまま含まれるもの) ②英語のメモ(単語・句動詞)が英文に含まれていればそれ
       ③無ければmyphrAddの自動推定(v5.26.1→v5.26.2: 日本語のメモでも「覚えたい表現」が核になる=並べ替えの狙いが定まる) */
    const inEn=s=>!!s && ln.en.toLowerCase().indexOf(String(s).toLowerCase())>=0;
    const k=inEn(ln.key)? ln.key : (hit && hit.t!=="j" && inEn(hit.ja))? hit.ja : "";
    const r=myphrAdd(ln.en, ja, k);
    if(r.err){ errs.push(ln.en.slice(0,30)+": "+r.err); return; }
    added++;
    if(hit){ hit._used=1; G.say[hit.id]=Object.assign({}, G.say[hit.id], {done:1, en:ln.en, at:Date.now()}); }
  });
  if(added) saveG();
  return {added, errs};
}


/* ---- ホームのパネル(今日の英語と同じ型・タップで詳細)。v5.26.0: 文言を削って数字だけ/v5.27.0: ボタンは✍だけ ---- */
function sayPanelHTML(){
  const pend=sayList().length, mine=myphrList().length, words=mywList().length, wp=mywPending().length;
  return '<div class="panel rlpanel" id="homeSay">'+
    '<div class="pacetop"><span>📝 マイ単語・マイフレーズ</span></div>'+ // v5.28.2: 題を「何が増えるか」に(行の「マイ」は省く)
    '<div class="rlrows">'+
      '<div class="rlrow"><span class="rlk">単語</span><span class="rlt"><b>'+words+'</b>語'+(wp? ' ・ 意味待ち <b>'+wp+'</b>':'')+'</span></div>'+
      '<div class="rlrow"><span class="rlk">フレーズ</span><span class="rlt"><b>'+mine+'</b>件'+(pend? ' ・ 英訳待ち <b>'+pend+'</b>件':'')+'</span></div>'+
    '</div>'+
    '<div class="row sayrow"><button class="btn grow" id="homeSayAdd">✍ メモする</button></div>'+
  '</div>';
}
function bindSayPanel(){
  const el=$("homeSay"); if(!el) return;
  el.onclick=()=>openSayModal();
  $("homeSayAdd").onclick=e=>{ e.stopPropagation(); openSayModal(true); };
}

/* ---- モーダル: 入力1つ→自動仕分けのプレビュー→追加 / 英訳待ちメモ(✎🗑→単語) / 📋依頼→貼り戻し / 一覧へ ---- */
let sayEditing=null; // 書き直し中のメモid
function openSayModal(focusAdd){
  const pend=sayList(), mine=myphrList(), words=mywList().length;
  const T={w:"単語", p:"フレーズ", j:"フレーズ"};
  openModal('<h3>📝 メモ → マイ単語・マイフレーズ '+helpBtn("hlp-say")+'</h3>'+
    helpNote("hlp-say", '1行1つ書くと自動で仕分ける。<b>単語</b>(英語3語以内)→マイ単語(意味は自動取得・4択に出る。品詞のチップはタップで変更。内蔵にある語・登録済みの語はその場で分かる)。'+
      '<b>フレーズ</b>(日本語=言えなかったこと/英語の表現)→英訳待ち → 📋依頼文をLLMに貼り、返った「英文 — 日本語 — 覚えたい表現」を貼り戻すとマイフレーズ(並べ替えに優先して出る)。'+
      '短い語もチップで「フレーズ」にすれば例文化される。「英文 — 日本語」と書けばその場で登録。<br>'+
      '<b>1行だけ</b>書くと、その場で辞書を引く(v5.35.0): 英単語なら意味の候補がチップで出て第一候補が選ばれた状態になる(タップで選び直し・複数可→「＋ 追加」で意味つきで登録)。'+
      '日本語の短い語句(14字以内)なら英語の候補が品詞・意味つきで並び、➕のワンタップでマイ単語に。<br>'+
      '<b>プライバシー</b>: メモはこの端末と、同期を使う場合はあなた自身のGoogleドライブの非公開領域にだけ保存される。辞書引きで外部(Google翻訳の辞書)に送るのは入力した語だけ')+
    '<textarea id="sayText" class="myta" rows="5" placeholder="1行1つ(英単語・英語の表現・日本語)\n例: incumbent → 意味の候補が出る\n例: 和らぐ → 英語の候補が出る\n例: I&#39;ll get back to you on that.\n例: 会議を来週に延期したいと言いたかった"></textarea>'+ // v5.28.2: 4行が見える高さ・例は短く。v5.35.0: 1語なら辞書を引く例
    '<div id="sayPrev" style="margin-top:6px"></div>'+
    '<div id="sayLook"></div>'+ // 辞書引きの結果(v5.35.0)
    '<div class="row" style="gap:8px; margin-top:6px"><button class="btn primary grow" id="sayAddBtn" disabled>＋ 追加</button></div>'+
    (pend.length
      ? '<div class="small" style="margin-top:12px">英訳待ち '+pend.length+'件</div>'+
        '<div class="panel" style="margin-top:4px" id="sayPend">'+pend.map(x=>
          sayEditing===x.id
            ? '<div class="myrow"><input class="pdate grow" id="sayEditIn" value="'+esc(x.ja)+'" style="margin-top:0">'+
              '<button class="btn primary sayok" data-id="'+x.id+'">保存</button><button class="btn saycancel">取消</button></div>'
            : '<div class="myrow"><div class="grow small"><span class="rlchip">'+(x.t==="j"? "日→英":"英")+'</span> <b style="color:var(--ink)">'+esc(x.ja)+'</b></div>'+
              '<button class="btn sayedit" data-id="'+x.id+'" title="書き直す">✎</button>'+
              (x.t!=="j"? '<button class="btn sayword" data-id="'+x.id+'" title="単語として登録">→単語</button>':'')+
              '<button class="btn mydel" data-id="'+x.id+'">🗑</button></div>').join("")+'</div>'+
        '<button class="btn" id="sayPromptBtn" style="width:100%; margin-top:8px">📋 '+pend.length+'件の英訳をLLMに頼む(依頼文をコピー)</button>'+
        '<textarea id="sayBack" class="myta" rows="3" style="margin-top:8px" placeholder="LLMの答えを貼り付け(1行『英文 — 日本語 — 覚えたい表現』)"></textarea>'+
        '<button class="btn primary" id="sayImportBtn" style="width:100%; margin-top:6px">貼り戻してマイフレーズに登録</button>'
      : (sayDoneList()? '<div class="small" style="margin-top:8px">英訳待ちはない(これまで '+sayDoneList()+'件を言えるようにした)</div>' : ''))+
    '<div class="row" style="gap:8px; margin-top:10px">'+
      '<button class="btn rlentry grow" id="sayMywBtn"><span class="grow">📚 マイ単語</span><span class="hlsub">'+words+'語 ›</span></button>'+
      '<button class="btn rlentry grow" id="sayMyBtn"><span class="grow">📚 マイフレーズ</span><span class="hlsub">'+mine.length+'件 ›</span></button></div>');
  const ta=$("sayText"), look=$("sayLook");
  let items=[], lookTgt=null, lookData=null, lookSel=[], lookPos={}, lookOwn=""; // 辞書引き(v5.35.0): 対象・結果・選んだ訳(英→日)・直した品詞(日→英)・自分で書いた意味(v5.36.0)
  sayLookSeq++; clearTimeout(sayLookTimer); // 前に開いていたモーダルの引き直しは捨てる
  const renderPrev=()=>{
    const box=$("sayPrev");
    if(!items.length){ box.innerHTML=""; $("sayAddBtn").disabled=true; return; }
    /* v5.29.0(実機FB): 単語の行は旧「マイ単語登録」と同じ確認=品詞チップ(タップで動/名/形/副)+内蔵にある/登録済み/意味は自動取得(mywPrevNote) */
    box.innerHTML='<div class="panel">'+items.map((it,i)=>{
      const w=it.t==="w"? mywPrevNote(it) : null;
      return '<div class="myrow"><button class="wchip saytype'+(it.t==="w"? " ksel":"")+'" data-i="'+i+'"'+(it.t==="j"? ' disabled':'')+'>'+T[it.t]+'</button>'+
      (w? '<button class="wchip poschip pos'+w.pos+' saypos" data-i="'+i+'" title="品詞(タップで変更)"'+(w.builtin? ' disabled':'')+'>'+POS_SHORT[w.pos]+'</button>':'')+
      '<div class="grow small"><b style="color:var(--ink)">'+esc(it.t==="j"? it.ja : it.en)+'</b>'+(it.t==="p" && it.ja? ' <span class="small">'+esc(it.ja)+'</span>':'')+ // 単語の意味は下の注記(mywPrevNote)に出る=二重に出さない(v5.35.0)
      '<br><span class="small">'+(w? w.note : it.t==="j"? '英訳待ちのメモに' : (it.ja? 'マイフレーズに' : '英訳待ちのメモに(例文化と日本語訳をLLMに)'))+'</span></div></div>'; }).join("")+'</div>';
    box.querySelectorAll(".saytype").forEach(b=>b.onclick=()=>{ const it=items[+b.dataset.i]; it.t=it.t==="w"? "p":"w"; if(it.t==="w" && !it.pos) it.pos=mywGuessPos(mywNorm(it.en)||it.en); renderPrev(); sayLookup(); });
    box.querySelectorAll(".saypos").forEach(b=>b.onclick=()=>{ const it=items[+b.dataset.i]; it.pos=MYW_POS_CYCLE[(MYW_POS_CYCLE.indexOf(it.pos||"n")+1)%MYW_POS_CYCLE.length]; renderPrev(); });
    $("sayAddBtn").disabled=false;
  };
  /* ---- 辞書引き(v5.35.0) ---- */
  const renderLook=()=>{ look.innerHTML=(lookTgt && lookData)? sayLookHTML(lookTgt, lookData, lookSel, lookPos, lookOwn) : ""; bindLook(); };
  const setLookMsg=(html, withOwn)=>{ look.innerHTML='<div class="small saylookmsg">'+html+'</div>'+(withOwn? sayOwnHTML(lookOwn) : ''); bindLook(); }; // 案内文(+自分で書く欄)
  const applySel=(keep)=>{ // 英→日: 選んだ訳(+自分で書いた意味)をプレビューの単語の意味(と品詞)に=「＋ 追加」で意味つきで登録される。keep=候補の枠は描き直さない(入力中のフォーカスを保つ)
    const it=items[0]; if(!it || !lookTgt || lookTgt.dir!=="en") return;
    const c=lookData? mywJaCands(lookData) : [], sel=lookSel.map(i=>c[i]).filter(Boolean), own=lookOwn.replace(/\s+/g," ").trim();
    it.ja=sel.map(x=>x.ja).concat(own? [own] : []).join("、"); const p=sel.find(x=>x.pos); if(p) it.pos=p.pos;
    renderPrev(); if(!keep) renderLook();
  };
  const bindLook=()=>{
    const own=$("sayOwn"); if(own) own.oninput=()=>{ lookOwn=own.value; applySel(true); }; // 自分で意味を書く(v5.36.0)
    look.querySelectorAll(".sayja").forEach(b=>b.onclick=()=>{ const i=+b.dataset.i, k=lookSel.indexOf(i); if(k>=0) lookSel.splice(k, 1); else lookSel.push(i); applySel(); });
    look.querySelectorAll(".saycpos").forEach(b=>b.onclick=()=>{ const i=+b.dataset.i, c=mywEnCands(lookData, lookTgt.q)[i]; if(!c) return; const cur=lookPos[i]||c.pos; lookPos[i]=MYW_POS_CYCLE[(MYW_POS_CYCLE.indexOf(cur)+1)%MYW_POS_CYCLE.length]; renderLook(); });
    look.querySelectorAll(".sayreg").forEach(b=>b.onclick=()=>{ // 日→英: ➕のワンタップでマイ単語に
      const i=+b.dataset.i, x=mywEnCands(lookData, lookTgt.q)[i]; if(!x) return;
      const r=mywAdd(x.en, x.ja, lookPos[i]||x.pos, "", "メモ");
      if(r.err){ toast(r.err); renderLook(); return; }
      toast(r.ref? "📝 "+x.en+" は内蔵の語 ─ 優先して出る" : "📝 "+x.en+" をマイ単語に登録("+x.ja.split("、")[0]+")");
      if(ta.value.trim()===lookTgt.q){ ta.value=""; items=[]; renderPrev(); } // その語だけの入力は空に(候補は残す=続けて別の語も登録できる)
      renderLook();
      const mb=$("sayMywBtn"); if(mb) mb.querySelector(".hlsub").textContent=mywList().length+"語 ›";
      renderHomeIfShown();
    });
  };
  const sayLookup=()=>{
    const tgt=sayLookTarget(items);
    if(!tgt){ if(lookTgt){ lookTgt=null; lookData=null; look.innerHTML=""; } return; }
    if(lookTgt && lookTgt.dir===tgt.dir && lookTgt.q===tgt.q){ if(lookData) applySel(); return; } // 同じ語=引き直さない(選んだ訳は保つ)
    const seq=++sayLookSeq; clearTimeout(sayLookTimer);
    lookTgt=tgt; lookData=null; lookSel=[]; lookPos={}; lookOwn="";
    const en=tgt.dir==="en", later=en? ' ─ 自分で意味を書くか、追加すればあとで自動取得' : '';
    if(!navigator.onLine && !mywDictImpl){ setLookMsg('🔍 オフライン'+later, en); return; }
    setLookMsg('🔍 '+esc(tgt.q)+' を調べている…', false);
    sayLookTimer=setTimeout(()=>{
      mywDictLookup(tgt.q, tgt.dir).then(d=>{
        if(seq!==sayLookSeq) return; // そのあと入力が変わった
        if(!d){ setLookMsg('🔍 '+esc(tgt.q)+' は見つからなかった'+later, en); return; }
        lookData=d;
        if(tgt.dir==="en"){ lookSel=[0]; applySel(); } else renderLook();
      });
    }, SAY_LOOK_DELAY);
  };
  ta.oninput=()=>{ items=ta.value.split(/\n+/).map(sayClassify).filter(Boolean); renderPrev(); sayLookup(); };
  $("sayAddBtn").onclick=()=>{
    const r=sayIntake(items);
    const parts=[]; if(r.w) parts.push("📝 単語"+r.w); if(r.p) parts.push("💬 フレーズ"+r.p); if(r.pend) parts.push("✍ 英訳待ち"+r.pend); if(r.errs.length) parts.push(r.errs[0]);
    toast(parts.join(" ・ ")||"追加できる行がない");
    if(r.w && typeof mywFillPending==="function") mywFillPending(()=>{}); // 意味の自動取得(myword.js)
    openSayModal(); renderHomeIfShown();
  };
  $("modal").querySelectorAll(".mydel").forEach(b=>b.onclick=()=>{ sayDelete(b.dataset.id); openSayModal(); renderHomeIfShown(); });
  $("modal").querySelectorAll(".sayedit").forEach(b=>b.onclick=()=>{ sayEditing=b.dataset.id; openSayModal(); const i=$("sayEditIn"); if(i){ i.focus(); } });
  $("modal").querySelectorAll(".sayok").forEach(b=>b.onclick=()=>{ sayEdit(b.dataset.id, $("sayEditIn").value); sayEditing=null; openSayModal(); });
  $("modal").querySelectorAll(".saycancel").forEach(b=>b.onclick=()=>{ sayEditing=null; openSayModal(); });
  $("modal").querySelectorAll(".sayword").forEach(b=>b.onclick=()=>{
    const r=sayToWord(b.dataset.id); toast(r.err? r.err : "📝 "+r.en+" をマイ単語に(意味は自動取得)");
    if(!r.err && typeof mywFillPending==="function") mywFillPending(()=>{});
    openSayModal(); renderHomeIfShown();
  });
  const pb=$("sayPromptBtn");
  if(pb) pb.onclick=()=>rlCopy(sayPromptText(sayList()), $("sayBack"));
  const ib=$("sayImportBtn");
  if(ib) ib.onclick=()=>{
    const r=sayImport($("sayBack").value);
    if(!r.added){ toast(r.errs[0] || "「英文 — 日本語」の行が見つからない"); return; }
    toast("💬 "+r.added+"件をマイフレーズに登録 ─ 明日からミックスに混ざる"+(r.errs.length? "("+r.errs.length+"件は登録できず)":""));
    openSayModal(); renderHomeIfShown();
  };
  $("sayMywBtn").onclick=openMywList;
  $("sayMyBtn").onclick=openMyphrList;
  if(focusAdd) setTimeout(()=>{ try{ ta.focus(); }catch(e){} }, 50);
}
function renderHomeIfShown(){ if(!$("homeView").classList.contains("hidden")) renderHome(); }
