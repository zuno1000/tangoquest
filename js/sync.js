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
  // 日別学習記録: 日ごとに大きい方(fz=フリーズが守った日も「守られた」側を保持)
  for(const k in b.days||{}){
    const x=m.days[k], y=b.days[k];
    if(!x) m.days[k]=y;
    else ["a","c","m","n","t","na","nc","ra","rc","fz","qk"].forEach(f=>{ // qk=サクッと完了回数(v4.30.0)
      x[f]=Math.max(x[f]||0, y[f]||0);
    });
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
  m.faces=Object.assign({}, b.faces||{}, a.faces||{}); // カスタムアイコンは和集合(ローカル優先)
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
  // 任務・編成・ログイン・るすばん探索の精算時刻は更新が新しい側を優先
  const newer=(b.updatedAt||0)>(a.updatedAt||0)? b : a;
  m.daily=newer.daily||m.daily; m.weekly=newer.weekly||m.weekly;
  m.party=newer.party||m.party; m.login=newer.login||m.login; m.mode=newer.mode||m.mode;
  m.idle=newer.idle||m.idle;
  /* 学習ペース: 目標日は「設定/解除した時刻(setAt)」が新しい側が勝つ。
     updatedAt基準だと起動しただけの未設定端末が勝って目標が消える(v4.7.1までの不具合)。
     setAt同士が同じ(旧版=0)なら目標あり側を優先。推定ログは長い方(結合すると重複計上になる) */
  {
    const pa=a.pace, pb=b.pace;
    if(!pa || !pb) m.pace=pa||pb||m.pace;
    else{
      const w=(pb.setAt||0)>(pa.setAt||0)? pb : (pa.setAt||0)>(pb.setAt||0)? pa : (pa.goal? pa : pb);
      m.pace={goal:w.goal||null, setAt:w.setAt||0, qd:w.qd||null,
              log:(((pa.log||[]).length>=(pb.log||[]).length? pa.log : pb.log)||[])};
    }
  }
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
    daily:g.daily||{}, weekly:g.weekly||{}, counters:g.counters||{}, ach:g.ach||{},
    login:g.login||{last:null,day:0}, gift10:g.gift10||0,
    frz:g.frz||0, faces:g.faces||{}, idle:{last:t},
    words:{}, days:{}, inv:{}, shards:0, combo:0,
    pace:{goal:null, setAt:t, log:[]}};
}

/* ================= 設定モーダル =================
   v4.30.0で分類・開閉化(実機FB「シンプルかつわかりやすく」): 常時見えるのは
   「記録のサマリ+あゆみ/学習ペース管理の入口」だけ。設定項目は
   📖学習/🎨演出/📥同期/🔄更新/🗑リセットの開閉セクション(foldSec)に分類して畳む。
   中身は常にDOMに置く=既存のボタンID・テストは全部そのまま生きる */
