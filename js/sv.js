"use strict";
/* ================= 単語のサバイバー(サバイバー系ローグライク・β / v4.20.0) =================
   「クイズを解くこと」がそのまま生存戦術になる新モード。冒険タブから遊ぶ。
   単語の防衛線(TD・v4.14〜4.19)を置き換える形で導入(2026-08-12ユーザー方針)。

   ■ 可逆性の約束(防衛線と同じ):
   既存の学習タブ(quiz.js・quizViewのUI)には一切手を入れない。
   このモードは js/sv.js(本ファイル)+ index.htmlのsvView/svEntryブロック+
   CSSのv4.20.0ブロック+TABSの1行だけで成立しており、それらを消せば元に戻る。
   学習の計上(SRS・日別記録・🎫・XP・カード)は学習タブと同一の帳簿付けを
   行うため、このモードで解いた分も正史の学習記録になる。

   ■ ゲームの形(Vampire Survivors系の文法をクイズ駆動に翻訳):
   ・VS: 敵が全方位から際限なく湧く/武器は自動で撃つ/意思決定はレベルアップの
     3択だけ/時間経過で激化 → すべて採用
   ・VSの「移動して避ける」だけは捨てる: クイズを解きながら移動操作は両立
     できないため、自機は中央固定・敵が全方位から迫るアリーナ型にする
     (殲滅が追いつかないと囲まれて死ぬ=移動回避の緊張感を代替)
   具体像:
   ・自機はフィールド中央。敵は縁から湧いて直進し、間合いに入ると殴り続ける
   ・武器=呪文の節が自動発火(動詞タイプで撃ち方が変わる: 強撃=最近接/
     貫通=直線ビーム/吸収=HPドレイン/連撃=2体)。自動火力だけでは湧きの
     激化に追いつかない係数にしてある(正解とレベルアップが生存の前提)
   ・正解=◆ジェム獲得(コンボで増)+全武器の即時一斉バースト。ミス=コンボ
     リセットのみ(自動攻撃は止まらない)
   ・◆が貯まるとレベルアップ: ゲームを止めて3択(威力/連射/バースト/回復/
     守り/金運)。ランの間だけの一時強化=ローグライクの成長
   ・180秒(論理時間)生き延びるとボス出現。倒せば勝利で🪙
   ・時間は「出題中と答え合わせ中」に流れる(v4.23.0実機FBで答え合わせ中も進行に変更)。
     3択・タブ移動中は完全停止=じっくり選ぶ権利は保証しつつ、戦場から目を離すと敵は迫る
   ・倒した敵の🪙は勝っても負けても全額持ち帰り(ローグライトの快感) */

/* ---- 定数(ゲームバランスはここに集約=実機FBごとの調整を速く) ---- */
const SV_TICK=250;              // 論理tick(ms)。描画はCSSトランジションで補間
const SV_STAGE_SEC=180;         // ボス出現までの生存時間(秒・論理時間)
const SV_CX=50, SV_CY=50;       // 自機の座標(フィールドは0〜100の正規化座標)
const SV_REACH=9;               // 敵が足を止めて殴りかかる間合い
const SV_TOUCH_CD=1200;         // 敵の攻撃間隔(ms)
const SV_SPAWN0=2700, SV_SPAWN1=800;  // 湧き間隔(ms): 開始→ボス直前へ線形に短縮(v4.22.0で加速)
const SV_HPF=0.55;              // 敵HP係数(ダンジョンより軽い=群れで押す)
const SV_BOSS_HPF=1.4;          // ボスHP係数(enemyForのボス補正にさらに乗る)
const SV_AUTO=0.55;             // 自動発火の威力係数(dpt比)
const SV_BURST=2.2;             // 正解バーストの威力係数(dpt比)
const SV_CD={0:2600, 1:4200, 2:3400, 3:3000}; // 動詞タイプ別の自動発火間隔(ms)
const SV_GEM_LV0=4, SV_GEM_STEP=2;  // レベルアップ必要◆: 4, 6, 8, …
const SV_HEAL_CAP=0.08;         // 吸収の回復上限(発射1回あたり最大HP比)
const SV_MAXFOES=36;            // 同時出現数の上限(スマホ描画ガード・v4.22.0で増員)
const SV_BEAM_DEG=32;           // 貫通ビームの有効角(度)

/* ---- Phase2(v4.21.0): なかま召喚・宝箱・エリート ---- */
const SV_SAT_MAX=3;             // なかま(衛星)の同時召喚数
const SV_SAT_CD=1800;           // なかまの攻撃間隔(ms)
const SV_SAT_DMG=0.35;          // なかまの攻撃係数(自軍dpt比×キャラ攻撃/40)
                                //  ─ TDの「なかま=ただの壁」の反省: 火力を呪文に併走させる
const SV_SAT_R=17;              // 周回半径(正規化座標)
const SV_SAT_DEG=46;            // 周回速度(度/秒)
const SV_CHEST_IV=45000;        // 宝箱スライムの出現間隔(ms)
const SV_CHEST_TTL=20000;       // 宝箱スライムの滞在時間(ms・逃すと消える)
const SV_CHEST_GOLD=15;         // 宝箱の🪙係数((2+tier)×これ)
/* なかまの射程タイプ(TD_RANGEの後継): 弓・魔法・唄タイプは遠くの敵も撃てる */
const SV_SATRNG={
  c02:1, c04:1, c11:1, c19:1, c25:1, c31:1, c32:1, c34:1,       // 支援・準後衛
  c03:2, c06:2, c13:2, c18:2, c20:2, c28:2, c30:2,              // 弓・魔法
  c10:3, c22:3, c33:3,                                          // 大魔法・打ち上げ
};

/* ---- Phase3(v4.21.0): 永続強化「サバイバーの心得」・日替わりチャレンジ ---- */
const SV_META=[
  {id:"hp",   ic:"❤️", name:"体力の心得", desc:"自機の最大HP +6%/Lv",       max:5},
  {id:"pow",  ic:"⚔",  name:"威力の心得", desc:"すべての攻撃 +5%/Lv",       max:5},
  {id:"rate", ic:"⏩", name:"詠唱の心得", desc:"自動発火の間隔 -4%/Lv",     max:5},
  {id:"gem",  ic:"🔷", name:"集中の心得", desc:"ラン開始時に◆+1/Lv",        max:3},
  {id:"gold", ic:"💰", name:"金運の心得", desc:"獲得🪙 +8%/Lv",             max:5},
];
const SV_META_COST=[500,1500,4000,10000,25000]; // Lv1→2→…の🪙(恒常ガチャと並ぶgoldシンク)
/* 日替わりの修飾(その日のルール)。mは敵・湧き・🪙への係数 */
const SV_DAILY_MODS=[
  {id:"horde", name:"大群の日", desc:"敵の数+40%・敵HP-20%", m:{spawn:0.7, ehp:0.8,  eatk:1,   espd:1,   gmult:1}},
  {id:"tank",  name:"重装の日", desc:"敵HP+35%",             m:{spawn:1,   ehp:1.35, eatk:1,   espd:1,   gmult:1}},
  {id:"rush",  name:"神速の日", desc:"敵の足+30%",           m:{spawn:1,   ehp:1,    eatk:1,   espd:1.3, gmult:1}},
  {id:"pain",  name:"痛撃の日", desc:"敵の攻撃+40%・🪙1.5倍", m:{spawn:1,   ehp:1,    eatk:1.4, espd:1,   gmult:1.5}},
];
const SV_DAILY_GOLD=t=>1200+400*t; // デイリー初回勝利の🪙ボーナス(tierで増える)

/* ---- v4.22.0: 無限ダンジョン「終わりなき荒野」 ----
   DUNGEONSには足さない(冒険タブ・解放連鎖・既存テストに波及するため)。
   敵は1分ごとにDUNGEONSの次のステージから「借りて」深化し、2分ごとにボスが乱入する
   (倒しても終わらない)。属性は等倍・勝利はなく、倒れるまでの記録(秒・キル)を持ち帰る */
const SV_ENDLESS={id:"dx", tier:1, floors:5, icon:"🏜️", name:"終わりなき荒野", endless:true};
const SV_EL_STAGE_IV=60000;    // ステージ深化の間隔(ms)
const SV_EL_BOSS_IV=120000;    // ボス乱入の間隔(ms)
const SV_EL_SPAWN_MIN=450;     // 湧き間隔の下限(ms)
const SV_EL_DECAY=0.93;        // 180秒以降の湧き間隔: 毎分-7%

/* レベルアップの3択候補(ランの間だけの一時強化)。
   v4.22.0でシナジー基盤に拡張: rule=trueのものは「オンヒット規則」として
   b.rulesに積まれ、svHit(全攻撃の一本道)で自動発火する=武器/バースト/なかま/
   反撃のどれにも波及して、固定コンボ表なしで創発する(v3呪文文法と同じ思想)。
   rare=trueは出現率が低く、宝箱の3択では優先して出る。maxは取得回数の上限 */
