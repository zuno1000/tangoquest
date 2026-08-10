/* TangoQuest service worker — cache-first */
const CACHE="tangoquest-v47"; // 表示名はLEXICAだがキャッシュ名系統は維持
const ASSETS=[
  "./", "index.html", "manifest.json",
  "css/style.css",
  "js/words.js","js/roots.js","js/util.js","js/state.js","js/cards.js","js/chars.js",
  "js/battle.js","js/pace.js","js/quiz.js","js/dungeon.js","js/missions.js","js/dex.js","js/sync.js","js/main.js",
  "icon-192.png","icon-512.png"
];
/* 資産はHTTPキャッシュ・CDNを迂回して取り込む(cache:no-store+版クエリ)。
   addAllは両者を素通りしないため、公開直後の連続リリースでは「sw.jsだけ新しく
   中身は旧版のまま」のキャッシュができ、以後どれだけ更新確認しても新版が
   取り込めない袋小路になっていた(v4.9.1で実際に発生) */
self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(u=>
    fetch(u+"?v="+CACHE, {cache:"no-store"}).then(res=>{
      if(!res.ok) throw new Error(u+" "+res.status);
      return c.put(u, res);
    })
  ))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
/* 「アップデートを確認」からの適用要求(installのskipWaitingを取り逃した場合の念押し) */
self.addEventListener("message", e=>{
  if(e.data==="skipWaiting") self.skipWaiting();
});
self.addEventListener("fetch", e=>{
  if(e.request.method!=="GET") return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin) return; // Google API等は素通し
  e.respondWith(
    caches.match(e.request).then(hit=>hit || fetch(e.request).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy));
      return res;
    }))
  );
});
