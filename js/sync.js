"use strict";
/* ================= 設定 & Googleドライブ同期 =================
   todaybgm と同方式: GIS + drive.appdata(非機密スコープ・審査不要)。
   ユーザー自身のGoogleドライブ appDataFolder に保存するためサーバー不要。
   クライアントIDは GCP で発行して下の定数に設定する(README参照)。 */

const GOOGLE_CLIENT_ID_PROD="122697629495-mf4tvi6cv31lr8mlie32622am6s8mf5a.apps.googleusercontent.com"; // 本番(https://zuno1000.github.io)
const GOOGLE_CLIENT_ID_DEV="122697629495-1t9og1hjpf0h0e22ngetrhq7o7tth6mh.apps.googleusercontent.com";  // 開発(http://localhost:8000)
const SYNC_FILENAME="tangoquest.json";

function syncClientId(){
  return location.hostname==="localhost" ? GOOGLE_CLIENT_ID_DEV : GOOGLE_CLIENT_ID_PROD;
}

/* ---- 同期リマインダー(todaybgm v1.0.1方式) ----
   最終同期時刻・未同期変更マーカーは「この端末の状態」なので G には入れない(同期対象外) */
const SYNC_LAST_KEY="tq_lastSync", SYNC_DIRTY_KEY="tq_dirty";
function lastSyncAt(){ return +localStorage.getItem(SYNC_LAST_KEY)||0; }
function markSynced(){
  try{ localStorage.setItem(SYNC_LAST_KEY, String(Date.now())); localStorage.removeItem(SYNC_DIRTY_KEY); }catch(e){}
}
function markDirty(){
  try{ if(!localStorage.getItem(SYNC_DIRTY_KEY)) localStorage.setItem(SYNC_DIRTY_KEY, String(Date.now())); }catch(e){}
}
/* 一度でも同期した端末で、未同期の変更があり、最終同期から3日超のときだけ促す */
function syncReminderNeeded(){
  const last=lastSyncAt();
  return !!syncClientId() && last>0 && !!localStorage.getItem(SYNC_DIRTY_KEY) &&
    (Date.now()-last > 3*864e5);
}
function fmtSyncTime(ts){
  const d=new Date(ts);
  return (d.getMonth()+1)+"/"+d.getDate()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}

/* ---- 認証(1タップ同期) ----
   3タップ問題の対処:
   1. GISスクリプトは起動時に先読みする(タップ時に非同期ロードを挟むと
      ポップアップがユーザー操作由来と見なされずブロックされていた)
   2. 一度同意した端末は prompt:"" で再確認なし(ポップアップは自動で閉じる)
   3. トークンは有効期限までsessionStorageに保持(同期後のリロードをまたいで再利用) */
let gisLoaded=false, gisLoading=false, tokenClient=null, tokenCb=null, tokenErrCb=null;
const AUTHED_KEY="tq_gAuthed", TOKEN_KEY="tq_gTok";
function savedToken(){
  try{
    const t=JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    if(t && t.tok && t.exp>Date.now()) return t.tok;
  }catch(e){}
  return null;
}
function ensureGis(cb){
  if(gisLoaded){ cb(); return; }
  if(gisLoading){ setTimeout(()=>ensureGis(cb), 300); return; }
  gisLoading=true;
  const s=document.createElement("script");
  s.src="https://accounts.google.com/gsi/client";
  s.onload=()=>{ gisLoaded=true; gisLoading=false; cb(); };
  s.onerror=()=>{ gisLoading=false; toast("Googleサービスに接続できない"); };
  document.head.appendChild(s);
}
function initTokenClient(){
  if(tokenClient) return;
  tokenClient=google.accounts.oauth2.initTokenClient({
    client_id: syncClientId(),
    scope: "https://www.googleapis.com/auth/drive.appdata",
    callback: r=>{
      const cb=tokenCb, ecb=tokenErrCb; tokenCb=null; tokenErrCb=null;
      if(r && r.access_token){
        const exp=Date.now()+Math.max(60,(+r.expires_in||3600)-60)*1000;
        try{
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({tok:r.access_token, exp}));
          localStorage.setItem(AUTHED_KEY,"1");
        }catch(e){}
        if(cb) cb(r.access_token);
      }else if(ecb) ecb("cancel");
      else toast("認証がキャンセルされた");
    },
    error_callback: e=>{
      const ecb=tokenErrCb; tokenCb=null; tokenErrCb=null;
      if(ecb) ecb((e&&e.type)||"error");
      else toast("認証できなかった("+((e&&e.type)||"error")+")");
    }
  });
}
/* errCb(v5.19.0・自動同期用): 認証できなかったときに、トーストではなく呼び元へ返す(学習を止めない) */
function getToken(cb, errCb){
  const t=savedToken();
  if(t){ cb(t); return; }
  ensureGis(()=>{
    initTokenClient();
    tokenCb=cb; tokenErrCb=errCb||null;
    // 同意済みの端末は確認画面を出さない(ポップアップが開いてもすぐ閉じる)
    tokenClient.requestAccessToken(localStorage.getItem(AUTHED_KEY)? {prompt:""} : {});
  });
}

async function driveFind(token){
  const q=encodeURIComponent("name='"+SYNC_FILENAME+"'");
  const res=await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q="+q+"&fields=files(id,modifiedTime)", {
    headers:{Authorization:"Bearer "+token}});
  if(!res.ok) throw new Error("list "+res.status);
  const j=await res.json();
  return j.files && j.files[0] || null;
}
async function driveDownload(token, id){
  const res=await fetch("https://www.googleapis.com/drive/v3/files/"+id+"?alt=media", {
    headers:{Authorization:"Bearer "+token}});
  if(!res.ok) throw new Error("download "+res.status);
  return res.json();
}
async function driveUpload(token, id, data){
  const meta={name:SYNC_FILENAME, parents: id? undefined : ["appDataFolder"]};
  const boundary="tq"+Date.now();
  const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+
    JSON.stringify(meta)+"\r\n--"+boundary+"\r\nContent-Type: application/json\r\n\r\n"+
    JSON.stringify(data)+"\r\n--"+boundary+"--";
  const url="https://www.googleapis.com/upload/drive/v3/files"+(id? "/"+id:"")+"?uploadType=multipart";
  const res=await fetch(url, {
    method: id? "PATCH":"POST",
    headers:{Authorization:"Bearer "+token, "Content-Type":"multipart/related; boundary="+boundary},
    body});
  if(!res.ok) throw new Error("upload "+res.status);
}

/* 端末間マージ: 進捗を失わない方向(大きい方・和集合)に寄せる。冪等。
   例外=リセット世代(resetAt)が異なるときは新しい世代が丸ごと勝つ:
   「データをすべてリセット」が他端末・リモートから復活しない&全端末に伝播する */
