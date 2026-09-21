"use strict";
/* ================= 今日の英語(リーディング・リスニングのおすすめ・v5.10.0) =================
   実機FB「リーディング・リスニング力の向上として、今日一日のおすすめの英語の記事・動画を表示してほしい。
   推薦は無料で。解説や内容正誤問題は各自がLLMに頼むので、依頼プロンプトをすぐコピペできるように」への回答。

   設計:
   ・素材=英検1級(CEFR C1)レベルの英語メディアを厳選したカタログ(RL_SOURCES)。読む=記事フィード(RSS/Atom)、
     聴く=ポッドキャスト(RSS)とYouTubeチャンネル(Atomフィード)。ジャンル(topics)と難度(lv)・一部有料(pay)のタグつき
   ・推薦アルゴリズム(無料・端末内・純関数): 「興味のあるテーマ」との一致度で重み付け →「合わない」で外したソースを除外 →
     直近3日に出したソースを後ろへ → 日付のハッシュで決定的にシャッフル(=同じ日は何度開いても同じおすすめ・翌日は入れ替わる)。
     「別の候補」はその順位を1つ進める。素材はソースの最新記事(読んだものは飛ばす)
   ・取得=静的サイトなので、フィードはCORS対応の無料の中継(rss2json → allorigins → 直接)で取り込み、端末に当日分をキャッシュ。
     取れない日はソースのトップページへの導線と、貼り付け前提のプロンプトだけを出す(機能が沈黙しない)
   ・LLMプロンプト: 記事/動画の題名・URL・出典を埋め込んだ依頼文(解説+語彙/内容正誤問題/要約の添削…)を
     テキストエリアで確認・編集→📋コピー。日本語訳・問題生成はアプリ側では行わない(方針=LLMなし・無料)
   ・記録=G.rl(state.js): topics=興味(端末の好み)/mute=合わないソース(操作時刻LWW・同期)/done=読んだ・聴いた(和集合・同期)
   可逆設計: このファイル+ホームの1パネル+CSSブロック+_headersのconnect-srcで完結(学習ロジックは不変) */

const RL_TOPICS={sci:"科学", tec:"テクノロジー", eco:"経済・ビジネス", pol:"政治・国際", env:"環境",
  med:"医療・健康", cul:"思想・文化", soc:"社会", his:"歴史"};
/* kind: read=記事 / listen=音声・動画。lv: 1=英検1級標準 / 2=1級+(長文・専門寄り)。
   yt: YouTubeチャンネル(fetchはAtom)。feedはすべて2026-09-20に応答・件数・最新日付を確認済み。
   ★掲載基準(ユーザー決定2026-09-21): 全文を無料で読める・全編を無料で視聴できるソースだけ。有料・閲読制限(メーター)のある
   メディア(The Economist・The Atlantic・NYT・FT・WIRED・New Scientist・MIT TR・SciAm・Nautilus・Project Syndicate・
   Foreign Policy・Nature)と、更新の止まったもの(Hakai・Science In Action)、外部の有料記事へ飛ぶ集約(Longreads)は載せない。
   種類が減っても「開いたら読めない」を出さないことを優先する。payフラグは使わない(テストで0件を固定) */
