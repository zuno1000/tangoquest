"use strict";
/* ================= ダンジョン & 編成 & 無限回廊 ================= */

const DUNGEONS=[
  {id:"d1", tier:1, floors:5,  icon:"🌾", name:"はじまりの草原",
   names:["スライム","野ウサギ","いたずら妖精"], eicons:["👾","🐇","🧚"], boss:"巨大スライム", bossIcon:"👾"},
  {id:"d2", tier:2, floors:7,  icon:"🕳️", name:"苔むす洞窟",
   names:["洞窟コウモリ","ゴブリン","岩ガニ"], eicons:["🦇","👺","🦀"], boss:"ゴブリンキング", bossIcon:"👹"},
  {id:"d3", tier:3, floors:8,  icon:"🌲", name:"忘却の森",
   names:["森オオカミ","歩く木トレント","毒キノコ"], eicons:["🐺","🌳","🍄"], boss:"森の主アルラウネ", bossIcon:"🌺"},
  {id:"d4", tier:4, floors:10, icon:"🏜️", name:"砂塵の遺跡",
   names:["砂サソリ","ミイラ兵","ガーゴイル"], eicons:["🦂","🧟","🗿"], boss:"遺跡の守護者アヌビス", bossIcon:"⚱️"},
  {id:"d5", tier:5, floors:10, icon:"🌋", name:"竜の火山",
   names:["火トカゲ","溶岩ゴーレム","ヘルハウンド"], eicons:["🦎","🪨","🔥"], boss:"火竜イフリート", bossIcon:"🐉"},
  {id:"d6", tier:6, floors:12, icon:"🗼", name:"星降る魔塔",
   names:["魔導兵","死霊術師","ガーゴイル卿"], eicons:["🧙","💀","🗿"], boss:"大魔王リヴェリオン", bossIcon:"👿"},
];

function dgRec(id){ if(!G.dungeons[id]) G.dungeons[id]={clears:0, lastClearDay:null}; return G.dungeons[id]; }
function dgUnlocked(i){ return i===0 || (G.dungeons[DUNGEONS[i-1].id]&&G.dungeons[DUNGEONS[i-1].id].clears>0); }

/* ---- 冒険タブ描画 ---- */
function renderAdv(){
  const P=playerStats();
  const ch=byChar[G.party.char];
  $("pcFace").textContent=ch? ch.face : "🗡️";
  $("pcName").textContent=ch? ch.name : "-";
  $("pcPower").innerHTML="戦闘力 <b style='color:var(--accent)'>"+fmt(P.power)+"</b>"+
    " ─ HP"+fmt(P.hp)+" 攻"+fmt(P.atk)+" 防"+fmt(P.def)+" 速"+fmt(P.spd);

  const list=$("dungeonList"); list.innerHTML="";
  DUNGEONS.forEach((d,i)=>{
    const un=dgUnlocked(i), rec=G.dungeons[d.id];
    const row=document.createElement("div");
    row.className="dg"+(un?"":" locked");
    const rp=Math.round(Math.pow(1.55,d.tier-1)*(1+0.13*(d.floors-1))*430); // 推奨戦闘力の目安
    row.innerHTML=
      '<div class="dic">'+d.icon+'</div>'+
      '<div class="grow"><div class="dname">'+d.name+'</div>'+
      '<div class="dinfo">全'+d.floors+'F ・ 推奨戦闘力 '+fmt(rp)+
      (rec&&rec.clears? ' ・ クリア'+rec.clears+'回' : (un? ' ・ 初クリアで🎫3':''))+'</div></div>'+
      '<button class="btn primary" '+(un?"":"disabled")+'>挑む</button>';
    if(un) row.querySelector("button").onclick=()=>startRun(d);
    list.appendChild(row);
  });
  renderInfPanel();
}

