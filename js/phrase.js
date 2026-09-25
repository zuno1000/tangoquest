"use strict";
/* ================= フレーズ学習(v5.0.0) =================
   「日本語は出てくるが英語が出てこない」の解消: 意図(日本語)→英語の産出訓練。
   可逆設計: js/phrases.js(データ)+このファイル+quizViewのセグ/#phrBuild+CSSブロック+
   quiz.jsの分岐数行で完結(単語学習のロジックは不変)。
   ・SRSはsrsApply/INTERVALS/MASTER_BOXを単語と完全共有(台帳だけG.phrに分離)
   ・経済(🎫/XP/コンボ/任務/5問ボーナス)も共有=どちらで学んでも損得なし
   ・今日の目安・学習のあゆみ・連続学習には計上しない(別カウント=実機FBの決定。日別はG.pdays)
   ・出題形式はSRSの階段と連動(v5.1.0): box0-1=核のクローズ4択 / box2-3=並べ替え / box4〜=口頭自己判定+TTS
   ・v5.10.0(実機FB「口頭のハードルが高い」): 口頭ステージと口頭ドリルはSPEAK_ENABLED=falseでUIから撤去し、
     box4〜は「全文4択」(日本語の意図→4つの英文から選ぶ・先に思い出すステップつき)に。実戦ドリルも全て選択式。
     復活はフラグをtrueに戻すだけ(スロットのSLOT_ENABLEDと同じ可逆設計)
   ・v5.15.0(実機FB「並べ替え形式に」): 通常の出題はPHR_REORDER_ALL=trueで並べ替えに一本化(粒度の階段=下記) */
var SPEAK_ENABLED=false;
/* v5.15.0(実機FB「フレーズの勉強は並べ替え形式に」): 出題形式を並べ替えに一本化(PHR_REORDER_ALL・可逆)。
   理由: 並べ替え(整序)は語順・チャンクの切れ目・動詞の型(enable 人 to do)を自分で組み立てる「再構成」の課題で、
   4択(再認)より産出に近く、自由作文より詰まらない。弱点=片が大きいと意味順だけで並ぶので、階段は「粒度」で作る:
   box0-1=チャンク(2〜3片)の並べ替え / box2-3=単語(3〜12語)の並べ替え /
   box4〜=単語の並べ替え+「まず自力で英文を思い出す」(先に思い出すステップ・設定共有)→正解で「覚えた」。
   クローズ4択(mc)・全文4択(fs)のコードは残し、🎯実戦ドリル(fmt固定)とフラグoffで従来どおり使える */
var PHR_REORDER_ALL=true;

let phrCur=null, phrAnswered=false, phrPos=0, phrMiss=0;
let phrAutoT=null;   // 「自動で次へ」(設定共有)のタイマー
let phrRecent=[];    // 直近3問の再出題回避(単語側と同じ流儀)
function phrNoteRecent(en){ phrRecent.push(en); if(phrRecent.length>3) phrRecent.shift(); }

/* 出題形式の階段(v5.1.0で3段に):
   box0-1 = 核のクローズ4択(文は最初から見え、核だけが空欄=「主語の名詞で選べてしまう」を封じる)
   box2-3 = 並べ替え(文全体の語順を産出)
   box4〜 = 全文4択(v5.10.0・"fs": 日本語の意図だけを見て、英文全体を4つから選ぶ。文脈行の助けなし・
            誤答は同カテゴリの英文。box5=覚えた はここで正解したことを意味する)
            ※SPEAK_ENABLED=trueなら従来の口頭自己判定("sp") */
function phrFormat(st){
  if(PHR_REORDER_ALL) return "or"; // v5.15.0: 通常の出題は並べ替えだけ(階段は粒度=phrGrain)
  if(st && st[0]>=4) return SPEAK_ENABLED? "sp" : "fs";
  return (st && st[0]>=2)? "or" : "mc";
}
/* 並べ替えの粒度(v5.15.0): "ch"=チャンク(定着0-1) / "w"=単語(定着2〜)。フラグoffの従来の並べ替え(定着2-3)はチャンク */
function phrGrain(st){ return (PHR_REORDER_ALL && st && st[0]>=2)? "w" : "ch"; }
/* 並べ替えの片(タイル): チャンクまたは単語。join(" ")===en を保つ(enはch.join(" ")で導出しているため)。
   単語の片は最大16(v5.16.0・論述・根拠の10〜16語文。それ以外のカテゴリは12以下)。同じ表層形の片が2つあっても判定は文字列比較=どちらでも正解 */
function phrTiles(p, grain){ return grain==="w"? p.en.split(" ") : p.ch.slice(); }
/* 定着4〜の単語並べ替えは、片を見る前に英文全体の自力想起を1回挟む(先に思い出すステップ・設定共有)。
   片を見ると語順は「見れば分かる」に寄るため。チャンク段階・ドリル(fmt固定)では出ない */
function phrRecallFirst(st){ return !!(G.opt.preRecall && PHR_REORDER_ALL && st && st[0]>=4 && !PDRILL); }

/* 核(k)の位置を英文から探し、語境界まで広げて返す(v5.1.0)。
   kは辞書形でも良い(seem→seemsのように活用語尾まで空欄が伸びる)。
   データ検査でk⊂enを保証しているためnullは実質出ない(保険のフォールバックだけ残す) */
function phrCloze(p){
  const en=p.en, i=en.toLowerCase().indexOf(p.k.toLowerCase());
  if(i<0) return null;
  let s=i, e=i+p.k.length;
  while(s>0 && /[A-Za-z''-]/.test(en[s-1])) s--;
  while(e<en.length && /[A-Za-z''-]/.test(en[e])) e++;
  return {pre:en.slice(0,s), key:en.slice(s,e), post:en.slice(e)};
}
/* 文脈行(#phrBuild)のHTML: 出題中=核だけ空欄/答え合わせ=核をハイライトした全文。
   出題時から同じ場所に常設するので、答え合わせでレイアウトが動かない
   (v5.0の「答え合わせで全文が後から現れて日本語が押し上がる」実機FBの根治) */
function phrCtxHTML(p, revealed){
  const cz=phrCloze(p);
  if(!cz) return revealed? '<b class="pkey">'+esc(p.en)+'</b>' : "";
  const blank='<span class="pblank">'+"＿".repeat(Math.max(3, Math.min(8, Math.round(cz.key.length/2))))+'</span>';
  return esc(cz.pre)+(revealed? '<b class="pkey">'+esc(cz.key)+'</b>' : blank)+esc(cz.post);
}

/* ---- マイフレーズ(v5.6.0): 自分専用のフレーズ帳 ----
   英会話の添削・ネイティブとの対話で「言えなかった」表現を貼り付けるだけで登録できる。
   自動化: 英文/日本語(2行目)/チャンク分割/核の候補をすべて解析で埋める(手作業は核の確認と日本語だけ)。
   保存はG.myphr=この端末+本人のDrive非公開領域のみ(静的サイト=他者に共有される経路がない)。
   学習への統合はallPhrases()の1点: 内蔵PHRASESと同じSRS・出題形式・経済に乗る */