/* SRS状態の勝敗(v5.16.0・純関数): yを採用すべきならtrue。最後に解いた時刻(st[8])が新しい方→同時刻・旧版は解答回数が多い方 */
function srsNewer(x, y){
  if(!x) return true;
  const tx=x[8]||0, ty=y[8]||0;
  if(tx!==ty) return ty>tx;
  return (y[2]+y[3])>(x[2]+x[3]);
}
/* 語彙力の日別記録(v5.22.0・days/pdaysのv0/v)の合流(純関数・xを更新): v0=その日の始まりの値は小さい方(先に解き始めた側)・
   v=最後の値は大きい方。片側にしかなければそれ。無いもの同士は作らない(v=0を生んでしまうと伸びの計算が濁る) */
function mergeVocabSnap(x, y){
  if(x.v0!=null || y.v0!=null) x.v0=(x.v0!=null && y.v0!=null)? Math.min(x.v0, y.v0) : (x.v0!=null? x.v0 : y.v0);
  if(x.v!=null || y.v!=null) x.v=Math.max(x.v!=null? x.v : -Infinity, y.v!=null? y.v : -Infinity);
  return x;
}
function mergeData(a, b){
  b=b||{};
  if((a.resetAt||0)!==(b.resetAt||0)){
    const w=(a.resetAt||0)>(b.resetAt||0)? a : b;
    return JSON.parse(JSON.stringify(w));
  }
  // 未知キー(将来のバージョンが追加するフィールド)も保持する=前方互換(既知キーはローカル起点)
  const m=JSON.parse(JSON.stringify(Object.assign({}, b, a)));
  /* 単語SRS(v5.16.0): 「最後に解いた時刻」(st[8])が新しい方を採用=記憶の真実は最新のテスト結果。
     旧版の記録(st[8]なし)どうし・同時刻は従来どおり解答回数(正解+ミス)が多い方。
     以前は回数だけで決めていたため、3問で覚えた語(既知語の早回し)が、別端末の回数の多い古い状態に上書きされて
     「覚えた」が消えることがあった(実機FB「覚えた語数と今週の伸びが合わない」の一因) */
  for(const en in b.words||{}){
    const x=m.words[en], y=b.words[en];
    if(srsNewer(x,y)) m.words[en]=y;
  }
  // マイフレーズ(v5.6.0): 項目ごとに操作時刻(at)が新しい方=追加も削除(トンボストーン)も伝播する
  m.myphr=m.myphr||{};
  for(const en in b.myphr||{}){
    const x=m.myphr[en], y=b.myphr[en];
    if(!x || (y.at||0)>(x.at||0)) m.myphr[en]=y;
  }
  // 📝メモ(v5.25.0): 項目ごとに操作時刻LWW(マイフレーズと同じ)・模試の結果は和集合
  m.say=m.say||{};
  for(const id in b.say||{}){ const x=m.say[id], y=b.say[id]; if(!x || (y.at||0)>(x.at||0)) m.say[id]=y; }
  m.mocks=Object.assign({}, b.mocks||{}, m.mocks||{});
  if(b.mockq && (b.mockq.at||0)>((m.mockq&&m.mockq.at)||0)) m.mockq=JSON.parse(JSON.stringify(b.mockq)); // 穴埋めの問題セット(v5.28.0)は新しい側
  // 取り違えペア(v5.12.0): ペアごとに回数の多い方(日別記録と同じmaxマージ)
  m.conf=m.conf||{};
  for(const en in b.conf||{}){
    m.conf[en]=m.conf[en]||{};
    for(const o in b.conf[en]) m.conf[en][o]=Math.max(m.conf[en][o]||0, b.conf[en][o]||0);
  }
  // マイ単語(v5.11.0): マイフレーズと同じ項目ごとの操作時刻LWW(追加・意味の取り込み・削除が伝播)
  m.myw=m.myw||{};
  for(const en in b.myw||{}){
    const x=m.myw[en], y=b.myw[en];
    if(!x || (y.at||0)>(x.at||0)) m.myw[en]=y;
  }
  /* 今日の英語(v5.10.0): done(読んだ・聴いた)は和集合/mute(合わないソース)は項目ごとの操作時刻LWW
     (「戻す」も伝播する=アイコン・マイフレーズと同じ型)/topics・lastは端末の好み=ローカル起点のまま */
  m.rl=Object.assign({topics:{}, mute:{}, done:{}, last:{}}, m.rl||{});
  m.rl.done=Object.assign({}, (b.rl&&b.rl.done)||{}, (a.rl&&a.rl.done)||{});
  m.rl.mute=Object.assign({}, (a.rl&&a.rl.mute)||{});
  for(const id in (b.rl&&b.rl.mute)||{}){
    const x=m.rl.mute[id], y=b.rl.mute[id];
    if(!x || (y.at||0)>(x.at||0)) m.rl.mute[id]=y;
  }
  /* v5.19.0(実機FB「今日の英語は端末で同じものを」): 今日の1本(pick)は種類ごとにrlPickNewer・
     ソースを最後に出した日(last)は新しい日付・興味のテーマは操作時刻(topicsAt)が新しい側(旧版どうし=0はローカル優先のまま) */
  m.rl.last=Object.assign({}, (a.rl&&a.rl.last)||{});
  for(const id in (b.rl&&b.rl.last)||{}){ const x=m.rl.last[id], y=b.rl.last[id]; if(!x || y>x) m.rl.last[id]=y; }
  {
    const ta=(a.rl&&a.rl.topicsAt)||0, tb=(b.rl&&b.rl.topicsAt)||0;
    if(tb>ta){ m.rl.topics=Object.assign({}, (b.rl&&b.rl.topics)||{}); m.rl.topicsAt=tb; }
  }
  { // ⏱ 聴く長さ(v5.23.0): 操作時刻(lmaxAt)が新しい側
    const la=(a.rl&&a.rl.lmaxAt)||0, lb=(b.rl&&b.rl.lmaxAt)||0;
    if(lb>la){ m.rl.lmax=b.rl.lmax; m.rl.lmaxAt=lb; }
  }
  m.rl.pick=Object.assign({}, (a.rl&&a.rl.pick)||{});
  for(const k in (b.rl&&b.rl.pick)||{}) m.rl.pick[k]=rlPickNewer(m.rl.pick[k], b.rl.pick[k]);
  // フレーズSRS(v5.0.0): 単語と同じ規則(v5.16.0: 最後に解いた時刻→解答回数)
  m.phr=m.phr||{};
  for(const en in b.phr||{}){
    const x=m.phr[en], y=b.phr[en];
    if(srsNewer(x,y)) m.phr[en]=y;
  }
  // フレーズの日別記録(v5.0.0): daysと同じ日ごとmax
  m.pdays=m.pdays||{};
  for(const k in b.pdays||{}){
    const x=m.pdays[k], y=b.pdays[k];
    if(!x) m.pdays[k]=y;
    else{ ["a","c","m"].forEach(f=>{ x[f]=Math.max(x[f]||0, y[f]||0); }); mergeVocabSnap(x, y); }
  }
  // 日別学習記録: 日ごとに大きい方(fz=フリーズが守った日も「守られた」側を保持)
  for(const k in b.days||{}){
    const x=m.days[k], y=b.days[k];
    if(!x) m.days[k]=y;
    else{
      /* 目安(t)だけはmaxにしない(v5.16.0・実機FB「同期すると昨日の目安が増えて未達成になる」):
         目安は端末ごとに「残り÷残り日数」で計算するため、同期が遅れた端末ほど進捗が古く、大きな目安を残す。
         maxだと「学習した端末のa」と「開いただけの端末の大きなt」が組み合わさって未達成に見えた。
         → その日に多く解いた端末のt・同数なら小さい方(進捗を多く知っている側の見積もり)・片側だけならそれ */
      const t=(x.t&&y.t)? ((x.a||0)>(y.a||0)? x.t : (y.a||0)>(x.a||0)? y.t : Math.min(x.t,y.t)) : (x.t||y.t||0);
      ["a","c","m","n","na","nc","ra","rc","fz","qk"].forEach(f=>{ // qk=サクッと完了回数(v4.30.0)
        x[f]=Math.max(x[f]||0, y[f]||0);
      });
      if(t) x.t=t;
      mergeVocabSnap(x, y);
    }
  }
  // カード在庫: キーごとに多い方
  for(const k in b.inv||{}) m.inv[k]=Math.max(m.inv[k]||0, b.inv[k]);
  // なかま: 和集合・突破は大きい方
  for(const id in b.chars||{}){
    if(!m.chars[id]) m.chars[id]=b.chars[id];
    else m.chars[id].dup=Math.max(m.chars[id].dup||0, b.chars[id].dup||0);
  }
  // ダンジョン: クリア回数が多い方
  for(const id in b.dungeons||{}){
    const x=m.dungeons[id], y=b.dungeons[id];
    if(!x || y.clears>x.clears) m.dungeons[id]=y;
  }
  // 通貨・累計・記録: 大きい方
  m.gold=Math.max(m.gold||0, b.gold||0);
  m.tickets=Math.max(m.tickets||0, b.tickets||0);
  m.shards=Math.max(m.shards||0, b.shards||0);
  m.xp=Math.max(m.xp||0, b.xp||0);
  m.gift10=Math.max(m.gift10||0, b.gift10||0); // 初回プレゼントは受取済みを優先
  m.frz=Math.max(m.frz||0, b.frz||0);          // フリーズ🧊は多い方(進捗を失わない方向)
  if((b.frzAt||"")>(m.frzAt||"")) m.frzAt=b.frzAt; // 🧊を配った日(v5.23.0)は新しい方=別端末で同じ日に二重に配らない
  /* カスタムアイコン(v5.8.0): なかまごとに操作時刻(faceAt)が新しい側が勝つ=変更も「絵文字に戻す」
     (削除トンボストーン)も伝播する。旧版の記録(faceAt無し=時刻0)どうしは従来どおり和集合(ローカル優先) */
  m.faceAt=Object.assign({}, b.faceAt||{}, a.faceAt||{});
  m.faces=Object.assign({}, b.faces||{}, a.faces||{});
  const fids=new Set(Object.keys(m.faces).concat(Object.keys(m.faceAt)));
  fids.forEach(id=>{
    const ta=((a.faceAt||{})[id]||{}).at||0, tb=((b.faceAt||{})[id]||{}).at||0;
    if(ta===tb) return; // 同時刻(旧版どうし)は和集合のまま
    const w=ta>tb? a : b;
    m.faceAt[id]=w.faceAt[id];
    if(w.faces && w.faces[id]) m.faces[id]=w.faces[id]; else delete m.faces[id];
  });
  for(const k in b.counters||{}) m.counters[k]=Math.max(m.counters[k]||0, b.counters[k]||0);
  m.inf=m.inf||{best:0,run:null};
  m.inf.best=Math.max(m.inf.best||0, (b.inf&&b.inf.best)||0);
  // サバイバーのクリア記録: ステージごとに多い方(v4.20.0)
  m.sv=m.sv||{clears:{}}; m.sv.clears=m.sv.clears||{};
  for(const id in (b.sv&&b.sv.clears)||{}) m.sv.clears[id]=Math.max(m.sv.clears[id]||0, b.sv.clears[id]||0);
  // 心得(永続強化)はLvごとに多い方・デイリー達成日は新しい日付(v4.21.0)
  m.sv.meta=m.sv.meta||{};
  const bsm=(b.sv&&b.sv.meta)||{};
  for(const k in bsm) m.sv.meta[k]=Math.max(m.sv.meta[k]||0, bsm[k]||0);
  const bdd=(b.sv&&b.sv.dailyDone)||"";
  if(bdd && bdd>(m.sv.dailyDone||"")) m.sv.dailyDone=bdd; // YYYY-MM-DDは辞書順=時系列
  // 本日初生還ボーナスの受取日(v4.25.0): dailyDoneと同じ日付文字列マージ=二重取り防止
  const bwd=(b.sv&&b.sv.winDay)||"";
  if(bwd && bwd>(m.sv.winDay||"")) m.sv.winDay=bwd;
  // スロットの心得(v4.28.0): Lvごとに多い方(サバイバーの心得と同じ扱い)
  m.slot=m.slot||{}; m.slot.meta=m.slot.meta||{};
  const bslm=(b.slot&&b.slot.meta)||{};
  for(const k in bslm) m.slot.meta[k]=Math.max(m.slot.meta[k]||0, bslm[k]||0);
  // 終わりなき荒野の記録: ベスト秒数・キルとも多い方(v4.22.0)
  const bel=(b.sv&&b.sv.endless)||null;
  if(bel || m.sv.endless){
    const mel=m.sv.endless||{};
    m.sv.endless={best:Math.max(mel.best||0, (bel&&bel.best)||0),
                  kills:Math.max(mel.kills||0, (bel&&bel.kills)||0)};
  }
  for(const id in b.ach||{}) m.ach[id]=Math.max(m.ach[id]||0, b.ach[id]||0);
  // 任務・編成・ログイン(と旧るすばん探索の記録)は更新が新しい側を優先
  const newer=(b.updatedAt||0)>(a.updatedAt||0)? b : a;
  m.daily=newer.daily||m.daily; m.weekly=newer.weekly||m.weekly;
  m.party=newer.party||m.party; m.login=newer.login||m.login; m.mode=newer.mode||m.mode;
  m.idle=newer.idle||m.idle;
  m.set=newer.set||m.set; // 進行中の30問セットの帳簿(v5.8.0)は更新が新しい側
  /* 学習ペース: 目標日は「設定/解除した時刻(setAt)」が新しい側が勝つ。
     updatedAt基準だと起動しただけの未設定端末が勝って目標が消える(v4.7.1までの不具合)。
     setAt同士が同じ(旧版=0)なら目標あり側を優先。推定ログは長い方(結合すると重複計上になる) */
  {
    const pa=a.pace, pb=b.pace;
    if(!pa || !pb){ const p=pa||pb; m.pace=p? {goal:p.goal||null, setAt:p.setAt||0, qd:p.qd||null, log:p.log||[]} : m.pace; } // 片側だけでも同じ形に揃える(syncChangesの比較のため)
    else{
      const w=(pb.setAt||0)>(pa.setAt||0)? pb : (pa.setAt||0)>(pb.setAt||0)? pa : (pa.goal? pa : pb);
      /* v5.19.0(実機FB「端末で1日の目安が違う」): 推定ログは時刻つきの記録を合流(mergePaceLog)・
         今日の目安(qd)は同じ日なら先に固定した端末の値(mergeQd)=全端末で同じ数字 */
      m.pace={goal:w.goal||null, setAt:w.setAt||0, qd:mergeQd(pa.qd, pb.qd), log:mergePaceLog(pa.log, pb.log)};
    }
  }
  m.resetAt=a.resetAt||0;
  return m;
}
/* 学習ペースの推定ログの合流(v5.19.0・純関数): 時刻つきの記録(entry[3])は両端末の和集合を時刻順に・
   旧版の時刻なし記録は従来どおり長い方(結合すると重複計上になる)。直近100問だけ残す。
   → 両端末の推定材料が同じになり、「残り約◯問」「1日の目安」が端末で食い違わない */
