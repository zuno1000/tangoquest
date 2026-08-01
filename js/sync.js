"use strict";
/* ================= 設定 & Googleドライブ同期 =================
   todaybgm と同方式: GIS + drive.appdata(非機密スコープ・審査不要)。
   ユーザー自身のGoogleドライブ appDataFolder に保存するためサーバー不要。
   クライアントIDは GCP で発行して下の定数に設定する(README参照)。 */

const GOOGLE_CLIENT_ID_PROD="";   // 本番(例: https://tangoquest.pages.dev)
const GOOGLE_CLIENT_ID_DEV="";    // 開発(http://localhost:8000)
const SYNC_FILENAME="tangoquest.json";

function syncClientId(){
  return location.hostname==="localhost" ? GOOGLE_CLIENT_ID_DEV : GOOGLE_CLIENT_ID_PROD;
}

let gisLoaded=false, accessToken=null;
function ensureGis(cb){
  if(gisLoaded){ cb(); return; }
  const s=document.createElement("script");
  s.src="https://accounts.google.com/gsi/client";
  s.onload=()=>{ gisLoaded=true; cb(); };
  s.onerror=()=>toast("Googleサービスに接続できない");
  document.head.appendChild(s);
}
function getToken(cb){
  if(accessToken){ cb(accessToken); return; }
  ensureGis(()=>{
    const tc=google.accounts.oauth2.initTokenClient({
      client_id: syncClientId(),
      scope: "https://www.googleapis.com/auth/drive.appdata",
      callback: r=>{
        if(r && r.access_token){ accessToken=r.access_token; cb(accessToken); }
        else toast("認証がキャンセルされた");
      }
    });
    tc.requestAccessToken();
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

/* 端末間マージ: 進捗を失わない方向(大きい方・和集合)に寄せる。冪等。 */
function mergeData(a, b){
  const m=JSON.parse(JSON.stringify(a));
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
        toast("同期完了。再読み込みします");
        setTimeout(()=>location.reload(), 800);
      }else{
        await driveUpload(token, null, G);
        toast("初回アップロード完了");
      }
    }catch(e){
      toast("同期に失敗: "+e.message);
    }
  });
}

/* ================= 設定モーダル ================= */
function openSettings(){
  const d=dayRec();
  const streak=(()=>{ let n=0; const t=new Date();
    for(let i=0;;i++){
      const dt=new Date(t.getFullYear(),t.getMonth(),t.getDate()-i);
      const k=dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
      const r=G.days[k];
      if(r&&r.a>0) n++;
      else if(i===0) continue;
      else break;
    } return n; })();
  let mastered=0; for(const en in G.words){ if(G.words[en][0]>=MASTER_BOX) mastered++; }
  openModal('<h3>⚙ 設定・記録</h3>'+
    '<table class="stt">'+
    '<tr><td>今日の解答</td><td>'+d.a+'問(正解'+d.c+')</td></tr>'+
    '<tr><td>覚えた単語</td><td>'+mastered+' / '+WORDS.length+'</td></tr>'+
    '<tr><td>学習した単語</td><td>'+Object.keys(G.words).length+'</td></tr>'+
    '<tr><td>連続学習日数</td><td>'+streak+'日</td></tr>'+
    '</table>'+
    '<h3 style="margin-top:16px">出題モード</h3>'+
    '<button class="btn" id="modeToggle">'+(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+' (タップで切替)</button>'+
    '<h3 style="margin-top:16px">演出</h3>'+
    '<button class="btn" id="vibeToggle">振動: '+(localStorage.getItem("tq_vibe")==="off"?"OFF":"ON")+'</button>'+
    '<h3 style="margin-top:16px">端末間同期(Googleドライブ)</h3>'+
    (syncClientId()
      ? '<div class="small">あなた自身のGoogleドライブ(アプリ専用領域)に保存。進捗を失わない方向でマージされる。</div>'+
        '<button class="btn primary" id="syncBtn" style="margin-top:8px">今すぐ同期</button>'
      : '<div class="small">未設定。GCPでOAuthクライアントIDを発行し js/sync.js に設定すると使える(README参照)。データは端末内に保存されている。</div>')+
    '<h3 style="margin-top:16px">データ</h3>'+
    '<button class="btn danger" id="resetBtn">データをすべてリセット</button>'+
    '<div class="small" style="margin-top:14px">LEXICA(レキシカ) v2.2.0 ─ 英単語×ローグライクRPG<br>単語データ: 英検1級レベル '+WORDS.length+'語(<a href="https://github.com/zuno1000/tango" style="color:var(--accent2)">tango</a> 由来)</div>');
  $("modeToggle").onclick=()=>{
    G.mode=G.mode==="e2j"?"j2e":"e2j"; saveG();
    $("modeToggle").textContent=(G.mode==="e2j"?"EN → 日本語":"日本語 → EN")+" (タップで切替)";
    if(!answered && cur) renderQuestion();
  };
  $("vibeToggle").onclick=()=>{
    const off=localStorage.getItem("tq_vibe")==="off";
    localStorage.setItem("tq_vibe", off?"on":"off");
    $("vibeToggle").textContent="振動: "+(off?"ON":"OFF");
    if(off) vibe(30);
  };
  const sb=$("syncBtn"); if(sb) sb.onclick=syncNow;
  $("resetBtn").onclick=()=>{
    openModal('<h3>本当にリセットする？</h3>'+
      '<div class="small">学習記録・カード・なかま・通貨がすべて消える。この操作は取り消せない。</div>'+
      '<div class="row" style="margin-top:12px; gap:10px">'+
      '<button class="btn" data-close>やめる</button>'+
      '<button class="btn danger" id="resetGo">リセットする</button></div>');
    $("resetGo").onclick=()=>{ localStorage.removeItem(KEY); location.reload(); };
  };
}
$("gearBtn").onclick=openSettings;
