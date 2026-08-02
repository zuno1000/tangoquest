"use strict";
/* ================= ダンジョン & 編成 & 無限回廊 ================= */

/* elem: 敵の属性(0火/1水/2風/3光/4闇) / trait: 敵の特性(なし・tough・fierce・swift)。
   ダンジョンごとに有効な編成が変わる=編成を考える理由になる */
const DUNGEONS=[
  {id:"d1", tier:1, floors:5,  icon:"🌾", name:"はじまりの草原", elem:2,
   names:["スライム","野ウサギ","いたずら妖精"], eicons:["👾","🐇","🧚"], boss:"巨大スライム", bossIcon:"👾"},
  {id:"d2", tier:2, floors:7,  icon:"🕳️", name:"苔むす洞窟", elem:4, trait:"tough",
   names:["洞窟コウモリ","ゴブリン","岩ガニ"], eicons:["🦇","👺","🦀"], boss:"ゴブリンキング", bossIcon:"👹"},
  {id:"d3", tier:3, floors:8,  icon:"🌲", name:"忘却の森", elem:2,
   names:["森オオカミ","歩く木トレント","毒キノコ"], eicons:["🐺","🌳","🍄"], boss:"森の主アルラウネ", bossIcon:"🌺"},
  {id:"d4", tier:4, floors:10, icon:"🏜️", name:"砂塵の遺跡", elem:0,
   names:["砂サソリ","ミイラ兵","ガーゴイル"], eicons:["🦂","🧟","🗿"], boss:"遺跡の守護者アヌビス", bossIcon:"⚱️"},
  {id:"d5", tier:5, floors:10, icon:"🌋", name:"竜の火山", elem:0, trait:"fierce",
   names:["火トカゲ","溶岩ゴーレム","ヘルハウンド"], eicons:["🦎","🪨","🔥"], boss:"火竜イフリート", bossIcon:"🐉"},
  {id:"d6", tier:6, floors:12, icon:"🗼", name:"星降る魔塔", elem:3,
   names:["魔導兵","死霊術師","ガーゴイル卿"], eicons:["🧙","💀","🗿"], boss:"大魔王リヴェリオン", bossIcon:"👿"},
  {id:"d7", tier:7, floors:12, icon:"🌊", name:"海淵の神殿", elem:1,
   names:["マーマン","深海クラゲ","海蛇"], eicons:["🧜","🪼","🐍"], boss:"深淵の主クラーケン", bossIcon:"🐙"},
  {id:"d8", tier:8, floors:12, icon:"🧊", name:"永久凍土の城", elem:1, trait:"tough",
   names:["アイスゴーレム","雪女","フロストウルフ"], eicons:["🧊","❄️","🐺"], boss:"氷帝グラキエス", bossIcon:"☃️"},
  {id:"d9", tier:9, floors:14, icon:"📚", name:"幻影図書館", elem:4, trait:"swift",
   names:["生きた辞書","インクの精","本の亡霊"], eicons:["📖","🖋️","👻"], boss:"禁書の王レキシス", bossIcon:"📕"},
  {id:"d10", tier:10, floors:14, icon:"🏯", name:"天空回廊", elem:2, trait:"swift",
   names:["ハーピー","雲海竜","天空騎士"], eicons:["🦅","☁️","🤺"], boss:"天翔ける王シエロ", bossIcon:"🌤️"},
  {id:"d11", tier:11, floors:15, icon:"🌑", name:"常夜の墓所", elem:4, trait:"fierce",
   names:["グール","バンシー","デュラハン"], eicons:["🧟","🕯️","🎃"], boss:"冥王ノクターン", bossIcon:"🌑"},
  {id:"d12", tier:12, floors:16, icon:"🌌", name:"星界の果て", elem:3, trait:"tough",
   names:["星屑の獣","コメットドラゴン","銀河の番人"], eicons:["🐆","☄️","🛸"], boss:"創星神アストラル", bossIcon:"🌌"},
];
const TRAITS={
  tough: {ic:"🛡️", name:"硬い",  desc:"防御がとても高い ─ 【貫通】技が有効"},
  fierce:{ic:"💢", name:"狂暴",  desc:"攻撃が激しい ─ HP・防御・【吸収】技で耐えよう"},
  swift: {ic:"💨", name:"神速",  desc:"素早く先手を取ってくる ─ 素早さで対抗"},
};

