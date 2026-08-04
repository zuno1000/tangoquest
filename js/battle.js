"use strict";
/* ================= 戦闘計算(呪文文法) =================
   編成は「文」= カードkeyの配列。左から評価して節(クローズ)の列に変換し、
   毎ターン全ての節が発動する。文法ルールは4つだけ:
     1. 名詞: 値を足す(基礎値)
     2. 形容詞: 直後の名詞を修飾(×m か ^p。名詞に近い方から適用 → 並び順で結果が変わる)
     3. 動詞: 溜めた値で発動し、節を区切る(強撃/貫通/吸収/連撃)
     4. 副詞: 文末効果(反復=直前の節をもう一度 / 増幅=全体× / 守護=被ダメ-%) */

/* ---- 属性相性 ----
   ELEM_BEATS[a]=b : 属性aは属性bに強い(火→風→水→火 / 光⇔闇)。
   文中の「敵に有利な属性」のカード1枚ごとに与ダメ+7%・被ダメ-4%、
   「敵に弱い属性」のカード1枚ごとに被ダメ+4%。 */
const ELEM_BEATS=[2,0,1,4,3];
function elemMatch(elems, eElem){
  if(eElem==null || eElem<0 || !elems) return {adv:0, dis:0, dealt:1, taken:1};
  const adv=elems[ELEM_BEATS.indexOf(eElem)]||0;
  const dis=elems[ELEM_BEATS[eElem]]||0;
  return {adv, dis, dealt:1+0.07*adv,
          taken:Math.min(1.6, Math.max(0.4, 1-0.04*adv+0.04*dis))};
}

/* ---- 文の評価 ----
   戻り値: {clauses:[{V,raw,res,resRoots,vt,w,rep,name,words}], guard, amp, dead:{idx:理由}}
   係り先の無い形容詞・値なしの動詞・節の無い反復は「不発」(dead) として位置と理由を返す。
   共鳴: 同じ語根のカードが同じ節に2枚以上あると、節の値×(1+0.35×超過枚数)。
   野生語: 語根なしカードは節に置くと×(1+0.08×記憶Lv)。覚えているほど強い */
function evalSentence(keys){
  const out={clauses:[], guard:0, amp:1, dead:{}};
  let V=0, adjs=[], words=[], rootCnt={}, wildM=1, wildN=0;
  const addRoots=c=>{
    (c.roots||[]).forEach(r=>rootCnt[r]=(rootCnt[r]||0)+1);
    if(c.wild){ wildM*=wildMult(c.en); wildN++; }
  };
  const closeClause=(vt,w,name)=>{
    let extra=0; const resRoots=[];
    for(const r in rootCnt){ if(rootCnt[r]>=2){ extra+=rootCnt[r]-1; resRoots.push({r:+r, n:rootCnt[r]}); } }
    const res=+(1+0.35*extra).toFixed(2);
    const wm=+wildM.toFixed(2);
    out.clauses.push({V:Math.round(V*res*wm), raw:Math.round(V), res, resRoots, wildM:wm, wildN,
                      vt, w, name, words:words.slice()});
    V=0; words=[]; rootCnt={}; wildM=1; wildN=0;
  };
  (keys||[]).forEach((k,idx)=>{
    const c=k? cardOf(k):null;
    if(!c) return;
    if(c.pos==="adj"){
      adjs.push({c,idx});
    }else if(c.pos==="n"){
      let v=c.val;
      // 名詞に近い形容詞から順に適用: [×2, ^1.1, sword40] → (40^1.1)×2
      for(let i=adjs.length-1;i>=0;i--){
        const a=adjs[i].c;
        v = a.sub===0? v*a.m : Math.pow(Math.max(1,v), a.p);
      }
      adjs.forEach(a=>{ words.push(a.c.en); addRoots(a.c); }); // 使われた修飾語は表示・共鳴に参加
      adjs=[]; V+=v; words.push(c.en); addRoots(c);
    }else if(c.pos==="v"){
      adjs.forEach(a=>out.dead[a.idx]="係る名詞がない"); adjs=[];
      if(V<=0){ out.dead[idx]="前に名詞がない"; return; }
      addRoots(c);
      closeClause(c.vt||0, c.w||1, c.en);
    }else{ // adv
      if(c.sub===0){
        const last=out.clauses[out.clauses.length-1];
        if(last) last.rep=Math.min(2, Math.round(((last.rep||0)+c.r)*100)/100);
        else out.dead[idx]="直前に発動(動詞)がない";
      }
      else if(c.sub===1) out.amp*=c.m;
      else out.guard=Math.min(60, out.guard+c.g);
    }
  });
  adjs.forEach(a=>out.dead[a.idx]="係る名詞がない");
  if(V>0) closeClause(0, 1, null); // 動詞なし=素の一撃
  return out;
}
/* 節1つの期待威力(防御0・等倍時) */
function clauseExp(cl){
  return cl.V*cl.w*VERB_TYPES[cl.vt||0].expF*(1+(cl.rep||0));
}

