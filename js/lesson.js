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
  return {t:(words<=3 && !sentence)? "w" : "p", en, ja};
}
/* 追加(v5.26.0): 仕分けどおりに振り分ける。items=[{t,en,ja}]。戻り={w:マイ単語, p:即マイフレーズ, pend:英訳待ち, errs[]} */
function sayIntake(items){
  const r={w:0, p:0, pend:0, errs:[]}; const now=Date.now();
  const have=new Set(sayList().map(x=>x.ja));
  (items||[]).forEach((it,i)=>{
    if(!it) return;
    if(it.t==="w"){
      const pw=(typeof mywParse==="function"? mywParse(it.en+(it.ja? " — "+it.ja : ""))[0] : null)||{en:it.en, ja:it.ja, pos:"n", ex:""};
      const x=mywAdd(pw.en, pw.ja, pw.pos, pw.ex, "メモ");
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
    '<div class="pacetop"><span>📝 分からなかった・言えなかった</span></div>'+
    '<div class="rlrows">'+
      '<div class="rlrow"><span class="rlk">単語</span><span class="rlt">マイ単語 <b>'+words+'</b>語'+(wp? ' <span class="small">(意味待ち'+wp+')</span>':'')+'</span></div>'+
      '<div class="rlrow"><span class="rlk">フレーズ</span><span class="rlt">マイフレーズ <b>'+mine+'</b>件'+(pend? ' ・ 英訳待ち <b>'+pend+'</b>件':'')+'</span></div>'+
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
  openModal('<h3>📝 メモ → 単語・フレーズ '+helpBtn("hlp-say")+'</h3>'+
    helpNote("hlp-say", '<b>1か所に書くだけ</b>(1行1つ)。行ごとに自動で仕分ける ─ '+
      '<b>単語</b>(意味が分からなかった英単語・3語以内)はそのままマイ単語に(意味は自動取得・学習の4択に出る)。'+
      '<b>フレーズ</b>(英語で言えなかったこと=日本語/意味は分かるのに出てこなかった英語の表現)は英訳待ちのメモに → '+
      '(wipe out・portable のような短い語も、チップで「フレーズ」にすればLLMが会話で使える例文にし、並べ替えで練習できる) '+
      '📋依頼文をLLM(ChatGPT等)に貼る → 返ってきた「英文 — 日本語」を貼り戻すとマイフレーズに(ミックスの5問目ごとのフレーズに優先して混ざる)。'+
      '「英文 — 日本語」と書けば単語もフレーズもその場で登録。仕分けは追加前のチップで変えられる。<br>'+
      '<b>プライバシー</b>: メモはこの端末と、同期を使う場合はあなた自身のGoogleドライブの非公開領域にだけ保存される')+
    '<textarea id="sayText" class="myta" rows="3" placeholder="1行1つ ─ 英単語 / 英語の表現 / 日本語(言えなかったこと) を混ぜてOK\n例: incumbent\n例: I&#39;ll get back to you on that.\n例: 締め切りに間に合わなかった理由を説明したかった"></textarea>'+
    '<div id="sayPrev" style="margin-top:6px"></div>'+
    '<div class="row" style="gap:8px; margin-top:6px"><button class="btn primary grow" id="sayAddBtn" disabled>＋ 追加</button></div>'+
    (pend.length
      ? '<div class="small" style="margin-top:12px">英訳待ちのメモ '+pend.length+'件 ─ ✎で書き直し・「→単語」で仕分け直し</div>'+
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
      : (sayDoneList()? '<div class="small" style="margin-top:8px">英訳待ちのメモはない ─ これまで '+sayDoneList()+'件を言えるようにした</div>' : ''))+
    '<div class="row" style="gap:8px; margin-top:10px">'+
      '<button class="btn rlentry grow" id="sayMywBtn"><span class="grow">📚 マイ単語</span><span class="hlsub">'+words+'語 ›</span></button>'+
      '<button class="btn rlentry grow" id="sayMyBtn"><span class="grow">📚 マイフレーズ</span><span class="hlsub">'+mine.length+'件 ›</span></button></div>');
  const ta=$("sayText");
  let items=[];
  const renderPrev=()=>{
    const box=$("sayPrev");
    if(!items.length){ box.innerHTML=""; $("sayAddBtn").disabled=true; return; }
    box.innerHTML='<div class="panel">'+items.map((it,i)=>
      '<div class="myrow"><button class="wchip saytype'+(it.t==="w"? " ksel":"")+'" data-i="'+i+'"'+(it.t==="j"? ' disabled':'')+'>'+T[it.t]+'</button>'+
      '<div class="grow small"><b style="color:var(--ink)">'+esc(it.t==="j"? it.ja : it.en)+'</b>'+(it.t!=="j" && it.ja? ' <span class="small">'+esc(it.ja)+'</span>':'')+
      '<br><span class="small">'+(it.t==="w"? 'マイ単語に(意味は'+(it.ja? 'この訳':'自動取得')+')' : it.t==="j"? '英訳待ちのメモに' : (it.ja? 'マイフレーズに' : '英訳待ちのメモに(例文化と日本語訳をLLMに)'))+'</span></div></div>').join("")+'</div>';
    box.querySelectorAll(".saytype").forEach(b=>b.onclick=()=>{ const it=items[+b.dataset.i]; it.t=it.t==="w"? "p":"w"; renderPrev(); });
    $("sayAddBtn").disabled=false;
  };
  ta.oninput=()=>{ items=ta.value.split(/\n+/).map(sayClassify).filter(Boolean); renderPrev(); };
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