function openSettings(){
  const d=dayRec();
  const streak=studyStreak();
  let mastered=0; for(const en in G.words){ if(G.words[en][0]>=MASTER_BOX) mastered++; }
  const learnInner=
    '<div class="small" style="margin-bottom:6px">出題と自動化のしくみ '+helpBtn("hlp-opt")+'</div>'+
    helpNote("hlp-opt", '<b>自動で次へ</b>: 答え合わせのあと、「次へ」を押さなくても設定した秒数で自動的に次の問題へ進む'+
      '(学習タブ・サバイバー共通。「次へ」を押せばすぐ進める。レベルアップの3択などは今までどおり止まる)<br><br>'+
      '<b>サバイバー3択の自動選択</b>: レベルアップ・宝箱の3択をおまかせで即決する'+
      '(HPが半分近く減っているときは回復を優先。じっくり選びたい人はオフのまま)')+
    '<button class="btn" id="modeToggle">出題: '+(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+' (タップで切替)</button>'+
    '<div style="height:8px"></div>'+
    '<button class="btn" id="autoNextBtn">自動で次へ: '+autoNextLabel(G.opt.autoNext)+' (タップで切替)</button>'+
    '<div style="height:8px"></div>'+
    '<button class="btn" id="svAutoBtn">サバイバー3択の自動選択: '+(G.opt.svAuto? "ON":"OFF")+'</button>';
  const fxInner=(CAN_VIBRATE
    ? '<div class="small" style="margin-bottom:6px">正解やお祝いで端末が振動する '+helpBtn("hlp-vibe")+'</div>'+
      helpNote("hlp-vibe", 'ONにするとテスト振動が鳴る。鳴らない場合は端末のマナーモード/バイブ設定を確認')+
      '<button class="btn" id="vibeToggle">振動: '+(localStorage.getItem("tq_vibe")==="off"?"OFF":"ON")+'</button>'
    : '<button class="btn" disabled>振動: この端末は非対応</button>'+
      '<div class="small" style="margin-top:6px">iPhone・iPad・PCのブラウザは振動APIに対応していない(Android Chrome等で使える)</div>');
  const syncInner=(syncClientId()
    ? '<div class="small" style="margin-bottom:6px">最終同期: '+(lastSyncAt()? fmtSyncTime(lastSyncAt()) : 'この端末ではまだ同期していない')+' '+helpBtn("hlp-sync")+'</div>'+
      helpNote("hlp-sync", 'あなた自身のGoogleドライブ(アプリ専用領域)に保存。進捗を失わない方向でマージされる')+
      '<button class="btn primary" id="syncBtn">今すぐ同期</button>'
    : '<div class="small">未設定 '+helpBtn("hlp-sync")+'</div>'+
      helpNote("hlp-sync", '未設定。GCPでOAuthクライアントIDを発行し js/sync.js に設定すると使える(README参照)。データは端末内に保存されている'));
  const updInner=
    '<div class="small" style="margin-bottom:6px">最新版への更新 '+helpBtn("hlp-upd")+'</div>'+
    helpNote("hlp-upd", 'ホーム画面から起動している場合(iOS等)もこのボタンで最新版に更新できる。学習データ・同期は消えない')+
    '<button class="btn" id="updateBtn">アップデートを確認</button>';
  const resetInner=
    '<div class="small" style="margin-bottom:6px">やり直したいときに '+helpBtn("hlp-reset")+'</div>'+
    helpNote("hlp-reset", '「学習記録とカードだけリセット」はなかま・通貨・レベル・冒険の記録を残して単語の学習をやり直す。どちらも確認画面が出る')+
    '<button class="btn" id="resetLearnBtn">学習記録とカードだけリセット</button>'+
    '<div style="height:10px"></div>'+
    '<button class="btn danger" id="resetBtn">データをすべてリセット</button>';
  openModal('<h3>⚙ 設定・記録</h3>'+
    '<table class="stt">'+
    '<tr><td>今日の解答</td><td>'+d.a+'問(正解'+d.c+')</td></tr>'+
    '<tr><td>覚えた単語</td><td>'+mastered+' / '+WORDS.length+'(学習した '+Object.keys(G.words).length+'語)</td></tr>'+
    '<tr><td>連続学習</td><td>'+streak+'日(XP×'+(+streakXpMult().toFixed(2))+' ・ 🧊'+(G.frz||0)+'/'+FRZ_MAX+')</td></tr>'+
    '</table>'+
    '<div class="row" style="gap:8px; margin-top:8px">'+
      '<button class="btn grow" id="histBtn">📊 学習のあゆみ</button>'+
      '<button class="btn grow" id="paceCfgBtn">🎯 学習ペース管理</button></div>'+
    foldSec("sfoldLearn", "📖 学習(出題・自動化)", learnInner, false)+
    foldSec("sfoldFx",    "🎨 演出(振動)", fxInner, false)+
    foldSec("sfoldSync",  "📥 端末間同期(Googleドライブ)", syncInner, false)+
    foldSec("sfoldUpd",   "🔄 アプリの更新", updInner, false)+
    foldSec("sfoldReset", "🗑 データのリセット", resetInner, false)+
    '<div class="small" style="margin-top:14px">LEXICA(レキシカ) v'+APP_VERSION+' ─ 英単語×ローグライクRPG<br>単語データ: 英検1級レベル '+WORDS.length+'語(<a href="https://github.com/zuno1000/tango" target="_blank" rel="noopener" style="color:var(--accent2)">tango</a> 由来)</div>');
  $("paceCfgBtn").onclick=openPaceModal;
  $("modeToggle").onclick=()=>{
    G.mode=G.mode==="e2j"?"j2e":"e2j"; saveG();
    $("modeToggle").textContent=(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+" (タップで切替)";
    if(!answered && cur) renderQuestion();
  };
  $("autoNextBtn").onclick=()=>{
    G.opt.autoNext=autoNextCycle(G.opt.autoNext); saveG();
    $("autoNextBtn").textContent="自動で次へ: "+autoNextLabel(G.opt.autoNext)+" (タップで切替)";
  };
  $("svAutoBtn").onclick=()=>{
    G.opt.svAuto=G.opt.svAuto? 0:1; saveG();
    $("svAutoBtn").textContent="サバイバー3択の自動選択: "+(G.opt.svAuto? "ON":"OFF");
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
  $("histBtn").onclick=openHistoryModal;
  $("updateBtn").onclick=appUpdate;
  $("resetLearnBtn").onclick=()=>{
    openModal('<h3>学習記録とカードをリセットする？</h3>'+
      '<div class="small" style="line-height:1.7">消えるもの: 単語の学習記録(SRS・学習のあゆみ)・単語カード・かけら・学習ペースの目標。<br>'+
      '残るもの: なかま(突破・カスタムアイコン)・🪙・🎫・レベル(XP)・冒険(サバイバー)や任務の記録。'+
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
