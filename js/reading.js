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
   ・LLMプロンプト: 記事/動画の題名・URL・出典を埋め込んだ依頼文(解説+語彙/英検形式の4択問題/要約の添削…)を
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
   種類が減っても「開いたら読めない」を出さないことを優先する。
   pay=会員限定の記事が混ざる媒体(v5.23.0・実機FB「有料会員にならないと読めない記事がたまに出る」→2026-09-25に最新記事を検査:
   Vox・Big Thinkに isAccessibleForFree=false の記事が混ざっていた)。候補から外す(longと同じ扱い・idはdone記録のため残す) */
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
  {id:"bigthink", pay:1, kind:"read", name:"Big Think", url:"https://bigthink.com", feed:"https://bigthink.com/feed/", t:["cul","sci"], lv:1},
  {id:"vox", pay:1, kind:"read", name:"Vox", url:"https://www.vox.com", feed:"https://www.vox.com/rss/index.xml", t:["soc","pol"], lv:1},
  {id:"ars", kind:"read", name:"Ars Technica", url:"https://arstechnica.com", feed:"https://feeds.arstechnica.com/arstechnica/index", t:["tec","sci"], lv:1},
  {id:"owid", kind:"read", name:"Our World in Data", url:"https://ourworldindata.org", feed:"https://ourworldindata.org/atom.xml", t:["soc","eco","env"], lv:1},
  {id:"marginalian", kind:"read", name:"The Marginalian", url:"https://www.themarginalian.org", feed:"https://www.themarginalian.org/feed/", t:["cul"], lv:2},
  {id:"jstor", kind:"read", name:"JSTOR Daily", url:"https://daily.jstor.org", feed:"https://daily.jstor.org/feed/", t:["his","cul"], lv:1},
  {id:"e360", kind:"read", name:"Yale Environment 360", url:"https://e360.yale.edu", feed:"https://e360.yale.edu/feed.xml", t:["env"], lv:2},
  {id:"grist", kind:"read", name:"Grist", url:"https://grist.org", feed:"https://grist.org/feed/", t:["env","pol"], lv:1},
  {id:"harvard-gaz", kind:"read", name:"The Harvard Gazette", url:"https://news.harvard.edu/gazette/", feed:"https://news.harvard.edu/gazette/feed/", t:["sci","soc","med"], lv:1},
  /* ---- 聴く: ポッドキャスト ---- */
  {id:"ted-audio", typ:14, kind:"listen", name:"TED Talks Daily", url:"https://www.ted.com/podcasts/ted-talks-daily", feed:"https://feeds.feedburner.com/TEDTalks_audio", t:["cul","sci","soc"], lv:1},
  {id:"ted-radio", long:1, kind:"listen", name:"TED Radio Hour (NPR)", url:"https://www.npr.org/programs/ted-radio-hour/", feed:"https://feeds.npr.org/510298/podcast.xml", t:["cul","sci","soc"], lv:1},
  {id:"hiddenbrain", long:1, kind:"listen", name:"Hidden Brain", url:"https://hiddenbrain.org", feed:"https://feeds.npr.org/510308/podcast.xml", t:["cul","med","soc"], lv:1},
  {id:"planetmoney", typ:25, kind:"listen", name:"Planet Money (NPR)", url:"https://www.npr.org/podcasts/510289/planet-money", feed:"https://feeds.npr.org/510289/podcast.xml", t:["eco"], lv:1},
  {id:"freakonomics", long:1, kind:"listen", name:"Freakonomics Radio", url:"https://freakonomics.com/series/freakonomics-radio/", feed:"https://feeds.simplecast.com/Y8lFbOT4", t:["eco","soc"], lv:1},
  {id:"bbc-global", typ:30, kind:"listen", name:"BBC Global News Podcast", url:"https://www.bbc.co.uk/programmes/p02nq0gn", feed:"https://podcasts.files.bbci.co.uk/p02nq0gn.rss", t:["pol"], lv:1},
  {id:"bbc-doc", typ:27, kind:"listen", name:"BBC The Documentary", url:"https://www.bbc.co.uk/programmes/p02nq0lx", feed:"https://podcasts.files.bbci.co.uk/p02nq0lx.rss", t:["soc","pol","cul"], lv:1},
  {id:"bbc-reith", long:1, kind:"listen", name:"BBC The Reith Lectures", url:"https://www.bbc.co.uk/programmes/b00729d9", feed:"https://podcasts.files.bbci.co.uk/b00729d9.rss", t:["cul","pol"], lv:2},
  {id:"bbc-inourtime", long:1, kind:"listen", name:"BBC In Our Time", url:"https://www.bbc.co.uk/programmes/b006qykl", feed:"https://podcasts.files.bbci.co.uk/b006qykl.rss", t:["his","cul","sci"], lv:2},
  {id:"bbc-bizdaily", typ:18, kind:"listen", name:"BBC Business Daily", url:"https://www.bbc.co.uk/programmes/p002vsxs", feed:"https://podcasts.files.bbci.co.uk/p002vsxs.rss", t:["eco"], lv:1},
  {id:"bbc-moreorless", typ:10, kind:"listen", name:"BBC More or Less", url:"https://www.bbc.co.uk/programmes/p02nrss1", feed:"https://podcasts.files.bbci.co.uk/p02nrss1.rss", t:["eco","soc"], lv:1},
  {id:"bbc-inquiry", typ:23, kind:"listen", name:"BBC The Inquiry", url:"https://www.bbc.co.uk/programmes/p029399x", feed:"https://podcasts.files.bbci.co.uk/p029399x.rss", t:["pol","soc"], lv:1},
  {id:"sciencevs", typ:30, kind:"listen", name:"Science Vs", url:"https://gimletmedia.com/shows/science-vs", feed:"https://feeds.megaphone.fm/sciencevs", t:["sci","med"], lv:1},
  {id:"99pi", typ:30, kind:"listen", name:"99% Invisible", url:"https://99percentinvisible.org", feed:"https://feeds.simplecast.com/BqbsxVfO", t:["cul","tec","his"], lv:1},
  {id:"radiolab", typ:30, kind:"listen", name:"Radiolab", url:"https://radiolab.org", feed:"https://feeds.simplecast.com/EmVW7VGp", t:["sci","cul"], lv:1},
  /* ---- 聴く: 短い番組(v5.23.0・実機FB「負荷を少なめにしたい日は1〜2分・時間があれば5〜10分・15分以上は厳しい」)。2026-09-25に疎通と長さを確認 ---- */
  {id:"npr-newsnow", typ:5, kind:"listen", name:"NPR News Now", url:"https://www.npr.org/podcasts/500005/npr-news-now", feed:"https://feeds.npr.org/500005/podcast.xml", t:["pol","soc"], lv:1},
  {id:"mw-wotd", typ:2, kind:"listen", name:"Merriam-Webster Word of the Day", url:"https://www.merriam-webster.com/word-of-the-day", feed:"https://www.merriam-webster.com/wotd/feed/rss2", t:["cul"], lv:1},
  {id:"npr-considerthis", typ:9, kind:"listen", name:"Consider This (NPR)", url:"https://www.npr.org/podcasts/510355/considerthis", feed:"https://feeds.npr.org/510355/podcast.xml", t:["pol","soc"], lv:1},
  {id:"mkt-morning", typ:7, kind:"listen", name:"Marketplace Morning Report", url:"https://www.marketplace.org/shows/marketplace-morning-report/", feed:"https://feeds.publicradio.org/public_feeds/marketplace-morning-report/rss/rss", t:["eco"], lv:1},
  {id:"bbc-witness", typ:10, kind:"listen", name:"BBC Witness History", url:"https://www.bbc.co.uk/programmes/p004t1hd", feed:"https://podcasts.files.bbci.co.uk/p004t1hd.rss", t:["his"], lv:1},
  /* ---- 聴く: YouTube(typ=動画の典型的な長さ・分。Atomフィードに長さがないので⏱の判定に使う・v5.23.0) ---- */
  {id:"yt-ted", kind:"listen", yt:1, typ:14, name:"TED (YouTube)", url:"https://www.youtube.com/@TED", feed:YT_FEED+"UCAuUUnT6oDeKwE6v1NGQxug", t:["cul","sci","soc"], lv:1},
  {id:"yt-teded", kind:"listen", yt:1, typ:5, name:"TED-Ed (YouTube)", url:"https://www.youtube.com/@TEDEd", feed:YT_FEED+"UCsooa4yRKGN_zEE8iknghZA", t:["sci","his","cul"], lv:1},
  {id:"yt-kurz", kind:"listen", yt:1, typ:12, name:"Kurzgesagt (YouTube)", url:"https://www.youtube.com/@kurzgesagt", feed:YT_FEED+"UCsXVk37bltHxD1rDPwtNM8Q", t:["sci"], lv:1},
  {id:"yt-veritasium", kind:"listen", yt:1, typ:25, name:"Veritasium (YouTube)", url:"https://www.youtube.com/@veritasium", feed:YT_FEED+"UCHnyfMqiRRG1u-2MsSQLbXA", t:["sci","tec"], lv:1},
  {id:"yt-vox", kind:"listen", yt:1, typ:10, name:"Vox (YouTube)", url:"https://www.youtube.com/@Vox", feed:YT_FEED+"UCLXo7UDZvByw2ixzpQCufnA", t:["soc","pol"], lv:1},
  {id:"yt-economist", kind:"listen", yt:1, typ:10, name:"The Economist (YouTube)", url:"https://www.youtube.com/@TheEconomist", feed:YT_FEED+"UC0p5jTq6Xx_DosDFxVXnWaQ", t:["eco","pol"], lv:2},
  {id:"yt-bigthink", kind:"listen", yt:1, typ:8, name:"Big Think (YouTube)", url:"https://www.youtube.com/@bigthink", feed:YT_FEED+"UCvQECJukTDE2i6aCoMnS-Vg", t:["cul","sci"], lv:1},
  {id:"yt-crashcourse", kind:"listen", yt:1, typ:12, name:"CrashCourse (YouTube)", url:"https://www.youtube.com/@crashcourse", feed:YT_FEED+"UCX6b17PVsYBQ0ip5gyeme-Q", t:["his","sci","eco"], lv:1},
  {id:"yt-dwdoc", long:1, kind:"listen", yt:1, name:"DW Documentary (YouTube)", url:"https://www.youtube.com/@DWDocumentary", feed:YT_FEED+"UCW39zufHfsuGgpLviKh297Q", t:["soc","pol","env"], lv:1},
  {id:"yt-pbs", long:1, kind:"listen", yt:1, name:"PBS NewsHour (YouTube)", url:"https://www.youtube.com/@PBSNewsHour", feed:YT_FEED+"UC6ZFN9Tx6xh-skXCuRHCDpQ", t:["pol","soc"], lv:1},
  {id:"yt-bloomberg-orig", kind:"listen", yt:1, typ:12, name:"Bloomberg Originals (YouTube)", url:"https://www.youtube.com/@business", feed:YT_FEED+"UCUMZ7gohGI9HcU9VNsr2FJQ", t:["eco","tec"], lv:1},
  {id:"yt-wsj", kind:"listen", yt:1, typ:8, name:"The Wall Street Journal (YouTube)", url:"https://www.youtube.com/@wsj", feed:YT_FEED+"UCK7tptUDHh-RYDsdxO1-5QQ", t:["eco","pol","tec"], lv:1},
  {id:"yt-johnnyharris", kind:"listen", yt:1, typ:25, name:"Johnny Harris (YouTube)", url:"https://www.youtube.com/@johnnyharris", feed:YT_FEED+"UCmGSJVG3mCRXVOP4yZrU1Dw", t:["pol","his"], lv:1},
  {id:"yt-wendover", kind:"listen", yt:1, typ:20, name:"Wendover Productions (YouTube)", url:"https://www.youtube.com/@Wendoverproductions", feed:YT_FEED+"UC9RM-iSvTu1uPJb8X5yp3EQ", t:["eco","tec"], lv:1},
  {id:"yt-polymatter", kind:"listen", yt:1, typ:15, name:"PolyMatter (YouTube)", url:"https://www.youtube.com/@PolyMatter", feed:YT_FEED+"UCgNg3vwj3xt7QOrcIDaHdFg", t:["eco","pol"], lv:1},
  {id:"yt-asianometry", kind:"listen", yt:1, typ:18, name:"Asianometry (YouTube)", url:"https://www.youtube.com/@Asianometry", feed:YT_FEED+"UC1LpsuAUaKoMzzJSEt5WImw", t:["tec","eco"], lv:2},
  {id:"yt-cnbc", long:1, kind:"listen", yt:1, name:"CNBC (YouTube)", url:"https://www.youtube.com/@CNBC", feed:YT_FEED+"UCvJJ_dzjViJCoLf5uKUTwoA", t:["eco"], lv:1},
  {id:"yt-schooloflife", kind:"listen", yt:1, typ:6, name:"The School of Life (YouTube)", url:"https://www.youtube.com/@theschooloflifetv", feed:YT_FEED+"UC7IcJI8PUf5Z3zKxnZvTBog", t:["cul"], lv:1},
  {id:"yt-scishow", kind:"listen", yt:1, typ:8, name:"SciShow (YouTube)", url:"https://www.youtube.com/@SciShow", feed:YT_FEED+"UCZYTClx2T1of7BRZ86-8fow", t:["sci","med"], lv:1},
  {id:"yt-realeng", kind:"listen", yt:1, typ:18, name:"Real Engineering (YouTube)", url:"https://www.youtube.com/@RealEngineering", feed:YT_FEED+"UCR1IuLEqb6UEA_zQ81kwXfg", t:["tec","sci"], lv:1},
  {id:"yt-vsauce", kind:"listen", yt:1, typ:20, name:"Vsauce (YouTube)", url:"https://www.youtube.com/@Vsauce", feed:YT_FEED+"UC6nSFpj9HTCZ5t-N3Rm3-HA", t:["sci","cul"], lv:1},
  {id:"yt-bbcnews", long:1, kind:"listen", yt:1, name:"BBC News (YouTube)", url:"https://www.youtube.com/@BBCNews", feed:YT_FEED+"UC16niRr50-MSBwiO3YDb3RA", t:["pol"], lv:1},
  {id:"yt-aljazeera", long:1, kind:"listen", yt:1, name:"Al Jazeera English (YouTube)", url:"https://www.youtube.com/@aljazeeraenglish", feed:YT_FEED+"UCNye-wNBqNL5ZzHSJj3l8Bg", t:["pol"], lv:1},
  {id:"yt-guardian", kind:"listen", yt:1, typ:8, name:"The Guardian (YouTube)", url:"https://www.youtube.com/@guardian", feed:YT_FEED+"UCHpw8xwDNhU9gdohEcJu4aA", t:["soc","pol"], lv:1},
  {id:"yt-ft", kind:"listen", yt:1, typ:8, name:"Financial Times (YouTube)", url:"https://www.youtube.com/@FinancialTimes", feed:YT_FEED+"UCoUxsWakJucWg46KW5RsvPw", t:["eco","pol"], lv:2},
  {id:"yt-bloombergtv", long:1, kind:"listen", yt:1, name:"Bloomberg Television (YouTube)", url:"https://www.youtube.com/@markets", feed:YT_FEED+"UCIALMKvObZNtJ6AmdCLP7Lg", t:["eco"], lv:1},
  {id:"yt-hbr", kind:"listen", yt:1, typ:5, name:"Harvard Business Review (YouTube)", url:"https://www.youtube.com/@harvardbusinessreview", feed:YT_FEED+"UCWo4IA01TXzBeGJJKWHOG9g", t:["eco"], lv:1},
  {id:"yt-quanta", kind:"listen", yt:1, typ:20, name:"Quanta Magazine (YouTube)", url:"https://www.youtube.com/@QuantaScienceChannel", feed:YT_FEED+"UCTpmmkp1E4nmZqWPS-dl5bg", t:["sci"], lv:2},
  {id:"yt-stanfordgsb", long:1, kind:"listen", yt:1, name:"Stanford GSB (YouTube)", url:"https://www.youtube.com/@stanfordgsb", feed:YT_FEED+"UCGwuxdEeCf0TIA2RbPOj-8g", t:["eco"], lv:1},
  {id:"yt-mit", kind:"listen", yt:1, typ:4, name:"MIT (YouTube)", url:"https://www.youtube.com/@mit", feed:YT_FEED+"UCFe-pfe0a9bDvWy74Jd7vFg", t:["sci","tec"], lv:1},
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
/* v5.19.0: long(1回がほぼ常に30分超の番組・長い動画が混ざるチャンネル)は候補にしない(実機FB「30分以上のポッドキャストは勉強しづらい」)。
   v5.23.0: pay(会員限定の記事が混ざる媒体)と、典型的な長さ(typ)が⏱の上限を超えるソースも候補にしない。
   「直近に出した」の減点は昨日・一昨日だけ(同じ日は減点しない=以前は今日出した瞬間に減点され、開き直すと別のソースに変わっていた) */