/* ---- プレイヤーステータス ----
   sentOpt を渡すとその文で試算する(状態は変更しない)。
   HP/防御/素早さはキャラ由来。文はダメージ/ターン(dpt)を決める。キャラの攻撃は文全体の係数 */
function playerStats(sentOpt){
  let sent=sentOpt||G.party.sentence;
  if(!sentOpt){
    if(sent.length>sentenceSlots()) sent.length=sentenceSlots(); // レベル相応に切り詰め
    for(let i=0;i<sent.length;i++){ if(sent[i] && !G.inv[sent[i]]) sent[i]=null; } // 在庫切れは外す
  }
  const ch=byChar[G.party.char]||CHARS[0];
  const base=charStats(ch.id);
  const cards=sent.filter(Boolean).map(cardOf).filter(Boolean);
  // 属性: セット効果(同属性2/4/6枚 → ダメージ×1.05/1.12/1.20)と相性判定に使う
  const ecnt=[0,0,0,0,0];
  cards.forEach(c=>ecnt[c.elem]++);
  let setM=1; const sets=[];
  ecnt.forEach((n,i)=>{
    const b = n>=6? 0.20 : n>=4? 0.12 : n>=2? 0.05 : 0;
    if(b){ sets.push({elem:i, n, b}); setM*=(1+b); }
  });
  const ev=evalSentence(sent);
  const charM=base.atk/40;
  // 固有スキル(v4.0.0): 出撃キャラのパッシブが戦闘・報酬に効く
  const sk=ch.sk||null;
  const abDmg  = sk&&sk.t==="dmg"?   sk.v : 0;
  const abBoss = sk&&sk.t==="boss"?  sk.v : 0;
  const abTaken= sk&&sk.t==="guard"? sk.v : 0;
  const abVamp = sk&&sk.t==="vamp"?  sk.v : 0;
  const abHeal = sk&&sk.t==="heal"?  sk.v : 0;
  const goldBonus = sk&&sk.t==="gold"? sk.v : 0;
  let dpt=0; ev.clauses.forEach(cl=>dpt+=clauseExp(cl));
  dpt=Math.round(dpt*charM*setM*ev.amp*(1+abDmg));
  const power=Math.round(base.hp/6 + dpt*4 + base.def*3*(1+ev.guard/100)*(1+abTaken) + base.spd*5);
  return {name:ch.name.split(" ").pop(), face:ch.face,
          hp:base.hp, def:base.def, spd:base.spd, catk:base.atk,
          charM, setM, amp:ev.amp, guard:ev.guard,
          clauses:ev.clauses, dead:ev.dead, elems:ecnt, sets,
          skill:sk, abDmg, abBoss, abTaken, abVamp, abHeal,
          dpt, goldBonus, power};
}

/* 敵の生成(ダンジョン定義 dungeon.js から参照)。
   opts={elem, trait}: 属性と特性(tough=硬い/fierce=狂暴/swift=神速)で敵に個性を付ける

   v4.6.0 一撃必殺の是正:
   - HP・防御はプレイヤーの「火力」(カードの重ね・共鳴・累乗で急成長=1.55^tier)に併走。
     さらに高tierほど倍率(hpB: 最大×3)を掛け、数ターンの攻防にする
   - 攻撃はプレイヤーの「耐久」(キャラHP=突破・Lvでしか伸びない=緩やか)に併走させ、
     1.55^tierではなく1.14^tierの緩い曲線に(旧式は高tierで即死しか生まなかった)。
     目安: 推奨戦闘力どおりの編成で1発=HPの8〜13%(fierce/bossはさらに重い) */
function enemyFor(tier, floor, floors, boss, names, bossName, opts){
  const p=Math.pow(1.55, tier-1)*(1+0.13*(floor-1));   // 火力併走(HP・防御)
  const a=Math.pow(1.14, tier-1)*(1+0.04*(floor-1));   // 耐久併走(攻撃)
  const hpB=Math.min(3, 1+0.25*(tier-1));              // 高tierほどHP増(低tierは従来の手応え)
  const e={
    name: boss? bossName : names[(floor-1)%names.length],
    hp:Math.round(130*p*hpB), atk:Math.round(36*a), def:Math.round(9*p*hpB),
    spd:8+tier+Math.floor(floor/3), boss:!!boss,
    elem: opts&&opts.elem!=null? opts.elem : null, trait: (opts&&opts.trait)||null
  };
  if(e.trait==="tough"){ e.def=Math.round(e.def*2.4); e.hp=Math.round(e.hp*0.85); }
  else if(e.trait==="fierce"){ e.atk=Math.round(e.atk*1.35); e.def=Math.round(e.def*0.7); }
  else if(e.trait==="swift"){ e.spd=Math.round(e.spd*1.7); }
  /* ボス: 推奨戦闘力ちょうどで約8ターンの長期戦・1発17%前後。
     属性対策・守護・回復スキルの有無が勝敗を分ける火加減にする */
  if(boss){ e.hp=Math.round(e.hp*2.0); e.atk=Math.round(e.atk*1.25); }
  return e;
}

