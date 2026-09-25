"use strict";
/* ================= 🗣 英会話(v5.25.0) =================
   実機FB「レッスン中に言えなかったことの振り返りと学習、今まで言えなかったことを表現できるようになることが目的。
   実戦ドリルを学習に組み込めていない。スピーキング(頭の中の言いたいことを英語で表現する力)を日々強化したい。
   ただし複雑にしない=『学習』『今日の英語』のようにやることが明快で、とりあえずで始めやすく」への回答。

   設計は3つだけ(入口=ホームの🗣英会話パネル・🎯実戦メニュー):
   ① 言えなかったこと(G.say): レッスン中/後に日本語で1行メモ → 📋LLMに英訳を頼む(依頼文をコピー) → 答えを貼り戻すと
      マイフレーズ(G.myphr・c:"my")に登録 → 翌日からミックスの5問目ごとのフレーズに優先して混ざる(phrase.js pickPhrase)
      = 「言えなかった」が毎日の学習の中で「言える」に変わる。翻訳・生成はアプリではしない(方針=LLMなし・無料)
   ② レッスン前ウォームアップ(5分): マイフレーズ優先+学習中のフレーズを5つ、日本語だけ見て声に出す→答えを見て⭕✖
      (口頭自己判定=PHR_DRILLS.warm・fmt "sp"。日常の学習では口頭ステージはオフのまま=SPEAK_ENABLED)
   ③ 振り返り: ウォームアップの5つに「レッスンで使えた」の印(=間隔をあけた正解として復習に反映・いちばん強い復習)
      +言えなかったことのメモ(①へ)。
   記録: G.say=id→{ja, at, done?}(削除は{del:1,at})・G.sayw={d, list, used}(今日のウォームアップ)。同期は操作時刻LWW(sync.js)。
   可逆設計: このファイル+ホームの1パネル+🎯メニューの2ボタン+PHR_DRILLS.warm+pickPhraseの優先1行+CSSブロックで完結 */

