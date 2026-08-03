"use strict";
/* ================= 単語カード(呪文文法) =================
   カードは (英単語, レア度) で一意。性能は単語のハッシュから決定的に生成する。
   v4: 育成は「重ねるだけ」─ 同じカードを入手するたびLv+1(Lv=枚数-1・上限なし)。
   旧「2枚合成で+1」は廃止(2^n枚問題の解消)。かけら強化=1枚重ねる、と同義。
   v3: カードは「文」に左から並べる演算子。品詞が文法上の役割を決める(Noita/Balatro参考):
     名詞=基礎値(+n。綴りが長い単語ほど大きい) / 形容詞=直後の名詞を修飾(×m or ^p)
     動詞=発動(溜めた値で行動し節を区切る) / 副詞=文末効果(反復・増幅・守護) */

function keyOf(en,rar,lv){ return en+"|"+rar+"|"+lv; }
function parseKey(k){ const p=k.split("|"); return {en:p[0], rar:+p[1], lv:+p[2]}; }

const POS_ICON={n:"💎", adj:"✨", v:"⚔️", adv:"🌀"};
const ELEM_ICON=["🔥","💧","🍃","☀️","🌙"];
const ELEM_NAME=["火","水","風","光","闇"];
/* 動詞の発動タイプ。expF は期待ダメージ係数(戦闘力・おまかせ編成用) */
const VERB_TYPES=[
  {name:"強撃", note:"溜めた値で一撃",       expF:1},
  {name:"貫通", note:"敵の防御をほぼ無視",   expF:0.85},
  {name:"吸収", note:"与ダメージの45%を回復", expF:0.8},
  {name:"連撃", note:"60%×2回攻撃",          expF:1.2},
];
const ADV_KIND=["反復","増幅","守護"];

function genCard(w, rar, lv){
  const h=hashStr(w.en);
  // Lvは上限なし。+10まではフル(+30%/Lv相当)、以降は35%効率で伸び続ける
  const el=lv<=10? lv : 10+(lv-10)*0.35;
  const rm=RAR_MULT[rar-1], lm=1+0.3*el;
  const c={en:w.en, ja:w.ja, pos:w.pos, rar, lv, key:keyOf(w.en,rar,0)};
  if(w.pos==="n"){
    // 基礎値: 長い(=難しい)単語ほど強い
    c.val=Math.round((8+Math.min(12,w.en.length)*2+h%9)*rm*lm);
  }else if(w.pos==="adj"){
    c.sub=Math.floor(h/13)%2; // 0=乗算 / 1=累乗
    if(c.sub===0) c.m=+((1+(0.2+(h%6)*0.05)*(1+0.35*(rar-1))*(1+0.15*el)).toFixed(2));
    else          c.p=+((1+(0.04+(h%5)*0.01)*(1+0.3*(rar-1))*(1+0.12*el)).toFixed(3));
  }else if(w.pos==="v"){
    c.vt=Math.floor(h/31)%4;  // 発動タイプ
    c.w=+(((100+10*(h%6)+20*(rar-1)+12*el)/100).toFixed(2)); // 発動倍率
  }else{ // adv
    c.sub=Math.floor(h/17)%3; // 0=反復 / 1=増幅 / 2=守護
    if(c.sub===0)      c.r=+(Math.min(0.9, 0.35+(h%4)*0.05+0.06*(rar-1)+0.04*el).toFixed(2));
    else if(c.sub===1) c.m=+((1+(0.08+(h%5)*0.02)*(1+0.3*(rar-1))*(1+0.12*el)).toFixed(2));
    else               c.g=Math.min(30, Math.round((5+h%5)+3*(rar-1)+2*el));
  }
  c.icon=POS_ICON[c.pos];
  c.typeName = c.pos==="n"? "基礎値"
             : c.pos==="adj"? (c.sub===0?"乗算":"累乗")
             : c.pos==="v"? VERB_TYPES[c.vt].name
             : ADV_KIND[c.sub];
  c.elem=Math.floor(h/7)%5; // 属性(セット効果・相性用)。他の判定と別ビットで決める
  c.elemIcon=ELEM_ICON[c.elem];
  c.roots=rootIdsOf(w.en);  // 語根タグ(共鳴判定用。表示は rootText)
  c.wild=c.roots.length===0; // 野生語: 語根なし。プレイヤーの記憶Lvが力になる
  return c;
}
/* ---- 野生語: SRSの記憶レベル(box 0〜7)がそのまま強さになる ---- */
function isWild(en){ return rootIdsOf(en).length===0; }
function memBox(en){ const st=G.words[en]; return st? Math.min(7, st[0]||0) : 0; }
function wildMult(en){ return +(1+0.08*memBox(en)).toFixed(2); }
function wildOverdue(en){ const st=G.words[en]; return !!st && st[1]<=Date.now(); }
/* 重ねLv: 所持枚数-1(1枚=Lv0)。上限なし */
function stackLv(key){ return Math.max(0, (G.inv[key]||0)-1); }
function cardOf(key){
  const p=parseKey(key), w=byEn[p.en];
  if(!w) return null;
  // 所持カードは重ね枚数でLvが決まる。未所持(試算・テスト用キー)はキーのlvを使う
  return genCard(w, p.rar, Math.max(p.lv, stackLv(keyOf(p.en,p.rar,0))));
}
function effectText(c){
  if(c.pos==="n") return "基礎値 +"+fmt(c.val);
  if(c.pos==="adj") return c.sub===0? "修飾: 次の名詞を ×"+c.m : "修飾: 次の名詞を ^"+c.p+"(累乗)";
  if(c.pos==="adv") return c.sub===0? "文末: 直前の発動をもう一度(威力×"+c.r+")"
                    : c.sub===1? "文末: ダメージ全体 ×"+c.m
                    : "文末: 受けるダメージ -"+c.g+"%";
  const vt=VERB_TYPES[c.vt||0];
  return "発動:【"+vt.name+"】×"+c.w+"("+vt.note+")";
}
/* 編成チップ等に出す短い表記 */
function shortEffect(c){
  if(c.pos==="n") return "+"+fmt(c.val);
  if(c.pos==="adj") return c.sub===0? "×"+c.m : "^"+c.p;
  if(c.pos==="adv") return c.sub===0? "反復×"+c.r : c.sub===1? "全体×"+c.m : "守護-"+c.g+"%";
  return VERB_TYPES[c.vt||0].name+"×"+c.w;
}
function lvLabel(c){ return c.lv>0? " +"+c.lv : ""; }