/* オート戦闘シミュレーション。P は playerStats() のスナップショット。
   毎ターン: プレイヤーが文の全ての節を発動 → 敵の攻撃。
   log 要素は演出用の構造化データも持つ: {t, s, side, dmg, sk, heal, php, ehp} */
function simBattle(P, E){
  let php=P.hp, ehp=E.hp;
  const log=[];
  const em=elemMatch(P.elems, E.elem);
  // v2以前の探索スナップショット互換: 文が無ければ攻撃力の素の一撃に変換
  const clauses=(P.clauses&&P.clauses.length)? P.clauses : [{V:P.atk||10, vt:0, w:1, name:null, words:[]}];
  const charM=P.charM||1, setM=P.setM||1, amp=P.amp||1, guard=P.guard||0;
  const rnd=()=>0.9+Math.random()*0.2;
  /* 戦闘中の回復(吸収・与ダメ回復)は1ターン合計で最大HPの25%まで。
     戦闘が複数ターン化(v4.6.0)すると、ダメージ比例の回復は無制限だと
     「削られるより速く回復する」不死になるため。上限内の維持力=個性は残る */
  let healBudget=0;
  const castOnce=(cl, powF)=>{
    const baseV=cl.V*cl.w*charM*setM*amp*em.dealt*(powF||1)
      *(1+(P.abDmg||0))*(E.boss? 1+(P.abBoss||0) : 1); // 固有スキル: 与ダメ+/ボス特効
    let v;
    if(cl.vt===1)      v=Math.round(rnd()*Math.max(1, baseV*0.85 - E.def*0.1));   // 貫通
    else if(cl.vt===2) v=Math.round(rnd()*Math.max(1, baseV*0.8  - E.def*0.55));  // 吸収
    else if(cl.vt===3) v=Math.round(rnd()*Math.max(1, baseV*0.6 - E.def*0.55))
                        +Math.round(rnd()*Math.max(1, baseV*0.6 - E.def*0.55));   // 連撃
    else               v=Math.round(rnd()*Math.max(1, baseV - E.def*0.55));       // 強撃
    let heal=0;
    if(cl.vt===2){ heal+=Math.round(v*0.45); }
    if(P.abVamp) heal+=Math.round(v*P.abVamp); // 固有スキル: 与ダメ回復
    heal=Math.min(heal, healBudget); healBudget-=heal;
    if(heal){ php=Math.min(P.hp, php+heal); }
    return {v, heal};
  };
  const pushP=(cl,r,repTag)=>{
    const label=cl.name? "『"+cl.name+"』("+VERB_TYPES[cl.vt||0].name+")" : (cl.words&&cl.words.length? cl.words[0]:P.name)+"の一撃";
    log.push({t: cl.name?"sk":"pl", side:"p", dmg:r.v, sk:cl.name||null, heal:r.heal,
              php:Math.max(0,php), ehp:Math.max(0,ehp),
              s:(repTag?"🌀反復! ":"")+label+" "+fmt(r.v)+"ダメージ"+(r.heal? " & "+fmt(r.heal)+"回復":"")});
  };
  const pTurn=()=>{
    healBudget=Math.round(P.hp*0.25);
    for(const cl of clauses){
      let r=castOnce(cl,1); ehp-=r.v; pushP(cl,r,false);
      if(ehp<=0) return;
      if(cl.rep){ r=castOnce(cl,cl.rep); ehp-=r.v; pushP(cl,r,true); if(ehp<=0) return; }
    }
  };
  const eAtk=()=>{
    const v=Math.round(rnd()*Math.max(1, E.atk - P.def*0.55)*em.taken*(1-guard/100)*(1-(P.abTaken||0)));
    php-=v;
    log.push({t:"en", side:"e", dmg:v, php:Math.max(0,php), ehp:Math.max(0,ehp),
              s:E.name+"の攻撃 "+fmt(v)+"ダメージ"});
  };
  const pFirst=P.spd>=E.spd;
  for(let t=0; t<200 && php>0 && ehp>0; t++){
    if(pFirst){ pTurn(); if(ehp>0) eAtk(); }
    else { eAtk(); if(php>0) pTurn(); }
  }
  const win=ehp<=0 && php>0;
  return {win, php:Math.max(0,Math.round(php)), log};
}
