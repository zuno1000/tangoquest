"use strict";
/* ================= ステージ定義 & 編成 =================
   v4.25.0: 冒険=サバイバー一本化 ─ 旧ダンジョン(オート戦闘)と無限回廊は廃止。
   DUNGEONSはサバイバーのステージ定義・敵カタログとして続投し、解放連鎖(dgUnlocked)は
   サバイバーの生還記録(G.sv.clears)が進める(旧クリア記録 G.dungeons でも解放済みを維持)。
   るすばん探索(idleGain)と編成(おまかせ・スロットUI)もこのファイルが担う */

/* elem: 敵の属性(0火/1水/2風/3光/4闇) / trait: 敵の特性(なし・tough・fierce・swift)。
   ステージごとに有効な編成が変わる=編成を考える理由になる */
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
  // v4.6.0 拡張(tier13〜18): 星界の先の世界
  {id:"d13", tier:13, floors:16, icon:"🎪", name:"逆さまの魔戯場", elem:4, trait:"fierce",
   names:["道化人形","影絵の獣","囁く仮面"], eicons:["🤡","🐈‍⬛","🎭"], boss:"狂宴の道化王 ジェスタ", bossIcon:"🃏"},
  {id:"d14", tier:14, floors:17, icon:"🕰️", name:"時忘れの砂時計", elem:2, trait:"swift",
   names:["時喰い虫","砂の巨人","過去の残像"], eicons:["🪲","🗿","👤"], boss:"刻の支配者 クロノス", bossIcon:"⏳"},
  {id:"d15", tier:15, floors:17, icon:"💠", name:"虹霓の水晶宮", elem:3, trait:"tough",
   names:["プリズムゴーレム","光の蝶","水晶兵"], eicons:["🔷","🦋","💎"], boss:"七彩の女王 イリス", bossIcon:"🌈"},
  {id:"d16", tier:16, floors:18, icon:"⚙️", name:"終末機関都市", elem:0, trait:"tough",
   names:["機械兵","蒸気竜","歯車の番人"], eicons:["🤖","🚂","⚙️"], boss:"機神デウス・マキナ", bossIcon:"🦾"},
  {id:"d17", tier:17, floors:18, icon:"🪞", name:"鏡界の狭間", elem:4, trait:"swift",
   names:["鏡写しの己","虚像の騎士","裏側の住人"], eicons:["🪞","🤺","👥"], boss:"反転の王 ウラガエシ", bossIcon:"🌓"},
  {id:"d18", tier:18, floors:20, icon:"📜", name:"原初の言霊神殿", elem:3, trait:"fierce",
   names:["言霊の精","アルファの獣","オメガの蛇"], eicons:["🔤","🦁","🐍"], boss:"言葉の始祖 ロゴス", bossIcon:"📜"},
];
const TRAITS={
  tough: {ic:"🛡️", name:"硬い",  desc:"防御がとても高い ─ 【貫通】技が有効"},
  fierce:{ic:"💢", name:"狂暴",  desc:"攻撃が激しい ─ HP・防御・【吸収】技で耐えよう"},
  swift: {ic:"💨", name:"神速",  desc:"素早く先手を取ってくる ─ 素早さで対抗"},
};

/* 解放連鎖: 前のステージを制していれば次が解放。
   v4.25.0からは「サバイバーで生還」(G.sv.clears)が進める。旧ダンジョンのクリア記録
   (G.dungeons)でも解放済みのまま=既存プレイヤーの進行を失わない */
function dgUnlocked(i){
  if(i===0) return true;
  const id=DUNGEONS[i-1].id;
  return !!((G.dungeons[id]&&G.dungeons[id].clears>0) ||
            (G.sv&&G.sv.clears&&G.sv.clears[id]>0));
}

function recPower(d){ return Math.round(Math.pow(1.55,d.tier-1)*(1+0.13*(d.floors-1))*430); } // 推奨戦闘力の目安

/* ---- るすばん探索(v4.13.0): アプリを開くだけで経過時間ぶんの🪙が貯まる ----
   放置ゲームの「ログインするだけでメリット」を最小構成で:
   レートは制した最高tierで決まる(冒険が進むほど留守番も稼ぐ)。
   上限24時間ぶん=毎日開くのがいちばん得。精算は起動・復帰時に自動 */