const YT_FEED="https://www.youtube.com/feeds/videos.xml?channel_id=";
const RL_SOURCES=[
  /* ---- 読む ---- */
  {id:"conversation", kind:"read", name:"The Conversation", url:"https://theconversation.com/us", feed:"https://theconversation.com/us/articles.atom", t:["soc","sci","pol"], lv:1},
  {id:"aeon", kind:"read", name:"Aeon", url:"https://aeon.co", feed:"https://aeon.co/feed.rss", t:["cul","sci"], lv:2},
  {id:"psyche", kind:"read", name:"Psyche", url:"https://psyche.co", feed:"https://psyche.co/feed", t:["cul","med"], lv:1},
  {id:"quanta", kind:"read", name:"Quanta Magazine", url:"https://www.quantamagazine.org", feed:"https://api.quantamagazine.org/feed/", t:["sci","tec"], lv:2},
  {id:"guardian-long", kind:"read", name:"The Guardian ─ The long read", url:"https://www.theguardian.com/news/series/the-long-read", feed:"https://www.theguardian.com/news/series/the-long-read/rss", t:["soc","cul","pol"], lv:2},
  {id:"guardian-sci", kind:"read", name:"The Guardian ─ Science", url:"https://www.theguardian.com/science", feed:"https://www.theguardian.com/science/rss", t:["sci"], lv:1},
  {id:"guardian-op", kind:"read", name:"The Guardian ─ Opinion", url:"https://www.theguardian.com/commentisfree", feed:"https://www.theguardian.com/commentisfree/rss", t:["pol","soc"], lv:1},
  {id:"guardian-env", kind:"read", name:"The Guardian ─ Environment", url:"https://www.theguardian.com/environment", feed:"https://www.theguardian.com/environment/rss", t:["env"], lv:1},
  {id:"npr-news", kind:"read", name:"NPR ─ News", url:"https://www.npr.org/sections/news/", feed:"https://feeds.npr.org/1001/rss.xml", t:["pol","soc"], lv:1},
  {id:"npr-health", kind:"read", name:"NPR ─ Health", url:"https://www.npr.org/sections/health/", feed:"https://feeds.npr.org/1128/rss.xml", t:["med"], lv:1},
  {id:"npr-sci", kind:"read", name:"NPR ─ Science", url:"https://www.npr.org/sections/science/", feed:"https://feeds.npr.org/1007/rss.xml", t:["sci"], lv:1},
  {id:"bbc-future", kind:"read", name:"BBC Future", url:"https://www.bbc.com/future", feed:"https://www.bbc.com/future/feed.rss", t:["sci","tec","soc"], lv:1},
  {id:"smithsonian", kind:"read", name:"Smithsonian Magazine", url:"https://www.smithsonianmag.com", feed:"https://www.smithsonianmag.com/rss/latest_articles/", t:["his","cul","sci"], lv:1},
  {id:"knowable", kind:"read", name:"Knowable Magazine", url:"https://knowablemagazine.org", feed:"https://knowablemagazine.org/rss", t:["sci","med"], lv:1},
  {id:"noema", kind:"read", name:"Noema Magazine", url:"https://www.noemamag.com", feed:"https://www.noemamag.com/feed/", t:["cul","pol","tec"], lv:2},
  {id:"undark", kind:"read", name:"Undark", url:"https://undark.org", feed:"https://undark.org/feed/", t:["sci","med"], lv:1},
  {id:"bigthink", kind:"read", name:"Big Think", url:"https://bigthink.com", feed:"https://bigthink.com/feed/", t:["cul","sci"], lv:1},
  {id:"vox", kind:"read", name:"Vox", url:"https://www.vox.com", feed:"https://www.vox.com/rss/index.xml", t:["soc","pol"], lv:1},
  {id:"ars", kind:"read", name:"Ars Technica", url:"https://arstechnica.com", feed:"https://feeds.arstechnica.com/arstechnica/index", t:["tec","sci"], lv:1},
  {id:"owid", kind:"read", name:"Our World in Data", url:"https://ourworldindata.org", feed:"https://ourworldindata.org/atom.xml", t:["soc","eco","env"], lv:1},
  {id:"marginalian", kind:"read", name:"The Marginalian", url:"https://www.themarginalian.org", feed:"https://www.themarginalian.org/feed/", t:["cul"], lv:2},
  {id:"jstor", kind:"read", name:"JSTOR Daily", url:"https://daily.jstor.org", feed:"https://daily.jstor.org/feed/", t:["his","cul"], lv:1},
  {id:"e360", kind:"read", name:"Yale Environment 360", url:"https://e360.yale.edu", feed:"https://e360.yale.edu/feed.xml", t:["env"], lv:2},
  {id:"grist", kind:"read", name:"Grist", url:"https://grist.org", feed:"https://grist.org/feed/", t:["env","pol"], lv:1},
  {id:"harvard-gaz", kind:"read", name:"The Harvard Gazette", url:"https://news.harvard.edu/gazette/", feed:"https://news.harvard.edu/gazette/feed/", t:["sci","soc","med"], lv:1},
  /* ---- 聴く: ポッドキャスト ---- */
  {id:"ted-audio", kind:"listen", name:"TED Talks Daily", url:"https://www.ted.com/podcasts/ted-talks-daily", feed:"https://feeds.feedburner.com/TEDTalks_audio", t:["cul","sci","soc"], lv:1},
  {id:"ted-radio", kind:"listen", name:"TED Radio Hour (NPR)", url:"https://www.npr.org/programs/ted-radio-hour/", feed:"https://feeds.npr.org/510298/podcast.xml", t:["cul","sci","soc"], lv:1},
  {id:"hiddenbrain", kind:"listen", name:"Hidden Brain", url:"https://hiddenbrain.org", feed:"https://feeds.npr.org/510308/podcast.xml", t:["cul","med","soc"], lv:1},
  {id:"planetmoney", kind:"listen", name:"Planet Money (NPR)", url:"https://www.npr.org/podcasts/510289/planet-money", feed:"https://feeds.npr.org/510289/podcast.xml", t:["eco"], lv:1},
  {id:"freakonomics", kind:"listen", name:"Freakonomics Radio", url:"https://freakonomics.com/series/freakonomics-radio/", feed:"https://feeds.simplecast.com/Y8lFbOT4", t:["eco","soc"], lv:1},
  {id:"bbc-global", kind:"listen", name:"BBC Global News Podcast", url:"https://www.bbc.co.uk/programmes/p02nq0gn", feed:"https://podcasts.files.bbci.co.uk/p02nq0gn.rss", t:["pol"], lv:1},
  {id:"bbc-doc", kind:"listen", name:"BBC The Documentary", url:"https://www.bbc.co.uk/programmes/p02nq0lx", feed:"https://podcasts.files.bbci.co.uk/p02nq0lx.rss", t:["soc","pol","cul"], lv:1},
  {id:"bbc-reith", kind:"listen", name:"BBC The Reith Lectures", url:"https://www.bbc.co.uk/programmes/b00729d9", feed:"https://podcasts.files.bbci.co.uk/b00729d9.rss", t:["cul","pol"], lv:2},
  {id:"bbc-inourtime", kind:"listen", name:"BBC In Our Time", url:"https://www.bbc.co.uk/programmes/b006qykl", feed:"https://podcasts.files.bbci.co.uk/b006qykl.rss", t:["his","cul","sci"], lv:2},
  {id:"bbc-bizdaily", kind:"listen", name:"BBC Business Daily", url:"https://www.bbc.co.uk/programmes/p002vsxs", feed:"https://podcasts.files.bbci.co.uk/p002vsxs.rss", t:["eco"], lv:1},
  {id:"bbc-moreorless", kind:"listen", name:"BBC More or Less", url:"https://www.bbc.co.uk/programmes/p02nrss1", feed:"https://podcasts.files.bbci.co.uk/p02nrss1.rss", t:["eco","soc"], lv:1},
  {id:"bbc-inquiry", kind:"listen", name:"BBC The Inquiry", url:"https://www.bbc.co.uk/programmes/p029399x", feed:"https://podcasts.files.bbci.co.uk/p029399x.rss", t:["pol","soc"], lv:1},
  {id:"sciencevs", kind:"listen", name:"Science Vs", url:"https://gimletmedia.com/shows/science-vs", feed:"https://feeds.megaphone.fm/sciencevs", t:["sci","med"], lv:1},
  {id:"99pi", kind:"listen", name:"99% Invisible", url:"https://99percentinvisible.org", feed:"https://feeds.simplecast.com/BqbsxVfO", t:["cul","tec","his"], lv:1},
  {id:"radiolab", kind:"listen", name:"Radiolab", url:"https://radiolab.org", feed:"https://feeds.simplecast.com/EmVW7VGp", t:["sci","cul"], lv:1},
  /* ---- 聴く: YouTube ---- */
  {id:"yt-ted", kind:"listen", yt:1, name:"TED (YouTube)", url:"https://www.youtube.com/@TED", feed:YT_FEED+"UCAuUUnT6oDeKwE6v1NGQxug", t:["cul","sci","soc"], lv:1},
  {id:"yt-teded", kind:"listen", yt:1, name:"TED-Ed (YouTube)", url:"https://www.youtube.com/@TEDEd", feed:YT_FEED+"UCsooa4yRKGN_zEE8iknghZA", t:["sci","his","cul"], lv:1},
  {id:"yt-kurz", kind:"listen", yt:1, name:"Kurzgesagt (YouTube)", url:"https://www.youtube.com/@kurzgesagt", feed:YT_FEED+"UCsXVk37bltHxD1rDPwtNM8Q", t:["sci"], lv:1},
  {id:"yt-veritasium", kind:"listen", yt:1, name:"Veritasium (YouTube)", url:"https://www.youtube.com/@veritasium", feed:YT_FEED+"UCHnyfMqiRRG1u-2MsSQLbXA", t:["sci","tec"], lv:1},
  {id:"yt-vox", kind:"listen", yt:1, name:"Vox (YouTube)", url:"https://www.youtube.com/@Vox", feed:YT_FEED+"UCLXo7UDZvByw2ixzpQCufnA", t:["soc","pol"], lv:1},
  {id:"yt-economist", kind:"listen", yt:1, name:"The Economist (YouTube)", url:"https://www.youtube.com/@TheEconomist", feed:YT_FEED+"UC0p5jTq6Xx_DosDFxVXnWaQ", t:["eco","pol"], lv:2},
  {id:"yt-bigthink", kind:"listen", yt:1, name:"Big Think (YouTube)", url:"https://www.youtube.com/@bigthink", feed:YT_FEED+"UCvQECJukTDE2i6aCoMnS-Vg", t:["cul","sci"], lv:1},
  {id:"yt-crashcourse", kind:"listen", yt:1, name:"CrashCourse (YouTube)", url:"https://www.youtube.com/@crashcourse", feed:YT_FEED+"UCX6b17PVsYBQ0ip5gyeme-Q", t:["his","sci","eco"], lv:1},
  {id:"yt-dwdoc", kind:"listen", yt:1, name:"DW Documentary (YouTube)", url:"https://www.youtube.com/@DWDocumentary", feed:YT_FEED+"UCW39zufHfsuGgpLviKh297Q", t:["soc","pol","env"], lv:1},
  {id:"yt-pbs", kind:"listen", yt:1, name:"PBS NewsHour (YouTube)", url:"https://www.youtube.com/@PBSNewsHour", feed:YT_FEED+"UC6ZFN9Tx6xh-skXCuRHCDpQ", t:["pol","soc"], lv:1},
  {id:"yt-bloomberg-orig", kind:"listen", yt:1, name:"Bloomberg Originals (YouTube)", url:"https://www.youtube.com/@business", feed:YT_FEED+"UCUMZ7gohGI9HcU9VNsr2FJQ", t:["eco","tec"], lv:1},
  {id:"yt-wsj", kind:"listen", yt:1, name:"The Wall Street Journal (YouTube)", url:"https://www.youtube.com/@wsj", feed:YT_FEED+"UCK7tptUDHh-RYDsdxO1-5QQ", t:["eco","pol","tec"], lv:1},
  {id:"yt-johnnyharris", kind:"listen", yt:1, name:"Johnny Harris (YouTube)", url:"https://www.youtube.com/@johnnyharris", feed:YT_FEED+"UCmGSJVG3mCRXVOP4yZrU1Dw", t:["pol","his"], lv:1},
  {id:"yt-wendover", kind:"listen", yt:1, name:"Wendover Productions (YouTube)", url:"https://www.youtube.com/@Wendoverproductions", feed:YT_FEED+"UC9RM-iSvTu1uPJb8X5yp3EQ", t:["eco","tec"], lv:1},
  {id:"yt-polymatter", kind:"listen", yt:1, name:"PolyMatter (YouTube)", url:"https://www.youtube.com/@PolyMatter", feed:YT_FEED+"UCgNg3vwj3xt7QOrcIDaHdFg", t:["eco","pol"], lv:1},
  {id:"yt-asianometry", kind:"listen", yt:1, name:"Asianometry (YouTube)", url:"https://www.youtube.com/@Asianometry", feed:YT_FEED+"UC1LpsuAUaKoMzzJSEt5WImw", t:["tec","eco"], lv:2},
  {id:"yt-cnbc", kind:"listen", yt:1, name:"CNBC (YouTube)", url:"https://www.youtube.com/@CNBC", feed:YT_FEED+"UCvJJ_dzjViJCoLf5uKUTwoA", t:["eco"], lv:1},
  {id:"yt-schooloflife", kind:"listen", yt:1, name:"The School of Life (YouTube)", url:"https://www.youtube.com/@theschooloflifetv", feed:YT_FEED+"UC7IcJI8PUf5Z3zKxnZvTBog", t:["cul"], lv:1},
  {id:"yt-scishow", kind:"listen", yt:1, name:"SciShow (YouTube)", url:"https://www.youtube.com/@SciShow", feed:YT_FEED+"UCZYTClx2T1of7BRZ86-8fow", t:["sci","med"], lv:1},
  {id:"yt-realeng", kind:"listen", yt:1, name:"Real Engineering (YouTube)", url:"https://www.youtube.com/@RealEngineering", feed:YT_FEED+"UCR1IuLEqb6UEA_zQ81kwXfg", t:["tec","sci"], lv:1},
  {id:"yt-vsauce", kind:"listen", yt:1, name:"Vsauce (YouTube)", url:"https://www.youtube.com/@Vsauce", feed:YT_FEED+"UC6nSFpj9HTCZ5t-N3Rm3-HA", t:["sci","cul"], lv:1},
  {id:"yt-bbcnews", kind:"listen", yt:1, name:"BBC News (YouTube)", url:"https://www.youtube.com/@BBCNews", feed:YT_FEED+"UC16niRr50-MSBwiO3YDb3RA", t:["pol"], lv:1},
  {id:"yt-aljazeera", kind:"listen", yt:1, name:"Al Jazeera English (YouTube)", url:"https://www.youtube.com/@aljazeeraenglish", feed:YT_FEED+"UCNye-wNBqNL5ZzHSJj3l8Bg", t:["pol"], lv:1},
  {id:"yt-guardian", kind:"listen", yt:1, name:"The Guardian (YouTube)", url:"https://www.youtube.com/@guardian", feed:YT_FEED+"UCHpw8xwDNhU9gdohEcJu4aA", t:["soc","pol"], lv:1},
  {id:"yt-ft", kind:"listen", yt:1, name:"Financial Times (YouTube)", url:"https://www.youtube.com/@FinancialTimes", feed:YT_FEED+"UCoUxsWakJucWg46KW5RsvPw", t:["eco","pol"], lv:2},
  {id:"yt-bloombergtv", kind:"listen", yt:1, name:"Bloomberg Television (YouTube)", url:"https://www.youtube.com/@markets", feed:YT_FEED+"UCIALMKvObZNtJ6AmdCLP7Lg", t:["eco"], lv:1},
  {id:"yt-hbr", kind:"listen", yt:1, name:"Harvard Business Review (YouTube)", url:"https://www.youtube.com/@harvardbusinessreview", feed:YT_FEED+"UCWo4IA01TXzBeGJJKWHOG9g", t:["eco"], lv:1},
  {id:"yt-quanta", kind:"listen", yt:1, name:"Quanta Magazine (YouTube)", url:"https://www.youtube.com/@QuantaScienceChannel", feed:YT_FEED+"UCTpmmkp1E4nmZqWPS-dl5bg", t:["sci"], lv:2},
  {id:"yt-stanfordgsb", kind:"listen", yt:1, name:"Stanford GSB (YouTube)", url:"https://www.youtube.com/@stanfordgsb", feed:YT_FEED+"UCGwuxdEeCf0TIA2RbPOj-8g", t:["eco"], lv:1},
  {id:"yt-mit", kind:"listen", yt:1, name:"MIT (YouTube)", url:"https://www.youtube.com/@mit", feed:YT_FEED+"UCFe-pfe0a9bDvWy74Jd7vFg", t:["sci","tec"], lv:1},
];
const byRl={}; RL_SOURCES.forEach(s=>byRl[s.id]=s);

