"use strict";
/* ================= 単語カード =================
   カードは (英単語, レア度, 強化Lv) で一意。性能は単語のハッシュから決定的に生成する。
   品詞→役割: 名詞=装備(固定値) / 形容詞=強化(基礎ステ%) / 副詞=フィールド(全体効果) / 動詞=攻撃技 */

function keyOf(en,rar,lv){ return en+"|"+rar+"|"+lv; }
function parseKey(k){ const p=k.split("|"); return {en:p[0], rar:+p[1], lv:+p[2]}; }

const SLOT_ICON={weapon:"⚔️", armor:"🛡️", acc:"💍", buff:"💪", field:"🌟", skill:"🗡️"};
const SLOT_NAME={weapon:"武器", armor:"防具", acc:"装飾品", buff:"強化", field:"フィールド", skill:"攻撃技"};
const STAT_NAME={hp:"HP", atk:"攻撃", def:"防御", spd:"素早さ"};
const ELEM_ICON=["🔥","💧","🍃","☀️","🌙"];
const ELEM_NAME=["火","水","風","光","闇"];
/* 技タイプ: 動詞カードの個性。敵に合わせて選ぶ意味を作る
   powerF は戦闘力・おまかせ編成用の期待値係数(防御無視や回復の価値を近似) */
const SKILL_TYPES=[
  {id:0, name:"強撃", note:"",                    powerF:1},
  {id:1, name:"貫通", note:"敵の防御をほぼ無視",   powerF:1.06},
  {id:2, name:"吸収", note:"与ダメージの45%を回復", powerF:0.95},
  {id:3, name:"連撃", note:"60%×2回攻撃",          powerF:1.0},
];

function genCard(w, rar, lv){
  const h=hashStr(w.en);
  const rm=RAR_MULT[rar-1], lm=1+0.3*lv;
  const c={en:w.en, ja:w.ja, pos:w.pos, rar, lv, key:keyOf(w.en,rar,lv)};
  if(w.pos==="n"){
    c.slot=["weapon","armor","acc"][h%3];
    if(c.slot==="weapon")      c.stats={atk:Math.round((10+h%7)*rm*lm)};
    else if(c.slot==="armor")  c.stats={def:Math.round((6+h%5)*rm*lm), hp:Math.round((34+h%25)*rm*lm)};
    else                       c.stats={spd:Math.round((4+h%4)*rm*lm), atk:Math.round((4+h%3)*rm*lm)};
  }else if(w.pos==="adj"){
    c.slot="buff";
    c.buffStat=["atk","def","hp","spd"][h%4];
    c.pct=(5+h%4)+3*(rar-1)+2*lv;
  }else if(w.pos==="adv"){
    c.slot="field";
    c.fieldType=["all","proc","gold"][h%3];
    c.pct = c.fieldType==="all"  ? (3+h%3)+2*(rar-1)+Math.round(1.5*lv)
          : c.fieldType==="proc" ? (6+h%4)+3*(rar-1)+2*lv
          :                        (10+h%6)+5*(rar-1)+3*lv;
  }else{ // v
    c.slot="skill";
    c.mult=150+10*(h%6)+25*(rar-1)+15*lv;   // 攻撃倍率%
    c.proc=Math.min(60, 20+(h%3)*4+2*(rar-1)+2*lv); // 発動率%
    c.skType=Math.floor(h/31)%4; // 技タイプ(mult/proc/elemと別ビットから導出)
  }
  c.icon=SLOT_ICON[c.slot];
  c.typeName=SLOT_NAME[c.slot];
  c.elem=Math.floor(h/7)%5; // 属性(セット効果用)。slot判定と別ビットで決める
  c.elemIcon=ELEM_ICON[c.elem];
  return c;
}
function cardOf(key){
  const p=parseKey(key), w=byEn[p.en];
  return w? genCard(w,p.rar,p.lv) : null;
}
function effectText(c){
  if(c.pos==="n") return Object.keys(c.stats).map(k=>STAT_NAME[k]+" +"+fmt(c.stats[k])).join(" / ");
  if(c.pos==="adj") return STAT_NAME[c.buffStat]+" +"+c.pct+"%";
  if(c.pos==="adv") return c.fieldType==="all"? "全ステータス +"+c.pct+"%"
                    : c.fieldType==="proc"? "技の発動率 +"+c.pct+"%"
                    : "獲得ゴールド +"+c.pct+"%";
  const st=SKILL_TYPES[c.skType||0];
  return "【"+st.name+"】威力 "+c.mult+"% ／ 発動率 "+c.proc+"%"+(st.note? "("+st.note+")":"");
}
function lvLabel(c){ return c.lv>0? " +"+c.lv : ""; }

