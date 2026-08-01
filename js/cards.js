"use strict";
/* ================= 単語カード =================
   カードは (英単語, レア度, 強化Lv) で一意。性能は単語のハッシュから決定的に生成する。
   品詞→役割: 名詞=装備(固定値) / 形容詞=強化(基礎ステ%) / 副詞=フィールド(全体効果) / 動詞=攻撃技 */

function keyOf(en,rar,lv){ return en+"|"+rar+"|"+lv; }
function parseKey(k){ const p=k.split("|"); return {en:p[0], rar:+p[1], lv:+p[2]}; }

const SLOT_ICON={weapon:"⚔️", armor:"🛡️", acc:"💍", buff:"✨", field:"🌟", skill:"🗡️"};
const SLOT_NAME={weapon:"武器", armor:"防具", acc:"装飾品", buff:"強化", field:"フィールド", skill:"攻撃技"};
const STAT_NAME={hp:"HP", atk:"攻撃", def:"防御", spd:"素早さ"};

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
  }
  c.icon=SLOT_ICON[c.slot];
  c.typeName=SLOT_NAME[c.slot];
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
  return "威力 "+c.mult+"% ／ 発動率 "+c.proc+"%";
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
  $("cardSummary").textContent="所持 "+fmt(total)+"枚 ／ "+kinds.size+"種類";
  if(!items.length){ grid.innerHTML='<div class="empty" style="grid-column:1/-1">クイズに正解するとカードを入手できます</div>'; return; }
  const frag=document.createDocumentFragment();
  items.forEach(c=>{
    const d=document.createElement("div");
    d.className="ccard bd"+c.rar+(eq.has(c.key)?" equipped":"");
    d.innerHTML=
      (c.lv>0? '<span class="clv">+'+c.lv+'</span>':"")+
      '<span class="ccnt">×'+G.inv[c.key]+'</span>'+
      '<div class="cic">'+c.icon+'</div>'+
      '<div class="cen">'+esc(c.en)+'</div>'+
      '<div class="cja">'+esc(c.ja)+'</div>'+
      '<div class="crar rc'+c.rar+'">'+RAR_STARS[c.rar-1]+'</div>'+
      (eq.has(c.key)? '<span class="ceq">装備中</span>':"");
    d.onclick=()=>openCardModal(c.key);
    frag.appendChild(d);
  });
  grid.appendChild(frag);
}

function cardDetailHTML(c){
  return '<div style="text-align:center; padding:6px 0">'+
    '<div style="font-size:34px">'+c.icon+'</div>'+
    '<div style="font-size:20px; font-weight:800; margin-top:4px">'+esc(c.en)+
      '<span style="font-size:13px; color:var(--accent)">'+lvLabel(c)+'</span></div>'+
    '<div class="small" style="margin-top:2px">'+esc(c.ja)+'</div>'+
    '<div class="rc'+c.rar+'" style="font-weight:800; margin-top:4px">'+RAR_STARS[c.rar-1]+'</div>'+
    '<div style="margin-top:6px"><span class="pos'+c.pos+'" style="font-size:11px; font-weight:700">'+
      POS_LABEL[c.pos]+' ・ '+c.typeName+'</span></div>'+
    '<div style="margin-top:10px; font-size:14px; font-weight:800">'+effectText(c)+'</div>'+
  '</div>';
}

/* カード詳細からの直接装備。品詞に応じた空きスロット(無ければ先頭)に入れる */
function quickEquip(key){
  const c=cardOf(key); if(!c) return null;
  const eq=G.party.equip;
  let slot;
  if(c.pos==="n") slot=c.slot;
  else if(c.pos==="adv") slot="field";
  else if(c.pos==="adj") slot=(!eq.buff1?"buff1": !eq.buff2?"buff2":"buff1");
  else slot=(!eq.skill1?"skill1": !eq.skill2?"skill2": !eq.skill3?"skill3":"skill1");
  eq[slot]=key;
  saveG();
  return slot;
}

function openCardModal(key){
  const c=cardOf(key); if(!c) return;
  const cnt=G.inv[key]||0;
  const eq=equippedKeys().has(key);
  openModal(
    '<h3>カード詳細</h3>'+cardDetailHTML(c)+
    '<div class="small" style="text-align:center">所持 ×'+cnt+(eq?" ・ 装備中":"")+'</div>'+
    '<div class="row" style="margin-top:12px; gap:10px">'+
      '<button class="btn primary" style="flex:1" id="mergeBtn" '+(cnt<2?"disabled":"")+'>⚒ 合成 → +'+(c.lv+1)+'</button>'+
      '<button class="btn" style="flex:1" id="quickEqBtn" '+(eq?"disabled":"")+'>'+(eq?"装備中":"🛡 装備する")+'</button>'+
    '</div>');
  $("mergeBtn").onclick=()=>{
    const nk=mergeOne(key);
    if(!nk) return;
    saveG(); toast("合成成功! +"+(c.lv+1)+" になった");
    renderCards(); openCardModal(nk);
    refreshHeader();
  };
  $("quickEqBtn").onclick=()=>{
    const slot=quickEquip(key);
    if(!slot) return;
    toast(SLOT_NAME[slot.replace(/[0-9]/g,"")]+"に装備した");
    renderCards(); openCardModal(key);
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