/* ---- 入手(=重ね) ---- */
function addCard(en, rar){
  const k=keyOf(en,rar,0);
  G.inv[k]=(G.inv[k]||0)+1;
  track("card");
  if(G.inv[k]>=2) track("merge"); // 2枚目からは「重ね」として計上(旧・合成の後継)
  return k;
}
/* 文の中のkey参照を書き換える(nk=nullなら外す) */
function replaceInSentence(key, nk){
  const s=G.party.sentence||[];
  for(let i=0;i<s.length;i++){ if(s[i]===key) s[i]=nk; }
}

/* ---- かけら経済: 不要カードを分解してかけらに、かけらで任意カードを強化 ---- */
const SHARD_VAL=[1,3,8,20,50]; // レア度ごとの分解価値(1枚あたり・Lvに依らず一定)
function shardValue(c){ return SHARD_VAL[c.rar-1]; }
function enhCost(c){ return SHARD_VAL[c.rar-1]*2*(c.lv+1); } // 重ねるほど次の1枚が高くつく

function disassemble(key, n){
  const c=cardOf(key); if(!c) return 0;
  n=Math.min(n||1, G.inv[key]||0);
  if(n<=0) return 0;
  const gain=shardValue(c)*n;
  G.inv[key]-=n;
  if(G.inv[key]<=0){
    delete G.inv[key];
    replaceInSentence(key, null);
  }
  G.shards+=gain;
  return gain;
}
/* かけらで1枚「重ねる」(Lv+1と同義・実カード不要) */
function enhanceOne(key){
  const c=cardOf(key); if(!c) return null;
  const cost=enhCost(c);
  if((G.inv[key]||0)<1 || G.shards<cost) return null;
  G.shards-=cost;
  G.inv[key]++;
  track("merge");
  return key;
}
/* 一括分解: 指定レア度以下をまとめて分解。
   v4: 枚数=強さなので、編成中のカードには一切触れない */
function bulkDisassemble(maxRar, dry){
  const eq=equippedKeys();
  let cnt=0, gain=0;
  for(const k of Object.keys(G.inv)){
    const c=cardOf(k); if(!c || c.rar>maxRar || eq.has(k)) continue;
    const n=G.inv[k]||0;
    if(n<=0) continue;
    cnt+=n; gain+=shardValue(c)*n;
    if(!dry) delete G.inv[k];
  }
  if(!dry) G.shards+=gain;
  return {cnt, gain};
}

