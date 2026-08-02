"use strict";
/* ================= 戦闘計算 ================= */

/* ---- 属性相性 ----
   ELEM_BEATS[a]=b : 属性aは属性bに強い(火→風→水→火 / 光⇔闇)。
   編成中の「敵に有利な属性」のカード1枚ごとに与ダメ+7%・被ダメ-4%、
   「敵に弱い属性」のカード1枚ごとに被ダメ+4%。編成を敵に合わせる意味を作る */
const ELEM_BEATS=[2,0,1,4,3];
function elemMatch(elems, eElem){
  if(eElem==null || eElem<0 || !elems) return {adv:0, dis:0, dealt:1, taken:1};
  const adv=elems[ELEM_BEATS.indexOf(eElem)]||0; // 敵属性に強い属性のカード枚数
  const dis=elems[ELEM_BEATS[eElem]]||0;         // 敵属性に弱い属性のカード枚数
  return {adv, dis, dealt:1+0.07*adv,
          taken:Math.min(1.6, Math.max(0.4, 1-0.04*adv+0.04*dis))};
}

/* 現在の編成からプレイヤーステータスを算出(JSON化可能なスナップショット)。
   eqOpt を渡すとその装備案で試算する(状態は変更しない) */
function playerStats(eqOpt){
  const eq=eqOpt||G.party.equip;
  if(!eqOpt){
    // 在庫に無いカードが装備されていたら外す
    for(const s in eq){
      const k=eq[s];
      if(k && !G.inv[k]) eq[s]=null;
    }
  }
  const ch=byChar[G.party.char]||CHARS[0];
  const base=charStats(ch.id);
  let hp=base.hp, atk=base.atk, def=base.def, spd=base.spd;
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
  // 動詞=攻撃技(タイプ付き)
  const skills=[];
  ["skill1","skill2","skill3"].forEach(s=>{
    const c=card(s); if(c&&c.mult) skills.push({name:c.en, mult:c.mult, proc:c.proc, type:c.skType||0});
  });
  // 属性セット効果: 同属性を並べるほど強い(2枚+5% / 4枚+12% / 6枚+20%)
  const ecnt=[0,0,0,0,0];
  for(const s in eq){ const c=card(s); if(c) ecnt[c.elem]++; }
  const sets=[];
  ecnt.forEach((n,i)=>{
    const b = n>=6? 0.20 : n>=4? 0.12 : n>=2? 0.05 : 0;
    if(b){ sets.push({elem:i, n, b}); const m=1+b; hp*=m; atk*=m; def*=m; spd*=m; }
  });
  hp=Math.round(hp); atk=Math.round(atk); def=Math.round(def); spd=Math.round(spd);
  // 戦闘力: 技の期待ダメージ倍率も攻撃に織り込む(技・発動率も戦闘力に反映される)
  let em=1;
  if(skills.length){
    let s=0;
    skills.forEach(k=>{
      const f=SKILL_TYPES[k.type||0].powerF;
      s+=Math.min(100, k.proc+procBonus)/100*(k.mult/100*f-1);
    });
    em=1+s/skills.length;
  }
  const power=Math.round(hp/6 + atk*em*4 + def*3 + spd*5);
  return {name:ch.name.split(" ").pop(), face:ch.face, hp, atk, def, spd, skills,
          procBonus, goldBonus, sets, elems:ecnt, power};
}

/* 敵の生成(ダンジョン定義 dungeon.js から参照)。
   opts={elem, trait}: 属性と特性(tough=硬い/fierce=狂暴/swift=神速)で敵に個性を付ける */
function enemyFor(tier, floor, floors, boss, names, bossName, opts){
  const p=Math.pow(1.55, tier-1)*(1+0.13*(floor-1));
  const e={
    name: boss? bossName : names[(floor-1)%names.length],
    hp:Math.round(130*p), atk:Math.round(20*p), def:Math.round(9*p),
    spd:8+tier+Math.floor(floor/3), boss:!!boss,
    elem: opts&&opts.elem!=null? opts.elem : null, trait: (opts&&opts.trait)||null
  };
  if(e.trait==="tough"){ e.def=Math.round(e.def*2.4); e.hp=Math.round(e.hp*0.85); }
  else if(e.trait==="fierce"){ e.atk=Math.round(e.atk*1.35); e.def=Math.round(e.def*0.7); }
  else if(e.trait==="swift"){ e.spd=Math.round(e.spd*1.7); }
  if(boss){ e.hp=Math.round(e.hp*2.8); e.atk=Math.round(e.atk*1.5); }
  return e;
}

/* オート戦闘シミュレーション。P/E は {hp,atk,def,spd,...}。P.skills使用。
   属性相性(P.elems vs E.elem)と技タイプ(強撃/貫通/吸収/連撃)を反映。
   log 要素は演出用の構造化データも持つ: {t, s, side, dmg, sk, heal, php, ehp} */
function simBattle(P, E){
  let php=P.hp, ehp=E.hp;
  const log=[];
  const em=elemMatch(P.elems, E.elem);
  const pAtk=()=>{
    let sk=null;
    if(P.skills && P.skills.length){
      sk=P.skills[Math.floor(Math.random()*P.skills.length)];
      if(Math.random()*100 >= sk.proc+(P.procBonus||0)) sk=null;
    }
    const rnd=0.9+Math.random()*0.2;
    let base, heal=0, txt;
    if(!sk){
      base=Math.max(1, P.atk - E.def*0.55);
    }else{
      const m=sk.mult/100, t=sk.type||0;
      if(t===1)      base=Math.max(1, P.atk*m*0.85 - E.def*0.1);            // 貫通: 防御をほぼ無視
      else if(t===2) base=Math.max(1, P.atk*m*0.8  - E.def*0.55);           // 吸収: 与ダメの45%回復
      else if(t===3) base=Math.max(1, P.atk*m*0.6 - E.def*0.55)
                         +Math.max(1, P.atk*m*0.6 - E.def*0.55);            // 連撃: 60%×2回
      else           base=Math.max(1, P.atk*m - E.def*0.55);                // 強撃
    }
    const v=Math.round(rnd*base*em.dealt);
    ehp-=v;
    if(sk && (sk.type||0)===2){ heal=Math.round(v*0.45); php=Math.min(P.hp, php+heal); }
    if(sk){
      const tn=SKILL_TYPES[sk.type||0].name;
      txt="『"+sk.name+"』("+tn+")! "+fmt(v)+"ダメージ"+(heal? " & "+fmt(heal)+"回復":"");
      log.push({t:"sk", side:"p", dmg:v, sk:sk.name, heal, php:Math.max(0,php), ehp:Math.max(0,ehp), s:txt});
    }else{
      log.push({t:"pl", side:"p", dmg:v, php:Math.max(0,php), ehp:Math.max(0,ehp),
                s:P.name+"の攻撃 "+fmt(v)+"ダメージ"});
    }
  };
  const eAtk=()=>{
    const v=Math.round((0.9+Math.random()*0.2)*Math.max(1, E.atk - P.def*0.55)*em.taken);
    php-=v;
    log.push({t:"en", side:"e", dmg:v, php:Math.max(0,php), ehp:Math.max(0,ehp),
              s:E.name+"の攻撃 "+fmt(v)+"ダメージ"});
  };
  const pFirst=P.spd>=E.spd;
  for(let t=0; t<200 && php>0 && ehp>0; t++){
    if(pFirst){ pAtk(); if(ehp>0) eAtk(); }
    else { eAtk(); if(php>0) pAtk(); }
  }
  const win=ehp<=0 && php>0;
  return {win, php:Math.max(0,Math.round(php)), log};
}