/* ---- 推薦(純関数) ----
   rl={topics:{t:1}, mute:{id:{on,at}}, last:{id:ymd}} / ymd=今日 / 戻り値=おすすめ順に並んだソース配列。
   スコア = 1 + 2×(興味と一致したテーマ数)  ─ 興味未設定なら全ソース同点
          − 3×(直近3日に出した)              ─ 同じソースが続かない
   同点は日付ハッシュ順(=同じ日は安定・翌日は入れ替わる)。「合わない」(mute.on)は除外 */
function rlDaysBetween(a, b){ // ymd文字列の差(日)
  return Math.round((new Date(b+"T00:00:00")-new Date(a+"T00:00:00"))/864e5);
}
function rlCandidates(sources, kind, rl, ymd){
  rl=rl||{}; const topics=rl.topics||{}, mute=rl.mute||{}, last=rl.last||{};
  const want=Object.keys(topics).filter(t=>topics[t]);
  return sources.filter(s=>s.kind===kind && !(mute[s.id] && mute[s.id].on)).map(s=>{
    let sc=1;
    if(want.length) sc+=2*s.t.filter(t=>topics[t]).length;
    if(last[s.id] && rlDaysBetween(last[s.id], ymd)>=0 && rlDaysBetween(last[s.id], ymd)<3) sc-=3;
    return {s, sc, h:hashStr(ymd+"|"+s.id)};
  }).sort((a,b)=>(b.sc-a.sc) || (a.h-b.h)).map(x=>x.s);
}
/* n番目の候補(「別の候補」で進める。末尾を越えたら先頭へ) */
function rlPick(kind, rl, ymd, n){
  const c=rlCandidates(RL_SOURCES, kind, rl, ymd);
  if(!c.length) return null;
  return c[((n||0)%c.length+c.length)%c.length];
}