let MYPHR_CACHE=null;
function myphrInvalidate(){ MYPHR_CACHE=null; }
function myphrList(){
  if(!MYPHR_CACHE){
    MYPHR_CACHE=Object.keys(G.myphr||{})
      .filter(en=>G.myphr[en] && !G.myphr[en].del)
      .map(en=>{ const m=G.myphr[en]; return {en, ja:m.ja, k:m.k, ch:m.ch, c:"my", ty:"c"}; });
  }
  return MYPHR_CACHE;
}
function allPhrases(){
  const my=myphrList();
  return my.length? PHRASES.concat(my) : PHRASES;
}
/* 貼り付けテキストから英文と日本語を推定(行ごとに判定・空白は正規化) */
function myphrParse(text){
  const lines=String(text||"").split(/\n+/).map(s=>s.trim()).filter(Boolean);
  let en="", ja="";
  for(const l of lines){
    const letters=(l.match(/[A-Za-z]/g)||[]).length;
    if(!en && letters>=l.length*0.5) en=l.replace(/\s+/g," ").trim();
    else if(!ja && /[぀-ヿ一-鿿]/.test(l)) ja=l;
  }
  return {en, ja};
}
/* チャンクの自動分割: カンマの後を優先しつつ1チャンク最大4語。join(" ")===en を保つ */
function myphrChunks(en){
  const w=en.split(" ");
  if(w.length<2) return [en];
  if(w.length<=4){
    const h=Math.ceil(w.length/2);
    return [w.slice(0,h).join(" "), w.slice(h).join(" ")];
  }
  const out=[]; let cur=[];
  w.forEach(t=>{
    cur.push(t);
    if(cur.length>=4 || /,$/.test(t)){ out.push(cur.join(" ")); cur=[]; }
  });
  if(cur.length){
    // 1語の尻尾は前のチャンクに吸収(ただし前が4語未満のときだけ=1チャンク最大4語を守る)
    if(cur.length===1 && out.length && out[out.length-1].split(" ").length<4) out[out.length-1]+=" "+cur[0];
    else out.push(cur.join(" "));
  }
  return out;
}
/* 核の候補: ストップワード以外でいちばん長い語(タップで変更できる出発点) */
const MYPHR_STOP=new Set(("a an the to of in on at for with and or but so if as by from is are was were be been being am "+
  "it its this that these those i you he she we they me him her them us my your his their our not no dont doesnt didnt cant "+
  "could would should will shall may might must have has had do does did there here what when where who which how why then "+
  "than very really just also too only about into over under out up down more most much many some any all both few get got go went make made").split(" "));
function myphrSuggestKey(en){
  const w=en.split(" ");
  let best=-1, bi=0;
  w.forEach((t,i)=>{
    const c=t.replace(/[^A-Za-z'-]/g,"");
    if(!c || MYPHR_STOP.has(c.toLowerCase())) return;
    if(c.length>best){ best=c.length; bi=i; }
  });
  return bi;
}
/* 登録の本体(純関数寄り・UIとテストの共用)。kは英文中の連続表現に限る(クローズの前提) */
function myphrAdd(en, ja, k){
  en=String(en||"").replace(/\s+/g," ").trim();
  ja=String(ja||"").trim();
  k=String(k||"").replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g,"").trim();
  if(!en || !/[A-Za-z]/.test(en)) return {err:"英文が読み取れない"};
  if(!ja) return {err:"日本語の意図を一言だけ入れてほしい(思い出す手がかりになる)"};
  if(byPhr[en]) return {err:"内蔵フレーズに同じ文がある"};
  if(G.myphr[en] && !G.myphr[en].del) return {err:"すでに登録済み"};
  if(!k || en.toLowerCase().indexOf(k.toLowerCase())<0){
    k=en.split(" ")[myphrSuggestKey(en)].replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g,"");
  }
  G.myphr[en]={ja, k, ch:myphrChunks(en), at:Date.now()};
  myphrInvalidate(); saveG();
  return {en};
}
function myphrDelete(en){
  G.myphr[en]={del:1, at:Date.now()}; // トンボストーン=削除が同期で他端末にも伝播する
  delete G.phr[en];                    // SRS記録も掃除
  myphrInvalidate(); saveG();
}

/* 出題選択(pickWordの縮約版): 期限が来た復習を忘れかけ度順に優先し、新規を確率で混ぜる。
   フレーズには目安がないので新規導入は固定確率(0.25) */
function pickPhrase(){
  const now=Date.now(); const due=[], unseen=[];
  /* v5.25.0(🗣英会話): 自分で登録した「言えなかったこと」(c:my)で復習期限が来た/未着手のものがあれば2回に1回はそれを出す
     =毎日の学習の中で「言えなかった」が「言える」に変わる導線(内蔵フレーズの復習は残りの回で回る) */
  const mine=myphrList().filter(p=>{ const st=G.phr[p.en]; return (!st || st[1]<=now) && !phrRecent.includes(p.en); });
  if(mine.length && Math.random()<0.5) return mine[Math.floor(Math.random()*mine.length)];
  for(const p of allPhrases()){
    const st=G.phr[p.en];
    if(!st) unseen.push(p);
    else if(st[1]<=now) due.push(p);
  }
  const fresh=a=>{ const f=a.filter(p=>!phrRecent.includes(p.en)); return f.length? f : a; };
  const d=fresh(due), u=fresh(unseen);
  if(d.length && (u.length===0 || Math.random()>=0.25)){
    d.sort((a,b)=>reviewUrgency(G.phr[b.en],now)-reviewUrgency(G.phr[a.en],now));
    const pool=d.slice(0, Math.min(8,d.length));
    return pool[Math.floor(Math.random()*pool.length)];
  }
  if(u.length) return u[Math.floor(Math.random()*u.length)];
  // 期限が来たものがない: 弱い順に先取り復習(先取り正解で階段が上がらないのはsrsApplyが担保)
  const seen=fresh(allPhrases().filter(p=>G.phr[p.en]));
  seen.sort((a,b)=>(G.phr[a.en][0]-G.phr[b.en][0]) || (G.phr[a.en][1]-G.phr[b.en][1]));
  const pool=seen.slice(0, Math.min(10,seen.length));
  return pool[Math.floor(Math.random()*pool.length)] || PHRASES[0];
}

/* 4択の誤答は同じカテゴリから(=紛らわしくて学習になる)。足りなければ全体から補う。
   v5.1.0: 選択肢の表示は核チャンクなので、表示が同じになる候補(核の表層形が重複)は除く */
function buildPhrChoices(p){
  const myKey=(phrCloze(p)||{key:p.en}).key.toLowerCase();
  const seen=new Set([myKey]);
  const uniq=x=>{
    const k=(phrCloze(x)||{key:x.en}).key.toLowerCase();
    if(seen.has(k)) return false;
    seen.add(k); return true;
  };
  const same=shuffle(allPhrases().filter(x=>x.c===p.c && x.en!==p.en && !overlaps(x,p)));
  const picks=same.filter(uniq).slice(0,3);
  if(picks.length<3){
    const rest=shuffle(allPhrases().filter(x=>x.c!==p.c && !overlaps(x,p)));
    picks.push(...rest.filter(uniq).slice(0, 3-picks.length));
  }
  return shuffle([p, ...picks]);
}