function mergePaceLog(la, lb){
  la=la||[]; lb=lb||[];
  const oldA=la.filter(e=>!e[3]), oldB=lb.filter(e=>!e[3]);
  /* v5.19.1: 同数のときは内容(文字列化)で決める=どちらの端末から見ても同じ側を採る。
     以前は「同数なら手元(la)」だったため、100問で頭打ちの旧記録は同期を何度しても端末ごとに別のまま残った */
  const old=oldA.length!==oldB.length? (oldA.length>oldB.length? oldA : oldB)
          : (JSON.stringify(oldA)<=JSON.stringify(oldB)? oldA : oldB);
  const seen={}, nw=[];
  la.concat(lb).forEach(e=>{ if(!e[3]) return; const k=e.join(","); if(seen[k]) return; seen[k]=1; nw.push(e); });
  nw.sort((x,y)=>x[3]-y[3]);
  const out=old.concat(nw);
  return out.slice(Math.max(0, out.length-100));
}
/* 今日の目安の固定値(qd={d,per,at})の合流(純関数): 新しい日の方→同じ日は先に固定した方(at小)。
   「その日はじめて計算した値で固定」(pace.js paceToday)の思想を端末をまたいで守る=同期で目安が途中に増えない */
function mergeQd(x, y){
  if(!x || !y) return x||y||null;
  if(x.d!==y.d) return x.d>y.d? x : y;
  if((x.at||0)!==(y.at||0)) return (x.at||0)<(y.at||0)? x : y;
  /* v5.19.1(実機FB「何度同期しても今日の目安が揃わない」): atが同じ(v5.18以前が固定したqd=atなし同士を含む)なら
     目安の小さい方=端末に依らない決め方(目安tの「同数なら小さい方」と同じ思想)。以前は「同じなら手元(x)」で、
     v5.19.0に更新した日はどちらの端末で同期しても自分の値が勝ち、いつまでも揃わなかった */
  return (x.per||0)<=(y.per||0)? x : y;
}