/* ---- 入手・合成 ---- */
function addCard(en, rar){
  const k=keyOf(en,rar,0);
  G.inv[k]=(G.inv[k]||0)+1;
  track("card");
  return k;
}
/* 同キー2枚 → Lv+1 を1枚。装備中カードの在庫が尽きたら装備参照を合成後カードへ引き継ぐ */
function mergeOne(key){
  if((G.inv[key]||0)<2) return null;
  const p=parseKey(key);
  G.inv[key]-=2;
  if(G.inv[key]<=0) delete G.inv[key];
  const nk=keyOf(p.en,p.rar,p.lv+1);
  G.inv[nk]=(G.inv[nk]||0)+1;
  if(!G.inv[key]){
    for(const s in G.party.equip){ if(G.party.equip[s]===key) G.party.equip[s]=nk; }
  }
  track("merge");
  return nk;
}
function autoMergeAll(){
  let n=0, moved=true;
  while(moved){
    moved=false;
    for(const k of Object.keys(G.inv)){
      while((G.inv[k]||0)>=2){ mergeOne(k); n++; moved=true; }
    }
  }
  return n;
}

/* ---- かけら経済: 不要カードを分解してかけらに、かけらで任意カードを強化 ---- */
const SHARD_VAL=[1,3,8,20,50]; // レア度ごとの分解価値(Lvで倍率: ×(lv+1))
function shardValue(c){ return SHARD_VAL[c.rar-1]*(c.lv+1); }
function enhCost(c){ return SHARD_VAL[c.rar-1]*2*(c.lv+1); } // 同レア2枚分解相当で+1

function disassemble(key, n){
  const c=cardOf(key); if(!c) return 0;
  n=Math.min(n||1, G.inv[key]||0);
  if(n<=0) return 0;
  const gain=shardValue(c)*n;
  G.inv[key]-=n;
  if(G.inv[key]<=0){
    delete G.inv[key];
    for(const s in G.party.equip){ if(G.party.equip[s]===key) G.party.equip[s]=null; }
  }
  G.shards+=gain;
  return gain;
}
/* かけらでLv+1(合成と同じ効果・2枚目不要) */
function enhanceOne(key){
  const c=cardOf(key); if(!c) return null;
  const cost=enhCost(c);
  if((G.inv[key]||0)<1 || G.shards<cost) return null;
  G.shards-=cost;
  G.inv[key]--;
  const nk=keyOf(c.en, c.rar, c.lv+1);
  G.inv[nk]=(G.inv[nk]||0)+1;
  if(G.inv[key]<=0){
    delete G.inv[key];
    for(const s in G.party.equip){ if(G.party.equip[s]===key) G.party.equip[s]=nk; }
  }
  track("merge");
  return nk;
}
/* 一括分解: 指定レア度以下をまとめて分解(装備中カードは各1枚残す) */
function bulkDisassemble(maxRar, dry){
  const eq=equippedKeys();
  let cnt=0, gain=0;
  for(const k of Object.keys(G.inv)){
    const c=cardOf(k); if(!c || c.rar>maxRar) continue;
    const keep=eq.has(k)? 1 : 0;
    const n=(G.inv[k]||0)-keep;
    if(n<=0) continue;
    cnt+=n; gain+=shardValue(c)*n;
    if(!dry){
      G.inv[k]-=n;
      if(G.inv[k]<=0) delete G.inv[k];
    }
  }
  if(!dry) G.shards+=gain;
  return {cnt, gain};
}

/* ---- 正解時のレア度判定 ----
   間違え続けた単語ほど強いカードに。久しぶり(30日以上ぶり)の正解にもボーナス */
function dropRarity(st){
  const ws=(st&&st[5])||0;
  let r=1+(ws>=1?1:0)+(ws>=3?1:0)+(ws>=6?1:0)+(ws>=10?1:0);
  if(st && st[6] && Date.now()-st[6]>30*864e5 && ws>=1) r++;
  if(Math.random()<0.06) r++;
  return Math.min(5,r);
}