const SV_UPGRADES=[
  // 基本: 数値の底上げ(従来の6種+効果はそのまま)
  {id:"pow",  ic:"⚔",  name:"言霊の研磨",   desc:"すべての攻撃の威力 +25%", max:5},
  {id:"rate", ic:"⏩", name:"詠唱加速",     desc:"自動発火の間隔 -18%", max:5},
  {id:"burst",ic:"💥", name:"会心の正解",   desc:"正解バーストの威力 +35%", max:5},
  {id:"heal", ic:"🌿", name:"いやしの言葉", desc:"いますぐHP40%回復 & 最大HP +10%", max:5},
  {id:"guard",ic:"🛡", name:"まもりの言霊", desc:"受けるダメージ -15%", max:5},
  {id:"gold", ic:"💰", name:"金運の言霊",   desc:"獲得ゴールド +30%", max:5},
  // 基本: オンヒット規則(すべての攻撃に乗る)
  {id:"crit", ic:"🎯", name:"会心の言霊",   desc:"すべての攻撃が12%で会心(2倍)。重ねると+8%", max:3, rule:1},
  {id:"burn", ic:"🔥", name:"延焼",         desc:"攻撃した敵が燃える(3秒かけて追加ダメージ)", max:3, rule:1},
  {id:"chill",ic:"❄️", name:"氷結",         desc:"攻撃した敵の足が凍えて遅くなる", max:3, rule:1},
  {id:"thorn",ic:"🌵", name:"トゲの言霊",   desc:"殴られたとき、その敵に自動で反撃する", max:3, rule:1},
  {id:"wave", ic:"🌊", name:"衝波",         desc:"正解バーストのたび敵を押し返す", max:3, rule:1},
  {id:"reso", ic:"🎼", name:"共鳴",         desc:"なかまの攻撃 +30%", max:3, rule:1},
  {id:"cheer",ic:"📯", name:"鼓舞",         desc:"正解バーストになかまも一斉参加する", max:2, rule:1},
  // v4.24.0: なかま自体の戦い方を強化する規則(実機FB「攻撃速度・攻撃範囲の強化が欲しい」)
  {id:"haste",ic:"🐎", name:"早駆け",       desc:"なかまの攻撃間隔 -15%", max:3, rule:1},
  {id:"reach",ic:"🔭", name:"遠見",         desc:"なかまの射程 +30%", max:3, rule:1},
  // レア: ランを塗り替える規則(宝箱の3択で優先)
  {id:"chain",ic:"⚡", name:"連鎖",         desc:"攻撃が近くの敵へ稲妻で連鎖する", max:2, rule:1, rare:1},
  {id:"echo", ic:"🌀", name:"やまびこ",     desc:"正解バーストがもう一度響く(50%威力)", max:2, rule:1, rare:1},
  {id:"exec", ic:"💀", name:"処刑",         desc:"HPが残りわずかな敵を即座に討ち取る(ボス以外)", max:2, rule:1, rare:1},
  {id:"blast",ic:"🎆", name:"爆散",         desc:"倒した敵が爆発して周囲を巻き込む", max:2, rule:1, rare:1},
  {id:"ovh",  ic:"🔰", name:"あふれる癒し", desc:"あふれた回復がシールドになる(最大HP30%まで)", max:2, rule:1, rare:1},
  {id:"bond", ic:"👥", name:"絆",           desc:"なかまの枠 +1(最大5体)", max:2, rule:1, rare:1},
];

/* ---- 純関数(テスト対象) ---- */

/* 呪文スナップショットの整形(tdSnapshotと同じ思想): playerStats()の節を
   武器リストに落とす。キャラ倍率・セット効果・増幅・スキルは各節のVに織り込み。
   節がない(呪文が空)ならキャラ攻撃の素の一撃(新規プレイヤー保護) */
function svSnapshot(P){
  const k=(P.charM||1)*(P.setM||1)*(P.amp||1)*(1+(P.abDmg||0));
  let cls=(P.clauses||[]).filter(c=>c.V>0).map(c=>(
    {V:c.V*k, vt:c.vt||0, w:c.w||1, rep:c.rep||0, name:c.name||null}));
  if(!cls.length) cls=[{V:Math.max(P.dpt||0, P.catk||10), vt:0, w:1, rep:0, name:null}];
  return {cls, hp:P.hp, abBoss:P.abBoss||0, dpt:Math.max(P.dpt||0, P.catk||10)};
}

/* 編成中の野生語のうち復習期限切れの数(=錆び)。防衛線から継承したルール:
   錆びた言霊1つにつき威力-6%(最大-30%)。復習して研ぎ直すと戻る(出撃時判定) */
function svRustCount(){
  let n=0;
  equippedEnSet().forEach(en=>{ if(isWild(en) && wildOverdue(en)) n++; });
  return n;
}
function svRustMult(n){ return Math.max(0.7, 1-0.06*(n||0)); }

/* 湧き間隔(ms): 経過時間でSV_SPAWN0→SV_SPAWN1へ線形短縮(VS式の激化) */
function svSpawnIv(tMs){
  const p=Math.min(1, tMs/(SV_STAGE_SEC*1000));
  return Math.round(SV_SPAWN0+(SV_SPAWN1-SV_SPAWN0)*p);
}

/* エリート個体の出現率: 30秒過ぎから混ざりはじめ、上限20%(v4.22.0で前倒し・増量) */
function svEliteP(tMs){
  if(tMs<30000) return 0;
  return Math.min(0.20, 0.03+0.12*tMs/(SV_STAGE_SEC*1000));
}

/* ---- 終わりなき荒野の純関数 ---- */
/* いま借りているステージ: 1分ごとにDUNGEONSを順に深く(最深はd18で頭打ち) */
function svEndlessStage(tMs){
  return DUNGEONS[Math.min(Math.floor(tMs/SV_EL_STAGE_IV), DUNGEONS.length-1)];
}
/* d18到達後もインフレを続ける係数(1分ごと×1.25) */
function svEndlessHpM(tMs){
  const over=Math.max(0, Math.floor(tMs/SV_EL_STAGE_IV)-(DUNGEONS.length-1));
  return Math.pow(1.25, over);
}
/* 荒野の湧き間隔: 180秒までは通常と同じ線形短縮、以降は毎分-7%(下限450ms) */
function svEndlessSpawnIv(tMs){
  if(tMs<=SV_STAGE_SEC*1000) return svSpawnIv(tMs);
  return Math.max(SV_EL_SPAWN_MIN,
    Math.round(SV_SPAWN1*Math.pow(SV_EL_DECAY, (tMs-SV_STAGE_SEC*1000)/60000)));
}

/* 心得(永続強化)のボーナス(純関数)。metaは G.sv.meta = {id→Lv} */
function svMetaBonus(meta){
  meta=meta||{};
  return {hpM:1+0.06*(meta.hp||0), powM:1+0.05*(meta.pow||0),
          rateM:1-0.04*(meta.rate||0), gem0:Math.min(meta.gem||0, SV_GEM_LV0-1),
          goldM:1+0.08*(meta.gold||0)};
}
/* 心得の購入(純関数寄り: gはG互換の{gold, sv}構造)。買えなければnull */
function svBuyMeta(g, id){
  g.sv=g.sv||{clears:{}}; g.sv.meta=g.sv.meta||{};
  const def=SV_META.find(x=>x.id===id);
  const lv=(g.sv.meta[id]||0);
  if(!def || lv>=def.max) return null;
  const cost=SV_META_COST[lv];
  if((g.gold||0)<cost) return null;
  g.gold-=cost;
  g.sv.meta[id]=lv+1;
  return {lv:lv+1, cost};
}
/* 心得の一括強化(v4.23.0実機FB): 安い順に買えるだけ買う=総レベルが最大になる貪欲法。
   dryRun=trueならgに触れず見積もりだけ返す(ボタンに「+◯・🪙◯」を出すため) */
function svBuyMetaAll(g, dryRun){
  const meta=Object.assign({}, (g.sv&&g.sv.meta)||{});
  let gold=g.gold||0, count=0, spent=0;
  for(;;){
    let best=null;
    for(const m of SV_META){
      const lv=meta[m.id]||0;
      if(lv>=m.max) continue;
      const cost=SV_META_COST[lv];
      if(cost<=gold && (!best || cost<best.cost)) best={id:m.id, cost};
    }
    if(!best) break;
    gold-=best.cost; spent+=best.cost; count++;
    meta[best.id]=(meta[best.id]||0)+1;
  }
  if(count && !dryRun){
    g.gold=gold;
    g.sv=g.sv||{clears:{}};
    g.sv.meta=meta;
  }
  return {count, spent};
}

/* 日替わりチャレンジの内容(決定的: 日付ハッシュ→修飾・品詞しばり・ステージ番号)。
   nStagesは解放済みステージ数(その範囲から選ぶ=詰まない) */
function svDailyFor(dayKey, nStages){
  const h=hashStr("svd"+dayKey);
  return {mods:SV_DAILY_MODS[h%SV_DAILY_MODS.length],
          pos:["v","n","adj","adv"][Math.floor(h/7)%4],
          idx:Math.floor(h/29)%Math.max(1, nStages||1)};
}

/* 品詞しばりの出題(デイリー用)。pickWord(quiz.js)の骨格を品詞プールに絞って再現:
   期限が来た復習を忘れかけ度順に優先→新規→先取り。SRSの帳簿付けは通常と同一。
   ※quiz.jsを書き換えず複製しているのは可逆性のため */
function svPickWord(pos){
  if(!pos) return pickWord();
  const now=Date.now();
  const pool=WORDS.filter(w=>w.pos===pos);
  const due=[], unseen=[];
  for(const w of pool){
    const st=G.words[w.en];
    if(!st) unseen.push(w);
    else if(st[1]<=now) due.push(w);
  }
  const fresh=a=>{ const f=a.filter(w=>!recentEns.includes(w.en)); return f.length? f : a; };
  const d=fresh(due), u=fresh(unseen);
  if(d.length && (u.length===0 || Math.random()>=0.25)){
    d.sort((a,b)=>reviewUrgency(G.words[b.en],now)-reviewUrgency(G.words[a.en],now));
    const p=d.slice(0, Math.min(8,d.length));
    return p[Math.floor(Math.random()*p.length)];
  }
  if(u.length) return u[Math.floor(Math.random()*u.length)];
  const seen=fresh(pool.filter(w=>G.words[w.en]));
  seen.sort((a,b)=>(G.words[a.en][0]-G.words[b.en][0]) || (G.words[a.en][1]-G.words[b.en][1]));
  const p2=seen.slice(0, Math.min(10,seen.length));
  return p2[Math.floor(Math.random()*p2.length)] || pool[0] || WORDS[0];
}

/* 正解1問の◆ジェム。コンボが乗る(5連続で2個・10連続で3個) */
function svGemGain(ok, combo){
  if(!ok) return 0;
  return (combo||0)>=10? 3 : (combo||0)>=5? 2 : 1;
}
/* 次のレベルに必要な◆: 4, 6, 8, …(1ラン40問正解でLv+5前後になる調整) */
function svXpNext(lv){ return SV_GEM_LV0+SV_GEM_STEP*(lv-1); }
/* 次のレベルまでに必要な正解数(いまのコンボの◆獲得数で換算・v4.23.0)。
   ◆ゲージの右に「あと◯問」で常駐=正解が何問ぶんの前進かをその場で示す */
function svNeedAnswers(b, combo){
  return Math.max(1, Math.ceil((svXpNext(b.lv)-b.gem)/svGemGain(true, combo||0)));
}
/* ◆を加算し、レベルアップしたらtrue(余りは持ち越し) */
function svAddGems(b, n){
  b.gem+=n;
  const need=svXpNext(b.lv);
  if(b.gem>=need){ b.gem-=need; b.lv++; return true; }
  return false;
}

/* 敵の生成。ダンジョン定義(DUNGEONS)を流用し、経過時間で深い階の敵になる。
   HPは群れ用に軽くする(ボスは逆に重く=ランの締めの長期戦) */