/* 今日の英語の「今日の1本」({d,id,alt,it,at})の勝敗(v5.19.0・純関数): 新しい日 → 「別の候補」を多く進めた方(alt大=意図した変更) →
   素材(it)が決まっている方 → 同じなら先に決めた方(at小)=その日はじめて開いた端末の1本が全端末に揃う */
function rlPickNewer(x, y){
  if(!x) return y||null;
  if(!y) return x;
  if(x.d!==y.d) return x.d>y.d? x : y;
  if((x.alt|0)!==(y.alt|0)) return (x.alt|0)>(y.alt|0)? x : y;
  if(!!x.it!==!!y.it) return x.it? x : y;
  return (x.at||0)<=(y.at||0)? x : y;
}

/* 学習を終えたときの同期(v5.29.0・実機FB「学習画面から離れた際に同期(1問以上解いたときのみ)。代わりにセット終わりの同期ボタンは廃止」)。
   v5.16.0〜v5.28.3の「📥 いま同期する」(セット完了・特訓完了・模試完了の画面)は撤去。
   学習タブ→別のタブ(main.js switchTab)で、その滞在中に1問でも解いていれば同期(タブのタップ=ユーザー操作ありなので認証ポップアップも通る)。
   最終同期からの間隔は問わない(学習の区切り=必ず上げる)。別端末に新しい記録があれば取り込んでリロードし、移った先のタブに戻る(RESUME_KEY) */
let ansSinceSync=0, syncing=false;
function syncNoteAnswer(){ ansSinceSync++; }  // quiz.js/phrase.jsの答え合わせから
function syncAnsSince(){ return ansSinceSync; }
/* 純関数: 学習タブを離れるときに同期するか */
function leaveSyncDecision(s){
  if(!(s.answered>0)) return false;
  if(!s.clientId || !s.authed || s.online===false) return false;
  if(s.syncing) return false;
  return true;
}
function autoSyncOnLeave(nextTab){
  let go=false;
  try{ go=leaveSyncDecision(Object.assign(autoSyncState(), {answered:ansSinceSync, syncing})); }catch(e){}
  if(!go) return false;
  syncNow({auto:true, resume:nextTab});
  return true;
}

/* キー順を揃えたJSON(純関数): マージ結果どうしの比較用(Object.assignでキー順が変わっても同じ文字列になる) */
function stableJSON(v){
  if(Array.isArray(v)) return "["+v.map(stableJSON).join(",")+"]";
  if(v && typeof v==="object") return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stableJSON(v[k])).join(",")+"}";
  return JSON.stringify(v);
}
/* リモートを取り込むと手元の状態が変わるか(v5.19.0・純関数)。
   「自分自身とのマージ」を基準にするので、マージが補う既定キー(resetAt=0等)の差は「変化」に数えない。updatedAtは除く */
function syncChanges(local, remote){
  const strip=o=>{ const c=Object.assign({}, o); delete c.updatedAt; return c; };
  const norm=x=>mergeData(x, JSON.parse(JSON.stringify(x))); // 自分自身とマージ=既定キー(日別記録のn/na…=0等)を補って形を揃える
  return stableJSON(strip(norm(local)))!==stableJSON(strip(norm(mergeData(local, remote||{}))));
}

/* ---- 自動同期(v5.19.0・実機FB「アプリを開いたタイミングで自動で同期。できなければセットのつづきを押したときに」) ----
   方針: ①開いた直後=手元にトークン(1時間有効・sessionStorage)があれば静かに同期。リモートに変化がなければリロードせず、
   変化があればマージ→リロード(ホームのまま)。②トークンがない(ふつうは日をまたいだ起動)=ユーザー操作なしのポップアップは
   ブラウザに止められるので、次の「学習/セットのつづき」タップ(=操作あり)で同期し、リロード後に学習タブへ自動で戻る(RESUME_KEY)。
   ③失敗(オフライン・認証不可)は学習を止めない。連発防止=最終同期から5分は再同期しない・学習の途中(学習タブ表示中)は割り込まない */