/* ---- ① 言えなかったこと ---- */
function sayList(){ // 未処理(英訳待ち)のメモ。古い順
  return Object.keys(G.say||{}).map(id=>Object.assign({id}, G.say[id]))
    .filter(x=>!x.del && !x.done && x.ja).sort((a,b)=>a.at-b.at);
}
function sayDoneList(){ // 英訳が済んでマイフレーズになったメモ(件数表示用)
  return Object.keys(G.say||{}).filter(id=>G.say[id] && !G.say[id].del && G.say[id].done).length;
}
/* メモの追加(1行1つ・空行は無視・同じ文は二重に入れない)。追加した件数を返す */
function sayAdd(text){
  const lines=String(text||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const now=Date.now(); let n=0;
  const have=new Set(sayList().map(x=>x.ja));
  lines.forEach((ja,i)=>{
    if(have.has(ja)) return;
    G.say["s"+(now+i)]={ja, at:now+i}; have.add(ja); n++;
  });
  if(n) saveG();
  return n;
}
function sayDelete(id){ if(G.say[id]){ G.say[id]={del:1, at:Date.now()}; saveG(); } }
/* LLMへの依頼文(コピー用): 出力を『英文 — 日本語』の1行1つに固定=貼り戻しで自動登録できる */
function sayPromptText(items){
  return "英会話レッスンで言いたかったのに英語で言えなかったことのメモです(日本語)。それぞれ、会話でそのまま口に出せる自然な英語1文にしてください。\n"+
    "・1つのメモに英文1つ。10〜15語程度・話し言葉として自然に(英検1級を目指す学習者なので、簡単すぎる言い回しは避けつつ、覚えて使える長さで)\n"+
    "・出力は1行につき「英文 — 日本語のメモ(そのまま)」だけ。番号・記号・説明・空行は入れないでください(単語帳アプリにそのまま貼り付けます)\n\n"+
    items.map(x=>"・"+x.ja).join("\n");
}
/* 貼り戻しの解析(純関数): 「英文 — 日本語」(— / – / - / ー / : のいずれか)の行を{en, ja}に。英文だけの行も通す(jaは空) */
function sayParse(text){
  const out=[];
  String(text||"").split(/\n+/).map(s=>s.trim().replace(/^[\d０-９]+[.)．、]\s*|^[・\-*•]\s*/, "")).filter(Boolean).forEach(l=>{
    const m=l.match(/^(.*?[A-Za-z][^—–ー]*?)\s*(?:—|–|ー|\s-\s|\s:\s)\s*(.*)$/);
    let en=m? m[1].trim() : l, ja=m? m[2].trim() : "";
    if(!/[A-Za-z]/.test(en) || (en.match(/[A-Za-z]/g)||[]).length<en.replace(/\s/g,"").length*0.5) return; // 英文でない行は捨てる
    out.push({en:en.replace(/\s+/g," "), ja});
  });
  return out;
}
/* 貼り戻し→マイフレーズ登録。jaが無い行は、未処理メモを上から順に当てる。登録できたメモはdone。{added, errs[]}を返す */
function sayImport(text){
  const lines=sayParse(text), pend=sayList(); const errs=[]; let added=0;
  const norm=s=>String(s||"").replace(/[\s。．、,.!?！？]/g,"");
  lines.forEach((ln,i)=>{
    const hit=pend.find(x=>!x._used && ln.ja && norm(x.ja)===norm(ln.ja)) || pend.find(x=>!x._used && ln.ja && (norm(ln.ja).indexOf(norm(x.ja))>=0 || norm(x.ja).indexOf(norm(ln.ja))>=0)) || pend.filter(x=>!x._used)[0];
    const ja=ln.ja || (hit? hit.ja : "");
    const r=myphrAdd(ln.en, ja, "");
    if(r.err){ errs.push(ln.en.slice(0,30)+": "+r.err); return; }
    added++;
    if(hit){ hit._used=1; G.say[hit.id]=Object.assign({}, G.say[hit.id], {done:1, en:ln.en, at:Date.now()}); }
  });
  if(added) saveG();
  return {added, errs};
}

/* ---- ② ウォームアップのプール(純関数寄り): マイフレーズ(弱い順)→学習中(復習が近い順)→未着手の意見・理由・つなぎ ---- */
function warmPool(used){
  used=used||new Set(); const now=Date.now();
  const box=p=>{ const st=G.phr[p.en]; return st? st[0] : -1; };
  const mine=myphrList().filter(p=>!used.has(p.en)).sort((a,b)=>box(a)-box(b));
  if(mine.length) return mine;
  const learning=allPhrases().filter(p=>!used.has(p.en) && G.phr[p.en] && !G.phr[p.en][4])
    .sort((a,b)=>reviewUrgency(G.phr[b.en],now)-reviewUrgency(G.phr[a.en],now));
  if(learning.length) return learning;
  const fresh=allPhrases().filter(p=>!used.has(p.en) && !G.phr[p.en] && /^(op|rs|str)$/.test(p.c));
  return fresh.length? shuffle(fresh) : allPhrases().filter(p=>!used.has(p.en));
}
/* ウォームアップの完了(phrase.js openDrillDoneから): 今日の5つを控える=振り返りで「使えた」を付ける相手 */
function sayWarmDone(list){
  G.sayw={d:todayKey(), list:list.slice(0, 10), used:(G.sayw && G.sayw.d===todayKey()? G.sayw.used : {})||{}, at:Date.now()};
  saveG();
}
function sayWarmToday(){ return (G.sayw && G.sayw.d===todayKey() && G.sayw.list && G.sayw.list.length)? G.sayw : null; }
/* ③ 「レッスンで使えた」: 実際の会話で出てきた=いちばん強い復習。期限前でも間隔をあけた正解として階段を進める */
function sayMarkUsed(en){
  const w=sayWarmToday(); if(!w || w.list.indexOf(en)<0 || w.used[en]) return false;
  let st=G.phr[en]; if(!st) st=G.phr[en]=[0,0,0,0,0,0,0];
  const now=Date.now();
  srsApply(st, true, Math.max(now, st[1]||0)); st[8]=now;
  w.used[en]=1; w.at=now; saveG();
  return true;
}