function svFoe(d, tMs, boss){
  const prog=Math.min(1, tMs/(SV_STAGE_SEC*1000));
  const floor=boss? d.floors : 1+Math.round((d.floors-1)*prog);
  const e=enemyFor(d.tier, floor, d.floors, boss, d.names, d.boss, {elem:d.elem, trait:d.trait});
  e.icon=boss? d.bossIcon : d.eicons[Math.floor(Math.random()*d.eicons.length)];
  e.hp=Math.round(e.hp*(boss? SV_BOSS_HPF : SV_HPF));
  e.hpMax=e.hp;
  // 縁のランダムな角度から湧く(全方位)
  const a=Math.random()*2*Math.PI;
  e.x=Math.min(97, Math.max(3, SV_CX+47*Math.cos(a)));
  e.y=Math.min(96, Math.max(4, SV_CY+44*Math.sin(a)));
  e.sp=(3.2+(e.spd||10)*0.14)*(boss? 0.5:1); // 進行速度(正規化座標/秒)
  e.atkCd=SV_TOUCH_CD; // 間合いに入ってから最初の一撃までの猶予
  return e;
}

/* 戦闘状態の生成。編成は出発時スナップショットで固定
   (無限回廊と同じ思想: ラン中の装備替えは効かない=放置悪用も防げる)。
   opts(v4.21.0)={meta:心得, mods:日替わり修飾, pos:品詞しばり, daily:デイリー扱い} */
function svNewRun(d, P, rustN, opts){
  opts=opts||{};
  const mb=svMetaBonus(opts.meta);
  const endless=!!d.endless;
  const b={id:d.id, name:d.name, icon:d.icon, tier:d.tier, elem:d.elem,
    t:0, hp:Math.round(P.hp*mb.hpM), hpMax:Math.round(P.hp*mb.hpM), def:P.def||0,
    P:svSnapshot(P),
    em:endless? 1 : elemMatch(P.elems||[], d.elem).dealt,       // 荒野は属性等倍
    emTaken:endless? 1 : elemMatch(P.elems||[], d.elem).taken,
    rust:rustN||0, rustM:svRustMult(rustN),
    enemies:[], seq:0, spawnAt:0,
    sats:[], satMax:SV_SAT_MAX, chestAt:SV_CHEST_IV, chests:0, lvups:0,
    mods:opts.mods||{spawn:1, ehp:1, eatk:1, espd:1, gmult:1},
    pos:opts.pos||null, dailyRun:!!opts.daily,
    lv:1, gem:mb.gem0, kills:0, gold:0,
    up:{pow:mb.powM, rate:mb.rateM, burst:1, guard:1, gold:mb.goldM},
    rules:{}, taken:{}, shield:0,                // v4.22.0: オンヒット規則とその取得回数・シールド
    endless, bossKills:0,
    bossAt:endless? SV_EL_BOSS_IV : SV_STAGE_SEC*1000, bossOn:false,
    over:false, win:false};
  b.weapons=b.P.cls.map((cl,i)=>(
    {V:cl.V, vt:cl.vt, w:cl.w, rep:cl.rep, name:cl.name, cd:600+i*700})); // 初弾は時間差
  return b;
}

/* ---- なかま召喚(v4.21.0): 自機の周りを回る「衛星砲台」 ----
   TDの反省(なかま=ただの壁で火力貢献が薄い)への答え: 攻撃力は自軍のdptに
   併走させ(×キャラ攻撃/40×スキル)、tierが上がっても火力貢献が保たれる。
   スキルの読み替え: dmg=攻撃UP/boss=対ボス/vamp=与ダメの一部で自機回復/
   heal=攻撃のたび自機を再生/guard=いるだけで被弾を軽減(オーラ) */
/* v4.22.0: スキルタイプ=戦闘スタイル9種。基礎ダメージ式は不変(テスト互換)で、
   スタイルは「撃ち方・オンヒットの個性」として上乗せする:
   dmg=剣舞(2体まで斬る)/boss=狙撃(射程+10・ボスとエリートに特効)/
   guard=守護(被弾軽減オーラ)/heal=再生(攻撃のたび自機回復)/vamp=吸血(与ダメ回復)/
   spd=疾風(攻撃間隔を短縮)/xp=詩人(攻撃のたび全武器のCDを縮める鼓舞の唄)/
   gold=商人(とどめの🪙+60%)/hp=重圧(攻撃した敵を一瞬ひるませる) */
function svSatFrom(id, dpt){
  const c=byChar[id];
  if(!c || !G.chars[id]) return null;
  const st=charStats(id);
  const sk=c.sk||{};
  const rng=SV_SATRNG[id]||0;
  return {id, name:c.name.split(" ").pop(), rar:c.rar,
    dmg:Math.round(Math.max(1, dpt)*SV_SAT_DMG*(st.atk/40)*(sk.t==="dmg"? 1+sk.v : 1)),
    reach:20+rng*8+(sk.t==="boss"? 10:0),
    style:sk.t||null,
    iv:sk.t==="spd"? Math.round(SV_SAT_CD*(1-Math.min(0.4, sk.v||0))) : SV_SAT_CD,
    skBoss:sk.t==="boss"? sk.v : 0,
    skVamp:sk.t==="vamp"? sk.v : 0,
    skHeal:sk.t==="heal"? sk.v : 0,
    skGuard:sk.t==="guard"? sk.v : 0,
    cd:900, ang:0, x:SV_CX+SV_SAT_R, y:SV_CY};
}
function svSummon(b, id){
  const cap=b.satMax||SV_SAT_MAX;
  if(b.sats.length>=cap) return null;
  const s=svSatFrom(id, b.P.dpt);
  if(!s) return null;
  s.uid="s"+(++b.seq);
  s.ang=(360*b.sats.length/cap+90)%360; // 等間隔に散らして出す
  b.sats.push(s);
  return s;
}

/* 自機からの距離と角度(度) */
function svDist(e){ const dx=e.x-SV_CX, dy=e.y-SV_CY; return Math.sqrt(dx*dx+dy*dy); }
function svAngle(e){ return Math.atan2(e.y-SV_CY, e.x-SV_CX)*180/Math.PI; }

/* ---- v4.22.0: ダメージの一本道 svHit() ----
   武器・バースト・なかま・反撃・連鎖・爆散、すべての攻撃はこの1関数を通る。
   取得済みのオンヒット規則(会心/延焼/氷結/処刑/連鎖/爆散)はここで自動発火する
   =どの攻撃手段にも自動で波及し、固定コンボ表なしでシナジーが創発する。
   ランダム性のある規則は「取得するまで確率0」=未取得ランの決定性を守る(テスト互換)。
   o={defF:防御係数(既定0.55), bossM:ボス倍率, src:発生源, sat:表示色, from:{x,y}=弾道の始点,
      depth:連鎖・爆散の再帰深さ}。戻り値は実ダメージ */
function svHit(b, e, raw, o, out){
  o=o||{};
  const r=b.rules||{};
  const depth=o.depth||0;
  let eff=Math.max(1, Math.round((raw-(e.def||0)*(o.defF!=null? o.defF:0.55))*(o.bossM||1)));
  // 会心: 取得していれば12%+8%/Lvで2倍(金色ポップ)。反撃には乗らない
  let crit=false;
  if(r.crit && o.src!=="thorn" && Math.random()<0.04+0.08*r.crit){ eff*=2; crit=true; }
  const take=Math.min(e.hp, eff);
  e.hp-=take;
  // 延焼: この一撃の50%×Lvを3秒かけて追い焼き(宝箱は燃やさない)
  if(r.burn && !e.chest && take>0){
    e.burnT=3000;
    e.burnV=Math.max(e.burnV||0, Math.round(take*0.5*r.burn));
  }
  // 氷結: 足止めの冷気(移動が-30%〜50%・svTickの進軍で参照)
  if(r.chill && !e.chest) e.chillT=2500;
  // 処刑: 残りHPがわずかな雑魚は即座に討ち取る(ボス・宝箱以外)
  let exec=false;
  if(r.exec && e.hp>0 && !e.boss && !e.chest && e.hp<=e.hpMax*(0.10+0.08*r.exec)){
    e.hp=0; exec=true;
  }
  const dead=e.hp<=0;
  out.hits.push({name:e.name, icon:e.icon, take, dead, x:e.x, y:e.y, boss:!!e.boss,
    sat:!!o.sat, crit, exec});
  if(o.from) out.shots.push({x1:o.from.x, y1:o.from.y, x2:e.x, y2:e.y, sat:!!o.sat});
  // 連鎖: 稲妻が近くの敵へ飛ぶ(40%+15%/Lv・60%威力・Lv回まで跳ねる)
  if(r.chain && depth<r.chain && o.src!=="chain" && o.src!=="blast" &&
     Math.random()<0.25+0.15*r.chain){
    const t=b.enemies.filter(x=>x!==e && x.hp>0 && !x.chest &&
        Math.hypot(x.x-e.x, x.y-e.y)<=30)
      .sort((a,c)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(c.x-e.x,c.y-e.y))[0];
    if(t){
      out.arcs.push({x1:e.x, y1:e.y, x2:t.x, y2:t.y});
      svHit(b, t, raw*0.6, {defF:o.defF, src:"chain", depth:depth+1}, out);
    }
  }
  // 爆散: 撃破の瞬間、周囲を巻き込む爆発(自軍dpt比・爆発の連鎖は1段まで)
  if(dead && r.blast && !e.chest && o.src!=="blast" && depth<2){
    out.rings.push({x:e.x, y:e.y});
    b.enemies.filter(x=>x!==e && x.hp>0 && Math.hypot(x.x-e.x, x.y-e.y)<=14)
      .forEach(x=>svHit(b, x, b.P.dpt*(0.5+0.3*r.blast), {src:"blast", depth:depth+1}, out));
  }
  return take;
}

/* 自機の回復もここに一本化: あふれる癒し(規則)を取得していると、
   あふれた分の50%×Lvがシールドになる(上限=最大HP30%・被弾を先に受ける) */
function svHealPlayer(b, n){
  const room=b.hpMax-b.hp;
  const applied=Math.min(n, room);
  b.hp+=applied;
  const r=(b.rules&&b.rules.ovh)||0;
  if(r && n>applied){
    b.shield=Math.min(Math.round(b.hpMax*0.3),
      (b.shield||0)+Math.round((n-applied)*0.5*r));
  }
  return applied;
}