function dgRec(id){ if(!G.dungeons[id]) G.dungeons[id]={clears:0, lastClearDay:null}; return G.dungeons[id]; }
function dgUnlocked(i){ return i===0 || (G.dungeons[DUNGEONS[i-1].id]&&G.dungeons[DUNGEONS[i-1].id].clears>0); }

/* ---- 冒険タブ描画(世界マップ風の蛇行パス) ---- */
function recPower(d){ return Math.round(Math.pow(1.55,d.tier-1)*(1+0.13*(d.floors-1))*430); } // 推奨戦闘力の目安

function renderAdv(){
  renderInfPanel();
  const list=$("dungeonList"); list.innerHTML="";
  let frontier=-1; // 最前線 = 未クリアで解放済みの最初のダンジョン
  DUNGEONS.forEach((d,i)=>{
    const rec=G.dungeons[d.id];
    if(frontier<0 && dgUnlocked(i) && !(rec&&rec.clears>0)) frontier=i;
  });
  DUNGEONS.forEach((d,i)=>{
    const un=dgUnlocked(i), rec=G.dungeons[d.id];
    const cleared=rec&&rec.clears>0;
    const node=document.createElement("div");
    node.className="dnode"+(i%2?" alt":"")+(un?"":" locked")+(i===frontier?" current":"");
    node.innerHTML=
      '<div class="dic">'+(un? d.icon : "🔒")+'</div>'+
      '<div class="grow"><div class="dname">'+d.name+
        (cleared? ' <span class="dclear">✓'+rec.clears+'</span>':'')+
        (i===frontier? ' <span class="dnew">NEW</span>':'')+'</div>'+
      '<div class="dinfo">'+(un
        ? '全'+d.floors+'F ・ '+ELEM_ICON[d.elem]+ELEM_NAME[d.elem]+'属性'+
          (d.trait? ' ・ '+TRAITS[d.trait].ic+TRAITS[d.trait].name:'')+' ・ 推奨 '+fmt(recPower(d))
        : '前のダンジョンをクリアで解放')+'</div></div>';
    if(un) node.onclick=()=>openDungeonModal(d);
    list.appendChild(node);
  });
}

function openDungeonModal(d){
  const P=playerStats();
  const rec=G.dungeons[d.id];
  const rp=recPower(d);
  const okp=P.power>=rp;
  // 属性相性: 敵属性に有利な属性と、いまの編成での効果を見せる(対策を促す)
  const adv=ELEM_BEATS.indexOf(d.elem);
  const m=elemMatch(P.elems, d.elem);
  const matchTxt = m.adv>0
    ? '有利カード<b style="color:var(--ok)">'+m.adv+'枚</b> → 与ダメ<b style="color:var(--ok)">+'+Math.round((m.dealt-1)*100)+'%</b>'+
      (m.taken<1? ' ・ 被ダメ<b style="color:var(--ok)">-'+Math.round((1-m.taken)*100)+'%</b>':'')
    : '<span style="color:var(--sub)">'+ELEM_ICON[adv]+ELEM_NAME[adv]+'属性のカードを装備すると有利に戦える</span>';
  openModal('<h3>'+d.icon+' '+esc(d.name)+'</h3>'+
    '<div class="small" style="line-height:1.9">'+
    '全'+d.floors+'F ・ ボス『'+d.boss+'』'+d.bossIcon+'<br>'+
    '敵は'+ELEM_ICON[d.elem]+ELEM_NAME[d.elem]+'属性(弱点: '+ELEM_ICON[adv]+ELEM_NAME[adv]+')<br>'+matchTxt+
    (d.trait? '<br>'+TRAITS[d.trait].ic+'<b>'+TRAITS[d.trait].name+'</b>: '+TRAITS[d.trait].desc:'')+'<br>'+
    '推奨戦闘力 <b style="color:'+(okp?"var(--ok)":"var(--ng)")+'">'+fmt(rp)+'</b>(いまの戦闘力 '+fmt(P.power)+')<br>'+
    (rec&&rec.clears? 'クリア'+rec.clears+'回 ・ 本日初クリアで🎫1' : '初クリア報酬: 🎫3')+'</div>'+
    (okp? "" : '<div class="small" style="margin-top:6px; color:var(--ng)">戦闘力が足りない。クイズでカードを集め、弱点属性で編成を組もう</div>')+
    '<div class="row" style="margin-top:14px; gap:8px">'+
    '<button class="btn" style="flex:1" data-close>やめる</button>'+
    '<button class="btn primary" style="flex:2" id="dgGo">⚔ 挑む</button></div>');
  $("dgGo").onclick=()=>startRun(d);
}