/* ---- 正解時のレア度判定 ----
   間違え続けた単語ほど強いカードに。久しぶり(30日以上ぶり)の正解にもボーナス */
function dropRarity(st){
  const ws=(st&&st[5])||0;
  // 連続ミスは1回ごとに効く: 節目(1/3/6/10回)で★2/3/4/5が確定、
  // その間は端数分の確率で+1(例: ミス2回=★2、50%で★3)
  const f= ws>=10? 5
    : ws>=6? 4+(ws-6)/4
    : ws>=3? 3+(ws-3)/3
    : ws>=1? 2+(ws-1)/2
    : 1;
  let r=Math.floor(f)+(Math.random()<f%1? 1:0);
  if(st && st[6] && Date.now()-st[6]>30*864e5 && ws>=1) r++;
  if(Math.random()<0.06) r++;
  return Math.min(5,r);
}

/* ================= カードタブ UI ================= */
let cardFilter="all";

function equippedKeys(){
  return new Set((G.party.sentence||[]).filter(Boolean));
}
function equippedEnSet(){
  return new Set((G.party.sentence||[]).filter(Boolean).map(k=>parseKey(k).en));
}

function renderCards(){
  const grid=$("cardGrid"); grid.innerHTML="";
  const eq=equippedKeys();
  const items=[];
  for(const k in G.inv){
    const c=cardOf(k); if(!c) continue;
    if(cardFilter!=="all" && c.pos!==cardFilter) continue;
    items.push(c);
  }
  items.sort((a,b)=> b.rar-a.rar || b.lv-a.lv || a.en.localeCompare(b.en));
  const kinds=new Set(Object.keys(G.inv).map(k=>parseKey(k).en));
  let total=0; for(const k in G.inv) total+=G.inv[k];
  $("cardSummary").innerHTML="所持 "+fmt(total)+"枚 / "+kinds.size+"種 ・ <b style='color:var(--accent)'>✨"+fmt(G.shards)+"</b>";
  if(!items.length){ grid.innerHTML='<div class="empty" style="grid-column:1/-1">クイズに正解するとカードを入手できます</div>'; return; }
  const frag=document.createDocumentFragment();
  items.forEach(c=>{
    const d=document.createElement("div");
    d.className="ccard bd"+c.rar+" el"+c.elem+(c.rar>=4?" shine":"")+(eq.has(c.key)?" equipped":"");
    d.innerHTML=
      (c.lv>0? '<span class="clv">+'+c.lv+'</span>':"")+
      '<div class="cic">'+c.icon+'</div>'+
      '<div class="cen">'+esc(c.en)+'</div>'+
      '<div class="cja">'+esc(c.ja)+'</div>'+
      '<div class="crar rc'+c.rar+'">'+c.elemIcon+' '+RAR_STARS[c.rar-1]+'</div>'+
      (eq.has(c.key)? '<span class="ceq">装備中</span>':"");
    d.onclick=()=>openCardModal(c.key);
    frag.appendChild(d);
  });
  grid.appendChild(frag);
}

function cardDetailHTML(c){
  return '<div class="bigcard bd'+c.rar+' el'+c.elem+(c.rar>=4?' shine':'')+'">'+
    '<div class="bcic">'+c.icon+'</div>'+
    '<div class="bcen">'+esc(c.en)+
      '<span style="font-size:13px; color:var(--accent)">'+lvLabel(c)+'</span></div>'+
    '<div class="bcja">'+esc(c.ja)+'</div>'+
    '<div class="bcstars rc'+c.rar+'">'+RAR_STARS[c.rar-1]+'</div>'+
    '<div class="bctype"><span class="pos'+c.pos+'">'+POS_LABEL[c.pos]+' ・ '+c.typeName+'</span>'+
      ' <span class="small">'+c.elemIcon+' '+ELEM_NAME[c.elem]+'</span></div>'+
    '<div class="bceffect">'+effectText(c)+'</div>'+
    (rootText(c.en)? '<div class="small" style="margin-top:7px">🧬 '+rootText(c.en)+'</div>':'')+
    (c.wild? '<div class="small" style="margin-top:7px; color:var(--accent)">🐺 野生語 ─ 記憶Lv'+memBox(c.en)+
      '(節×'+wildMult(c.en)+')'+(wildOverdue(c.en)? ' <b style="color:var(--ng)">⏳復習どき</b>':'')+'</div>':'')+
  '</div>';
}