/* ---- フィードの取り込み ---- */
/* 中継の順番(2026-09-20の疎通確認: rss2jsonが安定・alloriginsは日により不安定)。どれも無料・APIキー不要 */
const RL_PROXIES=[
  {name:"rss2json", url:f=>"https://api.rss2json.com/v1/api.json?rss_url="+encodeURIComponent(f), json:1},
  {name:"allorigins", url:f=>"https://api.allorigins.win/get?url="+encodeURIComponent(f), wrap:1},
  {name:"direct", url:f=>f},
];
/* テキストから素の文章を作る(HTMLタグ・空白の整理・長さの上限) */
function rlPlain(s, n){
  const d=document.createElement("div"); d.innerHTML=String(s||"");
  const t=(d.textContent||"").replace(/\s+/g," ").trim();
  return t.length>n? t.slice(0,n-1)+"…" : t;
}
/* rss2jsonのJSON → 共通形 [{t:題名, u:URL, d:日付(ISO), s:要約}] */
function rlParseJson(j){
  if(!j || j.status!=="ok" || !Array.isArray(j.items)) return null;
  return j.items.map(it=>({t:rlPlain(it.title, 160), u:it.link||(it.enclosure&&it.enclosure.link)||"",
    d:it.pubDate||"", s:rlPlain(it.description||it.content||"", 240)})).filter(x=>x.t && x.u);
}
/* RSS 2.0 / Atom(YouTube含む)のXML → 共通形 */
function rlParseXml(text){
  const doc=new DOMParser().parseFromString(text, "text/xml");
  if(doc.querySelector("parsererror")) return null;
  const pick=(el, names)=>{ for(const n of names){ const c=[...el.children].find(x=>x.localName===n); if(c) return c; } return null; };
  const items=[...doc.getElementsByTagName("item")].concat([...doc.getElementsByTagName("entry")]);
  return items.map(it=>{
    const title=pick(it,["title"]), link=pick(it,["link"]), enc=pick(it,["enclosure"]);
    let u=link? (link.getAttribute("href")||link.textContent) : "";
    if(!u && enc) u=enc.getAttribute("url")||"";
    const desc=pick(it,["description","summary","content","group"]);
    let s=desc? desc.textContent : "";
    if(desc && desc.localName==="group"){ const md=[...desc.children].find(x=>x.localName==="description"); s=md? md.textContent : ""; }
    const dt=pick(it,["pubDate","published","updated","date"]);
    return {t:rlPlain(title? title.textContent : "", 160), u:(u||"").trim(), d:dt? dt.textContent.trim() : "", s:rlPlain(s, 240)};
  }).filter(x=>x.t && x.u);
}
/* 端末キャッシュ(当日分・同期対象外)。ソースごとの最新10件 */
const RL_CACHE_KEY="tq_rlCache";
function rlCacheGet(id){
  try{
    const c=JSON.parse(localStorage.getItem(RL_CACHE_KEY)||"null");
    if(!c || c.d!==todayKey()) return null;
    return (c.s||{})[id]||null;
  }catch(e){ return null; }
}
function rlCachePut(id, items){
  try{
    let c=JSON.parse(localStorage.getItem(RL_CACHE_KEY)||"null");
    if(!c || c.d!==todayKey()) c={d:todayKey(), s:{}};
    c.s[id]=items.slice(0,10);
    localStorage.setItem(RL_CACHE_KEY, JSON.stringify(c));
  }catch(e){}
}
/* テストで差し替えられる取得の実体(既定=中継を順に試す)。戻り値=共通形の配列(取れなければ例外) */
var rlFetchImpl=null;
async function rlFetchRaw(src){
  let lastErr=null;
  for(const p of RL_PROXIES){
    try{
      const ctl=("AbortController" in window)? new AbortController() : null;
      const tm=ctl? setTimeout(()=>ctl.abort(), 9000) : null;
      const res=await fetch(p.url(src.feed), ctl? {signal:ctl.signal} : {});
      if(tm) clearTimeout(tm);
      if(!res.ok) throw new Error(p.name+" "+res.status);
      let items=null;
      if(p.json){ items=rlParseJson(await res.json()); }
      else if(p.wrap){ const j=await res.json(); items=rlParseXml(j.contents||""); }
      else items=rlParseXml(await res.text());
      if(items && items.length) return items;
      throw new Error(p.name+" empty");
    }catch(e){ lastErr=e; }
  }
  throw lastErr||new Error("fetch failed");
}
async function rlFetch(src){
  const c=rlCacheGet(src.id); if(c) return c;
  const items=await (rlFetchImpl? rlFetchImpl(src) : rlFetchRaw(src));
  rlCachePut(src.id, items);
  return items;
}
/* 日別の「読んだ・聴いた」本数(純関数・ymd→{r:読んだ, l:聴いた, n:合計})。
   今週の記録の📖/🎧印と今日の英語パネルの✓に使う(v5.10.2→v5.10.3で読む/聴くを分けた) */
