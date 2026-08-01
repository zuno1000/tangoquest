"use strict";
/* ================= 戦闘計算 ================= */

/* 現在の編成からプレイヤーステータスを算出(JSON化可能なスナップショット) */
function playerStats(){
  // 在庫に無いカードが装備されていたら外す
  for(const s in G.party.equip){
    const k=G.party.equip[s];
    if(k && !G.inv[k]) G.party.equip[s]=null;
  }
  const ch=byChar[G.party.char]||CHARS[0];
  const base=charStats(ch.id);
  let hp=base.hp, atk=base.atk, def=base.def, spd=base.spd;
  const eq=G.party.equip;
  const card=s=>eq[s]? cardOf(eq[s]) : null;

  // 名詞=装備(固定値)
  ["weapon","armor","acc"].forEach(s=>{
    const c=card(s); if(!c||!c.stats) return;
    hp+=c.stats.hp||0; atk+=c.stats.atk||0; def+=c.stats.def||0; spd+=c.stats.spd||0;
  });
  // 形容詞=強化(%)
  const pct={hp:0,atk:0,def:0,spd:0};
  ["buff1","buff2"].forEach(s=>{ const c=card(s); if(c&&c.buffStat) pct[c.buffStat]+=c.pct; });
  hp*=(1+pct.hp/100); atk*=(1+pct.atk/100); def*=(1+pct.def/100); spd*=(1+pct.spd/100);
  // 副詞=フィールド(全体効果)
  let procBonus=0, goldBonus=0;
  const f=card("field");
  if(f){
    if(f.fieldType==="all"){ const m=1+f.pct/100; hp*=m; atk*=m; def*=m; spd*=m; }
    else if(f.fieldType==="proc") procBonus=f.pct;
    else goldBonus=f.pct;
  }
  // 動詞=攻撃技
  const skills=[];
  ["skill1","skill2","skill3"].forEach(s=>{
    const c=card(s); if(c&&c.mult) skills.push({name:c.en, mult:c.mult, proc:c.proc});
  });
  hp=Math.round(hp); atk=Math.round(atk); def=Math.round(def); spd=Math.round(spd);
  const power=Math.round(hp/6 + atk*4 + def*3 + spd*5);
  return {name:ch.name.split(" ").pop(), face:ch.face, hp, atk, def, spd, skills, procBonus, goldBonus, power};
}

/* 敵の名前(ダンジョン定義 dungeon.js から参照) */
function enemyFor(tier, floor, floors, boss, names, bossName){
  const p=Math.pow(1.55, tier-1)*(1+0.13*(floor-1));
  const e={
    name: boss? bossName : names[(floor-1)%names.length],
    hp:Math.round(130*p), atk:Math.round(20*p), def:Math.round(9*p),
    spd:8+tier+Math.floor(floor/3), boss:!!boss
  };
  if(boss){ e.hp=Math.round(e.hp*2.8); e.atk=Math.round(e.atk*1.5); }
  return e;
}

/* オート戦闘シミュレーション。P/E は {hp,atk,def,spd,...}。P.skills使用。 */
function simBattle(P, E){
  let php=P.hp, ehp=E.hp;
  const log=[];
  const pAtk=()=>{
    let mult=1, sk=null;
    if(P.skills && P.skills.length){
      sk=P.skills[Math.floor(Math.random()*P.skills.length)];
      if(Math.random()*100 < sk.proc+(P.procBonus||0)) mult=sk.mult/100; else sk=null;
    }
    const v=Math.round((0.9+Math.random()*0.2)*Math.max(1, P.atk*mult - E.def*0.55));
    ehp-=v;
    log.push(sk? {t:"sk", s:"『"+sk.name+"』発動! "+fmt(v)+"ダメージ"}
               : {t:"pl", s:P.name+"の攻撃 "+fmt(v)+"ダメージ"});
  };
  const eAtk=()=>{
    const v=Math.round((0.9+Math.random()*0.2)*Math.max(1, E.atk - P.def*0.55));
    php-=v;
    log.push({t:"en", s:E.name+"の攻撃 "+fmt(v)+"ダメージ"});
  };
  const pFirst=P.spd>=E.spd;
  for(let t=0; t<200 && php>0 && ehp>0; t++){
    if(pFirst){ pAtk(); if(ehp>0) eAtk(); }
    else { eAtk(); if(php>0) pAtk(); }
  }
  const win=ehp<=0 && php>0;
  return {win, php:Math.max(0,Math.round(php)), log};
}