/* ---- 実戦ドリル(v5.2.0→v5.10.0で全て選択式に): 英検1級二次の実戦形 ----
   どの定着段階でもカテゴリ縛りで5問連続で出すセッション。帳簿は通常のフレーズ学習と完全に同一
   (SRS・🎫・任務・5問ボーナス)=練習した分がそのまま正史の学習記録になる。
   v5.10.0(実機FB「口頭のハードルが高い・実戦も選択式に」): 各ドリルの出題形式(fmt)を固定 ─
   ・グラフ描写=全文4択(fs): 意図→英文全体を選ぶ(数値の言い回しを文ごと選ぶ)
   ・大人の動詞/無生物主語/マイ=クローズ4択(mc): 動詞の型・主語の動詞・自分の核を、同カテゴリの誤答と弁別する
   ・PREP(スピーチの組み立て)は選択式に置き換えられないため撤去(spk:1=口頭専用・SPEAK_ENABLEDで復活)
   日替わりの「今日のドリル」(todayDrillKind)をセット完了画面に出し、日々の学習に組み込む */
let PDRILL=null; // {kind, res:[ok...], used:Set}
const PHR_DRILLS={
  prep:{icon:"🎤", name:"2分スピーチの組み立て", spk:1,
    desc:"主張→理由→例→結論(PREP型)の順に、意図だけを見て声に出す。スピーチ1本ぶんの流れの練習",
    steps:[
      {t:"① 主張", f:p=>p.c==="op"},
      {t:"② 理由", f:p=>p.c==="rs" && /理由|原因/.test(p.ja)},
      {t:"③ 例",   f:p=>p.c==="rs" && /例/.test(p.ja)},
      {t:"④ 結論", f:p=>p.c==="str" && /まとめ|結論|締め|以上/.test(p.ja)},
    ]},
  graph:{icon:"📈", name:"グラフ・数値の描写", fmt:"fs",
    desc:"増えた・減った・横ばい・◯割を占める…の言い回しを、意図から英文ごと選ぶ(全文4択)。5問連続",
    steps:[1,2,3,4,5].map(n=>({t:"描写 "+n+"/5", f:p=>p.c==="num"}))},
  /* v5.4.0(実機FB「make/help/forceばかりで子供っぽい」): 添削後の英語の2大パターンを集中練習 */
  verb:{icon:"🔁", name:"大人の動詞に言い換え", fmt:"mc",
    desc:"make・help・forceに頼らず、enable/prevent/provide…の「動詞の型」を選ぶ(クローズ4択・誤答も動詞の型)。5問連続",
    steps:[1,2,3,4,5].map(n=>({t:"動詞の型 "+n+"/5", f:p=>p.c==="vp"}))},
  inan:{icon:"🏛", name:"無生物主語で言う", fmt:"mc",
    desc:"「〜のおかげで/せいで/を見ると」を、モノや経験を主語にした文で(This graph shows…型)。クローズ4択で5問連続",
    steps:[1,2,3,4,5].map(n=>({t:"無生物主語 "+n+"/5", f:p=>p.c==="ims"}))},
  /* v5.6.0: 自分で登録した表現だけの特訓(登録が5件未満なら繰り返しで補う) */
  mine:{icon:"📝", name:"マイフレーズ特訓", fmt:"mc",
    desc:"自分で登録した「言えなかった表現」だけをクローズ4択で5問連続。次の英会話までに言えるようにする",
    steps:[1,2,3,4,5].map(n=>({t:"マイ "+n+"/5", f:p=>p.c==="my"}))},
  /* v5.25.0(js/lesson.js): レッスン前ウォームアップ=口頭自己判定(fmt sp)。spk=1なので日替わりドリル・実戦メニューの一覧には並ばず、
     🗣英会話パネル/🎯の専用ボタンから。pool=マイフレーズ優先(warmPool)・順番どおりに出す */
  warm:{icon:"🎤", name:"レッスン前ウォームアップ", fmt:"sp", spk:1, ordered:1,
    desc:"マイフレーズ(言えなかったこと)を優先に5つ。日本語だけ見て声に出し、答えを見て⭕✖。レッスンの直前に約5分",
    steps:[1,2,3,4,5].map(n=>({t:"🎤 "+n+"/5", f:p=>true})), pool:used=>warmPool(used)},
};
/* いま選べるドリル(口頭専用はSPEAK_ENABLEDのときだけ) */
function drillKinds(){ return Object.keys(PHR_DRILLS).filter(k=>SPEAK_ENABLED || !PHR_DRILLS[k].spk); }
/* 今日のドリル(純関数・日付で決定的に巡回): マイフレーズが無い日はmineを外す */
function todayDrillKind(ymd, hasMine){
  const ks=drillKinds().filter(k=>hasMine || k!=="mine");
  if(!ks.length) return null;
  return ks[hashStr("drill|"+ymd)%ks.length];
}
function drillPool(step, used){
  const pool=allPhrases().filter(p=>step.f(p) && !used.has(p.en));
  return pool.length? pool : allPhrases().filter(step.f); // 使い切ったら再利用(件数が少ないドリルの保険)
}
function openDrillMenu(){
  const today=todayDrillKind(todayKey(), myphrList().length>0);
  openModal('<h3>🎯 実戦ドリル '+helpBtn("hlp-drill")+'</h3>'+
    helpNote("hlp-drill", '定着段階に関わらず、テーマを1つに絞って5問連続で出す実戦形式(すべて選択式)。'+
      '解いた分はふつうのフレーズ学習として記録される(復習スケジュール'+(GAME_ENABLED? '・🎫・任務':'・実績')+'すべて共通)。'+
      '「今日のドリル」は日替わり ─ 30問セットの完了画面からも1タップで始められる。<br><br>'+
      '<b>🎤 レッスン前ウォームアップ</b>(v5.25.0): マイフレーズ優先に5つ、日本語だけ見て声に出し⭕✖で自己判定(約5分)。'+
      '<b>🧪 Part 1 模試</b>: 本番と同じ25問(単語21+熟語4)を4択で・タイムを表示(本番の目安は約10分)。解いた分はふつうの学習として記録')+
    '<button class="btn drillbtn" id="drillWarm"><span>🎤 <b>レッスン前ウォームアップ</b> <span class="drilltoday">約5分</span></span>'+
      '<span class="hlsub">'+PHR_DRILLS.warm.desc+(myphrList().length? '' : '(マイフレーズが無い日は学習中のフレーズから)')+'</span></button>'+
    '<button class="btn drillbtn" id="drillMock"><span>🧪 <b>Part 1 模試</b> <span class="drilltoday">25問・タイム</span></span>'+
      '<span class="hlsub">本番と同じ25問(単語21+熟語4)・4択・時間を計る。'+(mockLast()? '前回 '+mockLast().c+'/'+MOCK_N+' ・ '+mockFmtSec(mockLast().s) : 'まだ記録なし')+'</span></button>'+
    drillKinds().map(k=>{
      const d=PHR_DRILLS[k];
      return '<button class="btn drillbtn" data-drill="'+k+'"><span>'+d.icon+' <b>'+d.name+'</b>'+
        (k===today? ' <span class="drilltoday">今日のドリル</span>':'')+'</span>'+
        '<span class="hlsub">'+d.desc+'</span></button>';
    }).join("")); // v5.21.0: 「📊 フレーズのあゆみ」ボタンは撤去(記録タブの「覚えたフレーズ」の行から=重複の解消)
  $("modal").querySelectorAll("[data-drill]").forEach(b=>{ b.onclick=()=>startDrill(b.dataset.drill); });
  $("drillWarm").onclick=()=>startDrill("warm"); $("drillMock").onclick=startMock; // v5.25.0
  // マイフレーズが0件のときは特訓を選べない(➕からの登録を案内)
  if(!myphrList().length){
    const b=$("modal").querySelector('[data-drill="mine"]');
    if(b){ b.disabled=true; b.querySelector(".hlsub").textContent="まだ登録がない ─ 学習タブの➕から「言えなかった表現」を登録しよう"; }
  }
}
function startDrill(kind){
  if(!PHR_DRILLS[kind]) return;
  if(!allPhrases().some(PHR_DRILLS[kind].steps[0].f)){ toast("対象のフレーズがまだ無い(➕から登録)"); return; }
  closeModal();
  // v5.10.0: ドリルはどのモード(ミックス/単語/フレーズ)からでも走り、終わればそのモードに戻る
  if(typeof FOCUS!=="undefined"){ if(FOCUS && FOCUS.mock) clearInterval(FOCUS.mock.timer); FOCUS=null; }
  PDRILL={kind, res:[], used:new Set()};
  if($("quizView").classList.contains("hidden")) switchTab("quiz");
  phrNewQuestion();
}
function openDrillDone(){
  const d=PHR_DRILLS[PDRILL.kind], kind=PDRILL.kind;
  const okN=PDRILL.res.filter(Boolean).length, n=d.steps.length;
  if(kind==="warm") sayWarmDone([...PDRILL.used]); // v5.25.0: 今日の5つを控える(振り返りで「使えた」を付ける)
  PDRILL=null;
  const tip={prep:'この流れ(主張→理由→例→結論)がそのまま2分スピーチの骨組みになる',
    graph:'数値の言い回しは、文ごと口から出るまで繰り返すのがコツ',
    verb:'「make 人 do」が浮かんだら、enable/allow/prevent…に置き換える癖をつける',
    inan:'「私は〜のおかげで」を「〜が私に…させた」と主語を入れ替える発想を反射に',
    mine:'言えなかった表現が「選べる」→次は会話で「使える」へ',
    warm:'レッスンで使えたら、ホームの🗣英会話から「使えた」を押そう(間隔をあけた正解として復習に反映)。言えなかったことは✍でメモ'}[kind]||'';
  openModal('<h3>'+d.icon+' '+d.name+' ─ 完了!</h3>'+
    '<div class="giftbox">正解 <b style="font-size:18px">'+okN+' / '+n+'</b>'+(okN>=n? ' ─ 完璧! 🎉':'')+
      '<br><span class="small">'+tip+'</span></div>'+
    '<div class="row" style="gap:10px">'+
    '<button class="btn grow" id="drillAgain">'+d.icon+' もう1本</button>'+
    '<button class="btn primary grow" id="drillEnd">学習にもどる</button></div>');
  $("drillAgain").onclick=()=>startDrill(kind);
  $("drillEnd").onclick=()=>{ closeModal(); newQuestion(); };
}