const AUTO_SYNC_GAP=5*60e3, RESUME_KEY="tq_resume", SYNCED_MSG_KEY="tq_syncedMsg";
let autoSyncPending=false; // 開いたときに静かに同期できなかった → 次の学習タップで
/* 今日の目安の固定待ち(v5.20.0): 起動時に同期が控えている間は目安を固定しない(pace.js paceToday)。
   同期の完了・不要・失敗(paceHoldRelease)または最初の解答(paceLog)で固定する。
   =先に開いた端末が、別端末の前回同期ぶんまで取り込んだうえで今日の目安を決める(端末の順番でぶれない) */
let paceHold=false;
function syncHoldsPace(){ return paceHold; }
function paceHoldSet(v){ paceHold=!!v; }
function paceHoldRelease(){
  if(!paceHold) return;
  paceHold=false;
  try{ if(G.pace && G.pace.goal){ paceToday(G); saveG(); } }catch(e){}
}
/* 自動同期の判断(純関数): "silent"=いま静かに同期 / "gesture"=次のタップで / "none"=不要 */
function autoSyncDecision(s){
  if(!s.clientId || !s.authed || s.online===false) return "none";
  if(s.now-(s.lastSync||0)<AUTO_SYNC_GAP) return "none";
  if(s.hasToken && s.onHome) return "silent";
  return "gesture";
}
function autoSyncState(){
  return {clientId:!!syncClientId(), authed:!!localStorage.getItem(AUTHED_KEY), online:navigator.onLine,
          now:Date.now(), lastSync:lastSyncAt(), hasToken:!!savedToken(),
          onHome:!$("homeView").classList.contains("hidden")};
}
function autoSyncOnOpen(){
  let d="none";
  try{ d=autoSyncDecision(autoSyncState()); }catch(e){}
  if(d==="none") return;
  if(!(G.pace && G.pace.qd && G.pace.qd.d===todayKey())) paceHold=true; // まだ今日の目安を固定していなければ同期を待つ(v5.20.0)
  if(d==="silent"){ autoSyncPending=false; syncNow({auto:true}); return; }
  autoSyncPending=true;
  ensureGis(()=>{ try{ initTokenClient(); }catch(e){} }); // タップ時にポップアップが止められないよう先読み
}
/* 学習をはじめる/セットのつづきのタップ(ユーザー操作あり)。同期が要れば同期してから、要らなければすぐ then() */
function autoSyncOnGesture(then){
  let d="none";
  try{ d=autoSyncPending? autoSyncDecision(Object.assign(autoSyncState(), {onHome:true, hasToken:true})) : "none"; }catch(e){}
  if(d==="none"){ then(); return; }
  autoSyncPending=false;
  syncNow({auto:true, resume:"quiz", then});
}
/* リロード後の復帰(起動時にmain.jsが呼ぶ): 学習タブへ戻す・同期完了のトースト */
function syncResumeAfterReload(){
  let r=null, msg=null;
  try{ r=sessionStorage.getItem(RESUME_KEY); msg=sessionStorage.getItem(SYNCED_MSG_KEY); sessionStorage.removeItem(RESUME_KEY); sessionStorage.removeItem(SYNCED_MSG_KEY); }catch(e){}
  if(r && r!=="home" && TABS[r]) switchTab(r); // v5.29.0: 学習を終えたときの同期なら移った先(記録など)へ
  if(msg) toast(msg);
}

/* opts(v5.19.0): auto=自動同期(失敗を短く・変化なしはリロードしない)/resume=リロード後に戻るタブ/then=同期後(または不要・失敗時)に続ける処理 */
async function syncNow(opts){
  opts=opts||{};
  const then=()=>{ syncing=false; paceHoldRelease(); if(typeof opts.then==="function") opts.then(); }; // 同期が済んだ/不要/失敗 → 今日の目安を固定(v5.20.0)
  if(!syncClientId()){ if(!opts.auto) toast("同期は未設定(READMEの手順でクライアントIDを設定)"); then(); return; }
  syncing=true; ansSinceSync=0; // 学習を終えたときの同期(v5.29.0)の数え直し=この同期以降に解いた問数
  toast(opts.auto? "📥 自動同期中…" : "同期中…");
  getToken(async token=>{
    try{
      const f=await driveFind(token);
      if(f){
        const remote=await driveDownload(token, f.id);
        const changed=syncChanges(G, remote);
        const merged=mergeData(G, remote||{});
        merged.updatedAt=Date.now();
        if(!changed){
          /* リモートに新しいものがない: 手元の変更だけ上げて終わり(リロード不要=学習の流れを切らない) */
          let dirty=true; try{ dirty=!!localStorage.getItem(SYNC_DIRTY_KEY); }catch(e){}
          if(dirty || !opts.auto) await driveUpload(token, f.id, merged);
          markSynced();
          toast(opts.auto? "✓ 同期済み(この端末が最新)" : "同期完了(他の端末に新しい記録はなかった)");
          then(); return;
        }
        localStorage.setItem(KEY, JSON.stringify(merged));
        await driveUpload(token, f.id, merged);
        markSynced();
        try{
          if(opts.resume) sessionStorage.setItem(RESUME_KEY, opts.resume);
          sessionStorage.setItem(SYNCED_MSG_KEY, "✓ 同期完了 ─ 別の端末の記録を取り込んだ");
        }catch(e){}
        toast("同期完了。再読み込みします");
        setTimeout(()=>location.reload(), opts.auto? 400 : 800);
      }else{
        await driveUpload(token, null, G);
        markSynced();
        toast("初回アップロード完了");
        then();
      }
    }catch(e){
      toast((opts.auto? "自動同期できなかった: " : "同期に失敗: ")+e.message);
      then();
    }
  }, err=>{
    /* 認証できなかった(ポップアップが止められた・キャンセル): 自動同期は静かに諦めて学習へ。次の起動でまた試す */
    if(opts.auto){ autoSyncPending=false; toast("同期は次の機会に(⚙の「今すぐ同期」でいつでも)"); }
    else toast(err==="cancel"? "認証がキャンセルされた" : "認証できなかった("+err+")");
    then();
  });
}

/* ---- アプリの更新 ----
   iOSでホーム画面から起動している場合など「タブを閉じて開き直す」ができない環境向け。
   sw.jsの再取得はHTTPキャッシュを迂回するので、CACHE名が上がっていれば新SWが入り
   (install=skipWaiting済み・activate=旧キャッシュ削除+clients.claim済み)、
   制御が切り替わった時点でリロード=最新版になる。localStorage(学習データ・同期設定)には触れない */
/* SWキャッシュの自己修復: キャッシュ済みの同一オリジン資産を、HTTPキャッシュ・CDNを
   迂回して(cache:no-store+使い捨てクエリ)取り直し、その場で置き換える。
   sw.jsは最新なのに中身の資産だけ古い=「更新したのに古いまま」状態からの復旧手段。
   置き換えた件数を返す */