/* ---- ダンジョン攻略(即時シミュレーション → ビジュアルバトル演出) ---- */
function startRun(d){
  const P=playerStats();
  track("run");
  const floors=[]; // {f, boss, E, icon, hpStart, hpAfter, win, events}
  let cleared=0, gold=0, hp=P.hp;
  for(let f=1; f<=d.floors; f++){
    const boss=f===d.floors;
    const E=enemyFor(d.tier, f, d.floors, boss, d.names, d.boss, {elem:d.elem, trait:d.trait});
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
const CAN_VIBRATE = typeof navigator!=="undefined" && "vibrate" in navigator;
function vibe(pat){
  if(!CAN_VIBRATE || localStorage.getItem("tq_vibe")==="off") return;
  try{ navigator.vibrate(pat); }catch(e){}
}

const SPEED_ICONS={1:"🚶", 2:"🏃", 3:"⚡"};
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
      '<button class="btn" id="bSpeedBtn">'+SPEED_ICONS[speed]+' ×'+speed+'</button>'+
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
        $("bEName").textContent=(st.fl.E.elem!=null? ELEM_ICON[st.fl.E.elem]+" ":"")+st.fl.E.name;
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
          if(e.heal){ setHp($("bPHp"), $("bPHpN"), e.php, P.hp); pop($("bP"), "+"+fmt(e.heal), "heal"); }
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
    $("bSpeedBtn").textContent=SPEED_ICONS[speed]+" ×"+speed;
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
          atk:Math.round(20*p), def:Math.round(9*p), spd:9+Math.floor(floor/5),
          elem:floor%5}; // 階ごとに属性が巡る(偏った編成は深層で止まりやすい)
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

/* ================= 編成(呪文文) =================
   文のスロットUI・ライブ数式プレビュー・おまかせ編成(山登り法)。
   v3.5.0: おまかせを強化 ─ 置換に加えて「並べ替え(swap)」「外す」も探索し、
   共鳴相手のカードは低スコアでも候補に含める(属性対策だけは手動の領分のまま) */

function cardScore(c){
  if(c.pos==="n") return c.val;
  if(c.pos==="adj") return c.sub===0? c.m*30 : c.p*40; // 累乗は大きい値に係ると化ける
  if(c.pos==="adv") return c.sub===0? c.r*50 : c.sub===1? c.m*40 : c.g;
  return c.w*VERB_TYPES[c.vt||0].expF*40;
}
function autoEquip(){
  const before=playerStats().power;
  const max=sentenceSlots();
  const cands=[];
  for(const k in G.inv){ const c=cardOf(k); if(c) cands.push(c); }
  cands.sort((a,b)=>cardScore(b)-cardScore(a));
  let top=cands.slice(0,50);
  // 共鳴候補: 上位カードと語根を共有するカードは単体スコアが低くても候補に足す(同節で化ける)
  const roots=new Set();
  top.forEach(c=>rootIdsOf(c.en).forEach(r=>roots.add(r)));
  cands.slice(50).forEach(c=>{ if(rootIdsOf(c.en).some(r=>roots.has(r))) top.push(c); });
  top=top.slice(0,60);

  const climb=start=>{
    let best=start.slice(), bestP=playerStats(best).power;
    let improved=true, iter=0;
    while(improved && iter++<40){
      improved=false;
      // 置換・外す(null)
      for(const c of [...top, null]){
        const key=c? c.key : null;
        for(let i=0;i<max;i++){
          if(best[i]===key) continue;
          const trial=best.slice(); trial[i]=key;
          if(key && trial.filter(k=>k===key).length > (G.inv[key]||0)) continue; // 在庫超過
          const p=playerStats(trial).power;
          if(p>bestP){ best=trial; bestP=p; improved=true; }
        }
      }
      // 並べ替え(swap): 形容詞の係り先・×と^の適用順・共鳴の節割りが変わる
      for(let i=0;i<max;i++) for(let j=i+1;j<max;j++){
        if(best[i]===best[j]) continue;
        const trial=best.slice(); [trial[i],trial[j]]=[trial[j],trial[i]];
        const p=playerStats(trial).power;
        if(p>bestP){ best=trial; bestP=p; improved=true; }
      }
    }
    return {best, bestP};
  };
  // 多スタート: 「空」と「現在の編成」から登り、良い方を採る(局所解対策)
  const cur=G.party.sentence.slice(0,max);
  while(cur.length<max) cur.push(null);
  let r=null;
  for(const s of [new Array(max).fill(null), cur]){
    const x=climb(s);
    if(!r || x.bestP>r.bestP) r=x;
  }
  G.party.sentence=r.best;
  saveG();
  return {before, after:playerStats().power};
}
function unequipAll(){
  G.party.sentence=new Array(sentenceSlots()).fill(null);
  saveG();
}

/* 編成タブのボタン。要素は静的DOMにあるため一度だけバインド */
$("autoEqBtn").onclick=()=>{
  const r=autoEquip();
  renderEqSlots();
  toast(r.after>r.before? "おまかせ編成! 戦闘力 "+fmt(r.before)+" → "+fmt(r.after)
      : "これ以上は上がらなかった。属性対策は手動の出番");
};
$("unEqBtn").onclick=()=>{ unequipAll(); renderEqSlots(); toast("文をすべて空にした"); };

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
      '<div class="small" style="font-size:10px">HP'+st.hp+' 攻'+st.atk+'</div>';
    d.onclick=()=>{ G.party.char=c.id; saveG(); renderEqChars(); renderEqSlots(); };
    box.appendChild(d);
  });
}