function idleRate(g){
  let t=0;
  for(const d of DUNGEONS){
    const r=g.dungeons&&g.dungeons[d.id];        // 旧ダンジョンのクリア記録(互換)
    const s=g.sv&&g.sv.clears&&g.sv.clears[d.id]; // サバイバーの生還記録(v4.25.0〜)
    if(((r&&r.clears>0)||s>0) && d.tier>t) t=d.tier;
  }
  return 10+2*t*t; // 🪙/時(未クリアでも10/時=最初のログインからメリットがある)
}
function idleGain(g, now){
  now=now||Date.now();
  if(!g.idle) g.idle={last:0};
  if(!g.idle.last){ g.idle.last=now; return null; } // 初回は基準時刻を置くだけ
  const hours=Math.min(24, (now-g.idle.last)/3600e3);
  if(hours<0.5) return null; // 30分未満は貯めたまま(開くたびに出るとノイズ)
  const gold=Math.floor(hours*idleRate(g));
  if(gold<1) return null;
  g.idle.last=now;
  g.gold+=gold;
  return {gold, hours, rate:idleRate(g)};
}

/* ---- 振動(演出の共通部品。旧・演出プレイヤーから続投) ---- */
const CAN_VIBRATE = typeof navigator!=="undefined" && "vibrate" in navigator;
function vibe(pat){
  if(!CAN_VIBRATE || localStorage.getItem("tq_vibe")==="off") return;
  try{ navigator.vibrate(pat); }catch(e){}
}


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
  // 候補は単語ごとに1枚(正規キー=最高レア)。同単語の別レアを並べる
  // 自己共鳴の悪用(v4.7.2までの穴)も候補の時点で塞がる
  const cands=[];
  const ens=new Set(Object.keys(G.inv).map(k=>parseKey(k).en));
  for(const en of ens){ const c=cardOf(canonKeyOf(en)); if(c) cands.push(c); }
  cands.sort((a,b)=>cardScore(b)-cardScore(a));
  let top=cands.slice(0,50);
  // 共鳴候補: 上位カードと語根を共有するカードは単体スコアが低くても候補に足す(同節で化ける)
  const roots=new Set();
  top.forEach(c=>rootIdsOf(c.en).forEach(r=>roots.add(r)));
  cands.slice(50).forEach(c=>{ if(rootIdsOf(c.en).some(r=>roots.has(r))) top.push(c); });
  top=top.slice(0,60);

  // 評価: 戦闘力を最大化し、同点なら不発が少ない構成を優先
  // (不発カードは戦闘力に寄与しないため、これで不発は自然に外れる)
  const evalT=t=>{ const P=playerStats(t); return {p:P.power, d:Object.keys(P.dead).length}; };
  const betterThan=(a,b)=> a.p>b.p+1e-9 || (Math.abs(a.p-b.p)<=1e-9 && a.d<b.d);

  const climb=start=>{
    let best=start.slice(), bestE=evalT(best);
    let improved=true, iter=0;
    while(improved && iter++<40){
      improved=false;
      // 置換・外す(null)。v4: 同一カードは1枠まで(重ねはLvに宿る)
      for(const c of [...top, null]){
        const key=c? c.key : null;
        for(let i=0;i<max;i++){
          if(best[i]===key) continue;
          const trial=best.slice(); trial[i]=key;
          if(key && trial.filter(k=>k===key).length>1) continue; // 重複配置は不可
          const e=evalT(trial);
          if(betterThan(e, bestE)){ best=trial; bestE=e; improved=true; }
        }
      }
      // 挿入(以降を右へずらす): 「形容詞を名詞の前に割り込ませる」は置換では到達できない
      for(const c of top){
        for(let i=0;i<max;i++){
          const trial=best.slice(); trial.splice(i,0,c.key); trial.length=max;
          if(trial.filter(k=>k===c.key).length>1) continue;
          const e=evalT(trial);
          if(betterThan(e, bestE)){ best=trial; bestE=e; improved=true; }
        }
      }
      // 並べ替え(swap): 形容詞の係り先・×と^の適用順・共鳴の節割りが変わる
      for(let i=0;i<max;i++) for(let j=i+1;j<max;j++){
        if(best[i]===best[j]) continue;
        const trial=best.slice(); [trial[i],trial[j]]=[trial[j],trial[i]];
        const e=evalT(trial);
        if(betterThan(e, bestE)){ best=trial; bestE=e; improved=true; }
      }
    }
    return {best, bestE};
  };
  // 多スタート: 「空」と「現在の編成」から登り、良い方を採る(局所解対策)
  const cur=G.party.sentence.slice(0,max);
  while(cur.length<max) cur.push(null);
  let r=null;
  for(const s of [new Array(max).fill(null), cur]){
    const x=climb(s);
    if(!r || betterThan(x.bestE, r.bestE)) r=x;
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
$("unEqBtn").onclick=()=>{ unequipAll(); renderEqSlots(); toast("呪文を全て空にした"); };

/* 出撃キャラの1枚パネル。旧UIは横スクロールの全キャラ列だったが、iOSで
   スクロール容器内の角丸+光沢のクリップが壊れて突破彩色がはみ出すため、
   パネル+選択モーダル(なかまタブと同じ描画経路)に刷新(v4.5.0)。
   パネルのタップ=詳細モーダル/「変更」=選択モーダル */
function renderEqChars(){
  const box=$("eqChars"); if(!box) return;
  const c=byChar[G.party.char];
  if(!c){ box.innerHTML=""; return; }
  const dup=(G.chars[c.id]&&G.chars[c.id].dup)||0;
  const st=charStats(c.id);
  /* shine(光沢アニメ)は付けない: iOSはアニメ付き要素をレイヤー合成する際に
     要素自身の描画(背景・浮き影)が角丸に沿わなくなる(v4.5.1で背景を::beforeに
     逃したが、今度は浮き影が四角い角のまま描かれた=IMG_1681)。
     アニメを断てば通常描画に戻り根治する。フォイル彩色(dup10)は静的なので残る */
  box.innerHTML=
    '<div class="eqhero'+dupClass(dup).replace(" shine","")+'" id="eqCurChar" style="--dupc:'+DUP_RGB[c.rar-1]+'">'+
      '<div class="ecf">'+charFace(c)+'</div>'+
      '<div class="grow">'+
        '<div class="'+CHAR_RAR_CLASS[c.rar-1]+'" style="font-weight:800; font-size:11px">'+
          CHAR_RAR[c.rar-1]+(dup>=10? ' 👑+'+dup : dup? " +"+dup : "")+'</div>'+
        '<div style="font-weight:800; font-size:15px; line-height:1.25">'+esc(c.name)+'</div>'+
        (c.sk? '<div class="cskill">✦ '+esc(c.sk.n)+' ─ '+skillDesc(c.sk)+'</div>':"")+
        '<div class="small" style="margin-top:2px">HP'+st.hp+' 攻'+st.atk+' 防'+st.def+' 速'+st.spd+'</div>'+
      '</div>'+
      '<button class="btn" id="eqCharPickBtn">変更</button>'+
    '</div>';
  $("eqCurChar").onclick=()=>openCharModal(c.id, {select:true}); // タップで能力の詳細
  $("eqCharPickBtn").onclick=e=>{ e.stopPropagation(); openCharPicker(); };
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
    : "同じ属性を2枚そろえるとセット効果<br>冒険先の弱点属性で固めるのも有効";
}

/* ---- ライブ数式プレビュー: 文がそのままダメージ式になる ---- */
function renderFormula(P){
  const box=$("formulaBox"); if(!box) return;
  if(!P.clauses.length){
    box.innerHTML='<div class="empty">カードを置くと、ここにダメージの式が出る<br>'+
      '<span class="small">基本形: ✨形容詞 → 💎名詞 → ⚔️動詞<br>'+
      '並び順で結果が変わる<br>'+
      '同じ語根(🧬)を並べると「共鳴」<br>'+
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
     (P.guard? ' ・ 守護 被ダメ-'+P.guard+'%':'')+
     (P.skill? '<br>✦'+esc(P.skill.n)+': '+skillDesc(P.skill):'')+'</div>';
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
    // 単語ごとに1枚(正規キー)。別レアの端数は同じカードのLvに合流している
    const cands=[];
    const ens=new Set(Object.keys(G.inv).map(k=>parseKey(k).en));
    for(const en of ens){
      const c=cardOf(canonKeyOf(en)); if(!c) continue;
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
      // v4: 同一カードは文に1枠だけ(重ねた枚数はLvとして効いている)
      const placed=equippedCountOf(c.key)>0 && cur!==c.key;
      const row=document.createElement("div");
      row.className="prow"+(placed?" dim":"");
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
        if(placed){ toast("この単語はすでに文の中にある"); return; }
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