/* ================= カードタブ UI ================= */
let cardFilter="all";

function equippedKeys(){
  const s=new Set();
  for(const k in G.party.equip){ if(G.party.equip[k]) s.add(G.party.equip[k]); }
  return s;
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
      '<span class="ccnt">×'+G.inv[c.key]+'</span>'+
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
  '</div>';
}

/* カード詳細からの直接装備。空きスロット、無ければ一番弱いスロットと交代 */
function chooseSlotFor(c, eq){
  if(c.pos==="n") return c.slot;
  if(c.pos==="adv") return "field";
  const group=c.pos==="adj"? ["buff1","buff2"] : ["skill1","skill2","skill3"];
  for(const s of group){ if(!eq[s]) return s; }
  let worst=group[0], wv=Infinity;
  for(const s of group){
    const cc=cardOf(eq[s]);
    const v=cc? cardScore(cc) : -1;
    if(v<wv){ wv=v; worst=s; }
  }
  return worst;
}
function equippedCountOf(key, eq){ let n=0; for(const s in eq){ if(eq[s]===key) n++; } return n; }

function quickEquip(key){
  const c=cardOf(key); if(!c) return null;
  const eq=G.party.equip;
  if(equippedCountOf(key,eq) >= (G.inv[key]||0)) return null; // 在庫を超える重複装備はしない
  const slot=chooseSlotFor(c, eq);
  eq[slot]=key;
  saveG();
  return slot;
}
function openCardModal(key){
  const c=cardOf(key); if(!c) return;
  const cnt=G.inv[key]||0;
  const eq=equippedKeys().has(key);
  const cost=enhCost(c);
  openModal(
    '<h3>カード詳細</h3>'+cardDetailHTML(c)+
    '<div class="small" style="text-align:center">所持 ×'+cnt+(eq?" ・ 装備中":"")+' ・ ✨'+fmt(G.shards)+'</div>'+
    '<div class="row" style="margin-top:12px; gap:8px">'+
      '<button class="btn primary" style="flex:1" id="enhBtn" '+(cnt<1||G.shards<cost?"disabled":"")+'>✨'+fmt(cost)+' で強化</button>'+
      '<button class="btn" style="flex:1" id="mergeBtn" '+(cnt<2?"disabled":"")+'>⚒ 合成(2枚)</button>'+
    '</div>'+
    '<div class="row" style="margin-top:8px; gap:8px">'+
      '<button class="btn" style="flex:1" id="quickEqBtn" '+(eq?"disabled":"")+'>'+(eq?"装備中":"🛡 装備する")+'</button>'+
      '<button class="btn" style="flex:1" id="disBtn">分解 → ✨'+fmt(shardValue(c))+'</button>'+
    '</div>');
  $("enhBtn").onclick=()=>{
    const nk=enhanceOne(key);
    if(!nk) return;
    saveG(); toast("強化成功! +"+(c.lv+1)+" になった"); vibe(30);
    renderCards(); openCardModal(nk); refreshHeader();
  };
  $("mergeBtn").onclick=()=>{
    const nk=mergeOne(key);
    if(!nk) return;
    saveG(); toast("合成成功! +"+(c.lv+1)+" になった");
    renderCards(); openCardModal(nk); refreshHeader();
  };
  $("quickEqBtn").onclick=()=>{
    const slot=quickEquip(key);
    if(!slot){ toast("在庫が足りない"); return; }
    toast(SLOT_NAME[slot.replace(/[0-9]/g,"")]+"に装備した");
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
$("autoMergeBtn").onclick=()=>{
  const n=autoMergeAll();
  if(n){ saveG(); toast(n+"回 合成した"); renderCards(); }
  else toast("合成できるカードがない");
};
$("bulkDisBtn").onclick=()=>{
  const p1=bulkDisassemble(1,true), p2=bulkDisassemble(2,true);
  openModal('<h3>✨ 一括分解</h3>'+
    '<div class="small" style="line-height:1.7">選んだレア度以下のカードをまとめて分解し、かけらにする。装備中のカードは1枚残る。<br>かけらはカードの強化に使える。</div>'+
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