/* ---- 文スロットの描画 ---- */
function renderEqSlots(){
  const row=$("sentenceRow"); if(!row) return;
  const max=sentenceSlots();
  const s=G.party.sentence;
  if(s.length>max) s.length=max;
  while(s.length<max) s.push(null);
  const P=playerStats();
  row.innerHTML="";
  for(let i=0;i<max;i++){
    const k=s[i], c=k? cardOf(k):null;
    const d=document.createElement("div");
    d.className="wslot"+(c?" filled bd"+c.rar:"")+(P.dead[i]!=null?" wdead":"");
    d.innerHTML= c
      ? '<div class="wpos pos'+c.pos+'">'+POS_LABEL[c.pos]+'</div>'+
        '<div class="wen">'+esc(c.en)+lvLabel(c)+'</div>'+
        '<div class="wfx">'+c.elemIcon+' '+shortEffect(c)+'</div>'+
        (c.wild? '<div class="wmem">🐺Lv'+memBox(c.en)+(wildOverdue(c.en)? '<span class="wdue"> ⏳</span>':'')+'</div>':'')+
        (P.dead[i]!=null? '<div class="wwarn">⚠不発</div>':'')
      : '<div class="wplus">＋</div><div class="wfx">'+(i+1)+'語目</div>';
    d.onclick=()=>openSlotModal(i);
    row.appendChild(d);
  }
  $("slotInfo").textContent="現在"+max+"語まで(知識Lvで最大8語)";
  renderFormula(P);
  const pw=$("eqPower"); if(pw) pw.textContent=fmt(P.power);
  const es=$("eqSets");
  if(es) es.innerHTML = P.sets && P.sets.length
    ? "セット効果: "+P.sets.map(x=>ELEM_ICON[x.elem]+"×"+x.n+" <b style='color:var(--ok)'>+"+Math.round(x.b*100)+"%</b>").join(" ・ ")
    : "同じ属性を2枚そろえるとセット効果。<br>冒険先の弱点属性で固めるのも有効";
}

