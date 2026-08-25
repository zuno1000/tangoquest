"use strict";
/* ================= 状態管理 ================= */
const KEY="tangoquest_v1";
const APP_VERSION="4.29.0"; // リリースごとに更新(設定表示・更新確認のリモート版比較に使う)

/* ---- iOSスタンドアロン起動時の灰色帯対策(v4.5.0→v4.13.0で拡張) ----
   インストール直後の初回起動に加え、日をまたいだ最初のコールドスタート
   (ログインボーナスが出る起動)でもステータスバー領域が灰色に塗られ、
   タスクキルまで残ることが実機で確認された(2026-08-10報告)。リロードで
   直ることは確定しているため、「その日はじめての起動」も1回だけ自動リロード
   する。sessionStorageのガードで同一セッション内の再発火(ループ)を防ぐ。
   リロード確定はTQ_REBOOTINGで起動時UIに伝える ─ location.reload()は非同期で
   後続スクリプトが走り切るため、ガードしないとログインボーナスのモーダルが
   一瞬開いてリロードに巻き込まれる(v4.5.0の実機バグ)。
   判定本体は純関数に切り出してテスト可能にしている */
function shouldRebootForIOSGray(standalone, store, session, today){
  if(!standalone) return false;
  if(session && session.getItem("tq_sboot")) return false; // このセッションでリロード済み
  let fire=false;
  if(!store.getItem("tq_booted")){ store.setItem("tq_booted","1"); fire=true; }
  if(today && store.getItem("tq_bootDay")!==today){
    store.setItem("tq_bootDay", today); // 書けない環境は例外→呼び元のcatchへ=リロードしない
    fire=true;
  }
  if(fire && session) session.setItem("tq_sboot","1");
  return fire;
}
var TQ_REBOOTING=false; // main.jsが参照(トップレベルletはwindowに載らないためvar)
try{
  const sa=navigator.standalone ||
    (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  if(shouldRebootForIOSGray(sa, localStorage, sessionStorage, todayKey())){
    TQ_REBOOTING=true;
    location.reload();
  }
}catch(e){}

const RAR_MULT=[1, 1.6, 2.5, 3.8, 5.5];
const RAR_STARS=["★","★★","★★★","★★★★","★★★★★"];
const POS_LABEL={v:"動詞", n:"名詞", adj:"形容詞", adv:"副詞"};
const POS_ROLE={v:"発動", n:"基礎値", adj:"修飾", adv:"文末効果"};

let G;
try{ G=JSON.parse(localStorage.getItem(KEY)) }catch(e){ G=null }
if(!G || typeof G!=="object") G={};
G.v=1;
G.mode=G.mode||"e2j";
G.words=G.words||{};   // en -> [box, due, correct, wrong, mastered, wrongStreak, lastCorrectAt]
G.days=G.days||{};     // ymd -> {a,c,m}
G.inv=G.inv||{};       // "en|rar|lv" -> 枚数
G.chars=G.chars||{};   // charId -> {dup}
G.party=G.party||{char:null};
/* v3移行: 旧9スロット装備 → 文(カードkeyの配列・左から評価)。旧装備を文らしい語順で引き継ぐ */
function migrateEquipToSentence(g){
  if(g.party.sentence || !g.party.equip) return;
  const e=g.party.equip;
  const order=["buff1","weapon","skill1","buff2","armor","skill2","field","acc"];
  g.party.sentence=order.map(s=>e[s]).filter(Boolean).slice(0,8);
  delete g.party.equip;
}
migrateEquipToSentence(G);
G.party.sentence=G.party.sentence||[];
/* v4移行: カードは「重ねるだけ」でLvが上がる(Lv=枚数-1・上限なし)。
   旧「+Lv」キーは注ぎ込んだ枚数(2^lv)に換算して基本キーへ合流する。
   冪等: lv>0のキーが存在する限り何度でも安全に走る(同期で旧端末の在庫が
   混ざって戻ってきた場合もここで吸収される) */
function migrateInvToStacks(g){
  let touched=false;
  for(const k of Object.keys(g.inv||{})){
    const p=k.split("|"), lv=+p[2]||0;
    if(lv>0){
      const nk=p[0]+"|"+p[1]+"|0";
      g.inv[nk]=(g.inv[nk]||0)+(g.inv[k]||0)*Math.pow(2,lv);
      delete g.inv[k];
      touched=true;
    }
  }
  if(g.party && Array.isArray(g.party.sentence)){
    const seen=new Set();
    g.party.sentence=g.party.sentence.map(k=>{
      if(!k) return k;
      const p=k.split("|"), nk=p[0]+"|"+p[1]+"|0";
      if(seen.has(nk)) return null; // 同一カードは1枠だけ(重ねた分はLvに宿る)
      seen.add(nk);
      return nk;
    });
  }
  return touched;
}
migrateInvToStacks(G);
G.gold=G.gold||0;
G.tickets=G.tickets||0;
G.shards=G.shards||0;   // カードのかけら(分解で入手・強化に使う)
G.xp=G.xp||0;           // 知識XP(クイズ正解で獲得)
G.dungeons=G.dungeons||{};   // id -> {clears, lastClearDay}
G.inf=G.inf||{best:0, run:null};
G.daily=G.daily||{};    // ymd -> {a,c,card,merge,run,clear, cl:{missionId:1}}
G.weekly=G.weekly||{};  // weekKey -> {a,c,merge,clear,pull, cl:{}}
G.counters=Object.assign({ans:0,cor:0,cards:0,merges:0,runs:0,clears:0,pulls:0}, G.counters||{});
G.ach=G.ach||{};        // achId -> 受取済みティア数
G.login=G.login||{last:null, day:0};
G.combo=G.combo||0;     // 連続正解数(ミスで0に。XPボーナス・ドロップ★率UPの源)
G.pace=G.pace||{goal:null, setAt:0, log:[]}; // 学習ペース管理(v4.7.0): 目標日+直近100問の結果
if(!Array.isArray(G.pace.log)) G.pace.log=[];
G.pace.setAt=G.pace.setAt||0; // 目標を設定/解除した時刻(同期はこれが新しい側が勝つ=v4.7.2)
G.frz=G.frz||0;         // 連続学習フリーズ🧊の所持数(v4.13.0・最大FRZ_MAX)
G.faces=G.faces||{};    // なかまのカスタムアイコン(charId -> dataURL・v4.13.0)
G.idle=G.idle||{last:0}; // るすばん探索(放置報酬)の最終精算時刻(v4.13.0)
/* 学習オプション(v4.26.0): autoNext=答え合わせ後に自動で次へ進むまでのms(0=オフ)/
   svAuto=サバイバー3択の自動選択/slotBet=ことだまスロットの掛け金🪙の記憶(0=未設定→既定100)。
   同期マージはローカル優先(Object.assign起点)=端末ごとの好みとして振る舞う */
G.opt=Object.assign({autoNext:0, svAuto:0, slotBet:0}, G.opt||{});
/* スロットの永続データ(v4.28.0): meta=スロットの心得(id→Lv)。
   同期はLvごとmaxマージ・部分リセットでも残す(sync.jsに明示、G.sv.metaと同じ扱い) */
G.slot=G.slot||{}; G.slot.meta=G.slot.meta||{};
G.updatedAt=G.updatedAt||0;
G.resetAt=G.resetAt||0;     // リセット世代印(同期マージで新しい世代が丸ごと勝つ)

function saveG(){
  G.updatedAt=Date.now();
  try{ localStorage.setItem(KEY, JSON.stringify(G)) }catch(e){}
  if(typeof markDirty==="function") markDirty(); // 同期リマインダー用(sync.jsが後から定義)
}

function todayKey(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
/* 月曜始まりの週キー */
function weekKey(){
  const d=new Date();
  const day=(d.getDay()+6)%7; // 月=0
  const mon=new Date(d.getFullYear(), d.getMonth(), d.getDate()-day);
  return "w"+mon.getFullYear()+"-"+String(mon.getMonth()+1).padStart(2,"0")+"-"+String(mon.getDate()).padStart(2,"0");
}
function dayRec(){ const k=todayKey(); if(!G.days[k]) G.days[k]={a:0,c:0,m:0}; return G.days[k]; }
function dailyRec(){ const k=todayKey(); if(!G.daily[k]) G.daily[k]={a:0,c:0,card:0,merge:0,run:0,clear:0,cl:{}}; return G.daily[k]; }
function weeklyRec(){ const k=weekKey(); if(!G.weekly[k]) G.weekly[k]={a:0,c:0,merge:0,clear:0,pull:0,cl:{}}; return G.weekly[k]; }

/* 各種イベントの計上(累計・デイリー・ウィークリー) */
function track(ev, n){
  n=n||1;
  const d=dailyRec(), w=weeklyRec();
  switch(ev){
    case "ans":   G.counters.ans+=n;   d.a+=n; w.a+=n; break;
    case "cor":   G.counters.cor+=n;   d.c+=n; w.c+=n; break;
    case "card":  G.counters.cards+=n; d.card+=n; break;
    case "merge": G.counters.merges+=n; d.merge+=n; w.merge+=n; break;
    case "run":   G.counters.runs+=n;  d.run+=n; break;
    case "clear": G.counters.clears+=n; d.clear+=n; w.clear+=n; break;
    case "pull":  G.counters.pulls+=n; w.pull+=n; break;
  }
}

/* 古いデイリー/ウィークリー任務レコードの掃除(学習記録 G.days は残す) */
(function prune(){
  const cut=Date.now()-45*864e5;
  for(const k in G.daily){ const t=new Date(k).getTime(); if(t && t<cut) delete G.daily[k]; }
  for(const k in G.weekly){ const t=new Date(k.slice(1)).getTime(); if(t && t<cut) delete G.weekly[k]; }
})();

/* ---- 知識レベル: クイズ正解の積み重ねが直接強さになる ---- */
function accountLevel(){ return Math.floor(Math.pow((G.xp||0)/50, 0.55))+1; }
/* 連続学習日数(1問以上解いた日が対象。今日まだ解いていなくても途切れ扱いにしない)。
   フリーズ🧊が守った日(fz)は途切れないが日数には数えない(Duolingo等と同じ扱い) */
function studyStreak(){
  let n=0; const t=new Date();
  for(let i=0;;i++){
    const dt=new Date(t.getFullYear(), t.getMonth(), t.getDate()-i);
    const k=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
    const r=G.days[k];
    if(r && r.a>0) n++;
    else if(r && r.fz) continue; // フリーズが守った日: 数えないが途切れない
    else if(i===0) continue;
    else break;
  }
  return n;
}

/* ---- 連続学習フリーズ(v4.13.0・abceedのフリーズ参考) ----
   学習しなかった日を🧊1個につき1日自動で埋めて、連続記録を守る。
   入手はログインボーナス7日目(週1ペース)・所持は最大FRZ_MAX個。
   起動時に「昨日から直近の学習日までの空白」を調べ、在庫で埋め切れる
   ときだけ消費する(どうせ途切れている長い空白に無駄遣いしない)。
   埋めた日は days[k].fz=1 として永続化(同期はmaxマージ=消えない)。
   純関数(gとnowを受ける)=テスト可能。埋めた日数を返す */
const FRZ_MAX=2;
function applyStreakFreeze(g, now){
  if(!(g.frz>0)) return 0;
  const base=now!=null? new Date(now) : new Date();
  const key=i=>{ const dt=new Date(base.getFullYear(), base.getMonth(), base.getDate()-i);
    return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0"); };
  const gap=[];
  for(let i=1;i<=60;i++){
    const r=g.days[key(i)];
    if(r && r.a>0){ // 直近の学習日に到達: ここまでの空白が守る対象
      if(gap.length && gap.length<=g.frz){
        gap.forEach(k=>{ g.days[k]=g.days[k]||{a:0,c:0,m:0}; g.days[k].fz=1; });
        g.frz-=gap.length;
        return gap.length;
      }
      return 0;
    }
    if(r && r.fz) continue; // すでに守られた日はチェーンの一部
    gap.push(key(i));
    if(gap.length>FRZ_MAX) return 0; // 在庫上限を超える空白は守れない(=もう途切れている)
  }
  return 0; // 60日さかのぼっても学習日がない=守る連続記録がない
}
/* 連続日数XPボーナス: 2日目から+5%/日、21日目以降は×2.0で頭打ち */
function streakXpMult(){ return 1+0.05*Math.min(Math.max(studyStreak()-1,0), 20); }
/* 連続正解コンボ: 2連続から+4%/問、16連続以降は×1.6で頭打ち */
function comboXpMult(){ return 1+0.04*Math.min(Math.max((G.combo||0)-1,0), 15); }
/* コンボ中のドロップ★+1確率: 5連続で10%、以降+2%/問(上限30%) */
function comboDropBonus(){
  const c=G.combo||0;
  return c>=5? Math.min(0.30, 0.10+0.02*(c-5)) : 0;
}
/* 正解1問ごとに🎫1(v4.6.0)。🎫は限定召喚の専用通貨で、学習だけが源泉 ─
   「1問解けば1回引ける」の即時報酬が学習を続ける動機になる */
function corTicketGain(){ return 1; }
function lvMult(){ return 1+0.01*(accountLevel()-1); } // Lvごとに全ステータス+1%
/* 文の長さ(スロット数)は知識レベルで伸びる: Lv1=4語 → Lv24で最大8語 */
function sentenceSlots(){ return Math.min(8, 4+Math.floor(accountLevel()/6)); }

const byEn={}; WORDS.forEach(w=>byEn[w.en]=w);