function rlDoneByDay(rl){
  const out={}; const done=(rl&&rl.done)||{};
  for(const u in done){
    const e=done[u]; if(!e || !e.d) continue;
    const o=out[e.d]=out[e.d]||{r:0, l:0, n:0};
    if(e.k==="listen") o.l++; else o.r++;
    o.n++;
  }
  return out;
}
/* マス・パネル用の印: 読んだ=📖・聴いた=🎧(両方なら並ぶ) */
function rlMarks(o){ return o? (o.r? "📖":"")+(o.l? "🎧":"") : ""; }
/* これまでの記録(純関数): 新しい日→同じ日は新しい順(登録順が無いので題名順)。[{d,k,id,t,u}] */
function rlHistoryList(rl, max){
  const done=(rl&&rl.done)||{};
  const list=Object.keys(done).filter(u=>done[u] && done[u].d).map(u=>Object.assign({u}, done[u]));
  list.sort((a,b)=>(b.d>a.d? 1 : b.d<a.d? -1 : String(a.t).localeCompare(String(b.t))));
  return max? list.slice(0, max) : list;
}
/* 記録の一覧モーダル(v5.10.3): 日ごとに区切って📖/🎧・題名(リンク)・出典。◀で今日の英語へ */
function openRLHistory(){
  const list=rlHistoryList(G.rl, 200);
  const by=rlDoneByDay(G.rl);
  let r=0, l=0; for(const d in by){ r+=by[d].r; l+=by[d].l; }
  const md=k=>{ const dt=new Date(k+"T00:00:00"); return isNaN(dt)? k : (dt.getMonth()+1)+"/"+dt.getDate(); };
  let html="", last=null;
  list.forEach(e=>{
    if(e.d!==last){ last=e.d; html+='<div class="rlhday">'+md(e.d)+(e.d===todayKey()? "(今日)":"")+' <span class="small">'+rlMarks(by[e.d])+'</span></div>'; }
    const src=byRl[e.id];
    html+='<div class="myrow rlhrow"><span class="rlhk">'+(e.k==="listen"? "🎧":"📖")+'</span>'+
      '<div class="grow"><a class="rlhtitle" href="'+esc(e.u)+'" target="_blank" rel="noopener">'+esc(e.t||e.u)+'</a>'+
      (src? '<br><span class="small">'+esc(src.name)+'</span>':'')+'</div></div>';
  });
  openModal('<h3>📚 読んだ・聴いたの記録</h3>'+
    '<div class="small">📖 読んだ '+r+'本 ・ 🎧 聴いた '+l+'本'+(list.length<Object.keys(G.rl.done||{}).length? ' ・ 直近200本を表示':'')+'</div>'+
    (list.length? '<div class="panel" style="margin-top:8px">'+html+'</div>'
                : '<div class="empty">まだ記録がない ─ 今日の英語で読んだ・聴いたら ✓ を押そう</div>')+
    '<div class="row" style="margin-top:12px"><button class="btn" id="rlhBack">◀ 今日の英語</button></div>');
  $("rlhBack").onclick=openRLModal;
}
/* おすすめの1本: ソースの最新から「読んだ・聴いた」ものを飛ばした先頭 */
function rlChoose(items, rl){
  const done=(rl&&rl.done)||{};
  return items.find(it=>!done[it.u]) || items[0] || null;
}

/* ---- LLMへの依頼プロンプト(コピペ用) ----
   方針(実機FB): 解説・日本語訳・内容正誤問題はアプリでは作らず、ユーザーが使うLLMに頼む。
   その依頼文を素材の題名・URL・出典つきで用意し、そのまま貼れるようにする */
/* 学習の流れ(v5.11.0実機FB「プロンプトをどう活用して学習すればよいか不明瞭」):
   プロンプトは「いつ使うか」の順(①→②→③→④)で並べ、各型にwhen=使いどき、を持たせる。
   読む: 通読(辞書なし) → ①正誤問題で理解を確かめる → ②解説で語彙・構文を拾う → 分からなかった語を📝マイ単語へ
         → ③要約を書いて添削 → ④意見を英語で言う(二次対策) → ✓読んだ
   聴く: 字幕なしで1回 → ①正誤問題 → ②教材化(スクリプト・語彙・キーセンテンス)→ シャドーイング → 📝
         → ③ディクテーション採点 → ④意見を英語で → ✓聴いた
   ②の語彙一覧は「単語 — 日本語」の1行1語で返してもらう=📝マイ単語にそのまま貼れる */
