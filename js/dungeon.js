"use strict";
/* ================= ダンジョン & 編成 & 無限回廊 ================= */

const DUNGEONS=[
  {id:"d1", tier:1, floors:5,  icon:"🌾", name:"はじまりの草原",
   names:["スライム","野ウサギ","いたずら妖精"], boss:"巨大スライム"},
  {id:"d2", tier:2, floors:7,  icon:"🕳️", name:"苔むす洞窟",
   names:["洞窟コウモリ","ゴブリン","岩ガニ"], boss:"ゴブリンキング"},
  {id:"d3", tier:3, floors:8,  icon:"🌲", name:"忘却の森",
   names:["森オオカミ","歩く木トレント","毒キノコ"], boss:"森の主アルラウネ"},
  {id:"d4", tier:4, floors:10, icon:"🏜️", name:"砂塵の遺跡",
   names:["砂サソリ","ミイラ兵","ガーゴイル"], boss:"遺跡の守護者アヌビス"},
  {id:"d5", tier:5, floors:10, icon:"🌋", name:"竜の火山",
   names:["火トカゲ","溶岩ゴーレム","ヘルハウンド"], boss:"火竜イフリート"},
  {id:"d6", tier:6, floors:12, icon:"🗼", name:"星降る魔塔",
   names:["魔導兵","死霊術師","ガーゴイル卿"], boss:"大魔王リヴェリオン"},
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

/* ---- ダンジョン攻略(即時シミュレーション → ログ演出) ---- */
let logTimer=null;

function startRun(d){
  const P=playerStats();
  track("run");
  const lines=[]; // {t,s}
  let cleared=0, gold=0;
  let hp=P.hp;
  for(let f=1; f<=d.floors; f++){
    const boss=f===d.floors;
    const E=enemyFor(d.tier, f, d.floors, boss, d.names, d.boss);
    lines.push({t:"fl", s:"─── "+f+"F "+(boss?"👹 ":"")+E.name+" が現れた ───"});
    const cur=Object.assign({}, P, {hp});
    const r=simBattle(cur, E);
    // 長い戦闘ログは前後だけ見せる
    const bl=r.log.length>12? r.log.slice(0,6).concat([{t:"pl",s:"…激しい攻防が続く…"}], r.log.slice(-4)) : r.log;
    lines.push(...bl);
    if(!r.win){
      lines.push({t:"lose", s:"力尽きた… "+f+"Fで敗退"});
      break;
    }
    cleared=f;
    gold+=Math.round(8*d.tier*d.tier*(1+(P.goldBonus||0)/100));
    hp=Math.min(P.hp, Math.round(r.php + P.hp*0.25)); // 各階クリア後 25%回復
    lines.push({t:"win", s:E.name+"を倒した! (残りHP "+fmt(hp)+")"});
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
    lines.push({t:"win", s:"🏆 "+d.name+" 完全攻略!"});
  }
  G.gold+=gold; G.tickets+=tickets;
  lines.push({t:full?"win":"lose", s:"報酬: 🪙"+fmt(gold)+(tickets? " ／ 🎫"+tickets:"")});
  saveG(); refreshHeader();

  // 演出
  openModal('<h3>'+d.icon+' '+d.name+'</h3>'+
    '<div id="battleLog"></div>'+
    '<div class="row" style="justify-content:center; margin-top:10px">'+
    '<button class="btn" id="skipLog">スキップ ▶▶</button>'+
    '<button class="btn primary hidden" id="logDone">閉じる</button></div>');
  const box=$("battleLog");
  let i=0;
  const put=l=>{
    const e=document.createElement("div");
    e.className=l.t; e.textContent=l.s;
    box.appendChild(e); box.scrollTop=box.scrollHeight;
  };
  const finish=()=>{
    clearInterval(logTimer); logTimer=null;
    while(i<lines.length) put(lines[i++]);
    $("skipLog").classList.add("hidden");
    $("logDone").classList.remove("hidden");
    renderAdv();
  };
  logTimer=setInterval(()=>{ if(i>=lines.length){ finish(); return; } put(lines[i++]); }, 120);
  $("skipLog").onclick=finish;
  $("logDone").onclick=closeModal;
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
      '<div style="font-weight:800; font-size:13px">🌀 無限回廊</div>'+
      '<div class="small" style="margin-top:2px">出発すると1階25秒で自動探索。クイズをしている間も進む。10階ごとに🎫1<br>'+best+'</div></div>'+
      '<button class="btn gold" id="infStartBtn" '+(dgUnlocked(1)?"":"disabled")+'>出発</button></div>';
    const b=$("infStartBtn"); if(b&&!b.disabled) b.onclick=infStart;
  }else{
    p.innerHTML='<div class="row"><div class="grow">'+
      '<div style="font-weight:800; font-size:13px">🌀 探索'+(run.dead?"終了(敗退)":"中")+' ─ 現在 '+run.floor+'F</div>'+
      '<div class="small" style="margin-top:2px">獲得予定: 🪙'+fmt(run.gold)+(run.tickets?" ／ 🎫"+run.tickets:"")+
      '<br>'+best+'(編成は出発時の状態で固定)</div></div>'+
      '<button class="btn primary" id="infColBtn">'+(run.dead?"報告する":"回収して終了")+'</button></div>';
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

function openEquipModal(){
  const P=playerStats();
  const owned=CHARS.filter(c=>G.chars[c.id]).sort((a,b)=>b.rar-a.rar);
  openModal('<h3>編成</h3>'+
    '<div class="small">冒険者を選び、カードを装備する。戦闘力 <b id="eqPower" style="color:var(--accent)">'+fmt(P.power)+'</b></div>'+
    '<div class="charsel" id="eqChars"></div>'+
    '<div class="slotgrid" id="eqSlots"></div>'+
    '<div class="small" style="margin-top:10px">名詞=装備 ／ 形容詞=強化 ／ 副詞=場 ／ 動詞=技。カードはクイズ正解で入手。</div>');
  renderEqChars(); renderEqSlots();
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