/* ---- ホームのパネル(今日の英語と同じ型・タップで詳細) ---- */
function sayPanelHTML(){
  const pend=sayList().length, mine=myphrList().length, w=sayWarmToday();
  const usedN=w? Object.keys(w.used||{}).length : 0;
  return '<div class="panel rlpanel" id="homeSay">'+
    '<div class="pacetop"><span>🗣 英会話</span><b style="font-size:12px; color:var(--sub)">言えなかったことを、言えるように</b></div>'+
    '<div class="rlrows">'+
      '<div class="rlrow"><span class="rlk">言えなかった</span><span class="rlt">'+(pend? '英訳待ち <b>'+pend+'</b>件 ─ 📋でLLMに頼んで貼り戻す' : (mine? 'メモなし ─ レッスンで言えなかったことを✍で' : 'まだ無い ─ レッスンのあとに✍で1行メモ'))+'</span></div>'+
      '<div class="rlrow"><span class="rlk">マイフレーズ</span><span class="rlt">'+(mine? '<b>'+mine+'</b>件 ─ ミックスに優先して混ざる' : '0件 ─ 英訳を貼り戻すとここに増える')+
        (w? ' ・ 今日のウォームアップ '+usedN+'/'+w.list.length+' 使えた' : '')+'</span></div>'+
    '</div>'+
    '<div class="row sayrow"><button class="btn grow" id="homeWarm">🎤 ウォームアップ(5分)</button><button class="btn grow" id="homeSayAdd">✍ 言えなかったこと</button></div>'+
  '</div>';
}
function bindSayPanel(){
  const el=$("homeSay"); if(!el) return;
  el.onclick=()=>openSayModal();
  $("homeWarm").onclick=e=>{ e.stopPropagation(); startDrill("warm"); };
  $("homeSayAdd").onclick=e=>{ e.stopPropagation(); openSayModal(true); };
}

