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
let gisLoaded=false, gisLoading=false, tokenClient=null, tokenCb=null;
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
      const cb=tokenCb; tokenCb=null;
      if(r && r.access_token){
        const exp=Date.now()+Math.max(60,(+r.expires_in||3600)-60)*1000;
        try{
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({tok:r.access_token, exp}));
          localStorage.setItem(AUTHED_KEY,"1");
        }catch(e){}
        if(cb) cb(r.access_token);
      }else toast("認証がキャンセルされた");
    },
    error_callback: e=>{ tokenCb=null; toast("認証できなかった("+((e&&e.type)||"error")+")"); }
  });
}
function getToken(cb){
  const t=savedToken();
  if(t){ cb(t); return; }
  ensureGis(()=>{
    initTokenClient();
    tokenCb=cb;
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
function mergeData(a, b){
  b=b||{};
  if((a.resetAt||0)!==(b.resetAt||0)){
    const w=(a.resetAt||0)>(b.resetAt||0)? a : b;
    return JSON.parse(JSON.stringify(w));
  }
  // 未知キー(将来のバージョンが追加するフィールド)も保持する=前方互換(既知キーはローカル起点)
  const m=JSON.parse(JSON.stringify(Object.assign({}, b, a)));
  // 単語SRS: 解答回数(正解+ミス)が多い方を採用
  for(const en in b.words||{}){
    const x=m.words[en], y=b.words[en];
    if(!x || (y[2]+y[3])>(x[2]+x[3])) m.words[en]=y;
  }
  // 日別学習記録: 日ごとに大きい方
  for(const k in b.days||{}){
    const x=m.days[k], y=b.days[k];
    if(!x) m.days[k]=y;
    else { x.a=Math.max(x.a,y.a); x.c=Math.max(x.c,y.c); x.m=Math.max(x.m,y.m); }
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
  for(const k in b.counters||{}) m.counters[k]=Math.max(m.counters[k]||0, b.counters[k]||0);
  m.inf=m.inf||{best:0,run:null};
  m.inf.best=Math.max(m.inf.best||0, (b.inf&&b.inf.best)||0);
  for(const id in b.ach||{}) m.ach[id]=Math.max(m.ach[id]||0, b.ach[id]||0);
  // 任務・編成・ログインは更新が新しい側を優先
  const newer=(b.updatedAt||0)>(a.updatedAt||0)? b : a;
  m.daily=newer.daily||m.daily; m.weekly=newer.weekly||m.weekly;
  m.party=newer.party||m.party; m.login=newer.login||m.login; m.mode=newer.mode||m.mode;
  m.resetAt=a.resetAt||0;
  return m;
}

async function syncNow(){
  if(!syncClientId()){ toast("同期は未設定(READMEの手順でクライアントIDを設定)"); return; }
  toast("同期中…");
  getToken(async token=>{
    try{
      const f=await driveFind(token);
      if(f){
        const remote=await driveDownload(token, f.id);
        const merged=mergeData(G, remote||{});
        merged.updatedAt=Date.now();
        localStorage.setItem(KEY, JSON.stringify(merged));
        await driveUpload(token, f.id, merged);
        markSynced();
        toast("同期完了。再読み込みします");
        setTimeout(()=>location.reload(), 800);
      }else{
        await driveUpload(token, null, G);
        markSynced();
        toast("初回アップロード完了");
      }
    }catch(e){
      toast("同期に失敗: "+e.message);
    }
  });
}

/* ---- アプリの更新 ----
   iOSでホーム画面から起動している場合など「タブを閉じて開き直す」ができない環境向け。
   sw.jsの再取得はHTTPキャッシュを迂回するので、CACHE名が上がっていれば新SWが入り
   (install=skipWaiting済み・activate=旧キャッシュ削除+clients.claim済み)、
   制御が切り替わった時点でリロード=最新版になる。localStorage(学習データ・同期設定)には触れない */
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
    updating=false;
    if(remoteV && remoteV!==APP_VERSION){
      toast("新版 v"+remoteV+" を配信中。反映まで数分かかる ─ 少し待ってもう一度");
    }else{
      toast("最新版 v"+APP_VERSION+" を利用中 ✓");
    }
  }catch(e){
    location.reload();
  }
}

/* ================= 設定モーダル ================= */
function openSettings(){
  const d=dayRec();
  const streak=studyStreak();
  let mastered=0; for(const en in G.words){ if(G.words[en][0]>=MASTER_BOX) mastered++; }
  openModal('<h3>⚙ 設定・記録</h3>'+
    '<table class="stt">'+
    '<tr><td>今日の解答</td><td>'+d.a+'問(正解'+d.c+')</td></tr>'+
    '<tr><td>覚えた単語</td><td>'+mastered+' / '+WORDS.length+'</td></tr>'+
    '<tr><td>学習した単語</td><td>'+Object.keys(G.words).length+'</td></tr>'+
    '<tr><td>連続学習日数</td><td>'+streak+'日(XPボーナス ×'+(+streakXpMult().toFixed(2))+')</td></tr>'+
    '</table>'+
    '<h3 style="margin-top:16px">出題モード</h3>'+
    '<button class="btn" id="modeToggle">'+(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+' (タップで切替)</button>'+
    '<h3 style="margin-top:16px">演出</h3>'+
    (CAN_VIBRATE
      ? '<button class="btn" id="vibeToggle">振動: '+(localStorage.getItem("tq_vibe")==="off"?"OFF":"ON")+'</button>'+
        '<div class="small" style="margin-top:6px">ONにするとテスト振動が鳴る。鳴らない場合は端末のマナーモード/バイブ設定を確認</div>'
      : '<button class="btn" disabled>振動: この端末は非対応</button>'+
        '<div class="small" style="margin-top:6px">iPhone・iPad・PCのブラウザは振動APIに対応していない(Android Chrome等で使える)</div>')+
    '<h3 style="margin-top:16px">端末間同期(Googleドライブ)</h3>'+
    (syncClientId()
      ? '<div class="small">あなた自身のGoogleドライブ(アプリ専用領域)に保存。進捗を失わない方向でマージされる。</div>'+
        '<div class="small" style="margin-top:4px">最終同期: '+(lastSyncAt()? fmtSyncTime(lastSyncAt()) : 'この端末ではまだ同期していない')+'</div>'+
        '<button class="btn primary" id="syncBtn" style="margin-top:8px">今すぐ同期</button>'
      : '<div class="small">未設定。GCPでOAuthクライアントIDを発行し js/sync.js に設定すると使える(README参照)。データは端末内に保存されている。</div>')+
    '<h3 style="margin-top:16px">アプリの更新</h3>'+
    '<button class="btn" id="updateBtn">🔄 アップデートを確認</button>'+
    '<div class="small" style="margin-top:6px">ホーム画面から起動している場合(iOS等)もこのボタンで最新版に更新できる。学習データ・同期は消えない</div>'+
    '<h3 style="margin-top:16px">データ</h3>'+
    '<button class="btn danger" id="resetBtn">データをすべてリセット</button>'+
    '<div class="small" style="margin-top:14px">LEXICA(レキシカ) v'+APP_VERSION+' ─ 英単語×ローグライクRPG<br>単語データ: 英検1級レベル '+WORDS.length+'語(<a href="https://github.com/zuno1000/tango" target="_blank" rel="noopener" style="color:var(--accent2)">tango</a> 由来)</div>');
  $("modeToggle").onclick=()=>{
    G.mode=G.mode==="e2j"?"j2e":"e2j"; saveG();
    $("modeToggle").textContent=(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+" (タップで切替)";
    if(!answered && cur) renderQuestion();
  };
  const vt=$("vibeToggle");
  if(vt) vt.onclick=()=>{
    const off=localStorage.getItem("tq_vibe")==="off";
    localStorage.setItem("tq_vibe", off?"on":"off");
    vt.textContent="振動: "+(off?"ON":"OFF");
    // ONにした瞬間(タップ操作中)に長めのテスト振動。ここで鳴らなければ端末側の設定
    if(off){ try{ navigator.vibrate([80,50,80]); }catch(e){} }
  };
  const sb=$("syncBtn");
  if(sb){ ensureGis(()=>{}); sb.onclick=syncNow; } // GIS先読み=タップ時にポップアップがブロックされない
  $("updateBtn").onclick=appUpdate;
  $("resetBtn").onclick=()=>{
    openModal('<h3>本当にリセットする？</h3>'+
      '<div class="small">学習記録・カード・なかま・通貨がすべて消える。'+
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