/* ---- ダンジョン攻略(即時シミュレーション → ビジュアルバトル演出) ---- */
function startRun(d){
  const P=playerStats();
  track("run");
  const floors=[]; // {f, boss, E, icon, hpStart, hpAfter, win, events}
  let cleared=0, gold=0, hp=P.hp;
  for(let f=1; f<=d.floors; f++){
    const boss=f===d.floors;
    const E=enemyFor(d.tier, f, d.floors, boss, d.names, d.boss);
    const r=simBattle(Object.assign({}, P, {hp}), E);
    const fl={f, boss, E, icon:boss? d.bossIcon : d.eicons[(f-1)%d.eicons.length],
              hpStart:hp, win:r.win, events:r.log};
    if(!r.win){ floors.push(fl); break; }
    cleared=f;
    gold+=Math.round(8*d.tier*d.tier*(1+(P.goldBonus||0)/100));
    hp=Math.min(P.hp, Math.round(r.php + P.hp*0.25)); // 各階クリア後 25%回復
    fl.hpAfter=hp;
    floors.push(fl);
  }
  const full=cleared===d.floors;
  // 報酬確定
  const rec=dgRec(d.id);
  let tickets=0;
  if(full){
    gold+=Math.round(40*d.tier*d.tier*(1+(P.goldBonus||0)/100));
    if(rec.clears===0) tickets+=3;
    else if(rec.lastClearDay!==todayKey()) tickets+=1;      // 本日初クリア
    else if(Math.random()<0.25) tickets+=1;
    rec.clears++; rec.lastClearDay=todayKey();
    track("clear");
  }
  G.gold+=gold; G.tickets+=tickets;
  saveG(); refreshHeader(); renderAdv();
  playRun(d, P, floors, {full, cleared, gold, tickets});
}

/* ---- 演出プレイヤー ---- */
function vibe(pat){
  if(localStorage.getItem("tq_vibe")==="off") return;
  if(navigator.vibrate) try{ navigator.vibrate(pat); }catch(e){}
}