/* 出題(newQuestionから分岐)。phrStartはテスト・ドリルからの直接起動にも使う(fmtで形式を強制できる) */
function phrNewQuestion(){
  clearTimeout(phrAutoT);
  if(PDRILL){
    const d=PHR_DRILLS[PDRILL.kind];
    if(PDRILL.res.length>=d.steps.length){ openDrillDone(); return; }
    const pool=d.pool? d.pool(PDRILL.used) : drillPool(d.steps[PDRILL.res.length], PDRILL.used); // v5.25.0: ドリル専用のプール(ウォームアップ)
    const p=d.ordered? pool[0] : pool[Math.floor(Math.random()*pool.length)];
    PDRILL.used.add(p.en);
    phrStart(p, (SPEAK_ENABLED || d.fmt==="sp")? "sp" : (d.fmt||"mc")); // 実戦=ドリルごとの固定形式(v5.10.0: 選択式/v5.25.0: ウォームアップは口頭)
    return;
  }
  phrStart(pickPhrase());
}
function phrStart(p, fmt){
  const st=G.phr[p.en];
  phrCur={p, fmt:fmt||phrFormat(st), choices:null, grain:phrGrain(st), tiles:null};
  if(phrCur.fmt==="or") phrCur.tiles=phrTiles(p, phrCur.grain);
  if(phrCur.fmt==="mc") phrCur.choices=buildPhrChoices(p);
  if(phrCur.fmt==="fs") phrCur.choices=buildPhrChoicesFS(p);
  phrRenderQuestion();
}
/* 全文4択(v5.10.0)の誤答: 同じカテゴリの英文を優先(=意図の近い文どうしの弁別)。足りなければ全体から */
function buildPhrChoicesFS(p){
  const same=shuffle(allPhrases().filter(x=>x.c===p.c && x.en!==p.en && !overlaps(x,p)));
  const picks=same.slice(0,3);
  if(picks.length<3){
    const rest=shuffle(allPhrases().filter(x=>x.c!==p.c && x.en!==p.en && !overlaps(x,p)));
    picks.push(...rest.slice(0, 3-picks.length));
  }
  return shuffle([p, ...picks]);
}