/* ---- ライブ数式プレビュー: 文がそのままダメージ式になる ---- */
function renderFormula(P){
  const box=$("formulaBox"); if(!box) return;
  if(!P.clauses.length){
    box.innerHTML='<div class="empty">カードを置くと、ここにダメージの式が出る<br>'+
      '<span class="small">基本形: ✨形容詞 → 💎名詞 → ⚔️動詞。<br>'+
      '並び順で結果が変わる<br>'+
      '同じ語根(🧬)を並べると「共鳴」。<br>'+
      '語根のない野生語(🐺)は覚えているほど強い</span></div>';
    return;
  }
  let h="";
  P.clauses.forEach(cl=>{
    const dmg=Math.round(clauseExp(cl)*P.charM*P.setM*P.amp);
    h+='<div class="frow"><div class="grow">'+
      '<span class="small">'+esc(cl.words.join(" + ")||"-")+'</span> '+
      '<b>'+fmt(cl.V)+'</b>'+
      (cl.name? ' → ⚔<b>'+esc(cl.name)+'</b><span class="small">【'+VERB_TYPES[cl.vt||0].name+'×'+cl.w+'】</span>' : ' <span class="small">→ 素の一撃</span>')+
      (cl.res>1? ' <span style="color:var(--ok); font-weight:800">🧬共鳴'+
        cl.resRoots.map(x=>" "+ROOT_DEFS[x.r].t+"×"+x.n).join("")+' ⇒×'+cl.res+'</span>':'')+
      (cl.wildM>1? ' <span style="color:var(--accent); font-weight:800">🐺野生×'+cl.wildM+'</span>':'')+
      (cl.rep? ' <span style="color:var(--accent2)">🌀反復×'+cl.rep+'</span>':'')+
      '</div><b style="color:var(--accent2); font-size:15px">'+fmt(dmg)+'</b></div>';
  });
  h+='<div class="ftotal">▶ ダメージ/ターン <b>'+fmt(P.dpt)+'</b></div>'+
     '<div class="small" style="margin-top:3px">キャラ×'+P.charM.toFixed(2)+
     (P.setM>1? ' ・ セット×'+P.setM.toFixed(2):'')+
     (P.amp>1? ' ・ 増幅×'+P.amp.toFixed(2):'')+
     (P.guard? ' ・ 守護 被ダメ-'+P.guard+'%':'')+'</div>';
  box.innerHTML=h;
}

