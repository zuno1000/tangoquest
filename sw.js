/* TangoQuest service worker — cache-first */
const CACHE="tangoquest-v41"; // 表示名はLEXICAだがキャッシュ名系統は維持
const ASSETS=[
  "./", "index.html", "manifest.json",
  "css/style.css",
  "js/words.js","js/roots.js","js/util.js","js/state.js","js/cards.js","js/chars.js",
  "js/battle.js","js/pace.js","js/quiz.js","js/dungeon.js","js/missions.js","js/dex.js","js/sync.js","js/main.js",
  "icon-192.png","icon-512.png"
];
self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
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