const RL_VOCAB_FMT="最後に、3の語彙15個を「単語 — 日本語訳 — その語が使われている英文1文(本文からの引用)」の形式(1行1語・記号や番号なし・見出しの単語は原形)でまとめて一覧にしてください(単語帳アプリにそのまま貼り付けます)。";
const RL_PROMPTS={
  read:[
    {id:"tf", step:"①", name:"✅ 内容正誤問題", when:"読み終えた直後に。辞書なしで通読してから、理解できたかを問題で確かめる", tpl:(s,it)=>
      "次の英語記事について、英検1級の読解問題に近い形式で「内容正誤問題」を作ってください。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n・True / False / Not Given の3択で8問\n・最初は問題だけを出し、私が答えたら解答・解説(根拠の該当箇所の引用と日本語での説明)を示してください\n"+
      "・細部の言い換え(paraphrase)を含む、本文の精読が必要な問題にしてください\n"+
      "\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
    {id:"full", step:"②", name:"📚 解説フルセット", when:"答え合わせの後に。要約・語彙・構文の解説を読み、語彙一覧を📝マイ単語に貼り付ける", tpl:(s,it)=>
      "英検1級(CEFR C1)を目指す日本人学習者として、次の英語記事を教材にしたいです。記事を読んだうえで、以下を作ってください。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n1. 英語150語程度の要約と、その日本語訳\n"+
      "2. 記事の論旨(主張→根拠→結論)を3行で\n"+
      "3. 英検1級レベルの重要語彙・表現を15個(英語の定義・日本語訳・記事中の用例・言い換え)\n"+
      "4. 読解上つまずきやすい構文を3つ、文の骨格を示して解説\n"+
      "5. 内容正誤問題(True / False / Not Given)を5問、解答と根拠の該当箇所つき\n"+
      "6. この記事のテーマで英検1級二次の2分スピーチをするときの、主張と理由2つの例(英語)\n"+
      "\n"+RL_VOCAB_FMT+"\n\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
    {id:"sum", step:"③", name:"✍️ 要約の添削", when:"仕上げに。自分で英語の要約を書いて送り、添削してもらう(書く力)", tpl:(s,it)=>
      "次の英語記事を読み、私が英語で要約を書きます。まず私の要約を待ってください。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n私が要約を送ったら、①内容の抜け・誤読 ②文法・語法の誤り ③より自然で高度な表現への言い換え(英検1級レベル) の3点で添削し、"+
      "最後に模範要約(120語)を示してください。\n\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
    {id:"talk", step:"④", name:"🗣 意見を言う(二次対策)", when:"余裕があれば。記事のテーマについて英語で意見を述べ、質問と添削を受ける(話す力)", tpl:(s,it)=>
      "次の英語記事のテーマについて、英検1級二次試験(スピーチ+質疑)の練習をしたいです。あなたは面接官役です。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\nまず、記事のテーマから二次試験風のトピック(賛否が分かれる問い)を1つ出してください。私が英語で2分程度の意見(主張+理由2つ)を書いて送ります。"+
      "その後、面接官として英語で質問を2つずつ、計3往復してください。最後に、私の英語について ①論理の組み立て ②文法・語法 ③より高度な表現への言い換え の3点で講評してください。"+
      "\n\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
  ],
  listen:[
    {id:"tf", step:"①", name:"✅ 内容正誤問題", when:"字幕なしで1回聴いた直後に。聞き取れたかを問題で確かめる", tpl:(s,it)=>
      "次の英語の音声/動画について、英検1級のリスニング問題に近い形式で「内容正誤問題」を作ってください。"+
      "トランスクリプトを取得できない場合はそう伝えてください。貼り付けます。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n・True / False の2択で8問。最初は問題だけを出し、私が答えたら解答・解説(根拠の発言の引用と日本語での説明)を示してください\n"+
      "・話者の主張と根拠、数字や固有名詞、言い換えを問う問題を混ぜてください"},
    {id:"full", step:"②", name:"🎧 リスニング教材化", when:"答え合わせの後に。要約・語彙・キーセンテンスをもらい、シャドーイング。語彙一覧は📝マイ単語へ", tpl:(s,it)=>
      "英検1級(CEFR C1)を目指す日本人学習者として、次の英語の音声/動画をリスニング教材にしたいです。"+
      "内容(トランスクリプトや字幕)を取得できるなら、それを読んだうえで以下を作ってください。取得できない場合はそう伝えてください。トランスクリプトを貼り付けます。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n1. 内容の要約(英語100語+日本語)\n"+
      "2. 聞き取りのポイント(話の構成・話者の立場・結論)\n"+
      "3. 重要語彙・表現を15個(英語の定義・日本語訳・音声中の用例)\n"+
      "4. リスニング内容正誤問題(True / False)を5問、解答と根拠つき\n"+
      "5. シャドーイング用のキーセンテンス10文(短く・使い回せる言い回しを優先)\n"+
      "6. 音のつながり・弱形・脱落など、聞き取りにくい箇所があれば指摘\n"+
      "\n"+RL_VOCAB_FMT},
    {id:"dict", step:"③", name:"✍️ ディクテーション採点", when:"仕上げに。一部を書き起こして送り、聞き落としの原因を教えてもらう", tpl:(s,it)=>
      "次の英語の音声/動画で、私はディクテーション(聞き取って書き起こす練習)をします。まず私の書き起こしを待ってください。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n私が書き起こしを送ったら、正しいトランスクリプトと比較して、①聞き落とし・聞き違い ②その原因(弱形・連結・脱落・未知語など) ③復習用の言い回し10個 を示してください。"+
      "トランスクリプトを取得できない場合はそう伝えてください。貼り付けます。"},
    {id:"talk", step:"④", name:"🗣 意見を言う(二次対策)", when:"余裕があれば。話の内容について英語で意見を述べ、質問と添削を受ける(話す力)", tpl:(s,it)=>
      "次の英語の音声/動画のテーマについて、英検1級二次試験(スピーチ+質疑)の練習をしたいです。あなたは面接官役です。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\nまず、内容から二次試験風のトピック(賛否が分かれる問い)を1つ出してください。私が英語で2分程度の意見(主張+理由2つ)を書いて送ります。"+
      "その後、面接官として英語で質問を2つずつ、計3往復してください。最後に、私の英語について ①論理の組み立て ②文法・語法 ③より高度な表現への言い換え の3点で講評してください。"+
      "\n\nトランスクリプトを取得できない場合はそう伝えてください。貼り付けます。"},
  ],
};
/* 学習の流れ(モーダルの案内・カード下の1行) */
const RL_FLOW={
  read:{line:"通読 → ①正誤 → ②解説 → 📝単語 → ③要約 → ✓",
    steps:["<b>通読</b>: 🔗開いて辞書なしで最後まで読む(10〜15分)。要点を3行で頭に置く",
      "<b>① 内容正誤問題</b>: 📋プロンプトをLLMに貼り、問題に答える。理解の穴がここで見える",
      "<b>② 解説フルセット</b>: 答え合わせのあと、語彙・構文・論旨の解説を読む。<b>語彙一覧を📝マイ単語に貼る</b>と、翌日から4択に混ざる",
      "<b>③ 要約の添削</b>(余裕があれば): 英語で120語の要約を書いて送る。二次・英作文の練習になる",
      "<b>④ 意見を言う</b>(余裕があれば): 面接官役のLLMに英語で意見を述べ、講評をもらう",
      "<b>✓ 読んだ</b>: 記録に残る(今週の記録の📖)。目安は1日1本・30〜40分"]},
  listen:{line:"通し → ①正誤 → ②教材化 → シャドーイング → 📝 → ✓",
    steps:["<b>通し</b>: 🔗開いて字幕なしで1回聴く(10〜20分の1本、長ければ前半だけでよい)",
      "<b>① 内容正誤問題</b>: 📋プロンプトをLLMに貼り、問題に答える(トランスクリプトが取れないLLMには字幕を貼る)",
      "<b>② 教材化</b>: 要約・語彙・キーセンテンス10文をもらい、キーセンテンスをシャドーイング。<b>語彙一覧は📝マイ単語へ</b>",
      "<b>③ ディクテーション採点</b>(余裕があれば): 1〜2分ぶんを書き起こして送る。聞き落としの原因が分かる",
      "<b>④ 意見を言う</b>(余裕があれば): 面接官役のLLMに英語で意見を述べ、講評をもらう",
      "<b>✓ 聴いた</b>: 記録に残る(今週の記録の🎧)。目安は1日1本・20〜30分"]},
};
function rlPromptText(kind, promptId, src, item){
  const list=RL_PROMPTS[kind]||[];
  const p=list.find(x=>x.id===promptId)||list[0];
  return p? p.tpl(src, item) : "";
}
/* クリップボードへ(非対応・拒否ならテキストエリアを全選択して手動コピーを案内) */
function rlCopy(text, ta){
  const fallback=()=>{ if(ta){ ta.focus(); ta.select(); } toast("コピーできなかった ─ 全選択したので長押しでコピーしてください"); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>toast("📋 プロンプトをコピーした ─ LLMに貼り付けよう"), fallback);
  }else fallback();
}

/* ---- UI ---- */
let rlAlt={read:0, listen:0};   // 「別の候補」で進めた回数(セッション内)
let rlState={read:null, listen:null}; // {src, items|null, err}
function rlKindLabel(k){ return k==="read"? "📖 読む" : "🎧 聴く"; }
function rlSrcChips(s){
  return '<span class="rlchip lv">'+(s.lv>=2? "1級+" : "英検1級")+'</span>'+
    (s.pay? '<span class="rlchip pay">🔒一部有料</span>':'')+ // 掲載基準は無料のみ=通常は出ない(保険)
    s.t.map(t=>'<span class="rlchip">'+RL_TOPICS[t]+'</span>').join("");
}
function rlDateText(d){
  if(!d) return "";
  const t=new Date(d); if(isNaN(t)) return "";
  const days=Math.floor((Date.now()-t)/864e5);
  return days<=0? "今日" : days===1? "昨日" : days<7? days+"日前" : (t.getMonth()+1)+"/"+t.getDate();
}
/* ソースのおすすめを解決して状態に入れる(非同期)。done=描き直しのコールバック */
function rlLoad(kind, done){
  const src=rlPick(kind, G.rl, todayKey(), rlAlt[kind]);
  const st=rlState[kind]={src, items:null, err:null, loading:!!src};
  if(!src){ done(); return; }
  G.rl.last=G.rl.last||{};
  if(G.rl.last[src.id]!==todayKey()){ G.rl.last[src.id]=todayKey(); saveG(); } // 「直近に出した」の記録
  done();
  rlFetch(src).then(items=>{
    if(rlState[kind]!==st) return; // 別の候補に進んでいたら捨てる
    st.items=items; st.loading=false; done();
  }).catch(e=>{
    if(rlState[kind]!==st) return;
    st.err=String(e&&e.message||e); st.loading=false; done();
  });
}
/* ホームのパネル(2行: 読む/聴く)。タップでモーダル */
function rlFillHome(){
  const el=$("homeRL"); if(!el) return;
  const row=k=>{
    const st=rlState[k];
    let body;
    if(!st || !st.src) body='<span class="small">候補がない(⚙で「合わない」を見直す)</span>';
    else if(st.items){ const it=rlChoose(st.items, G.rl); body='<span class="rlt">'+esc(it? it.t : st.src.name)+'</span><span class="rls">'+esc(st.src.name)+'</span>'; }
    else if(st.err) body='<span class="rlt">'+esc(st.src.name)+'</span><span class="rls">最新の一覧を取れなかった ─ タップしてサイトへ</span>';
    else body='<span class="rlt">'+esc(st.src.name)+'</span><span class="rls">最新の記事を取得中…</span>';
    return '<div class="rlrow"><span class="rlk">'+rlKindLabel(k)+'</span>'+body+'</div>';
  };
  el.querySelector(".rlrows").innerHTML=row("read")+row("listen");
}
/* 未解決の種類だけ読み込む(解決済み・取得中・候補なし確定はそのまま)。doneは状態が進むたびに呼ばれる */
function rlEnsureLoaded(done){
  ["read","listen"].forEach(k=>{
    const st=rlState[k];
    if(st && (st.items || st.err || st.loading || st.src===null)) return;
    rlLoad(k, done);
  });
  done();
}
/* モーダル: 読む/聴くの2カード+興味のテーマ+合わないソース */
function openRLModal(){
  const render=()=>{
    if(!$("rlModal")) return; // 閉じられていたら描かない
    $("rlCards").innerHTML=rlCardHTML("read")+rlCardHTML("listen");
    rlBindCards();
  };
  openModal('<h3>📰 今日の英語 '+helpBtn("hlp-rl")+'</h3>'+
    helpNote("hlp-rl", '英検1級(CEFR C1)レベルの英語メディアから、<b>読む</b>(記事)と<b>聴く</b>(ポッドキャスト・YouTube)を毎日1本ずつおすすめする。'+
      '<b>すべて無料で全文を読める・全編を視聴できるソースだけ</b>(有料・閲読制限のあるメディアは載せていない)。'+
      '選び方は端末の中だけで完結(無料・通信は記事一覧の取得だけ): 「興味のあるテーマ」に合うソースを優先し、同じソースが3日続かないよう入れ替え、'+
      '日付で決まる順番なので同じ日に何度開いても同じおすすめ。合わないソースは「外す」で二度と出ない。<br><br>'+
      '<b>📋 LLMプロンプト</b>: 解説・語彙・内容正誤問題・要約の添削などを、あなたが使うLLM(ChatGPT・Claude・Gemini等)に頼むための依頼文。'+
      '題名とURLが入っているのでそのまま貼り付けるだけ。URLを開けないLLMには本文/トランスクリプトを続けて貼る。'+
      'このアプリは日本語訳や問題を自分では作らない(=無料・サーバーなし)。<b>学習の流れ</b>は下の「📘 進め方」に')+
    '<div id="rlModal"><div id="rlCards"></div>'+
    // 学習の流れ(v5.11.0実機FB): プロンプトをどの順で使うか
    foldSec("rlFlow", "📘 進め方(プロンプトをどう使うか)",
      '<div class="rlflow"><b>📖 読む(1日1本・30〜40分)</b><ol>'+RL_FLOW.read.steps.map(s=>'<li>'+s+'</li>').join("")+'</ol>'+
      '<b>🎧 聴く(1日1本・20〜30分)</b><ol>'+RL_FLOW.listen.steps.map(s=>'<li>'+s+'</li>').join("")+'</ol>'+
      '<div class="small">忙しい日は「通読(通し) → ①正誤 → ✓」だけでも十分。②以降は余裕のある日に。'+
      '分からなかった単語は<b>📝マイ単語</b>に貼るだけで、翌日から4択の学習に混ざる(意味は自動で取り込む)</div></div>', !G.rl.flowSeen)+
    '<button class="btn" id="rlMywBtn" style="margin-top:10px; width:100%">📝 分からなかった単語を登録<span class="hlsub">マイ単語 '+mywList().length+'語</span></button>'+
    foldSec("rlTopics", "🎛 興味のあるテーマ("+Object.keys(G.rl.topics||{}).filter(t=>G.rl.topics[t]).length+")",
      '<div class="small" style="margin-bottom:6px">選んだテーマに合うソースを優先する(未選択=全ソースから)</div>'+
      '<div class="rlchips">'+Object.keys(RL_TOPICS).map(t=>'<button class="wchip rltop'+(G.rl.topics[t]? " ksel":"")+'" data-t="'+t+'">'+RL_TOPICS[t]+'</button>').join("")+'</div>', false)+
    foldSec("rlMuted", "🔕 外したソース("+Object.keys(G.rl.mute||{}).filter(id=>G.rl.mute[id].on).length+")",
      '<div id="rlMuteList">'+rlMuteListHTML()+'</div>', false)+
    '<button class="btn" id="rlHistBtn" style="margin-top:10px; width:100%">📚 読んだ・聴いたの記録('+Object.keys(G.rl.done||{}).length+'本)</button>'+
    '<div class="small" style="margin-top:10px">ソース '+RL_SOURCES.filter(s=>s.kind==="read").length+'誌 ・ '+RL_SOURCES.filter(s=>s.kind==="listen").length+'番組。'+
      'すべて無料で読める・聴けるものだけ</div></div>');
  $("rlHistBtn").onclick=openRLHistory;
  $("rlMywBtn").onclick=()=>openMywAdd("", rlCurrentTitle("read")||rlCurrentTitle("listen"));
  if(!G.rl.flowSeen){ G.rl.flowSeen=1; saveG(); } // 進め方は初回だけ開いた状態で見せる(端末の好み)
  render();
  rlEnsureLoaded(()=>{ render(); rlFillHome(); });
  $("modal").querySelectorAll(".rltop").forEach(b=>{
    b.onclick=()=>{
      G.rl.topics[b.dataset.t]=G.rl.topics[b.dataset.t]? 0:1; saveG();
      b.classList.toggle("ksel", !!G.rl.topics[b.dataset.t]);
      rlAlt={read:0, listen:0}; rlState={read:null, listen:null};
      rlEnsureLoaded(()=>{ render(); rlFillHome(); });
    };
  });
  rlBindMuteList();
}
function rlMuteListHTML(){
  const ids=Object.keys(G.rl.mute||{}).filter(id=>G.rl.mute[id].on && byRl[id]);
  if(!ids.length) return '<div class="small">なし ─ カードの「外す」で、そのソースを今後のおすすめから除く</div>';
  return ids.map(id=>'<div class="myrow"><div class="grow small"><b>'+esc(byRl[id].name)+'</b></div>'+
    '<button class="btn mydel rlunmute" data-id="'+id+'">戻す</button></div>').join("");
}
function rlBindMuteList(){
  $("modal").querySelectorAll(".rlunmute").forEach(b=>{
    b.onclick=()=>{
      G.rl.mute[b.dataset.id]={on:0, at:Date.now()}; saveG();
      $("rlMuteList").innerHTML=rlMuteListHTML(); rlBindMuteList();
    };
  });
}
function rlCardHTML(kind){
  const st=rlState[kind];
  let inner;
  if(!st || !st.src){
    inner='<div class="empty">おすすめできるソースがない ─ 「外したソース」を戻すか、テーマを広げよう</div>';
  }else{
    const s=st.src;
    const it=st.items? rlChoose(st.items, G.rl) : null;
    const done=it && G.rl.done && G.rl.done[it.u];
    inner='<div class="rlsrc">'+esc(s.name)+' '+rlSrcChips(s)+'</div>'+
      (it
        ? '<a class="rltitle" href="'+esc(it.u)+'" target="_blank" rel="noopener">'+esc(it.t)+'</a>'+
          '<div class="rlmeta">'+(rlDateText(it.d)? rlDateText(it.d)+' ・ ':'')+(s.yt? "YouTube" : kind==="read"? "記事" : "ポッドキャスト")+(done? ' ・ <span class="qmas">✓ '+(kind==="read"?"読んだ":"聴いた")+'</span>':'')+'</div>'+
          (it.s? '<div class="rldesc">'+esc(it.s)+'</div>':'')+
          '<div class="rlmeta rlflowline">流れ: '+RL_FLOW[kind].line+'</div>'
        : st.err
          ? '<div class="rlmeta">最新の一覧を取得できなかった(通信・中継の都合)。サイトを直接開いて、気になる1本を選ぼう</div>'
          : '<div class="rlmeta">最新の一覧を取得中…</div>')+
      '<div class="rlbtns">'+
        '<a class="btn primary" href="'+esc(it? it.u : s.url)+'" target="_blank" rel="noopener">🔗 開く</a>'+
        '<button class="btn rlprompt" data-k="'+kind+'">📋 LLMプロンプト</button>'+
        '<button class="btn rlalt" data-k="'+kind+'">🔁 別の候補</button>'+
        (it? '<button class="btn rldone" data-k="'+kind+'"'+(done?' disabled':'')+'>✓ '+(kind==="read"?"読んだ":"聴いた")+'</button>':'')+
        '<button class="btn rlmute" data-k="'+kind+'" title="このソースを今後出さない">🔕 外す</button>'+
      '</div>';
  }
  return '<div class="rlcard" data-k="'+kind+'"><div class="rlhead">'+rlKindLabel(kind)+'</div>'+inner+'</div>';
}
function rlBindCards(){
  const m=$("modal");
  const rerender=()=>{ if($("rlCards")){ $("rlCards").innerHTML=rlCardHTML("read")+rlCardHTML("listen"); rlBindCards(); } rlFillHome(); };
  m.querySelectorAll(".rlalt").forEach(b=>{
    b.onclick=()=>{ const k=b.dataset.k; rlAlt[k]++; rlLoad(k, rerender); };
  });
  m.querySelectorAll(".rlmute").forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k, st=rlState[k]; if(!st||!st.src) return;
      G.rl.mute[st.src.id]={on:1, at:Date.now()}; saveG();
      toast("🔕 "+st.src.name+" を今後のおすすめから外した");
      rlLoad(k, rerender);
      if($("rlMuteList")){ $("rlMuteList").innerHTML=rlMuteListHTML(); rlBindMuteList(); }
    };
  });
  m.querySelectorAll(".rldone").forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k, st=rlState[k]; if(!st||!st.src||!st.items) return;
      const it=rlChoose(st.items, G.rl); if(!it) return;
      G.rl.done[it.u]={d:todayKey(), k, id:st.src.id, t:it.t.slice(0,80)}; saveG();
      toast(k==="read"? "📖 読んだ! 明日も1本" : "🎧 聴いた! 明日も1本");
      rerender();
    };
  });
  m.querySelectorAll(".rlprompt").forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k, st=rlState[k]; if(!st||!st.src) return;
      const it=(st.items && rlChoose(st.items, G.rl)) || {t:"(サイトで選んだ記事の題名)", u:st.src.url};
      openRLPrompt(k, st.src, it);
    };
  });
}
/* プロンプトの確認・編集・コピー(◀で今日の英語へ戻る) */
function openRLPrompt(kind, src, item){
  const list=RL_PROMPTS[kind];
  let curId=list[0].id;
  openModal('<h3>📋 LLMに頼む '+helpBtn("hlp-rlp")+'</h3>'+
    helpNote("hlp-rlp", 'あなたが使うLLM(ChatGPT・Claude・Gemini等)に貼り付ける依頼文。題名・出典・URLが入っている。'+
      'URLを開けないLLMには、続けて本文(またはトランスクリプト・字幕)を貼り付ける。文面は自由に書き換えてよい。<br>'+
      '①→②→③→④は使う順(流れ: '+RL_FLOW[kind].line+')。②の語彙一覧は「単語 — 日本語」で返るので、📝マイ単語にそのまま貼れる')+
    '<div class="seg metaseg rlpseg" id="rlpSeg">'+list.map((p,i)=>'<button data-p="'+p.id+'"'+(i===0?' class="active"':'')+'>'+p.step+' '+p.name.replace(/^\S+\s/,"")+'</button>').join("")+'</div>'+
    '<div class="small rlpwhen" id="rlpWhen"></div>'+
    '<div class="small" style="margin-bottom:6px">'+esc(src.name)+' ─ '+esc(item.t)+'</div>'+
    '<textarea id="rlpText" class="myta" rows="10"></textarea>'+
    '<div class="row" style="gap:10px; margin-top:12px">'+
    '<button class="btn" id="rlpBack">◀ 今日の英語</button>'+
    '<button class="btn" id="rlpMyw" title="LLMの語彙一覧を貼り付けて登録">📝 単語登録</button>'+
    '<button class="btn primary grow" id="rlpCopy">📋 コピー</button></div>');
  const ta=$("rlpText");
  const fill=()=>{
    ta.value=rlPromptText(kind, curId, src, item);
    const p=list.find(x=>x.id===curId)||list[0];
    $("rlpWhen").innerHTML='<b>'+p.step+' '+p.name+'</b> ─ '+p.when;
  };
  fill();
  $("rlpSeg").querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{
      curId=b.dataset.p;
      $("rlpSeg").querySelectorAll("button").forEach(x=>x.classList.toggle("active", x===b));
      fill();
    };
  });
  $("rlpCopy").onclick=()=>rlCopy(ta.value, ta);
  $("rlpBack").onclick=openRLModal;
  $("rlpMyw").onclick=()=>openMywAdd("", item.t);
}