/* ---- スロット操作(入替・移動・はずす) ---- */
function openSlotModal(i){
  const k=G.party.sentence[i];
  if(!k){ openWordPicker(i); return; }
  const c=cardOf(k);
  const P=playerStats();
  openModal('<h3>'+(i+1)+'語目: '+esc(c.en)+'</h3>'+
    cardDetailHTML(c)+
    (P.dead[i]!=null? '<div class="small" style="text-align:center; color:var(--ng); margin-top:6px">⚠不発: '+P.dead[i]+'</div>':'')+
    '<div class="row" style="margin-top:12px; gap:8px">'+
      '<button class="btn" style="flex:1" id="mvL" '+(i===0?"disabled":"")+'>◀ 左へ</button>'+
      '<button class="btn" style="flex:1" id="mvR" '+(i>=sentenceSlots()-1?"disabled":"")+'>右へ ▶</button>'+
    '</div>'+
    '<div class="row" style="margin-top:8px; gap:8px">'+
      '<button class="btn primary" style="flex:2" id="swapBtn">🔁 別のカードにする</button>'+
      '<button class="btn danger" style="flex:1" id="rmBtn">はずす</button>'+
    '</div>');
  const s=G.party.sentence;
  const swap=j=>{ const t=s[i]; s[i]=s[j]; s[j]=t; saveG(); closeModal(); renderEqSlots(); };
  $("mvL").onclick=()=>{ if(i>0) swap(i-1); };
  $("mvR").onclick=()=>{ if(i<sentenceSlots()-1) swap(i+1); };
  $("swapBtn").onclick=()=>openWordPicker(i);
  $("rmBtn").onclick=()=>{ s[i]=null; saveG(); closeModal(); renderEqSlots(); };
}

/* ---- カード選択(品詞フィルタ付き・どの品詞もどこにでも置ける) ---- */
let pickerPos="all";
function openWordPicker(i){
  openModal('<h3>'+(i+1)+'語目に置くカード</h3>'+
    '<div class="seg" id="pkSeg">'+["all","n","adj","v","adv"].map(p=>
      '<button data-p="'+p+'" class="'+(p===pickerPos?"active":"")+'">'+(p==="all"?"全て":POS_LABEL[p])+'</button>').join("")+'</div>'+
    '<div class="panel picker" id="pickList"></div>');
  const render=()=>{
    const list=$("pickList"); list.innerHTML="";
    const cands=[];
    for(const k in G.inv){
      const c=cardOf(k); if(!c) continue;
      if(pickerPos!=="all" && c.pos!==pickerPos) continue;
      cands.push(c);
    }
    cands.sort((a,b)=> b.rar-a.rar || b.lv-a.lv || a.en.localeCompare(b.en));
    if(!cands.length){
      list.innerHTML='<div class="empty">カードがない<br><span class="small">クイズに正解すると入手できる</span></div>';
      return;
    }
    const cur=G.party.sentence[i];
    cands.forEach(c=>{
      const free=(G.inv[c.key]||0) - equippedCountOf(c.key) + (cur===c.key?1:0);
      const row=document.createElement("div");
      row.className="prow"+(free<=0?" dim":"");
      row.innerHTML='<div class="sic">'+c.icon+'</div>'+
        '<div class="grow"><div style="font-size:14px; font-weight:800">'+esc(c.en)+lvLabel(c)+
        ' <span class="rc'+c.rar+'" style="font-size:11px">'+c.elemIcon+' '+RAR_STARS[c.rar-1]+'</span>'+
        (cur===c.key? ' <span class="small" style="color:var(--accent)">配置中</span>':"")+'</div>'+
        '<div class="small" style="font-size:11px">'+effectText(c)+' ─ '+esc(c.ja)+
        (rootText(c.en)? '<br>🧬'+rootText(c.en):'')+
        (c.wild? '<br><span style="color:var(--accent)">🐺記憶Lv'+memBox(c.en)+'(節×'+wildMult(c.en)+')'+
          (wildOverdue(c.en)? ' ⏳復習どき':'')+'</span>':'')+'</div></div>'+
        '<b style="color:var(--accent2); white-space:nowrap">'+shortEffect(c)+'</b>';
      row.onclick=()=>{
        if(free<=0){ toast("在庫が足りない(他の語で使用中)"); return; }
        G.party.sentence[i]=c.key; saveG();
        closeModal(); renderEqSlots();
      };
      list.appendChild(row);
    });
  };
  $("pkSeg").querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{
      pickerPos=b.dataset.p;
      $("pkSeg").querySelectorAll("button").forEach(x=>x.classList.toggle("active", x===b));
      render();
    };
  });
  render();
}