/* 1つの武器(節)の発射。動詞タイプで撃ち方が変わる(防衛線から継承・radial化):
   ・強撃(vt0)= 最も近い敵に一撃
   ・貫通(vt1)= 最も近い敵の方向へビーム(有効角±16度の全敵に60%・防御ほぼ無視)
   ・吸収(vt2)= 最近接に80%+与ダメの35%だけ自機を回復(1発あたり最大HP8%まで)
   ・連撃(vt3)= 近い2体に60%ずつ
   ・反復(rep)= その節をもう一度(威力×rep)
   powFは威力係数(自動=SV_AUTO/バースト=SV_BURST×強化×コンボ)。
   実際のダメージ処理はsvHit(一本道)に委譲する */
function svCast(b, w, powF, out){
  const alive=()=>b.enemies.filter(e=>e.hp>0).sort((a,c)=>svDist(a)-svDist(c));
  const hit=(e, raw, ignoreDef, noShot)=>svHit(b, e, raw,
    {defF:ignoreDef? 0.1:0.55, bossM:e.boss? 1+(b.P.abBoss||0):1, src:"weapon",
     from:noShot? null : {x:SV_CX, y:SV_CY}}, out);
  const casts=w.rep? 2:1;
  for(let c=0;c<casts;c++){
    const base=w.V*w.w*powF*b.em*b.rustM*(c? w.rep:1);
    const es=alive();
    if(!es.length) break;
    if(w.vt===1){
      const a0=svAngle(es[0]);
      out.beams.push(a0);
      es.forEach(e=>{
        let da=Math.abs(svAngle(e)-a0); if(da>180) da=360-da;
        if(da<=SV_BEAM_DEG/2) hit(e, base*0.6, true, true); // ビームは弾道を出さない
      });
    }else if(w.vt===2){
      let heal=Math.round(hit(es[0], base*0.8)*0.35);
      heal=Math.min(heal, Math.round(b.hpMax*SV_HEAL_CAP));
      if(heal>0){ svHealPlayer(b, heal); out.heal+=heal; }
    }else if(w.vt===3){
      hit(es[0], base*0.6);
      const es2=alive();
      if(es2.length) hit(es2[0], base*0.6);
    }else hit(es[0], base);
  }
}

/* なかま1体の攻撃(svTickの周回攻撃と鼓舞バーストの共通処理)。
   基礎ダメージ式はv4.21.0から不変: dpt×0.35×(キャラ攻撃/40)×スキル。
   共鳴(規則)と戦闘スタイルの個性はここで上乗せする。戻り値=撃ったか */
function svSatAttack(b, s, out, powM){
  const r=b.rules||{};
  const resoM=1+0.3*(r.reso||0);
  const reach=s.reach*(1+0.3*(r.reach||0)); // 遠見: 射程+30%/Lv(v4.24.0)
  const inReach=b.enemies.filter(e=>e.hp>0 && Math.hypot(e.x-s.x, e.y-s.y)<=reach)
    .sort((a,c)=>Math.hypot(a.x-s.x, a.y-s.y)-Math.hypot(c.x-s.x, c.y-s.y));
  if(!inReach.length) return false;
  // 剣舞(dmg): 一度に2体まで斬る(2体目は60%)
  const targets=(s.style==="dmg" && inReach.length>1)? [inReach[0], inReach[1]] : [inReach[0]];
  targets.forEach((e,i)=>{
    const bossM=e.boss? 1+(s.skBoss||0)
      : (e.elite && s.style==="boss")? 1+(s.skBoss||0)*0.5 : 1; // 狙撃はエリートにも特効
    const take=svHit(b, e, s.dmg*b.em*resoM*(powM||1)*(i? 0.6:1),
      {defF:0.35, bossM, sat:true, src:"sat", from:{x:s.x, y:s.y}}, out);
    if(s.skVamp) svHealPlayer(b, Math.round(take*s.skVamp));      // 吸血
    if(s.skHeal) svHealPlayer(b, Math.round(b.hpMax*s.skHeal*0.06)); // 再生
    if(s.style==="hp" && e.hp>0) e.stunT=900;                     // 重圧: ひるませる
    if(s.style==="gold" && e.hp<=0) e.gmult=(e.gmult||1)*1.6;     // 商人: とどめの🪙
  });
  if(s.style==="xp") b.weapons.forEach(w=>{ w.cd=Math.max(0, w.cd-150); }); // 詩人: 鼓舞の唄
  return true;
}

/* 撃破の精算: 死んだ敵を除去し、🪙とキル数を加算。ボス撃破=勝利。
   エリートは🪙4倍(gmult)・宝箱は大🪙+「ちからの3択」を予約(UI層が開く) */
function svReap(b){
  const dead=b.enemies.filter(e=>e.hp<=0);
  b.enemies=b.enemies.filter(e=>e.hp>0);
  for(const e of dead){
    b.kills++;
    const base=e.chest? SV_CHEST_GOLD*(2+b.tier) : (2+b.tier)*(e.boss? 25 : (e.gmult||1));
    b.gold+=Math.round(base*b.up.gold*((b.mods&&b.mods.gmult)||1));
    if(e.chest) b.chests=(b.chests||0)+1;
    if(e.boss){
      if(b.endless) b.bossKills=(b.bossKills||0)+1; // 荒野のボスは倒しても続く
      else{ b.over=true; b.win=true; b.enemies=[]; }
    }
  }
  return dead.length;
}

/* 正解の一斉バースト: 全武器がその場で1回ずつ発火(自動発火のCDは触らない=ボーナス)。
   multはコンボ倍率。戻り値は演出用 {hits, beams, heal, shots, arcs, rings}。
   v4.22.0: 鼓舞(なかまも参加)・やまびこ(もう一度響く)・衝波(押し返す)もここで発火 */
function svBurst(b, mult){
  const out={hits:[], beams:[], heal:0, shots:[], arcs:[], rings:[]};
  const r=b.rules||{};
  const powF=SV_BURST*b.up.pow*b.up.burst*(mult||1);
  for(const w of b.weapons) svCast(b, w, powF, out);
  // 鼓舞: 正解の号令でなかまも一斉攻撃(Lv2で威力1.5倍)
  if(r.cheer) for(const s of b.sats) svSatAttack(b, s, out, 1+0.5*(r.cheer-1));
  // やまびこ: バーストがもう一度響く(50%+25%/Lvの威力)
  if(r.echo) for(const w of b.weapons) svCast(b, w, powF*(0.25+0.25*r.echo), out);
  // 衝波: 敵をまとめて押し返して間合いを稼ぐ(攻撃の構えもリセット)
  if(r.wave){
    const push=5+3*r.wave;
    for(const e of b.enemies){
      if(e.hp<=0) continue;
      const d=Math.max(1, svDist(e));
      e.x=Math.min(97, Math.max(3, e.x+(e.x-SV_CX)/d*push));
      e.y=Math.min(96, Math.max(4, e.y+(e.y-SV_CY)/d*push));
      e.atkCd=Math.max(e.atkCd, SV_TOUCH_CD*0.6);
    }
  }
  svReap(b);
  return out;
}

/* 1tickの進行(dtミリ秒)。湧き(通常・宝箱・ボス) → 進軍/接敵攻撃 →
   なかまの周回攻撃 → 武器の自動発火 → 精算 → 判定。
   戻り値は演出用イベント {spawned, hits, beams, heal, touches, shots, arcs, rings, bossIn, win, lose} */