/* ---- モーダル: 言えなかったこと(メモ→英訳→登録)+今日のウォームアップの振り返り ---- */
function openSayModal(focusAdd){
  const pend=sayList(), mine=myphrList(), w=sayWarmToday();
  openModal('<h3>🗣 英会話 '+helpBtn("hlp-say")+'</h3>'+
    helpNote("hlp-say", '<b>目的</b>: レッスンで言えなかったことを、次は言えるようにする。<br>'+
      '<b>流れ</b>: ✍レッスン中・後に日本語で1行メモ → 📋依頼文をコピーしてLLM(ChatGPT等)に貼る → 返ってきた「英文 — 日本語」を貼り戻す → '+
      'マイフレーズに登録され、翌日から<b>ミックスの5問目ごとのフレーズに優先して混ざる</b>(並べ替え・先に思い出す)。'+
      '🎤ウォームアップはレッスンの直前に5つを声に出す練習(マイフレーズ優先)。レッスンで使えたら「使えた」を押す=間隔をあけた正解として復習に反映。<br>'+
      '<b>プライバシー</b>: メモはこの端末と、同期を使う場合はあなた自身のGoogleドライブの非公開領域にだけ保存される')+
    '<div class="small" style="margin-top:6px">✍ 言えなかったこと(日本語で・1行1つ)</div>'+
    '<textarea id="sayText" class="myta" rows="2" placeholder="例: 締め切りに間に合わなかった理由を説明したかった"></textarea>'+
    '<div class="row" style="gap:8px; margin-top:6px"><button class="btn primary grow" id="sayAddBtn">＋ メモに追加</button></div>'+
    (pend.length
      ? '<div class="panel" style="margin-top:8px" id="sayPend">'+pend.map(x=>
          '<div class="myrow"><div class="grow small"><b style="color:var(--ink)">'+esc(x.ja)+'</b> <span class="small">'+esc(x.at? new Date(x.at).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"}) : "")+'</span></div>'+
          '<button class="btn mydel" data-id="'+x.id+'">🗑</button></div>').join("")+'</div>'+
        '<button class="btn" id="sayPromptBtn" style="width:100%; margin-top:8px">📋 '+pend.length+'件の英訳をLLMに頼む(依頼文をコピー)</button>'+
        '<textarea id="sayBack" class="myta" rows="3" style="margin-top:8px" placeholder="LLMの答えを貼り付け(1行『英文 — 日本語』)"></textarea>'+
        '<button class="btn primary" id="sayImportBtn" style="width:100%; margin-top:6px">貼り戻してマイフレーズに登録</button>'
      : '<div class="small" style="margin-top:8px">英訳待ちのメモはない'+(sayDoneList()? ' ─ これまで '+sayDoneList()+'件を言えるようにした':'')+'</div>')+
    '<div class="small" style="margin-top:14px">🎤 レッスン前ウォームアップ ─ 5つを声に出す(マイフレーズ優先・約5分)</div>'+
    '<button class="btn" id="sayWarmBtn" style="width:100%; margin-top:6px">🎤 ウォームアップをはじめる</button>'+
    (w? '<div class="small" style="margin-top:10px">今日の5つ ─ レッスンで使えたものにタップで印(復習に反映)</div>'+
        '<div class="panel" style="margin-top:6px">'+w.list.map(en=>{ const p=allPhrases().find(x=>x.en===en); const used=!!w.used[en];
          return '<div class="myrow"><div class="grow small"><b style="color:var(--ink)">'+esc(en)+'</b><br>'+esc(p? p.ja : "")+'</div>'+
            '<button class="btn sayused'+(used? " ok":"")+'" data-en="'+esc(en)+'"'+(used? ' disabled':'')+'>'+(used? '✓ 使えた' : '使えた')+'</button></div>'; }).join("")+'</div>' : '')+
    '<button class="btn rlentry" id="sayMyBtn" style="margin-top:10px"><span class="grow">📚 マイフレーズ</span><span class="hlsub">'+mine.length+'件 ›</span></button>');
  const ta=$("sayText");
  $("sayAddBtn").onclick=()=>{
    const n=sayAdd(ta.value);
    if(!n){ toast("メモを1行入れてほしい"); return; }
    toast("✍ "+n+"件をメモした ─ 📋で英訳を頼もう"); openSayModal(); renderHomeIfShown();
  };
  $("modal").querySelectorAll(".mydel").forEach(b=>b.onclick=()=>{ sayDelete(b.dataset.id); openSayModal(); renderHomeIfShown(); });
  const pb=$("sayPromptBtn");
  if(pb) pb.onclick=()=>rlCopy(sayPromptText(sayList()), $("sayBack"));
  const ib=$("sayImportBtn");
  if(ib) ib.onclick=()=>{
    const r=sayImport($("sayBack").value);
    if(!r.added){ toast(r.errs[0] || "「英文 — 日本語」の行が見つからない"); return; }
    toast("📝 "+r.added+"件をマイフレーズに登録 ─ 明日からミックスに混ざる"+(r.errs.length? "("+r.errs.length+"件は登録できず)":""));
    openSayModal(); renderHomeIfShown();
  };
  $("sayWarmBtn").onclick=()=>startDrill("warm");
  $("modal").querySelectorAll(".sayused").forEach(b=>b.onclick=()=>{
    if(sayMarkUsed(b.dataset.en)){ toast("🗣 実戦で使えた=いちばん強い復習。定着が1段進んだ"); openSayModal(); renderHomeIfShown(); }
  });
  $("sayMyBtn").onclick=openMyphrList;
  if(focusAdd) setTimeout(()=>{ try{ ta.focus(); }catch(e){} }, 50);
}
function renderHomeIfShown(){ if(!$("homeView").classList.contains("hidden")) renderHome(); }