/* 文の中で同じキーを使っているか(v4: 同一カードは1枠だけ・重ねはLvに宿る) */
function equippedCountOf(key, sentence){
  return (sentence||G.party.sentence||[]).filter(k=>k===key).length;
}

/* カード詳細からの直接配置: 文の最初の空きスロットに置く */
function quickEquip(key){
  const c=cardOf(key); if(!c) return null;
  const s=G.party.sentence;
  if(!(G.inv[key]>0) || equippedCountOf(key,s)>=1) return null;
  const max=sentenceSlots();
  while(s.length<max) s.push(null);
  for(let i=0;i<max;i++){
    if(!s[i]){ s[i]=key; saveG(); return i+1; }
  }
  return null; // 文が満杯
}
function openCardModal(key){
  const c=cardOf(key); if(!c) return;
  const cnt=G.inv[key]||0;
  const eq=equippedKeys().has(key);
  const cost=enhCost(c);
  openModal(
    '<h3>カード詳細</h3>'+cardDetailHTML(c)+
    '<div class="small" style="text-align:center">重ね '+cnt+'枚 = Lv+'+c.lv+
      '(もう1枚で+'+(c.lv+1)+')'+(eq?" ・ 装備中":"")+' ・ ✨'+fmt(G.shards)+'</div>'+
    '<div class="row" style="margin-top:12px; gap:8px">'+
      '<button class="btn primary" style="flex:1" id="enhBtn" '+(cnt<1||G.shards<cost?"disabled":"")+'>✨'+fmt(cost)+' で重ねる</button>'+
      '<button class="btn" style="flex:1" id="quickEqBtn" '+(eq?"disabled":"")+'>'+(eq?"呪文に配置中":"📜 呪文に置く")+'</button>'+
    '</div>'+
    '<div class="row" style="margin-top:8px; gap:8px">'+
      '<button class="btn" style="flex:1" id="disBtn">1枚分解 → ✨'+fmt(shardValue(c))+(cnt>1?"(Lvが下がる)":"")+'</button>'+
    '</div>');
  $("enhBtn").onclick=()=>{
    if(!enhanceOne(key)) return;
    saveG(); toast("重ねた! Lv+"+cardOf(key).lv+" になった"); vibe(30);
    renderCards(); openCardModal(key); refreshHeader();
  };
  $("quickEqBtn").onclick=()=>{
    const slot=quickEquip(key);
    if(!slot){ toast("呪文が満杯か、すでに配置中"); return; }
    toast("呪文の"+slot+"語目に置いた");
    renderCards(); openCardModal(key);
  };
  $("disBtn").onclick=()=>{
    const gain=disassemble(key,1);
    if(!gain) return;
    saveG(); toast("分解した → ✨"+fmt(gain));
    renderCards(); refreshHeader();
    if(G.inv[key]) openCardModal(key); else closeModal();
  };
}

$("cardFilter").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{
    $("cardFilter").querySelectorAll("button").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); cardFilter=b.dataset.f; renderCards();
  };
});
$("bulkDisBtn").onclick=()=>{
  const p1=bulkDisassemble(1,true), p2=bulkDisassemble(2,true);
  openModal('<h3>✨ 一括分解</h3>'+
    '<div class="small" style="line-height:1.7">選んだレア度以下のカードをまとめて分解し、かけらにする。装備中のカードには触れない。<br>かけらは「重ねる」に使える。</div>'+
    '<div class="row" style="margin-top:14px; gap:8px; flex-direction:column; align-items:stretch">'+
    '<button class="btn" id="bd1" '+(p1.cnt?"":"disabled")+'>★1以下を分解 ('+p1.cnt+'枚 → ✨'+fmt(p1.gain)+')</button>'+
    '<button class="btn" id="bd2" '+(p2.cnt?"":"disabled")+'>★2以下を分解 ('+p2.cnt+'枚 → ✨'+fmt(p2.gain)+')</button>'+
    '</div>');
  const run=maxRar=>{
    const r=bulkDisassemble(maxRar,false);
    saveG(); closeModal(); renderCards(); refreshHeader();
    toast(r.cnt+"枚を分解 → ✨"+fmt(r.gain));
  };
  if(p1.cnt) $("bd1").onclick=()=>run(1);
  if(p2.cnt) $("bd2").onclick=()=>run(2);
};