function phrRenderQuestion(){
  phrAnswered=false; phrPos=0; phrMiss=0; qKind="p"; // 画面の種類(quiz.js・辞書リンクの分岐に使う)
  $("resultBar").classList.remove("show");
  const pc=$("promptCard");
  pc.classList.remove("srch");
  pc.classList.add("phr"); // フレーズ用レイアウト(上詰め+バッジ行の余白確保=v5.2.0の重なり対策)
  const p=phrCur.p, st=G.phr[p.en];
  /* バッジは定着状態だけ(v5.2.0実機FB: 分類名は長く、複数行の日本語と重なっていた。
     分類は答え合わせの結果バーで見せる)。実戦ドリル中はステップ名(①主張 等)を出す */
  $("qBadge").textContent = PDRILL
    ? PHR_DRILLS[PDRILL.kind].steps[PDRILL.res.length].t
    : (!st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習"));
  $("qBadge").style.color="var(--accent2)";
  refreshQuizCount();
  const pw=$("promptWord");
  pw.textContent=p.ja;
  pw.className="ja";
  $("qStats").innerHTML=qStatsHTML(st);
  const bl=$("phrBuild");
  bl.classList.remove("hidden"); bl.classList.remove("wex"); // 文脈行は出題時から常設(答え合わせでレイアウトが動かない)。wex=単語モードの用例枠(v5.24.0)
  const box=$("choices"); box.innerHTML="";
  clearInterval(phrSpkT); phrSpkT=null; // 口頭の制限時間タイマーの残りを掃除
  if(phrCur.fmt==="mc"){
    // 核のクローズ4択(v5.1.0): 文は見せて核だけ空欄。選択肢は核チャンク
    box.className="choices";
    bl.innerHTML=phrCtxHTML(p, false);
    /* 先に思い出すステップ(v5.3.0実機FB): 4択は再認(見覚えの照合)で解けてしまい、
       見ずに言う再生とギャップが生まれる。選択肢を開く前に1回、自力想起を必ず挟む
       (covert retrieval)。テンポ優先の人は設定でオフにできる */
    if(G.opt.preRecall){
      const b=document.createElement("button");
      b.className="choice rcbtn";
      b.id="phrRecallBtn";
      b.innerHTML='🧠 まず自力で思い出す<span class="rcsub">空欄の英語を(心の中で)言ってから、タップで選択肢</span>';
      b.onclick=()=>{ if(!phrAnswered) phrShowChoicesMC(); };
      box.appendChild(b);
    }else phrShowChoicesMC();
  }else if(phrCur.fmt==="fs"){
    /* 全文4択(v5.10.0・box4〜/グラフ描写ドリル): 文脈行の助けなしに、意図から英文全体を選ぶ。
       「先に思い出す」ステップ(設定・既定ON)は、ここでも4択を開く前に1回の自力想起を挟む */
    box.className="choices";
    bl.innerHTML='<span class="pbslot">💬 この意図を英語で ─ 4つの英文から選ぶ</span>';
    if(G.opt.preRecall){
      const b=document.createElement("button");
      b.className="choice rcbtn";
      b.id="phrRecallBtn";
      b.innerHTML='🧠 まず自力で英文を思い出す<span class="rcsub">頭の中で言ってから、タップで選択肢</span>';
      b.onclick=()=>{ if(!phrAnswered) phrShowChoicesFS(); };
      box.appendChild(b);
    }else phrShowChoicesFS();
  }else if(phrCur.fmt==="or"){
    // 並べ替え: 片(チャンク=定着0-1/単語=定着2〜)を正しい順にタップ(語順と結びつきの自動化)
    const wordy=phrCur.grain==="w";
    bl.innerHTML='<span class="pbslot">💬 '+(wordy? '単語':'チャンク')+'を正しい順にタップ</span>';
    if(phrRecallFirst(st)){
      box.className="choices";
      const b=document.createElement("button");
      b.className="choice rcbtn";
      b.id="phrRecallBtn";
      b.innerHTML='🧠 まず自力で英文を思い出す<span class="rcsub">頭の中で言ってから、タップで単語を並べる</span>';
      b.onclick=()=>{ if(!phrAnswered) phrShowTiles(); };
      box.appendChild(b);
    }else phrShowTiles();
  }else{
    // 口頭自己判定(v5.1.0・box4〜): 意図だけ見て声に出す→答えを見て⭕✖(採点は自分に正直に)
    box.className="choices";
    bl.innerHTML='<span class="pbslot">🎙 思い出して、声に出して言おう(答えを見る前に)</span>';
    const b=document.createElement("button");
    b.className="choice spshow";
    b.id="phrSpkShow";
    b.textContent="💬 答えを見る";
    b.onclick=()=>phrSpeakReveal(false);
    box.appendChild(b);
    /* 制限時間(v5.3.0設定・0=オフ): 流暢さ=想起の速さの訓練。カウントダウンして
       時間切れで自動的に答えを開く(判定は従来どおり自分で) */
    if(G.opt.spkSec){
      phrSpkLeft=Math.round(G.opt.spkSec/1000);
      b.textContent="💬 答えを見る(あと"+phrSpkLeft+"秒)";
      phrSpkT=setInterval(phrSpkTick, 1000);
    }
  }
}

/* ---- 口頭の制限時間(v5.3.0) ---- */
let phrSpkT=null, phrSpkLeft=0;
function spkSecCycle(v){ return {0:5000, 5000:8000, 8000:12000, 12000:0}[v||0]||0; }
function spkSecLabel(v){ return {0:"オフ", 5000:"5秒", 8000:"8秒", 12000:"12秒"}[v||0]||"オフ"; }
function phrSpkTick(){
  const b=$("phrSpkShow");
  if(!b || phrAnswered){ clearInterval(phrSpkT); phrSpkT=null; return; } // 画面が変わっていたら自壊
  phrSpkLeft--;
  if(phrSpkLeft<=0){ clearInterval(phrSpkT); phrSpkT=null; phrSpkTimeUp(); return; }
  b.textContent="💬 答えを見る(あと"+phrSpkLeft+"秒)";
}
function phrSpkTimeUp(){
  if(phrAnswered || !phrCur || phrCur.fmt!=="sp" || !$("phrSpkShow")) return;
  phrSpeakReveal(true);
}

/* クローズ4択の選択肢を開く(v5.3.0: 「先に思い出す」ステップの後、または設定オフなら即時) */
function phrShowChoicesMC(){
  const box=$("choices"); box.innerHTML=""; box.className="choices";
  phrCur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.innerHTML=choiceHTML((phrCloze(c)||{key:c.en}).key);
    b.onclick=()=>phrAnswerMC(c,b);
    box.appendChild(b);
  });
  refitChoices("#choices .choice");
}