function playRun(d, P, floors, R){
  let speed=+(localStorage.getItem("tq_bspeed")||1);
  if(![1,2,3].includes(speed)) speed=1;
  openModal('<h3>'+d.icon+' '+esc(d.name)+'</h3>'+
    '<div id="bScene">'+
      '<div id="bFloorTxt"></div>'+
      '<div id="bArena">'+
        '<div class="bUnit" id="bP">'+
          '<div class="bFace" id="bPFace">'+P.face+'</div>'+
          '<div class="bUName">'+esc(P.name)+'</div>'+
          '<div class="bHp"><i id="bPHp"></i></div><div class="bHpN" id="bPHpN"></div></div>'+
        '<div class="bUnit" id="bE">'+
          '<div class="bFace" id="bEFace"></div>'+
          '<div class="bUName" id="bEName"></div>'+
          '<div class="bHp"><i id="bEHp"></i></div><div class="bHpN" id="bEHpN"></div></div>'+
      '</div>'+
      '<div id="bAct"></div>'+
    '</div>'+
    '<div class="row" id="bCtrl" style="margin-top:10px">'+
      '<button class="btn" id="bSpeedBtn">⏩ ×'+speed+'</button>'+
      '<div class="grow"></div>'+
      '<button class="btn" id="bSkipBtn">結果へ ▶▶</button>'+
    '</div>');

  // ステップ列を組み立てる(長い攻防は前後だけ再生)
  const steps=[];
  floors.forEach(fl=>{
    steps.push({k:"floor", fl, ms:750});
    let ev=fl.events;
    if(ev.length>12){
      const head=ev.slice(0,7), tail=ev.slice(-4), mid=ev[ev.length-5];
      steps.push(...head.map(e=>({k:"atk", e, ms:e.sk?600:320})));
      steps.push({k:"ff", e:mid, ms:800});
      steps.push(...tail.map(e=>({k:"atk", e, ms:e.sk?600:320})));
    }else{
      steps.push(...ev.map(e=>({k:"atk", e, ms:e.sk?600:320})));
    }
    if(fl.win) steps.push({k:"kill", fl, ms:700});
    else steps.push({k:"dead", fl, ms:1000});
  });
  steps.push({k:"end", ms:0});

  const maxHpE=fl=>fl.E.hp;
  let curFl=null;
  const alive=()=>!!$("bArena"); // モーダルが閉じられたら停止
  const setHp=(el, nEl, v, max)=>{
    const r=Math.max(0, Math.min(1, v/max));
    el.style.width=(r*100)+"%";
    el.style.background = r>0.5? "var(--ok)" : r>0.25? "var(--accent)" : "var(--ng)";
    nEl.textContent=fmt(v);
  };
  const pop=(unit, txt, cls)=>{
    const p=document.createElement("div");
    p.className="bpop "+(cls||"");
    p.textContent=txt;
    p.style.left=(25+Math.random()*30)+"%";
    unit.appendChild(p);
    setTimeout(()=>p.remove(), 950);
  };
  const shake=(el, big)=>{
    el.classList.remove("bShake","bShakeBig");
    void el.offsetWidth;
    el.classList.add(big?"bShakeBig":"bShake");
  };
  const flash=el=>{
    el.classList.remove("bFlash");
    void el.offsetWidth;
    el.classList.add("bFlash");
  };
  const act=(txt, cls)=>{
    const a=$("bAct"); if(!a) return;
    a.className=cls||"";
    a.textContent=txt;
  };

  let i=0, timer=null;
  const doStep=st=>{
    switch(st.k){
      case "floor":{
        curFl=st.fl;
        $("bFloorTxt").innerHTML=st.fl.f+"F <span class='small'>/ "+d.floors+"F</span>"+(st.fl.boss?" <b class='bBoss'>BOSS</b>":"");
        $("bEFace").textContent=st.fl.icon;
        $("bEFace").classList.toggle("boss", st.fl.boss);
        $("bEFace").style.opacity=1; $("bEFace").style.transform="";
        $("bEName").textContent=st.fl.E.name;
        setHp($("bEHp"), $("bEHpN"), st.fl.E.hp, st.fl.E.hp);
        setHp($("bPHp"), $("bPHpN"), st.fl.hpStart, P.hp);
        act(st.fl.E.name+" が現れた!", st.fl.boss?"boss":"");
        if(st.fl.boss) vibe(60);
        break;
      }
      case "atk":{
        const e=st.e;
        if(e.side==="p"){
          const eU=$("bE");
          setHp($("bEHp"), $("bEHpN"), e.ehp, maxHpE(curFl));
          $("bPFace").classList.remove("lunge"); void $("bPFace").offsetWidth; $("bPFace").classList.add("lunge");
          if(e.sk){
            pop(eU, fmt(e.dmg), "crit");
            shake(eU, true); flash($("bEFace"));
            act("⚡『"+e.sk+"』!", "skill");
            vibe(35);
          }else{
            pop(eU, fmt(e.dmg));
            shake(eU, false);
          }
        }else{
          const pU=$("bP");
          setHp($("bPHp"), $("bPHpN"), e.php, P.hp);
          pop(pU, fmt(e.dmg), "hurt");
          shake(pU, false);
        }
        break;
      }
      case "ff":{
        act("…激しい攻防が続く…");
        setHp($("bEHp"), $("bEHpN"), st.e.ehp, maxHpE(curFl));
        setHp($("bPHp"), $("bPHpN"), st.e.php, P.hp);
        shake($("bE"), false); shake($("bP"), false);
        break;
      }
      case "kill":{
        const f=$("bEFace");
        flash(f);
        f.style.transform="scale(1.25)"; f.style.opacity=0;
        act(st.fl.E.name+"を倒した!", "win");
        if(st.fl.hpAfter!=null && st.fl.hpAfter>0){
          const healed=st.fl.hpAfter;
          setHp($("bPHp"), $("bPHpN"), healed, P.hp);
          pop($("bP"), "回復", "heal");
        }
        if(st.fl.boss) vibe([40,60,90]);
        break;
      }
      case "dead":{
        $("bPFace").textContent="💀";
        act("力尽きた… "+st.fl.f+"Fで敗退", "lose");
        shake($("bP"), true);
        vibe(120);
        break;
      }
      case "end": showResult(); return;
    }
  };

  const showResult=()=>{
    if(!alive()) return;
    clearTimeout(timer); timer=null;
    const scene=$("bScene");
    scene.innerHTML=
      '<div id="bResult" class="'+(R.full?"win":"lose")+'">'+
      '<div class="brTitle">'+(R.full? "🏆 完全攻略!" : "⚔ "+(R.cleared+1)+"Fで敗退…")+'</div>'+
      (R.full? "" : '<div class="small">'+R.cleared+'Fまで突破。カードを集めて再挑戦しよう</div>')+
      '<div class="brRew">🪙 <b id="brGold">0</b>'+(R.tickets? ' &nbsp;🎫 <b>+'+R.tickets+'</b>':"")+'</div>'+
      '</div>';
    $("bCtrl").innerHTML='<button class="btn primary" style="flex:1" data-close>閉じる</button>';
    $("bCtrl").querySelector("[data-close]").onclick=closeModal;
    if(R.full) vibe([40,60,90]);
    // ゴールドのカウントアップ
    const gEl=$("brGold"), t0=Date.now(), dur=600;
    const tick=()=>{
      if(!$("brGold")) return;
      const r=Math.min(1,(Date.now()-t0)/dur);
      gEl.textContent="+"+fmt(R.gold*(2-r)*r); // ease-out
      if(r<1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const next=()=>{
    if(!alive()) { clearTimeout(timer); return; }
    if(i>=steps.length) return;
    const st=steps[i++];
    doStep(st);
    if(st.k!=="end") timer=setTimeout(next, Math.max(120, st.ms/speed));
  };
  $("bSpeedBtn").onclick=()=>{
    speed=speed>=3?1:speed+1;
    localStorage.setItem("tq_bspeed", speed);
    $("bSpeedBtn").textContent="⏩ ×"+speed;
  };
  $("bSkipBtn").onclick=showResult;
  next();
}

/* ================= 無限回廊(放置探索) ================= */
const INF_FLOOR_SEC=25;

function infEnemy(floor){
  const p=Math.pow(1.09, floor);
  const names=["深層スライム","彷徨う鎧","影の獣","迷宮の番人","古の魔像"];
  return {name:floor+"Fの"+names[floor%names.length], hp:Math.round(140*p),
          atk:Math.round(20*p), def:Math.round(9*p), spd:9+Math.floor(floor/5)};
}

/* 経過時間ぶんの階層を逐次シミュレート(敗北で探索終了) */
function infTick(){
  const run=G.inf.run;
  if(!run || run.dead) return;
  let avail=Math.floor((Date.now()-run.startAt)/(INF_FLOOR_SEC*1000)) - run.simmed;
  avail=Math.min(avail, 500);
  let changed=false;
  while(avail-->0){
    run.simmed++;
    changed=true;
    const E=infEnemy(run.floor+1);
    const r=simBattle(Object.assign({}, run.P), E); // 各階HP全快で挑む
    if(r.win){
      run.floor++;
      run.gold+=Math.round((8+run.floor*2)*(1+(run.P.goldBonus||0)/100));
      if(run.floor%10===0) run.tickets++;
      if(run.floor>G.inf.best) G.inf.best=run.floor;
    }else{ run.dead=true; break; }
  }
  if(changed) saveG();
}

function infStart(){
  if(!dgUnlocked(1)){ toast("まず「はじまりの草原」をクリアしよう"); return; }
  G.inf.run={startAt:Date.now(), simmed:0, floor:0, gold:0, tickets:0, dead:false, P:playerStats()};
  track("run"); saveG();
  toast("無限回廊へ出発! クイズの間も探索が進む");
  renderAdv(); refreshInfPill();
}
function infCollect(){
  const run=G.inf.run; if(!run) return;
  infTick();
  G.gold+=run.gold; G.tickets+=run.tickets;
  toast("探索終了: "+run.floor+"F到達 ／ 🪙"+fmt(run.gold)+(run.tickets?" 🎫"+run.tickets:""));
  G.inf.run=null;
  saveG(); refreshHeader(); renderAdv(); refreshInfPill();
}

function renderInfPanel(){
  infTick();
  const p=$("infPanel"); const run=G.inf.run;
  const best=G.inf.best? "最深記録 "+G.inf.best+"F" : "";
  if(!run){
    p.innerHTML='<div class="row"><div class="grow">'+
      '<div style="font-weight:800; font-size:15px">🌀 無限回廊</div>'+
      '<div class="small" style="margin-top:3px">クイズ中も自動で進む放置探索。10階ごとに🎫1'+(best?'<br>'+best:'')+'</div></div>'+
      '<button class="btn gold" id="infStartBtn" '+(dgUnlocked(1)?"":"disabled")+'>出発</button></div>';
    const b=$("infStartBtn"); if(b&&!b.disabled) b.onclick=infStart;
  }else{
    p.innerHTML='<div class="row"><div class="grow">'+
      '<div style="font-weight:800; font-size:15px">🌀 探索'+(run.dead?"終了(敗退)":"中")+' ─ '+run.floor+'F</div>'+
      '<div class="small" style="margin-top:3px">獲得予定: 🪙'+fmt(run.gold)+(run.tickets?" ／ 🎫"+run.tickets:"")+
      (best?'<br>'+best:'')+'</div></div>'+
      '<button class="btn primary" id="infColBtn">'+(run.dead?"報告する":"回収")+'</button></div>';
    $("infColBtn").onclick=infCollect;
  }
}
function refreshInfPill(){
  const run=G.inf.run, pill=$("infPill");
  if(!run){ pill.classList.remove("show"); return; }
  infTick();
  pill.classList.add("show");
  $("infPillTxt").textContent=run.dead? run.floor+"Fで敗退(報告待ち)" : run.floor+"F 探索中";
}
$("infPill").onclick=()=>switchTab("adv");

/* ================= 編成モーダル ================= */
const SLOT_DEFS=[
  {s:"weapon", label:"武器",   pos:"n"},
  {s:"armor",  label:"防具",   pos:"n"},
  {s:"acc",    label:"装飾品", pos:"n"},
  {s:"field",  label:"場",     pos:"adv"},
  {s:"buff1",  label:"強化1",  pos:"adj"},
  {s:"buff2",  label:"強化2",  pos:"adj"},
  {s:"skill1", label:"技1",    pos:"v"},
  {s:"skill2", label:"技2",    pos:"v"},
  {s:"skill3", label:"技3",    pos:"v"},
];
function slotAccepts(def, c){
  if(def.pos!==c.pos) return false;
  if(def.pos==="n") return c.slot===def.s; // 名詞はさらに部位(武器/防具/装飾品)一致
  return true;
}

/* ---- おまかせ編成 ----
   スロット毎にスコア最大のカードを自動装備。在庫数を超えて同キーを重複装備しない */
function cardScore(c){
  if(c.pos==="n"){ const s=c.stats;
    return (s.atk||0)*4+(s.def||0)*3+(s.spd||0)*5+(s.hp||0)/6; } // powerと同じ重み
  if(c.pos==="adj") return c.pct;
  if(c.pos==="adv") return c.fieldType==="all"? c.pct*4 : c.fieldType==="proc"? c.pct*1.5 : c.pct*0.5;
  return c.mult*Math.min(100,c.proc)/100; // 期待ダメージ
}
function autoEquip(){
  const before=playerStats().power;
  const groups={};
  for(const k in G.inv){
    const c=cardOf(k); if(!c) continue;
    (groups[c.slot]=groups[c.slot]||[]).push(c);
  }
  for(const g in groups) groups[g].sort((a,b)=>cardScore(b)-cardScore(a));
  const used={};
  const pick=list=>{
    if(!list) return null;
    for(const c of list){
      if((used[c.key]||0) < (G.inv[c.key]||0)){ used[c.key]=(used[c.key]||0)+1; return c.key; }
    }
    return null;
  };
  const eq=G.party.equip;
  eq.weapon=pick(groups.weapon); eq.armor=pick(groups.armor); eq.acc=pick(groups.acc);
  eq.field=pick(groups.field);
  eq.buff1=pick(groups.buff); eq.buff2=pick(groups.buff);
  eq.skill1=pick(groups.skill); eq.skill2=pick(groups.skill); eq.skill3=pick(groups.skill);
  saveG();
  const after=playerStats().power;
  return {before, after};
}
function unequipAll(){
  for(const s in G.party.equip) G.party.equip[s]=null;
  saveG();
}

function openEquipModal(){
  const P=playerStats();
  openModal('<h3>編成</h3>'+
    '<div class="row"><div class="grow small">戦闘力 <b id="eqPower" style="color:var(--accent); font-size:16px">'+fmt(P.power)+'</b></div>'+
    '<button class="btn primary" id="autoEqBtn">✨ おまかせ</button>'+
    '<button class="btn" id="unEqBtn">解除</button></div>'+
    '<div class="charsel" id="eqChars"></div>'+
    '<div class="slotgrid" id="eqSlots"></div>');
  renderEqChars(); renderEqSlots();
  $("autoEqBtn").onclick=()=>{
    const r=autoEquip();
    renderEqSlots();
    toast(r.after>r.before? "おまかせ編成! 戦闘力 "+fmt(r.before)+" → "+fmt(r.after)
        : "すでに最強の編成");
  };
  $("unEqBtn").onclick=()=>{ unequipAll(); renderEqSlots(); toast("装備をすべてはずした"); };
}
function renderEqChars(){
  const box=$("eqChars"); if(!box) return;
  box.innerHTML="";
  CHARS.filter(c=>G.chars[c.id]).sort((a,b)=>b.rar-a.rar).forEach(c=>{
    const d=document.createElement("div");
    d.className="charopt"+(G.party.char===c.id?" sel":"");
    const st=charStats(c.id);
    d.innerHTML='<div class="cf">'+c.face+'</div>'+
      '<div class="cr '+CHAR_RAR_CLASS[c.rar-1]+'">'+CHAR_RAR[c.rar-1]+'</div>'+
      '<div class="cn">'+esc(c.name)+'</div>'+
      '<div class="small" style="font-size:8px">HP'+st.hp+' 攻'+st.atk+'</div>';
    d.onclick=()=>{ G.party.char=c.id; saveG(); renderEqChars(); renderEqSlots(); };
    box.appendChild(d);
  });
}
function renderEqSlots(){
  const box=$("eqSlots"); if(!box) return;
  box.innerHTML="";
  SLOT_DEFS.forEach(def=>{
    const k=G.party.equip[def.s];
    const c=k? cardOf(k) : null;
    const d=document.createElement("div");
    d.className="slot"+(c?" filled bd"+c.rar:"");
    d.innerHTML= c
      ? '<div class="sic">'+c.icon+'</div><div class="sname">'+esc(c.en)+lvLabel(c)+'</div><div class="stype rc'+c.rar+'">'+RAR_STARS[c.rar-1]+'</div>'
      : '<div class="sic" style="opacity:.4">'+SLOT_ICON[def.s.replace(/[0-9]/g,"")]+'</div><div class="stype">'+def.label+'</div>';
    d.onclick=()=>openSlotPicker(def);
    box.appendChild(d);
  });
  const pw=$("eqPower"); if(pw) pw.textContent=fmt(playerStats().power);
}
function openSlotPicker(def){
  const cands=[];
  for(const k in G.inv){
    const c=cardOf(k); if(!c) continue;
    if(!slotAccepts(def,c)) continue;
    cands.push(c);
  }
  cands.sort((a,b)=> b.rar-a.rar || b.lv-a.lv || a.en.localeCompare(b.en));
  const cur=G.party.equip[def.s];
  openModal('<h3>'+def.label+' を選ぶ</h3>'+
    '<div class="panel picker" id="pickList">'+
    (cur? '<div class="prow" id="unequipRow"><div class="sic">🚫</div><div class="grow" style="font-size:12px; font-weight:700">はずす</div></div>':"")+
    (cands.length? "" : '<div class="empty">装備できるカードがない<br><span class="small">'+
      ({n:"名詞",adj:"形容詞",adv:"副詞",v:"動詞"})[def.pos]+'の単語に正解すると入手</span></div>')+
    '</div>');
  const list=$("pickList");
  cands.forEach(c=>{
    const row=document.createElement("div");
    row.className="prow";
    row.innerHTML='<div class="sic">'+c.icon+'</div>'+
      '<div class="grow"><div style="font-size:12px; font-weight:800">'+esc(c.en)+lvLabel(c)+
      ' <span class="rc'+c.rar+'" style="font-size:10px">'+RAR_STARS[c.rar-1]+'</span>'+
      (cur===c.key? ' <span class="small" style="color:var(--accent)">装備中</span>':"")+'</div>'+
      '<div class="small" style="font-size:10px">'+effectText(c)+' ─ '+esc(c.ja)+'</div></div>';
    row.onclick=()=>{ G.party.equip[def.s]=c.key; saveG(); openEquipModal(); };
    list.appendChild(row);
  });
  const un=$("unequipRow");
  if(un) un.onclick=()=>{ G.party.equip[def.s]=null; saveG(); openEquipModal(); };
}
$("equipBtn").onclick=openEquipModal;