function rlCandidates(sources, kind, rl, ymd){
  rl=rl||{}; const topics=rl.topics||{}, mute=rl.mute||{}, last=rl.last||{};
  const want=Object.keys(topics).filter(t=>topics[t]);
  const maxSec=rlMaxSec(rl);
  return sources.filter(s=>s.kind===kind && !s.long && !s.pay && !(s.typ && s.typ*60>maxSec) && !(mute[s.id] && mute[s.id].on)).map(s=>{
    let sc=1;
    if(want.length) sc+=2*s.t.filter(t=>topics[t]).length;
    if(last[s.id] && rlDaysBetween(last[s.id], ymd)>0 && rlDaysBetween(last[s.id], ymd)<3) sc-=3;
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
/* 番組の長さ(v5.19.0→v5.23.0): 聴くは「⏱ 長さ」で選んだ上限以内の回だけおすすめする(実機FB「負荷を少なめにしたい日は1〜2分、
   時間があれば5〜10分。15分以上の音声は正直厳しい」)。段=RL_LEN(分)・既定=RL_LEN_DEFAULT・記録=G.rl.lmax(分・lmaxAtが新しい側が同期で勝つ)。
   sec=0は「長さ不明」(YouTubeのAtomには長さがない)=チャンネルの典型的な長さ(typ・分)で判定し、typも無ければ通す */
const RL_MAX_SEC=30*60;    // いちばん長い段(=v5.19.0の上限)
const RL_LEN=[5,15,30];    // ⏱の段(分)
const RL_LEN_DEFAULT=15;
function rlMaxSec(rl){ const m=rl && rl.lmax; return (RL_LEN.indexOf(m)>=0? m : RL_LEN_DEFAULT)*60; }
function rlLenText(rl){ return (rlMaxSec(rl)/60)+"分以内"; }
/* 素材が⏱の上限に収まるか(純関数): 長さが分かればそれで・不明ならソースの典型(typ)で・どちらも無ければ通す */
function rlFits(it, src, rl){
  const max=rlMaxSec(rl);
  if(it && it.sec>0) return it.sec<=max;
  if(src && src.typ) return src.typ*60<=max;
  return true;
}
/* itunes:duration の値 → 秒(純関数)。"1620"・"27:00"・"1:02:30"・数値。解釈できなければ0 */
function rlDurSec(v){
  if(v==null || v==="") return 0;
  if(typeof v==="number") return v>0? Math.round(v) : 0;
  const s=String(v).trim(); if(!s) return 0;
  if(/^\d+(\.\d+)?$/.test(s)) return Math.round(+s);
  if(!/^\d+(:\d+)+$/.test(s)) return 0;
  return s.split(":").reduce((a,b)=>a*60+(+b), 0);
}
/* rss2jsonのJSON → 共通形 [{t:題名, u:URL, d:日付(ISO), s:要約, sec:長さ(秒・不明は0)}] */
function rlParseJson(j){
  if(!j || j.status!=="ok" || !Array.isArray(j.items)) return null;
  return j.items.map(it=>({t:rlPlain(it.title, 160), u:it.link||(it.enclosure&&it.enclosure.link)||"",
    d:it.pubDate||"", s:rlPlain(it.description||it.content||"", 240),
    sec:rlDurSec(it.enclosure && it.enclosure.duration)})).filter(x=>x.t && x.u);
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
    const dur=pick(it,["duration"]); // itunes:duration(ポッドキャスト)
    return {t:rlPlain(title? title.textContent : "", 160), u:(u||"").trim(), d:dt? dt.textContent.trim() : "", s:rlPlain(s, 240),
            sec:rlDurSec(dur? dur.textContent : "")};
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
/* おすすめの1本: ソースの最新から「読んだ・聴いた」ものを飛ばした先頭。
   聴く(kind="listen")は⏱の上限を超える回を除く(v5.19.0→v5.23.0: rlFits=長さ不明ならsrcの典型typで判定)。該当がなければnull(呼び元が次の候補へ進む) */
function rlChoose(items, rl, kind, src){
  const done=(rl&&rl.done)||{};
  const c=(items||[]).filter(it=>!(kind==="listen" && !rlFits(it, src, rl)));
  return c.find(it=>!done[it.u]) || c[0] || null;
}

/* ---- LLMへの依頼プロンプト(コピペ用) ----
   方針(実機FB): 解説・日本語訳・内容一致問題はアプリでは作らず、ユーザーが使うLLMに頼む。
   その依頼文を素材の題名・URL・出典つきで用意し、そのまま貼れるようにする */
/* 学習の流れ(v5.11.0実機FB「プロンプトをどう活用して学習すればよいか不明瞭」):
   プロンプトは「いつ使うか」の順(①→②→③→④)で並べ、各型にwhen=使いどき、を持たせる。
   読む: 通読(辞書なし) → ①4択問題(英検形式・v5.23.0。以前はTrue/False/Not Given)で理解を確かめる → ②解説で語彙・構文を拾う → 分からなかった語を📝マイ単語へ
         → ③要約を書いて添削 → ④意見を英語で言う(二次対策) → ✓読んだ
   聴く: 字幕なしで1回 → ①4択問題 → ②教材化(スクリプト・語彙・キーセンテンス)→ シャドーイング → 📝
         → ③ディクテーション採点 → ④意見を英語で → ✓聴いた
   ②の語彙一覧は「単語 — 日本語」の1行1語で返してもらう=📝マイ単語にそのまま貼れる */
const RL_VOCAB_FMT="最後に、3の語彙15個を「単語 — 日本語訳 — その語が使われている英文1文(本文からの引用・20語以内。長い文はその語を含む部分だけに切り詰める)」の形式(1行1語・記号や番号なし・見出しの単語は原形)でまとめて一覧にしてください(単語帳アプリにそのまま貼り付けます。例文は画面の2行に収まる長さで)。";
const RL_PROMPTS={
  read:[
    {id:"tf", step:"①", name:"✅ 読解問題(英検形式・4択)", when:"読み終えた直後に。辞書なしで通読してから、理解できたかを英検と同じ形式の問題で確かめる", tpl:(s,it)=>
      "次の英語記事を素材に、英検1級一次試験の読解問題と同じ形式で、4択(選択肢1〜4)の問題を合計6問作ってください。問いと選択肢は英語で、英検1級の問題文と同じ書き方にしてください。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n【Part 2形式(空所補充)を2問】本文の1文の一部(5〜8語の句)を空所( )にし、入る語句を4択で。前後の論理のつながり(逆接・因果・具体例・言い換え)で決まる問題にし、"+
      "誤りの選択肢は文法的には入るが文脈に合わないものにしてください(例: 「(26) 1 this mainly benefited other insects / 2 the timing was not a coincidence …」)\n"+
      "【Part 3形式(内容一致)を4問】問いの型を混ぜてください: 「Based on the information in the ◯ paragraph, what can be inferred about …?」(推測)・"+
      "「What is true about …?」(内容一致)・「The author suggests that …」(文の完成)・「Which of the following best describes …?」(段落の要点)。"+
      "選択肢は本文の言い換え(paraphrase)にし、誤りの選択肢は「本文の語を使いつつ内容が違う」「言いすぎ」「因果の逆転」のように紛らわしくしてください\n"+
      "・最初は問題だけを出し、私が答えたら、解答・根拠の該当箇所の引用・日本語での解説(正解の理由と、他の選択肢が誤りの理由)を示してください\n"+
      "\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
    {id:"full", step:"②", name:"📚 解説フルセット", when:"答え合わせの後に。要約・語彙・構文の解説を読み、語彙一覧を📝マイ単語に貼り付ける", tpl:(s,it)=>
      "英検1級(CEFR C1)を目指す日本人学習者として、次の英語記事を教材にしたいです。記事を読んだうえで、以下を作ってください。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n1. 英語100語程度の要約(英検1級Part 4「English Summary」の分量=90〜110語)と、その日本語訳\n"+
      "2. 記事の論旨(主張→根拠→結論)を3行で\n"+
      "3. 英検1級レベルの重要語彙・表現を15個(英語の定義・日本語訳・記事中の用例・言い換え)\n"+
      "4. 読解上つまずきやすい構文を3つ、文の骨格を示して解説\n"+
      "5. 英検1級形式の内容一致4択問題を4問(問いと選択肢は英語)、解答と根拠の該当箇所つき\n"+
      "6. この記事のテーマから、英検1級Part 5(英作文)と同じ形のTOPIC(「Agree or disagree: …」または「Should …?」)を1つと、賛成・反対それぞれの理由3つの例(英語・1行ずつ)\n"+
      "\n"+RL_VOCAB_FMT+"\n\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
    {id:"sum", step:"③", name:"✍️ 要約の添削(Part 4形式・90〜110語)", when:"仕上げに。英検1級Part 4「English Summary」と同じ条件で要約を書いて送り、採点と添削を受ける(書く力)", tpl:(s,it)=>
      "次の英語記事を素材に、英検1級一次試験Part 4(English Summary)の練習をします。条件は本番と同じ「Summarize it in your own words as far as possible in English, between 90 and 110 words」です。まず私の要約を待ってください。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n私が要約を送ったら、英検の4つの観点(内容=要点の網羅と余計な情報の有無・構成=論理の流れと接続・語彙=本文の丸写しでない言い換え・文法)で各観点を講評し、"+
      "語数を数えて90〜110語に収まっているかも確かめてください。①内容の抜け・誤読 ②文法・語法の誤り ③より自然で高度な表現への言い換え(英検1級レベル) の順に添削し、"+
      "最後に模範要約(100語前後・本文の語を言い換えたもの)を示してください。\n\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
    {id:"talk", step:"④", name:"🗣 意見を書く・言う(英作文/二次)", when:"余裕があれば。記事のテーマで英検1級Part 5(英作文200〜240語・理由3つ)か二次試験(2分スピーチ+質疑)の練習(書く力・話す力)", tpl:(s,it)=>
      "次の英語記事のテーマで、英検1級の英作文(一次Part 5)またはスピーチ(二次試験)の練習をしたいです。\n"+
      "\n記事: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\nまず、記事のテーマから英検1級Part 5と同じ形のTOPICを1つ出してください(「Agree or disagree: Governments should …」または「Should …?」の形・社会的に賛否が分かれる問い)。"+
      "私はどちらかで答えます:\n(A) 英作文: 200〜240語・理由3つ・序論/本論/結論の構成(本番と同じ条件)\n(B) スピーチ: 2分程度の意見(主張+理由2つ)\n"+
      "(A)を送ったら、英検の4観点(内容・構成・語彙・文法)で各観点を0〜8点で採点して理由を添え、語数を確かめ、①論理の組み立て ②文法・語法 ③より高度な表現への言い換え の順に添削し、最後に模範解答(220語)を示してください。\n"+
      "(B)を送ったら、あなたは面接官役として英語で質問を2つずつ、計3往復してください。最後に、私の英語について ①論理の組み立て ②文法・語法 ③より高度な表現への言い換え の3点で講評してください。"+
      "\n\nURLを開けない場合はそう伝えてください。本文を貼り付けます。"},
  ],
  listen:[
    {id:"tf", step:"①", name:"✅ リスニング問題(英検形式・4択)", when:"字幕なしで1回聴いた直後に。聞き取れたかを英検Part 2/4と同じ形式の問題で確かめる", tpl:(s,it)=>
      "次の英語の音声/動画について、英検1級のリスニング問題と同じ形式で問題を作ってください。基本はPart 2(ひとつの話に対する内容一致・4択)の形式で、"+
      "話がインタビューや対談ならPart 4(インタビューの内容一致・4択)の形式を2問混ぜてください。"+
      "トランスクリプトを取得できない場合はそう伝えてください。貼り付けます。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n・4択(選択肢1〜4)で6問。問いと選択肢は英語で、英検1級の問題文と同じ書き方(「What is one thing the speaker says about …?」"+
      "「What does the speaker imply about …?」「What did the study find?」など)にしてください\n"+
      "・話者の主張と根拠、数字や固有名詞、言い換えを問う問題を混ぜ、誤りの選択肢は話に出た語を使いつつ内容が違うものにしてください\n"+
      "・最初は問題だけを出し、私が答えたら、解答・根拠の発言の引用・日本語での解説(正解の理由と、他の選択肢が誤りの理由)を示してください"},
    {id:"full", step:"②", name:"🎧 リスニング教材化", when:"答え合わせの後に。要約・語彙・キーセンテンスをもらい、シャドーイング。語彙一覧は📝マイ単語へ", tpl:(s,it)=>
      "英検1級(CEFR C1)を目指す日本人学習者として、次の英語の音声/動画をリスニング教材にしたいです。"+
      "内容(トランスクリプトや字幕)を取得できるなら、それを読んだうえで以下を作ってください。取得できない場合はそう伝えてください。トランスクリプトを貼り付けます。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n1. 内容の要約(英語100語+日本語)\n"+
      "2. 聞き取りのポイント(話の構成・話者の立場・結論)\n"+
      "3. 重要語彙・表現を15個(英語の定義・日本語訳・音声中の用例)\n"+
      "4. 英検1級リスニング形式の内容一致4択問題を4問(問いと選択肢は英語)、解答と根拠つき\n"+
      "5. シャドーイング用のキーセンテンス10文(短く・使い回せる言い回しを優先)\n"+
      "6. 音のつながり・弱形・脱落など、聞き取りにくい箇所があれば指摘\n"+
      "\n"+RL_VOCAB_FMT},
    {id:"dict", step:"③", name:"✍️ ディクテーション採点", when:"仕上げに。一部を書き起こして送り、聞き落としの原因を教えてもらう", tpl:(s,it)=>
      "次の英語の音声/動画で、私はディクテーション(聞き取って書き起こす練習)をします。まず私の書き起こしを待ってください。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\n私が書き起こしを送ったら、正しいトランスクリプトと比較して、①聞き落とし・聞き違い ②その原因(弱形・連結・脱落・未知語など) ③復習用の言い回し10個 を示してください。"+
      "トランスクリプトを取得できない場合はそう伝えてください。貼り付けます。"},
    {id:"talk", step:"④", name:"🗣 意見を書く・言う(英作文/二次)", when:"余裕があれば。話のテーマで英検1級Part 5(英作文200〜240語・理由3つ)か二次試験(2分スピーチ+質疑)の練習(書く力・話す力)", tpl:(s,it)=>
      "次の英語の音声/動画のテーマで、英検1級の英作文(一次Part 5)またはスピーチ(二次試験)の練習をしたいです。\n"+
      "\n題名: "+it.t+"\n出典: "+s.name+"\nURL: "+it.u+"\n"+
      "\nまず、内容から英検1級Part 5と同じ形のTOPICを1つ出してください(「Agree or disagree: …」または「Should …?」の形・社会的に賛否が分かれる問い)。"+
      "私はどちらかで答えます:\n(A) 英作文: 200〜240語・理由3つ・序論/本論/結論の構成(本番と同じ条件)\n(B) スピーチ: 2分程度の意見(主張+理由2つ)\n"+
      "(A)を送ったら、英検の4観点(内容・構成・語彙・文法)で各観点を0〜8点で採点して理由を添え、語数を確かめ、①論理の組み立て ②文法・語法 ③より高度な表現への言い換え の順に添削し、最後に模範解答(220語)を示してください。\n"+
      "(B)を送ったら、あなたは面接官役として英語で質問を2つずつ、計3往復してください。最後に、私の英語について ①論理の組み立て ②文法・語法 ③より高度な表現への言い換え の3点で講評してください。"+
      "\n\nトランスクリプトを取得できない場合はそう伝えてください。貼り付けます。"},
  ],
};
/* 学習の流れ(モーダルの案内・カード下の1行)。
   v5.20.1(実機FB「進め方の説明がごちゃついてスマホで読みにくい」): 手順は{t:見出し, d:説明, opt:余裕があれば}に分け、
   番号つきの段組み(rlFlowHTML)で描く。見出しは太字1行・説明は薄い色で下に=一目で手順が数えられる */
const RL_FLOW={
  read:{line:"通読 → ①4択 → ②解説 → 📝単語 → ③要約 → ✓", head:"📖 読む", time:"1日1本・30〜40分",
    steps:[{t:"通読", d:"🔗開いて辞書なしで最後まで読む(10〜15分)。要点を3行で頭に置く"},
      {t:"① 読解問題(英検形式)", d:"📋プロンプトをLLMに貼り、一次のPart 2(空所補充)2問+Part 3(内容一致)4問に答える。理解の穴がここで見える"},
      {t:"② 解説フルセット", d:"答え合わせのあと、語彙・構文・論旨の解説を読む。語彙一覧を📝マイ単語に貼ると、翌日から4択に混ざる"},
      {t:"③ 要約の添削", d:"一次Part 4と同じ条件(90〜110語・自分の言葉で)で要約を書いて送り、4観点(内容・構成・語彙・文法)で採点と添削を受ける", opt:1},
      {t:"④ 意見を書く・言う", d:"Part 5と同じ形のTOPICで、英作文(200〜240語・理由3つ)か2分スピーチ(二次)。採点と講評をもらう", opt:1},
      {t:"✓ 読んだ", d:"記録に残る(今週の記録の📖)"}]},
  listen:{line:"通し → ①4択 → ②教材化 → シャドーイング → 📝 → ✓", head:"🎧 聴く", time:"1日1本・20〜30分",
    steps:[{t:"通し", d:"🔗開いて字幕なしで1回聴く(おすすめはカードの⏱で選んだ長さ以内の回だけ・既定15分。長く感じたら前半だけでよい)"},
      {t:"① リスニング問題(英検形式)", d:"📋プロンプトをLLMに貼り、Part 2(話の内容一致)形式の4択6問に答える。対談ならPart 4形式も(トランスクリプトが取れないLLMには字幕を貼る)"},
      {t:"② 教材化", d:"要約・語彙・キーセンテンス10文をもらい、キーセンテンスをシャドーイング。語彙一覧は📝マイ単語へ"},
      {t:"③ ディクテーション採点", d:"1〜2分ぶんを書き起こして送る。聞き落としの原因が分かる", opt:1},
      {t:"④ 意見を書く・言う", d:"Part 5と同じ形のTOPICで、英作文(200〜240語・理由3つ)か2分スピーチ(二次)。採点と講評をもらう", opt:1},
      {t:"✓ 聴いた", d:"記録に残る(今週の記録の🎧)"}]},
};
/* 時間がない日の最低限(v5.19.0の文言をv5.20.1で箇条書きに) */
const RL_FLOW_MIN=[
  {t:"10分", d:"読む・聴くのどちらか1本だけ。記事は冒頭3段落(結論が出るところまで)を辞書なしで/音声は前半10分を字幕なしで → ✓。4択問題は省く"},
  {t:"15〜20分", d:"通読(通し) → ①英検形式の問題(6問)だけ → ✓"},
  {t:"どの日も", d:"分からなかった語を1〜2個だけ📝マイ単語へ(翌日から4択に混ざる)。②解説・③要約・④英作文/スピーチは余裕のある日(週1回でよい)にまとめて。毎日ゼロにしないことが完走より効く"},
];
/* 進め方の中身(純関数・HTML): 読む/聴く/時間がない日の3区画。手順=番号つきの段組み */
function rlFlowHTML(){
  const steps=(list, cls)=>'<ol class="rlfsteps'+(cls? " "+cls:"")+'">'+list.map(s=>
    '<li><b>'+s.t+(s.opt? ' <i class="rlchip">余裕があれば</i>':'')+'</b><span>'+s.d+'</span></li>').join("")+'</ol>';
  const sec=(head, time, inner)=>'<div class="rlfsec"><div class="rlfhd">'+head+(time? '<span>'+time+'</span>':'')+'</div>'+inner+'</div>';
  return '<div class="rlflow">'+
    sec(RL_FLOW.read.head, RL_FLOW.read.time, steps(RL_FLOW.read.steps))+
    sec(RL_FLOW.listen.head, RL_FLOW.listen.time, steps(RL_FLOW.listen.steps))+
    sec("⏱ 時間がない日の最低限", "", steps(RL_FLOW_MIN, "rlfmin"))+
    '</div>';
}
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
/* ---- 今日の1本の固定(v5.19.0・実機FB「更新は1日1回(初めて開いたとき)で十分。閉じても同じものを・別の端末でも同じものを」) ----
   G.rl.pick[kind]={d:日付, id:ソース, alt:「別の候補」で進めた回数, it:{t,u,d,s,sec}=決めた素材, at:決めた時刻}(同期: sync.js rlPickNewer)。
   その日はじめて開いたときに決めて保存し、以後は開き直しても(端末を変えても)同じ1本。日付が変われば引き直す。
   以前は「今日出した」がその瞬間に減点されて開き直すと別のソースに変わり、素材も取得ごとに変わり得た(=実機FB) */
function rlPickSaved(kind){
  const p=G.rl.pick && G.rl.pick[kind];
  if(!p || p.d!==todayKey() || !byRl[p.id] || byRl[p.id].long || byRl[p.id].pay) return null;
  const mu=G.rl.mute && G.rl.mute[p.id]; if(mu && mu.on) return null;
  if(kind==="listen" && p.it && !rlFits(p.it, byRl[p.id], G.rl)) return null; // ⏱の長さを変えた(別端末で変えて同期した)あとは引き直す(v5.23.0)
  return p;
}
function rlSavePick(kind, src, alt, it){
  G.rl.pick=G.rl.pick||{};
  G.rl.pick[kind]={d:todayKey(), id:src.id, alt:alt|0, it:it? {t:it.t, u:it.u, d:it.d||"", s:it.s||"", sec:it.sec||0} : null, at:Date.now()};
  saveG();
}
/* ソースのおすすめを解決して状態に入れる(非同期)。done=描き直しのコールバック。
   opt.force=保存した今日の1本を使わず引き直す(別の候補・外す・テーマ変更)/opt.hops=⏱の長さ以内の回がなく次の候補へ進んだ回数 */
function rlLoad(kind, done, opt){
  opt=opt||{};
  const today=todayKey();
  const saved=opt.force? null : rlPickSaved(kind);
  if(saved && saved.it){ // 今日の1本が決まっている: 取得なしでそのまま出す
    rlAlt[kind]=saved.alt||0;
    rlState[kind]={src:byRl[saved.id], it:saved.it, items:null, err:null, loading:false, d:today};
    done(); return;
  }
  if(saved) rlAlt[kind]=saved.alt||0;
  const src=saved? byRl[saved.id] : rlPick(kind, G.rl, today, rlAlt[kind]);
  const st=rlState[kind]={src, it:null, items:null, err:null, loading:!!src, d:today};
  if(!src){ done(); return; }
  G.rl.last=G.rl.last||{};
  G.rl.last[src.id]=today; // 「直近に出した」の記録(明日・明後日の減点)
  rlSavePick(kind, src, rlAlt[kind], null); // 素材が決まるまでソースだけ保存(saveG込み)
  done();
  rlFetch(src).then(items=>{
    if(rlState[kind]!==st) return; // 別の候補に進んでいたら捨てる
    const it=rlChoose(items, G.rl, kind, src);
    if(!it && (opt.hops|0)<6){ rlAlt[kind]++; rlLoad(kind, done, {force:true, hops:(opt.hops|0)+1}); return; } // ⏱の長さ以内の回がない番組は飛ばす
    st.items=items; st.it=it; st.loading=false;
    if(it) rlSavePick(kind, src, rlAlt[kind], it);
    done();
  }).catch(e=>{
    if(rlState[kind]!==st) return;
    st.err=String(e&&e.message||e); st.loading=false; done();
  });
}
function rlDurText(sec){ return sec>0? Math.max(1, Math.round(sec/60))+"分" : ""; }
/* ホームのパネル(2行: 読む/聴く)。タップでモーダル */
function rlFillHome(){
  const el=$("homeRL"); if(!el) return;
  const row=k=>{
    const st=rlState[k];
    let body;
    if(!st || !st.src) body='<span class="small">候補がない(⚙で「合わない」を見直す)</span>';
    else if(st.it) body='<span class="rlt">'+esc(st.it.t)+'</span><span class="rls">'+esc(st.src.name)+(st.it.sec? ' ・ '+rlDurText(st.it.sec):'')+'</span>';
    else if(st.items) body='<span class="rlt">'+esc(st.src.name)+'</span><span class="rls">'+rlLenText(G.rl)+'の回が見つからない ─ タップしてサイトへ</span>';
    else if(st.err) body='<span class="rlt">'+esc(st.src.name)+'</span><span class="rls">最新の一覧を取れなかった ─ タップしてサイトへ</span>';
    else body='<span class="rlt">'+esc(st.src.name)+'</span><span class="rls">最新の記事を取得中…</span>';
    return '<div class="rlrow"><span class="rlk">'+rlKindLabel(k)+'</span>'+body+'</div>';
  };
  el.querySelector(".rlrows").innerHTML=row("read")+row("listen");
}
/* 未解決の種類だけ読み込む(解決済み・取得中・候補なし確定はそのまま。日付が変わっていれば引き直す)。doneは状態が進むたびに呼ばれる */
function rlEnsureLoaded(done){
  ["read","listen"].forEach(k=>{
    const st=rlState[k];
    if(st && st.d===todayKey() && (st.it || st.items || st.err || st.loading || st.src===null)) return;
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
      '<b>すべて無料で全文を読める・全編を視聴できるソースだけ</b>(有料・閲読制限のあるメディアは載せていない。会員限定の記事が混ざる媒体も外した。有料の記事に当たったら「🔁 別の候補」へ)。'+
      '<b>🎧 聴く</b>の<b>⏱ 長さ</b>(〜5分・〜15分・〜30分)で、その日の余裕に合わせて番組の長さを絞れる(YouTubeはチャンネルの典型的な長さで判定)。'+
      '選び方は端末の中だけで完結(無料・通信は記事一覧の取得だけ): 「興味のあるテーマ」に合うソースを優先し、同じソースが3日続かないよう入れ替え、'+
      '日付で決まる順番なので同じ日に何度開いても同じおすすめ。合わないソースは「外す」で二度と出ない。<br><br>'+
      '<b>📋 LLMプロンプト</b>: 解説・語彙・英検1級一次と同じ形式の問題(Part 2/3・リスニングPart 2/4)・Part 4形式の要約(90〜110語)の添削・Part 5形式の英作文(200〜240語)などを、あなたが使うLLM(ChatGPT・Claude・Gemini等)に頼むための依頼文。'+
      '題名とURLが入っているのでそのまま貼り付けるだけ。URLを開けないLLMには本文/トランスクリプトを続けて貼る。'+
      'このアプリは日本語訳や問題を自分では作らない(=無料・サーバーなし)。<b>学習の流れ</b>は下の「📘 進め方」に')+
    '<div id="rlModal"><div id="rlCards"></div>'+
    // 学習の流れ(v5.11.0実機FB): プロンプトをどの順で使うか
    foldSec("rlFlow", "📘 進め方(プロンプトをどう使うか)", rlFlowHTML(), !G.rl.flowSeen)+
    /* v5.20.1(実機FB「この2つだけ中央ぞろえで違和感」): 開閉の行と同じ左寄せの1行(.rlentry)に。右端に件数と › */
    '<button class="btn rlentry" id="rlMywBtn"><span class="grow">📝 分からなかった単語を登録</span><span class="hlsub">マイ単語 '+mywList().length+'語 ›</span></button>'+
    foldSec("rlTopics", "🎛 興味のあるテーマ("+Object.keys(G.rl.topics||{}).filter(t=>G.rl.topics[t]).length+")",
      '<div class="small" style="margin-bottom:6px">選んだテーマに合うソースを優先する(未選択=全ソースから)</div>'+
      '<div class="rlchips">'+Object.keys(RL_TOPICS).map(t=>'<button class="wchip rltop'+(G.rl.topics[t]? " ksel":"")+'" data-t="'+t+'">'+RL_TOPICS[t]+'</button>').join("")+'</div>', false)+
    foldSec("rlMuted", "🔕 外したソース("+Object.keys(G.rl.mute||{}).filter(id=>G.rl.mute[id].on).length+")",
      '<div id="rlMuteList">'+rlMuteListHTML()+'</div>', false)+
    '<button class="btn rlentry" id="rlHistBtn"><span class="grow">📚 読んだ・聴いたの記録</span><span class="hlsub">'+Object.keys(G.rl.done||{}).length+'本 ›</span></button>'+
    '<div class="small" style="margin-top:10px">ソース '+RL_SOURCES.filter(s=>s.kind==="read" && !s.pay).length+'誌 ・ '+RL_SOURCES.filter(s=>s.kind==="listen").length+'番組。'+
      'すべて無料で読める・聴けるものだけ。今日のおすすめは、はじめて開いたときに決まり、閉じても別の端末でも同じ(日付が変わると更新)</div></div>');
  $("rlHistBtn").onclick=openRLHistory;
  $("rlMywBtn").onclick=()=>openMywAdd("", rlCurrentTitle("read")||rlCurrentTitle("listen"));
  if(!G.rl.flowSeen){ G.rl.flowSeen=1; saveG(); } // 進め方は初回だけ開いた状態で見せる(端末の好み)
  render();
  rlEnsureLoaded(()=>{ render(); rlFillHome(); });
  $("modal").querySelectorAll(".rltop").forEach(b=>{
    b.onclick=()=>{
      G.rl.topics[b.dataset.t]=G.rl.topics[b.dataset.t]? 0:1; G.rl.topicsAt=Date.now(); saveG(); // topicsAt=同期で新しい操作が勝つ(v5.19.0)
      b.classList.toggle("ksel", !!G.rl.topics[b.dataset.t]);
      rlAlt={read:0, listen:0};
      const cb=()=>{ render(); rlFillHome(); };
      ["read","listen"].forEach(k=>rlLoad(k, cb, {force:true})); // テーマを変えたら今日の1本も引き直す
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
    const it=st.it||null;
    const done=it && G.rl.done && G.rl.done[it.u];
    inner='<div class="rlsrc">'+esc(s.name)+' '+rlSrcChips(s)+'</div>'+
      (it
        ? '<a class="rltitle" href="'+esc(it.u)+'" target="_blank" rel="noopener">'+esc(it.t)+'</a>'+
          '<div class="rlmeta">'+(rlDateText(it.d)? rlDateText(it.d)+' ・ ':'')+(s.yt? "YouTube" : kind==="read"? "記事" : "ポッドキャスト")+
            (it.sec? ' ・ '+rlDurText(it.sec):'')+(done? ' ・ <span class="qmas">✓ '+(kind==="read"?"読んだ":"聴いた")+'</span>':'')+'</div>'+
          (it.s? '<div class="rldesc">'+esc(it.s)+'</div>':'')+
          '<div class="rlmeta rlflowline">流れ: '+RL_FLOW[kind].line+'</div>'
        : st.err
          ? '<div class="rlmeta">最新の一覧を取得できなかった(通信・中継の都合)。サイトを直接開いて、気になる1本を選ぼう</div>'
          : st.items
          ? '<div class="rlmeta">この番組の最新回は'+rlLenText(G.rl)+'に収まらない。⏱で長さを広げるか、「別の候補」へ</div>'
          : '<div class="rlmeta">最新の一覧を取得中…</div>')+
      '<div class="rlbtns">'+
        '<a class="btn primary" href="'+esc(it? it.u : s.url)+'" target="_blank" rel="noopener">🔗 開く</a>'+
        '<button class="btn rlprompt" data-k="'+kind+'">📋 LLMプロンプト</button>'+
        '<button class="btn rlalt" data-k="'+kind+'">🔁 別の候補</button>'+
        (it? '<button class="btn rldone" data-k="'+kind+'"'+(done?' disabled':'')+'>✓ '+(kind==="read"?"読んだ":"聴いた")+'</button>':'')+
        '<button class="btn rlmute" data-k="'+kind+'" title="このソースを今後出さない">🔕 外す</button>'+
      '</div>';
  }
  return '<div class="rlcard" data-k="'+kind+'"><div class="rlhead">'+rlKindLabel(kind)+'</div>'+(kind==="listen"? rlLenRowHTML() : '')+inner+'</div>';
}
/* ⏱ 聴く長さの段(v5.23.0・実機FB): 聴くカードの見出しの下に3つのチップ(〜5分・〜15分・〜30分)。選ぶと今日の1本を引き直す */
function rlLenRowHTML(){
  const cur=rlMaxSec(G.rl)/60;
  return '<div class="rllenrow"><span class="small">⏱ 長さ</span>'+
    RL_LEN.map(m=>'<button class="wchip rllen'+(m===cur? " ksel":"")+'" data-m="'+m+'">〜'+m+'分</button>').join("")+'</div>';
}
function rlBindCards(){
  const m=$("modal");
  const rerender=()=>{ if($("rlCards")){ $("rlCards").innerHTML=rlCardHTML("read")+rlCardHTML("listen"); rlBindCards(); } rlFillHome(); };
  m.querySelectorAll(".rlalt").forEach(b=>{
    b.onclick=()=>{ const k=b.dataset.k; rlAlt[k]++; rlLoad(k, rerender, {force:true}); }; // 進めた先も今日の1本として保存される
  });
  m.querySelectorAll(".rllen").forEach(b=>{ // ⏱ 聴く長さ(v5.23.0)
    b.onclick=()=>{
      const v=+b.dataset.m; if(rlMaxSec(G.rl)===v*60) return;
      G.rl.lmax=v; G.rl.lmaxAt=Date.now(); saveG(); // lmaxAt=同期で新しい操作が勝つ
      rlAlt.listen=0;
      rlLoad("listen", rerender, {force:true}); // 上限を変えたら今日の1本を引き直す
    };
  });
  m.querySelectorAll(".rlmute").forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k, st=rlState[k]; if(!st||!st.src) return;
      G.rl.mute[st.src.id]={on:1, at:Date.now()}; saveG();
      toast("🔕 "+st.src.name+" を今後のおすすめから外した");
      rlLoad(k, rerender, {force:true});
      if($("rlMuteList")){ $("rlMuteList").innerHTML=rlMuteListHTML(); rlBindMuteList(); }
    };
  });
  m.querySelectorAll(".rldone").forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k, st=rlState[k]; if(!st||!st.src||!st.it) return;
      const it=st.it;
      G.rl.done[it.u]={d:todayKey(), k, id:st.src.id, t:it.t.slice(0,80)}; saveG();
      toast(k==="read"? "📖 読んだ! 明日も1本" : "🎧 聴いた! 明日も1本");
      checkAchievements(); // 学習の実績(v5.13.0)
      rerender();
    };
  });
  m.querySelectorAll(".rlprompt").forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.k, st=rlState[k]; if(!st||!st.src) return;
      const it=st.it || {t:"(サイトで選んだ記事の題名)", u:st.src.url};
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