function svTick(b, dt){
  const ev={spawned:[], hits:[], beams:[], heal:0, touches:[],
    shots:[], arcs:[], rings:[], bossIn:false, win:false, lose:false};
  if(b.over) return ev;
  b.t+=dt;
  const r=b.rules||{};
  // 荒野: 1分ごとにDUNGEONSを順借りして深化(🪙計算のtierも追随)
  const dd=b.endless? svEndlessStage(b.t) : (b._d||DUNGEONS.find(x=>x.id===b.id));
  if(b.endless) b.tier=dd.tier;
  const md=b.mods||{};
  const elM=b.endless? svEndlessHpM(b.t) : 1;
  // ボス出現。通常ステージは決戦(以降の湧き停止)、荒野は乱入(2分ごと・湧きは続く)
  if(b.t>=b.bossAt && (b.endless || !b.bossOn)){
    b.bossOn=true;
    if(b.endless) b.bossAt+=SV_EL_BOSS_IV;
    const boss=svFoe(dd, b.t, true);
    boss.hp=Math.round(boss.hp*(md.ehp||1)*elM); boss.hpMax=boss.hp;
    boss.atk=Math.round(boss.atk*(md.eatk||1));
    boss.uid=b.endless? "eb"+(++b.seq) : "eboss";
    b.enemies.push(boss);
    ev.spawned.push(boss); ev.bossIn=true;
  }
  if(!b.bossOn || b.endless){
    // 通常の湧き(経過時間で間隔が縮む・時々エリート・修飾を反映)
    while(b.t>=b.spawnAt){
      b.spawnAt+=Math.round((b.endless? svEndlessSpawnIv(b.t) : svSpawnIv(b.t))*(md.spawn||1));
      if(b.enemies.length>=SV_MAXFOES) continue;
      const e=svFoe(dd, b.t, false);
      if(Math.random()<svEliteP(b.t)){
        e.elite=true; e.hp=Math.round(e.hp*2.2); e.atk=Math.round(e.atk*1.35); e.gmult=4;
      }
      e.hp=Math.round(e.hp*(md.ehp||1)*elM); e.hpMax=e.hp;
      e.atk=Math.round(e.atk*(md.eatk||1));
      e.sp=e.sp*(md.espd||1);
      e.uid="e"+(++b.seq);
      b.enemies.push(e);
      ev.spawned.push(e);
    }
    // 宝箱スライム(無害・時間で消える。倒すと🪙+ちからの3択)
    if(b.t>=b.chestAt){
      b.chestAt+=SV_CHEST_IV;
      const c=svFoe(dd, b.t, false);
      c.chest=true; c.icon="🎁"; c.atk=0; c.sp=2.2;
      c.hp=Math.round(c.hp*0.9); c.hpMax=c.hp;
      c.ttl=SV_CHEST_TTL;
      c.uid="e"+(++b.seq);
      b.enemies.push(c);
      ev.spawned.push(c);
    }
  }
  // 進軍: 間合いの外なら自機へ直進、間合い内なら足を止めて殴る(guard持ちのなかまは被弾を軽減)
  const guardM=b.sats.reduce((m,s)=>m*(1-Math.min(0.3, 2*(s.skGuard||0))), 1);
  const expired=[];
  for(const e of b.enemies){
    if(e.ttl!=null){ e.ttl-=dt; if(e.ttl<=0){ expired.push(e.uid); continue; } }
    // 延焼: 燃えている敵は時間経過で追い焼き(ポップは出さず、色で見せる)
    if(e.burnT>0 && e.hp>0){
      e.burnT-=dt;
      const bd=Math.min(e.hp, Math.max(1, Math.round((e.burnV||0)*dt/3000)));
      e.hp-=bd;
      if(e.hp<=0){ ev.hits.push({name:e.name, icon:e.icon, take:bd, dead:true,
        x:e.x, y:e.y, boss:!!e.boss, burn:true}); continue; }
    }
    if(e.chillT>0) e.chillT-=dt;
    if(e.stunT>0){ e.stunT-=dt; continue; } // 重圧: ひるんでいる間は動けない
    if(e.hp<=0) continue;
    const dist=svDist(e);
    if(dist>SV_REACH){
      const chillM=e.chillT>0? 1-Math.min(0.5, 0.2+0.1*(r.chill||1)) : 1; // 氷結の減速
      const step=e.sp*chillM*dt/1000;
      e.x+=(SV_CX-e.x)/dist*Math.min(step, dist-SV_REACH+0.01);
      e.y+=(SV_CY-e.y)/dist*Math.min(step, dist-SV_REACH+0.01);
      e.atkCd=Math.max(e.atkCd, 300); // 到着直後に即殴らせない
    }else{
      e.atkCd-=dt;
      if(e.atkCd<=0){
        e.atkCd+=SV_TOUCH_CD;
        if(e.atk>0){
          let dmg=Math.max(1, Math.round((e.atk-b.def*0.55)*b.emTaken*b.up.guard*guardM));
          // シールド(あふれる癒し)が先に受け止める
          if(b.shield>0){ const sh=Math.min(b.shield, dmg); b.shield-=sh; dmg-=sh; }
          b.hp-=dmg;
          ev.touches.push({dmg, icon:e.icon});
          // トゲ: 殴られたらその敵に自動で反撃(自軍dpt比×Lv)
          if(r.thorn) svHit(b, e, b.P.dpt*0.4*r.thorn, {src:"thorn"}, ev);
        }
      }
    }
  }
  if(expired.length) b.enemies=b.enemies.filter(e=>expired.indexOf(e.uid)<0);
  // なかま(衛星): 周回しながら射程内のいちばん近い敵を撃つ(処理はsvSatAttackに共通化)
  for(const s of b.sats){
    s.ang=(s.ang+SV_SAT_DEG*dt/1000)%360;
    const rad=s.ang*Math.PI/180;
    s.x=SV_CX+SV_SAT_R*Math.cos(rad);
    s.y=SV_CY+SV_SAT_R*0.82*Math.sin(rad); // フィールドの縦横比に合わせた楕円軌道
    s.cd-=dt;
    if(s.cd<=0){
      // 早駆け(規則): 再装填が-15%/Lv(下限500ms・v4.24.0)
      if(svSatAttack(b, s, ev, 1))
        s.cd+=Math.max(500, Math.round((s.iv||SV_SAT_CD)*Math.pow(0.85, r.haste||0)));
      else s.cd=0; // 敵が来るまで構える
    }
  }
  // 武器の自動発火(それぞれのクールダウンで最近接を撃つ)
  if(b.enemies.some(e=>e.hp>0)){
    const out={hits:ev.hits, beams:ev.beams, heal:0, shots:ev.shots, arcs:ev.arcs, rings:ev.rings};
    for(const w of b.weapons){
      w.cd-=dt;
      if(w.cd<=0){
        w.cd+=Math.max(500, SV_CD[w.vt]*b.up.rate);
        svCast(b, w, SV_AUTO*b.up.pow, out);
      }
    }
    ev.heal+=out.heal;
  }else{
    for(const w of b.weapons){ w.cd=Math.max(0, w.cd-dt); } // 敵がいない間は撃たず構える
  }
  svReap(b);
  if(b.over && b.win) ev.win=true;
  if(!b.over && b.hp<=0){ b.hp=0; b.over=true; b.win=false; ev.lose=true; }
  return ev;
}

/* レベルアップの3択: 候補から3種を重複なしで引く。
   bを渡すと「なかま召喚」の候補が混ざる(枠が空いていて未召喚のなかまがいるとき)。
   v4.22.0: 取得上限(max)に達した強化は出ない・レア規則は出現率を絞る(約1/3)。
   opts.rare=true(宝箱の3択)はレア規則を優先して前に積む */
function svUpgradeChoices(b, opts){
  opts=opts||{};
  const lvOf=id=>(b&&b.taken&&b.taken[id])||0;
  let pool=SV_UPGRADES.filter(u=>!u.max || lvOf(u.id)<u.max);
  if(!opts.rare) pool=pool.filter(u=>!u.rare || Math.random()<0.34); // レアは控えめに顔を出す
  if(b && b.sats && b.sats.length<(b.satMax||SV_SAT_MAX)){
    const used=new Set(b.sats.map(s=>s.id));
    const cand=shuffle(Object.keys(G.chars).filter(id=>byChar[id] && !used.has(id))).slice(0,2);
    cand.forEach(id=>{
      const c=byChar[id];
      pool.push({id:"sat:"+id, ic:c.face, name:c.name.split(" ").pop()+"を召喚",
        desc:"なかまが自機を周回して自動攻撃"+(c.sk? "(固有スキル反映)":""), sat:1});
    });
  }
  if(opts.rare){
    // 宝箱: レア規則を先頭に積み、足りない分を基本強化で埋める
    const rares=shuffle(pool.filter(u=>u.rare));
    const rest=shuffle(pool.filter(u=>!u.rare));
    return rares.concat(rest).slice(0,3);
  }
  return shuffle(pool).slice(0,3);
}
function svApplyUpgrade(b, id){
  if(id && String(id).indexOf("sat:")===0){ svSummon(b, id.slice(4)); return; }
  b.taken=b.taken||{};
  b.taken[id]=(b.taken[id]||0)+1;
  const u=b.up;
  const def=SV_UPGRADES.find(x=>x.id===id);
  if(def && def.rule){
    // オンヒット規則: Lvを積むだけ。発火はsvHit/svBurst/svTickの一本道が担う
    b.rules=b.rules||{};
    b.rules[id]=(b.rules[id]||0)+1;
    if(id==="bond") b.satMax=Math.min(5, SV_SAT_MAX+b.rules.bond); // 絆: なかま枠+1(最大5)
    return;
  }
  if(id==="pow") u.pow*=1.25;
  else if(id==="rate") u.rate=Math.max(0.4, u.rate*0.82);
  else if(id==="burst") u.burst*=1.35;
  else if(id==="guard") u.guard=Math.max(0.4, u.guard*0.85);
  else if(id==="gold") u.gold*=1.3;
  else if(id==="heal"){
    b.hpMax=Math.round(b.hpMax*1.1);
    b.hp=Math.min(b.hpMax, b.hp+Math.round(b.hpMax*0.4));
  }
}

/* 時間停止の条件(純関数): タブ非表示・別画面・モーダル(3択含む)中。
   v4.23.0実機FB: 答え合わせ中は止めない ─ 結果を眺めている間も敵は迫る
   (じっくり考える権利は「出題そのものに制限時間がない」ことが引き続き担保する) */
function svShouldPause(hidden, viewHidden, modalOpen){
  return !!(hidden || viewHidden || modalOpen);
}

/* 解答の学習計上。quiz.jsのanswer()と同一の帳簿付け(SRS・日別・ペース・🎫・XP・
   カードドロップ)を行う ─ サバイバーで解いた1問も学習タブの1問と等価。
   ※quiz.jsを書き換えず複製しているのは可逆性のため(このファイルごと消せる) */
function svApplyAnswer(w, ok){
  const now=Date.now();
  let st=G.words[w.en];
  const wasNew=!st;
  if(!st) st=G.words[w.en]=[0,0,0,0,0,0,0];
  const preSt=st.slice();
  srsApply(st, ok, now);
  const d=dayRec(); recordDayAnswer(d, wasNew, ok);
  let justMastered=false;
  if(ok && st[0]>=MASTER_BOX && !st[4]){ st[4]=1; d.m++; justMastered=true; }
  track("ans"); if(ok) track("cor");
  paceLog(wasNew, ok);
  noteRecent(w.en);
  if(ok){
    G.combo=(G.combo||0)+1;
    G.tickets+=corTicketGain();
    const l0=accountLevel();
    G.xp+=Math.round((10+(justMastered?40:0))*streakXpMult()*comboXpMult()*abilityXpMult());
    let rar=dropRarity(preSt);
    if(Math.random()<comboDropBonus()) rar=Math.min(5, rar+1);
    const drop=addCard(w.en, rar);
    if(justMastered){ toast("🏅 "+w.en+" を覚えた! 7日あけても思い出せた"); vibe([30,40,60]); }
    else if(accountLevel()>l0){ toast("📖 レベルアップ! Lv"+accountLevel()+" ─ 全ステータス強化"); vibe(40); }
    else if(drop.rarUp){ toast("🎉 "+w.en+" のカードが★"+drop.rar+"にランクアップ!"); }
  }else{
    G.combo=0;
  }
  const pq=paceToday(G);
  if(pq && !pq.done && d.a===pq.perDay){ toast("🎉 今日の目安 "+pq.perDay+"問を達成!"); vibe(40); }
  return {ok, wasNew, justMastered};
}

/* ---- 画面(svView) ---- */
var SV=null, svCur=null, svAnswered=false, svLoop=null;

function svRec(){ G.sv=G.sv||{clears:{}}; return G.sv; }