async function repairCaches(){
  if(!("caches" in window)) return 0;
  let n=0;
  for(const name of await caches.keys()){
    const c=await caches.open(name);
    for(const req of await c.keys()){
      const u=new URL(req.url);
      if(u.origin!==location.origin) continue;
      try{
        const res=await fetch(u.pathname+u.search+(u.search?"&":"?")+"rep="+Date.now(),
          {cache:"no-store"});
        if(res.ok){ await c.put(req, res); n++; }
      }catch(e){}
    }
  }
  return n;
}

let updating=false;
async function appUpdate(){
  if(updating) return;
  updating=true;
  toast("更新を確認中…");
  try{
    const reg=("serviceWorker" in navigator)? await navigator.serviceWorker.getRegistration() : null;
    if(!reg){ location.reload(); return; }

    let done=false;
    const finish=()=>{ if(!done){ done=true; location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", finish, {once:true});
    /* 新SWのインストール完了(activated)を見届けてからリロードする。
       以前は5秒で無条件リロードしていたため、回線が遅いと旧SWが生きたまま
       リロード=「更新したのに古いまま」に見えることがあった */
    const apply=nw=>{
      toast("新しいバージョンを適用中…");
      if(nw.state==="installed") nw.postMessage("skipWaiting");
      nw.addEventListener("statechange", ()=>{
        if(nw.state==="activated") setTimeout(finish, 150);
        else if(nw.state==="installed") nw.postMessage("skipWaiting");
        else if(nw.state==="redundant" && !done){
          done=true; updating=false; toast("適用に失敗した。通信環境を確認してもう一度");
        }
      });
      if(nw.state==="activated") setTimeout(finish, 150);
      setTimeout(finish, 30000); // 保険(30秒)
    };
    /* 公開直後は配信網(CDN)の反映待ちで1回目に見つからないことがある → 数回再確認 */
    for(let i=0;i<3;i++){
      try{ await reg.update(); }catch(e){}
      const nw=reg.installing||reg.waiting;
      if(nw){ apply(nw); return; }
      if(i<2) await new Promise(r=>setTimeout(r, 3500));
    }
    /* 新SWなし → リモートの版を直接確認して正直に伝える */
    let remoteV=null;
    try{
      const txt=await fetch("js/state.js?upd="+Date.now(), {cache:"no-store"}).then(r=>r.ok? r.text():null);
      const mv=txt && txt.match(/APP_VERSION\s*=\s*"([^"]+)"/);
      if(mv) remoteV=mv[1];
    }catch(e){}
    if(remoteV && remoteV!==APP_VERSION){
      /* 新SWが見つからないのにリモートの版だけ新しい=SWキャッシュに古い資産が
         入っている(旧installがHTTPキャッシュ経由で資産を取り込んでいたため、
         公開直後の更新で混入した=v4.9.1で実際に発生)。資産を取り直して復旧する */
      toast("新版 v"+remoteV+" を取り込んでいる…");
      const n=await repairCaches();
      if(n>0){ setTimeout(()=>location.reload(), 400); return; }
      updating=false;
      toast("新版 v"+remoteV+" を配信中。反映まで数分かかる ─ 少し待ってもう一度");
    }else{
      updating=false;
      toast("最新版 v"+APP_VERSION+" を利用中 ✓");
    }
  }catch(e){
    location.reload();
  }
}

/* ---- 部分リセット(v4.13.0): 学習記録・カードだけ消して、なかま・通貨・レベル・
   冒険の記録は残す。resetAt世代を進めるので、同期している全端末に丸ごと伝播する
   (フィールド別マージだと消した単語が他端末から復活してしまうため)。
   任務(daily/weekly)は残す=今日達成済みの学習系任務の二重受取を防ぐ。純関数 */
function partialResetData(g, t){
  return {v:1, resetAt:t, updatedAt:t, mode:g.mode||"e2j",
    chars:g.chars||{}, party:{char:(g.party&&g.party.char)||null, sentence:[]},
    gold:g.gold||0, tickets:g.tickets||0, xp:g.xp||0,
    dungeons:g.dungeons||{}, inf:{best:(g.inf&&g.inf.best)||0, run:null},
    sv:{clears:(g.sv&&g.sv.clears)||{}, meta:(g.sv&&g.sv.meta)||{},
        dailyDone:(g.sv&&g.sv.dailyDone)||null,
        winDay:(g.sv&&g.sv.winDay)||null,
        endless:(g.sv&&g.sv.endless)||null}, // サバイバーの記録・心得・荒野は冒険の記録として残す
    slot:{meta:(g.slot&&g.slot.meta)||{}}, // スロットの心得も冒険の記録として残す(v4.28.0)
    myphr:g.myphr||{}, // マイフレーズの定義はユーザーの資産=部分リセットでも残す(SRS記録だけやり直し・v5.6.0)
    myw:g.myw||{},     // マイ単語の定義も同じく資産(v5.11.0)
    say:g.say||{},     // 言えなかったことのメモも資産(v5.25.0)
    rl:g.rl||{topics:{}, mute:{}, done:{}, last:{}}, // 今日の英語の好み・記録も資産として残す(v5.10.0)
    daily:g.daily||{}, weekly:g.weekly||{}, counters:g.counters||{}, ach:g.ach||{},
    login:g.login||{last:null,day:0}, gift10:g.gift10||0,
    frz:g.frz||0, frzAt:g.frzAt||"", faces:g.faces||{}, faceAt:g.faceAt||{}, idle:{last:t},
    words:{}, days:{}, inv:{}, shards:0, combo:0, conf:{},
    pace:{goal:null, setAt:t, log:[]}};
}

/* ================= 設定モーダル =================
   v4.30.0で分類・開閉化(実機FB「シンプルかつわかりやすく」): 常時見えるのは
   「記録のサマリ+あゆみ/学習ペース管理の入口」だけ。設定項目は
   📖学習/🎨演出/📥同期/🔄更新/🗑リセットの開閉セクション(foldSec)に分類して畳む。
   中身は常にDOMに置く=既存のボタンID・テストは全部そのまま生きる */
function openSettings(){
  /* v5.24.0(実機FB「設定にサバイバー関連が残っている」): サバイバーの設定・文言はGAME_ENABLEDのときだけ(方針=隠すだけ・削除しない) */
  const learnInner=
    '<div class="small" style="margin-bottom:6px">出題と自動化のしくみ '+helpBtn("hlp-opt")+'</div>'+
    helpNote("hlp-opt", '<b>自動で次へ</b>: 答え合わせのあと、「次へ」を押さなくても設定した秒数で自動的に次の問題へ進む'+
      (GAME_ENABLED? '(学習タブ・サバイバー共通。「次へ」を押せばすぐ進める。レベルアップの3択などは今までどおり止まる)' : '(「次へ」を押せばすぐ進める)')+'<br><br>'+
      (GAME_ENABLED? '<b>サバイバー3択の自動選択</b>: レベルアップ・宝箱の3択をおまかせで即決する'+
      '(HPが半分近く減っているときは回復を優先。じっくり選びたい人はオフのまま)<br><br>' : '')+ // v5.24.0: ゲーム面オフでは出さない
      '<b>先に思い出すステップ</b>: 単語の復習(一度出た語)とフレーズの4択で、選択肢を最初は伏せて自力で思い出してから開く。'+
      '選択肢は「見れば分かる」(再認)で解けてしまい、見ずに言う力(再生)が付きにくい ─ '+
      'このワンクッションが両者のギャップを埋める(新規の単語・にがて特訓'+(GAME_ENABLED? '・サバイバー':'')+'では出ない。テンポ優先ならオフ)<br><br>'+
      '<b>4択の誤答と追い出題(設定なし・常時)</b>: 誤答には「以前に取り違えた相手」と「同じ語根の語」を優先して混ぜ、'+
      'ミスの直後はその相手を数問以内に出す ─ 消去法で解けず、似た語の区別が毎回の学習の中で固まる'+
      (SPEAK_ENABLED? '<br><br><b>フレーズ: 口頭の制限時間</b>: 口頭チェックにカウントダウンを付け、時間切れで自動的に答えが開く。'+
      '本番で使えるのは「すぐ出てくる」フレーズだけ ─ 想起の速さを鍛える' : ''))+
    '<button class="btn" id="modeToggle">出題: '+(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+' (タップで切替)</button>'+
    '<div style="height:8px"></div>'+
    '<button class="btn" id="autoNextBtn">自動で次へ: '+autoNextLabel(G.opt.autoNext)+' (タップで切替)</button>'+
    '<div style="height:8px"></div>'+
    (GAME_ENABLED? '<button class="btn" id="svAutoBtn">サバイバー3択の自動選択: '+(G.opt.svAuto? "ON":"OFF")+'</button>'+
    '<div style="height:8px"></div>' : '')+ // v5.24.0: サバイバーの設定はゲーム面オフでは隠す
    '<button class="btn" id="preRecallBtn">先に思い出すステップ(単語の復習・フレーズ): '+(G.opt.preRecall? "ON":"OFF")+'</button>'+
    // 口頭ステージはv5.10.0でUIから撤去(SPEAK_ENABLED=false)。制限時間の設定も一緒に隠す
    (SPEAK_ENABLED? '<div style="height:8px"></div>'+
    '<button class="btn" id="spkSecBtn">フレーズ: 口頭の制限時間: '+spkSecLabel(G.opt.spkSec)+' (タップで切替)</button>' : '');
  /* 効果音(v5.23.0・実機FB): 振動と同じ端末ローカルの設定。v5.24.0: 音の種類(SFX_KINDS)と音量(SFX_VOLS)をチップで選ぶ=タップで試聴 */
  const chips=(cls, defs, cur)=>Object.keys(defs).map(k=>'<button class="wchip '+cls+(k===cur? " ksel":"")+'" data-k="'+k+'">'+defs[k].name+'</button>').join("");
  const sfxInner=
    '<div class="small" style="margin-bottom:6px">正解・不正解で短い音が鳴る '+helpBtn("hlp-sfx")+'</div>'+
    helpNote("hlp-sfx", '音声ファイルは使わず端末が合成する。iPhoneはマナースイッチ(消音)に従う。種類・音量のチップをタップすると試聴できる(正解→不正解の順)')+
    '<button class="btn" id="sfxToggle">効果音: '+(sfxOn()? "ON":"OFF")+'</button>'+
    '<div class="sfxrow"><span class="small">音</span>'+chips("sfxk", SFX_KINDS, sfxKind())+'</div>'+
    '<div class="sfxrow"><span class="small">音量</span>'+chips("sfxv", SFX_VOLS, sfxVol())+'</div>'+
    '<div style="height:10px"></div>';
  const fxInner=sfxInner+(CAN_VIBRATE
    ? '<div class="small" style="margin-bottom:6px">正解やお祝いで端末が振動する '+helpBtn("hlp-vibe")+'</div>'+
      helpNote("hlp-vibe", 'ONにするとテスト振動が鳴る。鳴らない場合は端末のマナーモード/バイブ設定を確認')+
      '<button class="btn" id="vibeToggle">振動: '+(localStorage.getItem("tq_vibe")==="off"?"OFF":"ON")+'</button>'
    : '<button class="btn" disabled>振動: この端末は非対応</button>'+
      '<div class="small" style="margin-top:6px">iPhone・iPad・PCのブラウザは振動APIに対応していない(Android Chrome等で使える)</div>');
  /* v5.15.0(実機FB「同期・アップデートのボタンを処理しやすい位置に」): 2つのボタンは開閉セクションに畳まず、
     ⚙を開いた直後のいちばん上に横並びで常時表示する(1タップ目=⚙・2タップ目=同期/更新)。
     ID(syncBtn/updateBtn)・ヘルプ文は従来どおり。同期が未設定の端末ではボタンを無効にして理由を添える */
  const topRow=
    '<div class="row settop">'+
      (syncClientId()
        ? '<button class="btn primary grow" id="syncBtn">📥 今すぐ同期</button>'
        : '<button class="btn grow" id="syncBtn" disabled>📥 同期(未設定)</button>')+
      '<button class="btn grow" id="updateBtn">アップデートを確認</button>'+
    '</div>'+
    '<div class="small" style="margin:6px 0 4px">'+
      (syncClientId()
        ? '最終同期: '+(lastSyncAt()? fmtSyncTime(lastSyncAt()) : 'この端末ではまだ同期していない')
        : '同期は未設定')+' '+helpBtn("hlp-sync")+
      ' ・ v'+APP_VERSION+' '+helpBtn("hlp-upd")+'</div>'+
    helpNote("hlp-sync", syncClientId()
      ? 'あなた自身のGoogleドライブ(アプリ専用領域)に保存。進捗を失わない方向でマージされる'
      : '未設定。GCPでOAuthクライアントIDを発行し js/sync.js に設定すると使える(README参照)。データは端末内に保存されている')+
    helpNote("hlp-upd", 'ホーム画面から起動している場合(iOS等)も「アップデートを確認」で最新版に更新できる。学習データ・同期は消えない');
  const resetInner=
    '<div class="small" style="margin-bottom:6px">やり直したいときに '+helpBtn("hlp-reset")+'</div>'+
    helpNote("hlp-reset", (GAME_ENABLED? '「学習記録とカードだけリセット」はなかま・通貨・レベル・冒険の記録を残して単語の学習をやり直す。' : '「学習記録だけリセット」は実績・マイフレーズ・今日の英語の記録を残して単語とフレーズの学習をやり直す。')+'どちらも確認画面が出る')+
    '<button class="btn" id="resetLearnBtn">'+(GAME_ENABLED? '学習記録とカードだけリセット' : '学習記録だけリセット')+'</button>'+
    '<div style="height:10px"></div>'+
    '<button class="btn danger" id="resetBtn">データをすべてリセット</button>';
  /* v5.14.0: 「記録」(数字の表・あゆみ・にがて・読んだ聴いた・マイ単語・図鑑・実績)は📊記録タブ(records.js)へ移した。
     ⚙は設定だけ(出題・演出・同期・更新・リセット) */
  openModal('<h3>⚙ 設定</h3>'+
    topRow+ // 同期・更新はいちばん上(v5.15.0)
    foldSec("sfoldLearn", "📖 学習(出題・自動化)", learnInner, false)+
    foldSec("sfoldFx",    "🎨 演出(効果音・振動)", fxInner, false)+
    foldSec("sfoldReset", "🗑 データのリセット", resetInner, false)+
    '<div class="small" style="margin-top:14px">学習の記録・あゆみ・実績は下のナビの <b>📊 記録</b> に<br>'+
      'LEXICA(レキシカ) v'+APP_VERSION+' ─ 単語データ: 英検1級レベル '+WORDS.length+'語(<a href="https://github.com/zuno1000/tango" target="_blank" rel="noopener" style="color:var(--accent2)">tango</a> 由来)</div>');
  $("modeToggle").onclick=()=>{
    G.mode=G.mode==="e2j"?"j2e":"e2j"; saveG();
    $("modeToggle").textContent=(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+" (タップで切替)";
    if(!answered && cur) renderQuestion();
  };
  $("autoNextBtn").onclick=()=>{
    G.opt.autoNext=autoNextCycle(G.opt.autoNext); saveG();
    $("autoNextBtn").textContent="自動で次へ: "+autoNextLabel(G.opt.autoNext)+" (タップで切替)";
  };
  if($("svAutoBtn")) $("svAutoBtn").onclick=()=>{
    G.opt.svAuto=G.opt.svAuto? 0:1; saveG();
    $("svAutoBtn").textContent="サバイバー3択の自動選択: "+(G.opt.svAuto? "ON":"OFF");
  };
  $("preRecallBtn").onclick=()=>{
    G.opt.preRecall=G.opt.preRecall? 0:1; saveG();
    $("preRecallBtn").textContent="先に思い出すステップ(単語の復習・フレーズ): "+(G.opt.preRecall? "ON":"OFF");
  };
  if($("spkSecBtn")) $("spkSecBtn").onclick=()=>{
    G.opt.spkSec=spkSecCycle(G.opt.spkSec); saveG();
    $("spkSecBtn").textContent="フレーズ: 口頭の制限時間: "+spkSecLabel(G.opt.spkSec)+" (タップで切替)";
  };
  $("sfxToggle").onclick=()=>{
    const on=!sfxOn();
    try{ localStorage.setItem("tq_sfx", on? "on":"off"); }catch(e){}
    $("sfxToggle").textContent="効果音: "+(on? "ON":"OFF");
    if(on) sfx("test"); // ONにした瞬間(タップ操作中)にテスト音
  };
  // 音の種類・音量(v5.24.0): 選んで保存し、その設定で試聴(OFFのときも試聴だけは鳴らす)
  $("modal").querySelectorAll(".sfxk").forEach(b=>b.onclick=()=>{
    try{ localStorage.setItem("tq_sfxKind", b.dataset.k); }catch(e){}
    $("modal").querySelectorAll(".sfxk").forEach(x=>x.classList.toggle("ksel", x===b));
    sfx("test", {force:true});
  });
  $("modal").querySelectorAll(".sfxv").forEach(b=>b.onclick=()=>{
    try{ localStorage.setItem("tq_sfxVol", b.dataset.k); }catch(e){}
    $("modal").querySelectorAll(".sfxv").forEach(x=>x.classList.toggle("ksel", x===b));
    sfx("test", {force:true});
  });
  const vt=$("vibeToggle");
  if(vt) vt.onclick=()=>{
    const off=localStorage.getItem("tq_vibe")==="off";
    localStorage.setItem("tq_vibe", off?"on":"off");
    vt.textContent="振動: "+(off?"ON":"OFF");
    // ONにした瞬間(タップ操作中)に長めのテスト振動。ここで鳴らなければ端末側の設定
    if(off){ try{ navigator.vibrate([80,50,80]); }catch(e){} }
  };
  const sb=$("syncBtn");
  if(sb && !sb.disabled){ ensureGis(()=>{}); sb.onclick=()=>syncNow(); } // GIS先読み=タップ時にポップアップがブロックされない
  $("updateBtn").onclick=appUpdate;
  $("resetLearnBtn").onclick=()=>{
    openModal('<h3>'+(GAME_ENABLED? '学習記録とカードをリセットする？' : '学習記録をリセットする？')+'</h3>'+
      '<div class="small" style="line-height:1.7">消えるもの: 単語・フレーズの学習記録(SRS・学習のあゆみ・語彙力の記録)'+(GAME_ENABLED? '・単語カード・かけら':'')+'・学習ペースの目標。<br>'+
      (GAME_ENABLED? '残るもの: なかま(突破・カスタムアイコン)・🪙・🎫・レベル(XP)・冒険(サバイバー)や任務の記録・マイフレーズの登録内容。'
                   : '残るもの: 実績(XP)・マイフレーズ・マイ単語の登録内容・今日の英語の記録と好み・連続学習フリーズ。')+ // v5.24.0: ゲーム面オフの文言

      (syncClientId()&&lastSyncAt()? '<br>Drive同期を使っているため、<b>他の端末も次回同期時に同じ状態になる</b>。':'')+
      '<br>この操作は取り消せない。</div>'+
      '<div class="row" style="margin-top:12px; gap:10px">'+
      '<button class="btn" data-close>やめる</button>'+
      '<button class="btn danger" id="resetLearnGo">リセットする</button></div>');
    $("resetLearnGo").onclick=()=>{
      // resetAt世代を進めた「なかま等だけ残る」セーブを書いてリロード(全端末に伝播)
      localStorage.setItem(KEY, JSON.stringify(partialResetData(G, Date.now())));
      location.reload();
    };
  };
  $("resetBtn").onclick=()=>{
    openModal('<h3>本当にリセットする？</h3>'+
      '<div class="small">'+(GAME_ENABLED? '学習記録・カード・なかま・通貨がすべて消える。' : '学習記録・実績・マイ単語・マイフレーズ・今日の英語の記録がすべて消える。')+
      (syncClientId()&&lastSyncAt()? 'Drive同期を使っているため、<b>他の端末も次回同期時にリセットされる</b>。':'')+
      'この操作は取り消せない。</div>'+
      '<div class="row" style="margin-top:12px; gap:10px">'+
      '<button class="btn" data-close>やめる</button>'+
      '<button class="btn danger" id="resetGo">リセットする</button></div>');
    $("resetGo").onclick=()=>{
      // 空セーブに世代印(resetAt)を残す: 同期でリセットが復活せず、他端末にも伝播する
      const t=Date.now();
      localStorage.setItem(KEY, JSON.stringify({v:1, resetAt:t, updatedAt:t}));
      location.reload();
    };
  };
}
$("gearBtn").onclick=openSettings;