/* 全文4択の選択肢を開く(v5.10.0)。英文は長いので専用の見た目(.fs=小さめの文字・複数行) */
function phrShowChoicesFS(){
  const box=$("choices"); box.innerHTML=""; box.className="choices";
  phrCur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice fs";
    b.textContent=c.en;
    b.onclick=()=>phrAnswerFS(c,b);
    box.appendChild(b);
  });
}
function phrAnswerFS(chosen, btn){
  if(phrAnswered || !phrCur) return;
  const p=phrCur.p, ok=chosen.en===p.en;
  document.querySelectorAll("#choices .choice").forEach(b=>{
    b.disabled=true;
    if(b.textContent===p.en) b.classList.add("correct");
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  phrFinish(ok);
  armCorrectNext("#choices", newQuestion); // 正解の英文タップでも次へ(v5.10.0)
}

/* 口頭ステージ(SPEAK_ENABLED=trueのときだけ出る): 答えを開いてから自己判定。🔊お手本(TTS)は答え合わせ後も押せる(シャドーイング用)。
   timedOut=制限時間切れで自動的に開いた(v5.3.0) */
function phrSpeakReveal(timedOut){
  if(phrAnswered || !phrCur) return;
  clearInterval(phrSpkT); phrSpkT=null;
  const p=phrCur.p;
  $("phrBuild").innerHTML=phrCtxHTML(p, true);
  const box=$("choices"); box.innerHTML="";
  if(timedOut){
    const n=document.createElement("div");
    n.className="small sptimeup";
    n.textContent="⏰ 時間切れ ─ 本番なら沈黙。言えていたかで正直に判定しよう";
    box.appendChild(n);
  }
  const mk=(id, cls, label, fn)=>{
    const b=document.createElement("button");
    b.className="choice "+cls; b.id=id; b.textContent=label; b.onclick=fn;
    box.appendChild(b); return b;
  };
  const judge=ok=>{
    if(phrAnswered) return;
    $("phrSpkOk").disabled=$("phrSpkNg").disabled=true;
    $("phrSpkOk").classList.toggle("correct", ok);
    $("phrSpkNg").classList.toggle("wrong", !ok);
    phrFinish(ok);
  };
  mk("phrSpkOk", "spok", "⭕ 言えた", ()=>judge(true));
  mk("phrSpkNg", "spng", "✖ まだ言えない", ()=>judge(false));
  if("speechSynthesis" in window)
    mk("phrTts", "sptts", "🔊 お手本を聞く(そのまま声に出そう)", ()=>phrSay(p.en));
}
function phrSay(en){
  try{
    const u=new SpeechSynthesisUtterance(en);
    u.lang="en-US"; u.rate=0.95;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }catch(e){}
}

/* 並べ替えの片を開く(v5.15.0: 「先に思い出す」の後、または即時)。片はシャッフル(偶然正順になったら混ぜ直す) */
function phrShowTiles(){
  const box=$("choices"); box.innerHTML="";
  box.className="choices chunks"+(phrCur.grain==="w"? " words":"")+(phrCur.tiles.length>12? " many":""); // 13片以上は小さめ(v5.16.0・論述の長文)
  let arr=shuffle(phrCur.tiles.slice());
  if(arr.length>2 && arr.join(" ")===phrCur.tiles.join(" ")) arr=shuffle(arr);
  arr.forEach(t=>{
    const b=document.createElement("button");
    b.className="chunkbtn";
    b.textContent=t;
    b.onclick=()=>phrTapChunk(t,b);
    box.appendChild(b);
  });
}
/* 並べ替えのタップ: 正しい次の片なら確定、違えばミスとして数える(1ミスでも不正解扱い)。
   タップは常にどれかが正解なので詰まない=降参ボタン不要。同じ語が2つあっても表層形が同じならどちらでも正解 */
function phrTapChunk(t,b){
  if(phrAnswered || !phrCur) return;
  const tiles=phrCur.tiles||phrCur.p.ch;
  if(t===tiles[phrPos]){
    b.disabled=true; b.classList.add("used");
    phrPos++;
    $("phrBuild").innerHTML='<b>'+esc(tiles.slice(0,phrPos).join(" "))+'</b>'+
      (phrPos<tiles.length? ' <span class="pbslot">▁</span>':'');
    if(phrPos>=tiles.length) phrFinish(phrMiss===0);
  }else{
    phrMiss++;
    b.classList.add("wrong");
    setTimeout(()=>b.classList.remove("wrong"), 350);
  }
}

function phrAnswerMC(chosen, btn){
  if(phrAnswered || !phrCur) return;
  const p=phrCur.p, ok=chosen.en===p.en;
  const key=(phrCloze(p)||{key:p.en}).key; // 選択肢の表示は核チャンク(v5.1.0)
  document.querySelectorAll("#choices .choice").forEach(b=>{
    b.disabled=true;
    if(b.textContent===key) b.classList.add("correct"); // csegはtextContentを変えない(v4.30.0)
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  phrFinish(ok);
  armCorrectNext("#choices", newQuestion); // 正解の選択肢タップでも次へ(v5.10.0)
}

/* 帳簿(単語のanswer()と同じ骨格): SRS→フレーズ日別→経済(共有)→結果表示 */
function phrFinish(ok){
  phrAnswered=true;
  sfx(ok? "ok":"ng"); // 効果音(v5.23.0)
  const p=phrCur.p, now=Date.now();
  let st=G.phr[p.en];
  const wasNew=!st;
  if(!st) st=G.phr[p.en]=[0,0,0,0,0,0,0];
  const preBox=st[0];
  const pd=pdayRec();
  const vPre=knowScore(G.phr); // 語彙力(v5.22.0): フレーズも同じ物差しでpdaysにv0/vを残す
  srsApply(st, ok, now);
  st[8]=now; // 最後に解いた時刻(v5.16.0・同期は新しい方が勝つ)
  pd.a++; if(ok) pd.c++;   // 目安・あゆみとは別台帳(G.pdays)
  vocabSnap(pd, vPre, knowScore(G.phr));
  const bonus5=ansBonus();                      // 5問ボーナスは単語+フレーズの合算
  track("ans"); if(ok) track("cor");            // 任務・実績のクイズ系は共有
  phrNoteRecent(p.en);
  if(PDRILL) PDRILL.res.push(ok); // 実戦ドリルの進行(v5.2.0)
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; st[9]=now; pd.m++; justMastered=true; }
  /* 30問セットの帳簿(v5.10.0): フレーズの解答もセットの進みに数える(単語+フレーズの合算)。
     境界に達したら「次へ」で完了モーダル(ドリル中は終わってから) */
  const tk=(ok? corTicketGain():0)+bonus5;
  if(setRecord(G, todayTotal(), {ok, wasNew, up:ok && st[0]>preBox, mas:justMastered, tk, phr:1})) setDonePending=true;
  let bigT=false;
  if(ok){
    G.combo=(G.combo||0)+1;
    G.tickets+=corTicketGain();
    const l0=accountLevel();
    G.xp+=Math.round((10+(justMastered?40:0))*streakXpMult()*comboXpMult()*abilityXpMult());
    const l1=accountLevel();
    if(justMastered){ toast("🏅 フレーズを覚えた! 7日あけても出てきた"); vibe([30,40,60]); bigT=true; }
    else if(GAME_ENABLED && l1>l0){ toast("📖 レベルアップ! Lv"+l1+" ─ 全ステータス強化"); vibe(40); bigT=true; } // v5.22.0: ゲーム面オフではLvは実績の中だけ
  }else{
    G.combo=0;
  }
  if(GAME_ENABLED && bonus5 && !bigT) toast("🎁 5問ごとのボーナス 🎫+"+bonus5);
  /* 答え合わせ: 常設の文脈行の空欄を核で埋める(核はハイライト)。
     v5.0の「青字の全文を後から差し込む」は廃止 ─ 要素が増えないのでレイアウトが動かない */
  $("phrBuild").innerHTML=phrCtxHTML(p, true);
  /* 論述・根拠(v5.16.0)の型は長い(例: Although X has a merit, a single Y can Z(譲歩→反論))ので、
     結果バーの狭い枠ではなく英文の直下に全文を出し、結果バーには末尾の日本語ラベル(譲歩→反論)だけを出す */
  const ptLabel=(p.c==="es" && p.pt)? (p.pt.match(/[(（]([^()（）]+)[)）]\s*$/)||[])[1] : null;
  if(ptLabel) $("phrBuild").innerHTML+='<div class="ptline">🧩 '+esc(p.pt)+'</div>';
  $("qStats").innerHTML=qStatsHTML(st);
  /* pt(型の一般形・v5.4.0)があれば核の代わりに型を見せる: 1文の暗記を
     「enable 人 to do」のような使い回せる型の獲得につなげる */
  $("resultCard").innerHTML='<span class="poschip phrcat">'+(PHR_CATS[p.c]||"")+'</span>'+
    (p.pt
      ? '<span class="rmeta">🧩 <b class="pkey">'+esc(ptLabel||p.pt)+'</b></span>'
      : '<span class="rmeta">🔑 <b class="pkey">'+esc(p.k)+'</b></span>'+
        '<span class="rmeta small"> '+(p.ty==="s"? "🧩 型":"🔗 連語")+' ・ 単語タップで辞書</span>');
  $("resultBar").classList.add("show");
  $("promptCard").classList.add("srch"); // タップで核の語を辞書へ(quiz.js側で分岐)
  saveG(); refreshHeader(); refreshQuizCount();
  checkAchievements(); // 学習の実績(v5.13.0・自動付与)
  if(G.opt && G.opt.autoNext){
    clearTimeout(phrAutoT);
    phrAutoT=setTimeout(()=>{ if(phrAnswered) newQuestion(); }, G.opt.autoNext);
  }
}

/* ---- フレーズのあゆみ(v5.3.0): 日別グラフ+定着の階段の分布 ----
   単語の「学習のあゆみ」のフレーズ版(台帳はG.pdays=目安と別カウント)。
   導線は⚙設定・記録と🎤実戦メニューの2か所 */
function pdayHistory(g, n, offset){
  const out=[], base=new Date(), off=offset||0;
  for(let i=n-1+off;i>=off;i--){
    const dt=new Date(base.getFullYear(), base.getMonth(), base.getDate()-i);
    const k=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
    const r=(g.pdays||{})[k]||{};
    out.push({k, md:(dt.getMonth()+1)+"/"+dt.getDate(), day:dt.getDate(), a:r.a||0, c:r.c||0, m:r.m||0});
  }
  return out;
}
function openPhrHistoryModal(page){
  page=+page; if(!isFinite(page) || page<0) page=0; // onclick直結でイベントが渡っても0扱い
  const h=pdayHistory(G, 14, page*14);
  const max=Math.max(1, ...h.map(x=>x.a));
  const H=56;
  const bars=h.map(x=>{
    const bh=x.a? Math.max(3, Math.round(H*x.a/max)) : 0;
    return '<div class="hcol"><div class="hval">'+(x.a||"")+'</div>'+
      '<div class="hbarw"><div class="hbar" style="height:'+bh+'px"></div></div>'+
      '<div class="hday">'+x.day+'</div></div>';
  }).join("");
  let oldest=null;
  for(const k in G.pdays){ if((G.pdays[k].a||0)>0 && (!oldest || k<oldest)) oldest=k; }
  const hasPrev=!!(oldest && oldest<h[0].k);
  let daysN=0, tot=0, totC=0;
  for(const k in G.pdays){ const r=G.pdays[k]; if(r.a>0){ daysN++; tot+=r.a; totC+=r.c||0; } }
  // 定着の階段の分布: どの出題形式の層に何フレーズいるか(=次に何をすれば進むかが見える)
  let s0=0,s1=0,s2=0,s3=0,s4=0;
  allPhrases().forEach(p=>{
    const st=G.phr[p.en];
    if(!st) s0++;
    else if(st[0]>=MASTER_BOX) s4++;
    else if(st[0]>=4) s3++;
    else if(st[0]>=2) s2++;
    else s1++;
  });
  const top=SPEAK_ENABLED? "🎙 口頭チェック" : "💬 全文4択", topDone=SPEAK_ENABLED? "口頭で言えた" : "全文4択で正解";
  // 階段の説明(v5.15.0: 並べ替えに一本化=粒度の階段。フラグoffは従来の3形式)
  const ladder=PHR_REORDER_ALL
    ? {help:'🧩チャンクの並べ替え(定着0-1)→🔤単語の並べ替え(2-3)→🧠思い出してから単語の並べ替え(4)→正解で「✓覚えた」(定着5)',
       rows:[['🧩 チャンクの並べ替え(定着0-1)', s1], ['🔤 単語の並べ替え(定着2-3)', s2], ['🧠 思い出してから並べ替え(定着4)', s3]],
       done:'思い出して並べられた'}
    : {help:'🧠クローズ4択(定着0-1)→🧩並べ替え(2-3)→'+top+'(4)→正解で「✓覚えた」(定着5)',
       rows:[['🧠 クローズ4択(定着0-1)', s1], ['🧩 並べ替え(定着2-3)', s2], [top+'(定着4)', s3]],
       done:topDone};
  openModal('<h3>📊 フレーズのあゆみ '+helpBtn("hlp-phist")+'</h3>'+
    helpNote("hlp-phist", 'フレーズは単語の「今日の目安」とは別カウント(このグラフが専用の記録・30問セットの進みには数える)。'+
      '出題は定着の階段と連動する: '+ladder.help+'。忘却曲線・復習間隔は単語と同じ')+
    '<div class="row histnav" style="gap:8px; margin-top:6px">'+
      '<button class="btn hnav" id="phrHistPrev"'+(hasPrev?'':' disabled')+'>◀</button>'+
      '<div class="grow" style="text-align:center; font-weight:800">'+h[0].md+' 〜 '+h[13].md+
        '<span class="small" style="font-weight:700"> ・ '+fmt(h.reduce((s,x)=>s+x.a,0))+'問</span></div>'+
      '<button class="btn hnav" id="phrHistNext"'+(page>0?'':' disabled')+'>▶</button></div>'+
    '<div class="histchart">'+bars+'</div>'+
    '<div class="small" style="margin-top:6px">バー=その日のフレーズ解答数</div>'+
    '<table class="stt" style="margin-top:12px">'+
      '<tr><td>累計解答(全期間)</td><td>'+fmt(tot)+'問(正答率 '+(tot? Math.round(100*totC/tot):0)+'%)</td></tr>'+
      '<tr><td>学習した日数</td><td>'+daysN+'日</td></tr>'+
      '<tr><td>覚えたフレーズ</td><td>'+fmt(s4)+' / '+fmt(allPhrases().length)+
        (myphrList().length? '(マイ '+myphrList().length+'件を含む)':'')+'</td></tr>'+
    '</table>'+
    '<h2 style="margin-top:12px">🪜 定着の階段(いまの分布)</h2>'+
    '<table class="stt">'+
      ladder.rows.map(r=>'<tr><td>'+r[0]+'</td><td>'+fmt(r[1])+'</td></tr>').join("")+
      '<tr><td>✓ 覚えた('+ladder.done+')</td><td>'+fmt(s4)+'</td></tr>'+
      '<tr><td>未学習</td><td>'+fmt(s0)+'</td></tr>'+
    '</table>');
  $("phrHistPrev").onclick=()=>{ if(hasPrev) openPhrHistoryModal(page+1); };
  $("phrHistNext").onclick=()=>{ if(page>0) openPhrHistoryModal(page-1); };
}

/* ---- マイフレーズの登録UI(v5.6.0) ----
   貼り付け→自動解析(英文/日本語/チャンク/核)→登録の最短動線。核は単語チップのタップで変更できる
   (1語目のタップ=その語だけ・範囲外の2語目のタップ=そこまで範囲を広げる) */
function openMyphrAdd(){
  openModal('<h3>➕ マイフレーズ登録 '+helpBtn("hlp-my")+'</h3>'+
    helpNote("hlp-my", '英会話の先生の添削・記事やネイティブとの対話で出会った「言えなかった表現」を、'+
      '自分専用のフレーズとして登録する。貼り付けると英文・日本語(2行目にあれば)・チャンク分割・'+
      '核(🔑=覚えたい部分)の候補を自動で読み取る。登録後は内蔵フレーズと同じ復習・出題・報酬に乗る。<br><br>'+
      '<b>プライバシー</b>: 登録内容は<b>この端末と、同期を使う場合はあなた自身のGoogleドライブの非公開領域にだけ</b>保存される。'+
      'このアプリはサーバー処理のない静的サイトなので、開発者や他の利用者に内容が送られる経路は存在しない')+
    addSegHTML("p")+
    '<textarea id="myphrText" class="myta" rows="3" placeholder="英文を貼り付け(2行目に日本語があれば自動で取り込む)"></textarea>'+
    '<button class="btn" id="myphrPaste" style="margin-top:8px; width:100%">📋 クリップボードから貼り付け</button>'+
    '<div id="myphrPrev" style="margin-top:10px"></div>'+
    '<div class="row" style="gap:10px; margin-top:12px">'+
    '<button class="btn" id="myphrListBtn">📚 登録済み '+myphrList().length+'件</button>'+
    '<button class="btn primary grow" id="myphrSave" disabled>登録する</button></div>');
  bindAddSeg();
  const ta=$("myphrText");
  let cur=null; // {en, words[], kf, kt}
  const kString=()=>{
    if(!cur) return "";
    return cur.words.slice(cur.kf, cur.kt+1).join(" ").replace(/^[^A-Za-z'-]+|[^A-Za-z'-]+$/g,"");
  };
  const renderPrev=(parsedJa)=>{
    const box=$("myphrPrev");
    if(!cur){ box.innerHTML=""; $("myphrSave").disabled=true; return; }
    const keepJa=($("myphrJa")&&$("myphrJa").value)||parsedJa||"";
    box.innerHTML=
      '<div class="small" style="margin-bottom:4px">🔑 核(覚えたい部分)を確認 ─ 単語をタップで変更</div>'+
      '<div class="mywords">'+cur.words.map((w,i)=>
        '<button class="wchip'+(i>=cur.kf&&i<=cur.kt?" ksel":"")+'" data-i="'+i+'">'+esc(w)+'</button>').join("")+'</div>'+
      '<input id="myphrJa" class="pdate" style="margin-top:8px" placeholder="言いたかったこと(日本語で一言・思い出す手がかり)" value="'+esc(keepJa)+'">'+
      '<div class="small" style="margin-top:6px">チャンク分割(自動): '+myphrChunks(cur.en).map(esc).join(" ⁄ ")+'</div>';
    box.querySelectorAll(".wchip").forEach(b=>{
      b.onclick=()=>{
        const i=+b.dataset.i;
        if(i<cur.kf) cur.kf=i;            // 範囲より前=そこまで広げる
        else if(i>cur.kt) cur.kt=i;       // 範囲より後=そこまで広げる
        else { cur.kf=cur.kt=i; }         // 範囲内=その語だけに絞り直す
        renderPrev();
      };
    });
    $("myphrSave").disabled=false;
  };
  const reparse=()=>{
    const r=myphrParse(ta.value);
    if(!r.en){ cur=null; renderPrev(); return; }
    if(!cur || cur.en!==r.en){
      const i=myphrSuggestKey(r.en);
      cur={en:r.en, words:r.en.split(" "), kf:i, kt:i};
    }
    renderPrev(r.ja);
  };
  ta.oninput=reparse;
  $("myphrPaste").onclick=()=>{
    if(!navigator.clipboard || !navigator.clipboard.readText){ toast("この環境では手動で貼り付けてください"); return; }
    navigator.clipboard.readText().then(t=>{ ta.value=t; reparse(); })
      .catch(()=>toast("貼り付けが許可されなかった ─ 長押しで貼り付けてください"));
  };
  $("myphrListBtn").onclick=openMyphrList;
  $("myphrSave").onclick=()=>{
    if(!cur) return;
    const r=myphrAdd(cur.en, $("myphrJa")&&$("myphrJa").value, kString());
    if(r.err){ toast(r.err); return; }
    toast("📝 登録した! フレーズ学習に混ざって出てくる");
    ta.value=""; cur=null; renderPrev();
    $("myphrListBtn").textContent="📚 登録済み "+myphrList().length+"件"; // 続けて登録できる
  };
}
function openMyphrList(){
  const list=myphrList();
  openModal('<h3>📚 マイフレーズ('+list.length+'件)</h3>'+
    '<div class="small">この端末(と本人のDrive)にだけ保存 ─ 誰にも共有されない</div>'+
    (list.length
      ? '<div class="panel" style="margin-top:8px">'+list.map(p=>
          '<div class="myrow"><div class="grow"><b style="font-size:13px">'+esc(p.en)+'</b><br>'+
          '<span class="small">'+esc(p.ja)+' ・ 🔑'+esc(p.k)+'</span></div>'+
          '<button class="btn mydel" data-en="'+esc(p.en)+'">🗑</button></div>').join("")+'</div>'
      : '<div class="empty">まだ無い ─ 「言えなかった表現」を貼り付けて登録しよう</div>')+
    '<div class="row" style="margin-top:12px"><button class="btn primary grow" id="myphrAddBtn">➕ 登録する</button></div>');
  $("modal").querySelectorAll(".mydel").forEach(b=>{
    b.onclick=()=>{ myphrDelete(b.dataset.en); toast("削除した(同期で他の端末にも反映)"); openMyphrList(); };
  });
  $("myphrAddBtn").onclick=openMyphrAdd;
}

/* ---- 学習対象のセグ切替(単語/フレーズ)。好みはG.opt.qtab(端末ローカル優先マージ) ---- */
function phrSyncSeg(){
  const seg=$("quizSeg"); if(!seg) return;
  seg.querySelectorAll("button").forEach(x=>x.classList.toggle("active", x.dataset.q===quizTarget()));
}
$("quizSeg").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{
    if(b.dataset.q==="dr"){ openDrillMenu(); return; } // 実戦は「入口」(モードではない=v5.2.0)
    if(b.dataset.q==="add"){ openMywAdd(); return; } // ➕=マイ単語(v5.11.0)/マイフレーズ(v5.6.0)の登録入口(モーダル内で切替)
    PDRILL=null; // モード(ミックス/単語/フレーズ)への切替でドリル・にがて特訓は中断
    if(typeof FOCUS!=="undefined"){ if(FOCUS && FOCUS.mock) clearInterval(FOCUS.mock.timer); FOCUS=null; }
    if(quizTarget()===b.dataset.q) return; // 同状態への切替は無視(冪等)
    G.opt.qtab=b.dataset.q; saveG();
    phrSyncSeg();
    newQuestion();
  };
});
phrSyncSeg(); // 起動時に保存済みの好みをセグへ反映