/* CSSアニメを確実に再発火させる(クラスを付け直す) */
function svFx(el, cls){
  if(!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
}

function svStart(d, extra){
  if(svLoop){ clearInterval(svLoop); svLoop=null; }
  // 心得(永続強化)は常に反映。extra=デイリーの修飾・品詞しばりなど
  const opts=Object.assign({meta:(G.sv&&G.sv.meta)||null}, extra||{});
  SV=svNewRun(d, playerStats(), svRustCount(), opts);
  SV._d=d;
  SV._extra=extra||null; // 「もう一度」で同じ条件を引き継ぐ
  closeModal();
  switchTab("sv");
  $("svQuitBtn").hidden=!d.endless; // 🏳切り上げは荒野(無限)だけ(v4.24.0)
  $("svField").innerHTML=""; // 前のランのスプライトを一掃
  svQuestion();
  svTick(SV, SV_TICK);       // 最初の1体を湧かせて即座に見せる
  renderSVField(null);
  svCutinShow('<div class="ci3">'+d.icon+' '+esc(d.name)+' ─ 生きのびろ!</div>', 1100);
  svLoop=setInterval(svFrame, SV_TICK);
}

/* 論理tickの駆動。時間が流れるのは出題中+答え合わせ中(v4.23.0):
   レベルアップ3択・タブ非表示・別画面のときは完全停止。
   v4.22.0: 3択のdrainはここでは開かない ─ 予約は「次へ」(svNext)が1つずつ消化する
   決定的フローに一本化(出題中にモーダルが割り込んでこない) */
function svFrame(){
  if(!SV || SV.over) return;
  if(svShouldPause(document.hidden,
      $("svView").classList.contains("hidden"),
      $("overlay").classList.contains("show"))) return;
  const ev=svTick(SV, SV_TICK);
  renderSVField(ev);
  if(SV.over){ setTimeout(svFinish, 700); return; }
}

/* 後片付け(テスト・退出用): ループを止めてランを破棄する */
function svCleanup(){
  if(svLoop){ clearInterval(svLoop); svLoop=null; }
  SV=null;
}

/* カットイン(ボス・開始の告知) */
function svCutinShow(html, ms){
  const ci=$("svCutin");
  if(!ci) return;
  ci.innerHTML=html;
  ci.classList.remove("hidden");
  svFx(ci, "go");
  setTimeout(()=>{ if($("svCutin")) $("svCutin").classList.add("hidden"); }, ms||1500);
}

function svQuestion(){
  if(!SV || SV.over) return;
  const w=svPickWord(SV.pos); // 品詞しばり(デイリー)はここで効く。帳簿付けは通常と同一
  svCur={word:w, choices:buildChoices(w)};
  svRenderQuestion();
}

/* 出題画面の描画(svCurから)。svQuestion(新しい問題)とsvRestore(復帰時の再構築)が
   共有する ─ 「別画面で何が起きていても押せない盤面を残さない」ための分離(v4.22.0) */
function svRenderQuestion(){
  if(!SV || !svCur) return;
  svAnswered=false;
  $("svNextBtn").style.visibility="hidden";
  $("svPrompt").classList.remove("srch"); // 辞書リンクは正誤確認中だけ
  const w=svCur.word;
  const st=G.words[w.en], e2j=G.mode==="e2j";
  // 学習タブと同じヘッダ表記: バッジ・「今日 X/Y問」・「これまで/定着」
  $("svBadge").textContent = !st? "新規" : (st[0]>=MASTER_BOX? "覚えた・復習" : "復習");
  const d=dayRec(), q=paceToday(G);
  $("svCount").textContent=((G.combo||0)>=3? "⚡"+G.combo+"連続 ・ ":"")+
    "今日 "+d.a+(q&&!q.done? "/"+q.perDay:"")+"問";
  $("svStats").innerHTML=qStatsHTML(st);
  $("svWord").textContent = e2j? w.en : w.ja;
  const box=$("svChoices"); box.innerHTML="";
  svCur.choices.forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent = e2j? c.ja : c.en;
    b.onclick=()=>svAnswer(c, b);
    box.appendChild(b);
  });
  refitChoices("#svChoices .choice"); // 長い訳語は縮めて1行に(quiz.jsと同じ・v4.23.0)
}

function svAnswer(chosen, btn){
  if(svAnswered || !SV || SV.over) return;
  svAnswered=true;
  const w=svCur.word, ok=chosen.en===w.en, e2j=G.mode==="e2j";
  document.querySelectorAll("#svChoices .choice").forEach(b=>{
    b.disabled=true;
    const isCorrect = b.textContent === (e2j? w.ja : w.en);
    if(isCorrect) b.classList.add("correct");
    else if(b===btn) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  svApplyAnswer(w, ok);
  $("svStats").innerHTML=qStatsHTML(G.words[w.en]); // 定着ステップの変化を見せる
  $("svPrompt").classList.add("srch"); // 単語タップで辞書へ(学習タブと同じ流儀)
  saveG(); refreshHeader();
  if(ok){
    // 一斉バースト(コンボで威力UP)+◆ジェム(コンボで増)
    const mult=1+0.04*Math.min(Math.max((G.combo||0)-1,0), 15);
    const fire=svBurst(SV, mult);
    if(svAddGems(SV, svGemGain(true, G.combo))) SV.lvups=(SV.lvups||0)+1;
    renderSVField(fire);
    const f=$("svField");
    ["svfire","svfire2","svfire3"].forEach(c=>f.classList.remove(c));
    svFx(f, (G.combo||0)>=10? "svfire3" : (G.combo||0)>=5? "svfire2" : "svfire");
    vibe(fire.hits.some(h=>h.dead)? 25 : 12);
    if(SV.over){ setTimeout(svFinish, 700); return; }
  }else{
    renderSVField(null);
  }
  /* 正解でもミスでも「次へ」必須(v4.22.0実機FB): 自動進行タイマーを廃止。
     v4.23.0: 確認中も時間は流れる ─ 眺めている間も敵は迫る(svFrameが駆動を継続) */
  $("svNextBtn").style.visibility="visible";
}

/* 「次へ」= 予約された3択(レベルアップ・宝箱)を1つずつ消化してから次の問題へ。
   タイマー競合のない決定的フロー(v4.22.0)。✕で見送った予約も、もう一度
   「次へ」を押せば流れが続く */
function svNext(){
  if(!SV) return;
  if(SV.over){ svFinish(); return; }
  if($("overlay").classList.contains("show")) return; // いまのモーダルが閉じてから
  if(SV.lvups>0){ SV.lvups--; svOpenUpgrade("✨ レベルアップ! Lv"+SV.lv); return; }
  if(SV.chests>0){ SV.chests--; svOpenUpgrade("🎁 宝箱のちから", {rare:true}); return; }
  svQuestion();
}

/* 中断からの復帰(v4.22.0): 「別画面で何が起きていても押せない盤面を残さない」不変条件。
   解答済みなら「次へ」を出し、出題中なら選択肢をsvCurから再構築する
   (quiz.jsのセレクタスコープ修正との二段構え) */
function svRestore(){
  if(!SV) return;
  renderSVField(null);
  if(SV.over){ svFinish(); return; }
  if(svAnswered){ $("svNextBtn").style.visibility="visible"; return; }
  if(svCur) svRenderQuestion();
  else svQuestion();
}

/* 3択モーダル(じっくり選べる=時間停止)。titleでレベルアップ/宝箱を出し分け。
   宝箱(opts.rare)はレア規則を優先して差し出す */
function svOpenUpgrade(title, opts){
  if(!SV || SV.over) return;
  const cs=svUpgradeChoices(SV, opts);
  // 注釈は?に集約(v4.23.0): 常時出ていた2行の説明を畳んでシンプルに
  openModal('<h3>'+(title||"✨ レベルアップ! Lv"+SV.lv)+' '+helpBtn("hlp-svup")+'</h3>'+
    helpNote("hlp-svup", '言霊のちからを1つ選ぶ(このランの間だけ有効)。✕で閉じると見送り(選び直しはできない)')+
    cs.map((c,i)=>'<button class="btn svup'+(c.rare? " svrare":"")+'" data-i="'+i+'">'+
      '<span class="svupic">'+c.ic+'</span><span class="grow" style="text-align:left">'+
      '<b>'+esc(c.name)+(c.rare? ' <span class="small" style="color:#e8a400; font-weight:800">レア</span>':'')+'</b>'+
      ((SV.taken&&SV.taken[c.id])? ' <span class="small">Lv'+SV.taken[c.id]+(c.max? "/"+c.max:"")+'</span>':'')+
      '<br><span class="small">'+c.desc+'</span></span></button>').join(""));
  $("modal").querySelectorAll(".svup").forEach(b=>{
    b.onclick=()=>{
      if(!SV) return;
      const c=cs[+b.dataset.i];
      svApplyUpgrade(SV, c.id);
      closeModal();
      renderSVField(null);
      toast("✨ "+c.name);
      setTimeout(svNext, 150); // 予約が残っていれば次の3択、なければ次の問題へ
    };
  });
}

function renderSVField(ev){
  if(!SV) return;
  // ヘッダー: HPバー+ステージ名+残り時間/BOSS+キル数
  const pct=Math.max(0, Math.round(100*SV.hp/SV.hpMax));
  $("svHpTxt").textContent=fmtShort(Math.max(0,SV.hp));
  const bar=$("svHpBar");
  bar.style.width=pct+"%";
  bar.style.background=pct>50? "var(--ok)" : pct>25? "var(--accent)" : "var(--ng)";
  // 時計: 通常=ボスまでのカウントダウン/荒野=経過時間(記録)+ボス在場マーク
  let clock;
  if(SV.endless){
    const sec=Math.floor(SV.t/1000);
    clock="⏱ "+Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")+
      (SV.enemies.some(e=>e.boss)? ' <span style="color:var(--ng)">👑</span>':'');
  }else{
    const remain=Math.max(0, Math.ceil((SV.bossAt-SV.t)/1000));
    clock=SV.bossOn? '<span style="color:var(--ng)">👑 ボス戦!</span>'
      : "⏱ "+Math.floor(remain/60)+":"+String(remain%60).padStart(2,"0");
  }
  $("svTitle").innerHTML="💫 "+esc(SV.name)+(SV.pos? ' <span style="color:var(--accent2)">'+POS_LABEL[SV.pos]+'縛り</span>':'')+"<br>"+
    clock+' ・ <span class="svnb">💀'+SV.kills+'</span> ・ <span class="svnb">🪙'+fmtShort(SV.gold)+'</span>'+
    (SV.rust? ' ・ <span style="color:var(--ng)">⏳-'+Math.round((1-SV.rustM)*100)+'%</span>':'');
  // メーター行: Lv・◆ゲージ・次のLvまであと◯問(🪙はタイトル行へ移設=v4.23.0実機FB)
  $("svLv").textContent="Lv"+SV.lv;
  $("svXpBar").style.width=Math.min(100, Math.round(100*SV.gem/svXpNext(SV.lv)))+"%";
  $("svNeed").textContent="あと"+svNeedAnswers(SV, G.combo)+"問";
  // フィールド: 自機は中央固定・敵はuid差分更新(CSSトランジションでなめらかに迫る)
  const f=$("svField");
  let me=f.querySelector("#svMe");
  if(!me){
    me=document.createElement("div");
    me.id="svMe";
    me.innerHTML='<span class="svface">'+charFace(byChar[G.party.char]||CHARS[0])+'</span>';
    f.appendChild(me);
  }
  const seen=new Set();
  SV.enemies.forEach(e=>{
    let el=f.querySelector('[data-k="'+e.uid+'"]');
    if(!el){
      el=document.createElement("div");
      el.className="sve"+(e.boss?" svb":"")+(e.elite?" svel":"")+(e.chest?" svch":"");
      el.dataset.k=e.uid;
      el.innerHTML='<div class="te">'+e.icon+'</div><div class="svhpb"><i></i></div>';
      f.appendChild(el);
    }
    el.style.left=e.x+"%"; el.style.top=e.y+"%";
    el.querySelector(".svhpb i").style.width=Math.max(4, Math.round(100*e.hp/(e.hpMax||e.hp)))+"%";
    // 状態異常の彩り: 燃焼=橙・氷結=青(v4.22.0)
    el.classList.toggle("svburn", (e.burnT||0)>0);
    el.classList.toggle("svchill", (e.chillT||0)>0);
    seen.add(e.uid);
  });
  // なかま(衛星): 自機の周りを回る
  SV.sats.forEach(s=>{
    let el=f.querySelector('[data-k="'+s.uid+'"]');
    if(!el){
      el=document.createElement("div");
      el.className="svs";
      el.dataset.k=s.uid;
      el.innerHTML='<span class="svsface">'+charFace(byChar[s.id])+'</span>';
      f.appendChild(el);
    }
    el.style.left=s.x+"%"; el.style.top=s.y+"%";
    seen.add(s.uid);
  });
  [...f.querySelectorAll("[data-k]")].forEach(el=>{ if(!seen.has(el.dataset.k)) el.remove(); });
  // 取得した規則(シナジー)のチップ+シールド残量: フィールド左下に常駐(v4.22.0)
  let rl=f.querySelector("#svRules");
  if(!rl){ rl=document.createElement("div"); rl.id="svRules"; f.appendChild(rl); }
  const rls=SV.rules||{};
  rl.innerHTML=Object.keys(rls).map(id=>{
    const u=SV_UPGRADES.find(x=>x.id===id);
    return u? '<span>'+u.ic+(rls[id]>1? rls[id]:'')+'</span>' : '';
  }).join("")+((SV.shield||0)>0? '<span>🔰'+fmtShort(SV.shield)+'</span>':'');
  if(!ev) return;
  // 一時演出(ダメージポップ・撃破の爆発・ビーム・被弾)は追加して時間で消す
  const fx=(cls, x, y, html, ms)=>{
    const s=document.createElement("div");
    s.className=cls; s.style.left=x+"%"; s.style.top=y+"%"; s.innerHTML=html;
    f.appendChild(s);
    setTimeout(()=>s.remove(), ms);
  };
  (ev.hits||[]).forEach((h,i)=>{
    fx("svpopw", h.x, h.y, '<span class="svpop'+(h.sat?" svsat":"")+(h.crit?" svcrit":"")+
      '" style="animation-delay:'+(Math.min(i,4)*90)+'ms">-'+fmt(h.take)+(h.crit?"!":"")+'</span>', 950);
    if(h.exec) fx("svpopw", h.x, h.y-6, '<span class="svpop svcrit">💀</span>', 950);
    if(h.dead) fx("sve svboom"+(h.boss?" svb":""), h.x, h.y, '<div class="te">'+h.icon+'</div>', 600);
    if(h.dead && h.boss) fx("svring", h.x, h.y, "", 520);
  });
  // 弾道: 発射位置に生成→リフロー→着弾位置へCSSトランジションで飛ぶ(1tick最大10発)
  (ev.shots||[]).slice(0,10).forEach(s=>{
    const d=document.createElement("div");
    d.className="svshot"+(s.sat?" svsats":"");
    d.style.left=s.x1+"%"; d.style.top=s.y1+"%";
    f.appendChild(d);
    void d.offsetWidth;
    d.style.left=s.x2+"%"; d.style.top=s.y2+"%";
    setTimeout(()=>d.remove(), 260);
  });
  // 稲妻(連鎖): %座標をpxに換算して敵→敵を結ぶ回転線を描く
  if(ev.arcs && ev.arcs.length){
    const fw=f.clientWidth||300, fh=f.clientHeight||170;
    ev.arcs.forEach(a=>{
      const dx=(a.x2-a.x1)*fw/100, dy=(a.y2-a.y1)*fh/100;
      const d=document.createElement("div");
      d.className="svarc";
      d.style.left=a.x1+"%"; d.style.top=a.y1+"%";
      d.style.width=Math.round(Math.hypot(dx,dy))+"px";
      d.style.transform="rotate("+Math.round(Math.atan2(dy,dx)*180/Math.PI)+"deg)";
      f.appendChild(d);
      setTimeout(()=>d.remove(), 420);
    });
  }
  // 爆発リング(爆散)
  (ev.rings||[]).forEach(rg=>fx("svring", rg.x, rg.y, "", 520));
  (ev.beams||[]).forEach(a=>{
    const bm=document.createElement("div");
    bm.className="svbeam";
    bm.style.transform="rotate("+Math.round(a)+"deg)";
    f.appendChild(bm);
    setTimeout(()=>bm.remove(), 550);
  });
  (ev.touches||[]).forEach(tc=>{
    fx("svpopw", SV_CX, SV_CY+9, '<span class="svpop svhit">-'+fmt(tc.dmg)+'</span>', 950);
  });
  if(ev.touches && ev.touches.length){ svFx($("svHead"), "svshake"); }
  if(ev.heal>0) svFx($("svHpWrap"), "svheal");
  if(ev.bossIn){
    const boss=SV.enemies.find(e=>e.boss);
    if(boss) svCutinShow('<div class="ci1">─ BOSS ─</div><div class="ci2">'+boss.icon+'</div>'+
      '<div class="ci3">'+esc(boss.name)+'</div>', 1500);
    vibe([40,60,120]);
  }
}

function svFinish(){
  if(!SV) return;
  if(svLoop){ clearInterval(svLoop); svLoop=null; }
  const rec=svRec();
  let html;
  const survived=Math.min(SV_STAGE_SEC, Math.round(SV.t/1000));
  if(SV.endless){
    // 荒野: 勝利はない。生存秒数とキルの記録(ベストはmaxマージ=同期・部分リセット対応)
    const sec=Math.round(SV.t/1000);
    rec.endless=rec.endless||{best:0, kills:0};
    const newBest=sec>(rec.endless.best||0);
    rec.endless.best=Math.max(rec.endless.best||0, sec);
    rec.endless.kills=Math.max(rec.endless.kills||0, SV.kills);
    G.gold+=SV.gold;
    // 🏳切り上げ(v4.24.0)は「果てた」ではなく「帰還」。記録の扱いは死亡時と同一
    html='<h3>'+(SV.retreat? '🏜️ 荒野から帰還!' : '🏜️ 荒野に果てた…')+'</h3>'+
      '<div class="small" style="line-height:1.7; margin-top:6px">⏱ <b>'+Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")+'</b> 生存 ・ 💀'+SV.kills+'体(👑ボス'+(SV.bossKills||0)+')'+
      (newBest? ' <span style="color:var(--accent); font-weight:800">🏅新記録!</span>' : '<br>ベスト: '+Math.floor((rec.endless.best)/60)+":"+String(rec.endless.best%60).padStart(2,"0"))+
      '<br>倒した分の <b>🪙'+fmt(SV.gold)+'</b> と、解いた分の🎫・XP・カードはすべて持ち帰っている。</div>';
  }else if(SV.win){
    const first=!(rec.clears[SV.id]>0);
    let bonus=Math.round(60*SV.tier*SV.tier)+(first? 1000:0);
    rec.clears[SV.id]=(rec.clears[SV.id]||0)+1;
    // デイリーチャレンジの初回勝利ボーナス(1日1回。日付はdailyDoneに記録=同期対象)
    let dailyGot=0;
    if(SV.dailyRun && rec.dailyDone!==todayKey()){
      rec.dailyDone=todayKey();
      dailyGot=SV_DAILY_GOLD(SV.tier);
      bonus+=dailyGot;
    }
    G.gold+=SV.gold+bonus;
    html='<h3>🎉 生還!</h3>'+
      '<div class="small" style="text-align:center; margin-top:6px">'+SV.icon+' '+esc(SV.name)+' ─ ボスを討ち取った(💀'+SV.kills+'体)</div>'+
      '<div class="giftbox" style="margin-top:10px">報酬 <b>🪙'+fmt(SV.gold+bonus)+'</b>'+
      (first? '<br><span class="small">はじめての生還ボーナス +🪙1000!</span>':'')+
      (dailyGot? '<br><span class="small">📅 今日のチャレンジ達成 +🪙'+fmt(dailyGot)+'!</span>':'')+'</div>';
  }else{
    G.gold+=SV.gold;
    html='<h3>💔 力尽きた…</h3>'+
      '<div class="small" style="line-height:1.7; margin-top:6px">'+SV.icon+' '+esc(SV.name)+' ─ '+survived+'秒・💀'+SV.kills+'体まで戦い抜いた。<br>'+
      '倒した分の <b>🪙'+fmt(SV.gold)+'</b> と、解いた分の🎫・XP・カードはすべて持ち帰っている。<br>'+
      '編成を強くするか、正答率を上げてもう一度!</div>';
  }
  saveG(); refreshHeader();
  openModal(html+
    '<div class="row" style="margin-top:12px; gap:8px">'+
    '<button class="btn" style="flex:1" id="svRetryBtn">もう一度</button>'+
    '<button class="btn primary" style="flex:1" id="svExitBtn">冒険へ戻る</button></div>');
  const d=SV._d||DUNGEONS.find(x=>x.id===SV.id)||SV_ENDLESS;
  const extra=SV._extra;
  $("svRetryBtn").onclick=()=>svStart(d, extra); // デイリーの修飾・縛りも同じ条件で
  $("svExitBtn").onclick=()=>{ svCleanup(); closeModal(); switchTab("adv"); };
}

/* 心得(永続強化)の購入モーダル。🪙シンク=冒険・サバイバーの稼ぎの行き先 */
function svOpenMeta(){
  const rec=svRec(); rec.meta=rec.meta||{};
  let h='<h3>📜 サバイバーの心得 '+helpBtn("hlp-svmeta")+'</h3>'+
    helpNote("hlp-svmeta", '🪙で修める永続強化。すべてのラン(次の出撃から)に効く。'+
      '「一括で修める」は安い順に買えるだけ買う(総レベルがいちばん増える買い方)');
  SV_META.forEach(m=>{
    const lv=rec.meta[m.id]||0;
    const cost=lv<m.max? SV_META_COST[lv] : null;
    h+='<div class="row svmeta">'+
      '<span class="svupic">'+m.ic+'</span>'+
      '<span class="grow"><b>'+m.name+'</b> <span class="small">Lv'+lv+'/'+m.max+'</span>'+
      '<br><span class="small">'+m.desc+'</span></span>'+
      (cost!=null
        ? '<button class="btn" data-meta="'+m.id+'" '+(G.gold<cost? "disabled":"")+'>🪙'+fmt(cost)+'</button>'
        : '<span class="small" style="color:var(--ok); font-weight:800">MAX</span>')+
      '</div>';
  });
  // 一括強化(v4.23.0実機FB): 押す前に「何段・いくら」を見せる=確認ダイアログ不要
  const est=svBuyMetaAll(G, true);
  if(est.count)
    h+='<button class="btn primary" id="svMetaAll" style="margin-top:12px; width:100%">'+
      '一括で修める(+'+est.count+'段 ・ 🪙'+fmt(est.spent)+')</button>';
  h+='<div class="small" style="margin-top:10px">所持 🪙'+fmt(G.gold)+'</div>';
  openModal(h);
  $("modal").querySelectorAll("[data-meta]").forEach(btn=>{
    btn.onclick=()=>{
      const r=svBuyMeta(G, btn.dataset.meta);
      if(!r){ toast("🪙が足りない(冒険・サバイバーで稼ごう)"); return; }
      saveG(); refreshHeader();
      toast("📜 心得を修めた(Lv"+r.lv+")");
      svOpenMeta();
    };
  });
  const all=$("svMetaAll");
  if(all) all.onclick=()=>{
    const r=svBuyMetaAll(G);
    if(!r.count) return;
    saveG(); refreshHeader();
    toast("📜 心得を+"+r.count+"段 修めた(🪙"+fmt(r.spent)+")");
    svOpenMeta();
  };
}

/* ステージ選択(冒険タブの入口パネルから)。解放条件は冒険のダンジョンと共通 */
function openSVSelect(){
  const rec=svRec();
  // 遊び方の長文は?に集約(v4.23.0): 画面には選ぶものだけを並べる
  let h='<h3>💫 単語のサバイバー(β) '+helpBtn("hlp-svsel")+'</h3>'+
    helpNote("hlp-svsel", '全方位から押し寄せる敵をしのぐ<b>サバイバー系ローグライク</b>。'+
    'あなたは中央で呪文を自動詠唱し続ける ─ 動詞で撃ち方が変わる(強撃=一点/貫通=ビーム/吸収=HP回復/連撃=2体)。<br>'+
    '<b>正解=全武器の一斉バースト+◆ジェム</b>(コンボで威力・獲得数UP)。◆が貯まると<b>レベルアップの3択</b>: '+
    '約20種の強化・<b>オンヒット規則</b>(会心・延焼・連鎖・爆散など=武器にもなかまにも乗って組み合わさる)・'+
    '<b>なかまの召喚</b>(周回して自動攻撃・戦闘スタイルはスキルで変わる)から選ぶ。<br>'+
    'ときどき<b>🎁宝箱スライム</b>が横切る(倒すと🪙+<b>レア規則優先</b>の3択・逃すと消える)。時間が経つほど敵は増え、<b>エリート</b>(強いが🪙4倍)も混ざる。<br>'+
    '時間が流れるのは<b>出題中と答え合わせ中</b>(3択・離脱中は完全停止)。'+SV_STAGE_SEC+'秒生きのびるとボスが出現、倒せば勝利!<br>'+
    '倒した敵の🪙は<b>勝っても負けても全額持ち帰り</b>。解いた分は<b>ふつうの学習として記録される</b>(今日の目安・🎫・カードすべて)。<br>'+
    '編成は出撃時のスナップショットで固定。⏳復習期限切れの野生語は言霊が錆びる(-6%/枚)。')+
    '<button class="btn" id="svMetaBtn" style="margin-top:10px; width:100%">📜 サバイバーの心得(🪙で永続強化)</button>';
  // 日替わりチャレンジ: 解放済みステージ×修飾×品詞しばり(初回勝利に🪙ボーナス)
  const un=DUNGEONS.filter((d,i)=>dgUnlocked(i));
  const dc=svDailyFor(todayKey(), un.length);
  const ds=un[dc.idx];
  const dDone=rec.dailyDone===todayKey();
  h+='<div class="panel svdaily">'+
    '<div style="font-weight:800">📅 今日のチャレンジ'+(dDone? ' <span style="color:var(--ok)">✓達成</span>':'')+' '+helpBtn("hlp-svdaily")+'</div>'+
    helpNote("hlp-svdaily", '毎日ちがうステージ×ルール×品詞しばりが日替わりで出る。初回勝利に🪙ボーナス(明日は別の内容)')+
    '<div class="small">'+ds.icon+' '+esc(ds.name)+' ・ <b>'+dc.mods.name+'</b>('+dc.mods.desc+')'+
    ' ・ しばり: <b>'+POS_LABEL[dc.pos]+'のみ</b><br>初回勝利: <b>🪙'+fmt(SV_DAILY_GOLD(ds.tier))+'</b></div>'+
    '<button class="btn primary" id="svDailyBtn" style="margin-top:8px; width:100%">'+(dDone? 'もう一度あそぶ':'挑戦する')+'</button>'+
    '</div>';
  // 終わりなき荒野(v4.22.0): 勝利のない無限モード。記録(生存秒・キル)を持ち帰る
  const er=rec.endless||{best:0, kills:0};
  h+='<div class="panel svdaily">'+
    '<div style="font-weight:800">🏜️ 終わりなき荒野 <span class="svbeta">∞</span> '+helpBtn("hlp-svend")+'</div>'+
    helpNote("hlp-svend", '勝利のない無限モード。敵は1分ごとに深いダンジョンのものへ入れ替わり、'+
      '2分ごとにボスが乱入する(倒しても終わらない)。属性相性なし。'+
      '倒れるまで戦うか、画面上の🏳でいつでも切り上げて🪙と記録を持ち帰れる')+
    '<div class="small">倒れるまで戦う無限モード'+
    (er.best? ' ・ ベスト: <b>⏱'+Math.floor(er.best/60)+":"+String(er.best%60).padStart(2,"0")+'</b> ・ 💀'+er.kills : '')+'</div>'+
    '<button class="btn" id="svEndlessBtn" style="margin-top:8px; width:100%">挑戦する</button>'+
    '</div>';
  if(SV && !SV.over){
    h+='<button class="btn primary" id="svResumeBtn" style="margin-top:10px; width:100%">▶ 戦闘に戻る('+esc(SV.name)+')</button>'+
      '<div class="small" style="margin-top:4px">離れている間、時間は止まっている</div>';
  }
  h+='<div style="margin-top:10px" id="svStageList">';
  DUNGEONS.forEach((d,i)=>{
    if(!dgUnlocked(i)) return;
    const n=rec.clears[d.id]||0;
    h+='<button class="btn svstage" data-i="'+i+'" style="width:100%; margin-top:8px; text-align:left">'+
      d.icon+' '+esc(d.name)+' <span class="small">tier'+d.tier+' ・ 推奨 '+fmt(recPower(d))+
      (n? ' ・ ✓'+n : '')+'</span></button>';
  });
  h+='</div>';
  openModal(h);
  $("svMetaBtn").onclick=svOpenMeta;
  $("svDailyBtn").onclick=()=>{
    if(SV && !SV.over) svCleanup();
    svStart(ds, {mods:Object.assign({}, dc.mods.m), pos:dc.pos, daily:true});
  };
  $("svEndlessBtn").onclick=()=>{
    if(SV && !SV.over) svCleanup();
    svStart(SV_ENDLESS);
  };
  const rb=$("svResumeBtn");
  if(rb) rb.onclick=()=>{ closeModal(); switchTab("sv"); svRestore(); };
  $("svStageList").querySelectorAll(".svstage").forEach(b=>{
    b.onclick=()=>{
      if(SV && !SV.over) svCleanup(); // 進行中のランは破棄して新しく始める
      svStart(DUNGEONS[+b.dataset.i]);
    };
  });
}

/* ---- 静的DOMへのバインド ---- */
$("svEntry").onclick=openSVSelect;
$("svBack").onclick=()=>switchTab("adv"); // ランは保持(時間停止・入口から「戦闘に戻る」)
/* 🏳=荒野(無限)を死亡以外で自主的に切り上げる(v4.24.0実機FB)。
   確認モーダルが開いている間は時間停止(svShouldPauseのmodalOpen)なので焦らず選べる */
$("svQuitBtn").onclick=()=>{
  if(!SV || SV.over || !SV.endless) return;
  const sec=Math.floor(SV.t/1000);
  openModal('<h3>🏳 ここで切り上げる?</h3>'+
    '<div class="small">ここまでの記録(⏱'+Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")+
    ' ・ 💀'+SV.kills+')と <b>🪙'+fmt(SV.gold)+'</b> をすべて持ち帰って終了する</div>'+
    '<div class="row" style="margin-top:12px; gap:10px">'+
    '<button class="btn" data-close>戦い続ける</button>'+
    '<button class="btn primary" id="svQuitGo">持ち帰る</button></div>');
  $("svQuitGo").onclick=()=>{
    if(!SV) return;
    SV.over=true; SV.retreat=true;
    closeModal();
    svFinish();
  };
};
$("svNextBtn").onclick=svNext; // 予約の3択を1つずつ消化→次の問題(v4.22.0の決定的フロー)
/* 正誤確認中は単語タップで辞書(Weblio)へ ─ 学習タブのpromptCardと同じ流儀(v4.22.0)。
   出題中は誤タップ防止のため無効(srchクラスで見た目も切り替え) */
$("svPrompt").onclick=()=>{
  if(!svAnswered || !svCur) return;
  window.open("https://ejje.weblio.jp/content/"+encodeURIComponent(svCur.word.en), "_blank", "noopener");
};
