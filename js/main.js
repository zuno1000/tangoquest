"use strict";
/* ================= タブ切替・起動 ================= */

const TABS={
  home:    {view:"homeView",    nav:"navHome",    on:()=>renderHome()},
  quiz:    {view:"quizView",    nav:"navQuiz",    on:()=>refreshInfPill()},
  party:   {view:"partyView",   nav:"navParty",   on:()=>renderParty()},
  adv:     {view:"advView",     nav:"navAdv",     on:()=>renderAdv()},
  gacha:   {view:"gachaView",   nav:"navGacha",   on:()=>renderGacha()},
  mission: {view:"missionView", nav:null,         on:()=>{ renderMissions(); refreshMissionDot(); }},
  sv:      {view:"svView",      nav:null,         on:()=>{}}, // 単語のサバイバー(β・冒険タブから入る)
};
function switchTab(name){
  closeModal();
  for(const k in TABS){
    $(TABS[k].view).classList.toggle("hidden", k!==name);
    if(TABS[k].nav) $(TABS[k].nav).classList.toggle("active", k===name);
  }
  TABS[name].on();
}
$("navHome").onclick=()=>switchTab("home");
$("navQuiz").onclick=()=>switchTab("quiz");
$("navParty").onclick=()=>switchTab("party");
$("navAdv").onclick=()=>switchTab("adv");
$("navGacha").onclick=()=>switchTab("gacha");

/* ---- ホーム画面(各機能へのハブ) ---- */
/* お知らせ: 「イベント」(ガチャ告知など・上部に長く掲示)と「アップデート」を分ける。
   イベントはBANNERSから自動生成(開催前=予告/開催中=残り日数)+手動のEVENTS */
const EVENTS=[
  // {d:"2026-08-03", t:"..."} 形式でバナー以外のイベント告知を書く
];
const NEWS=[
  {d:"2026-08-12", t:"🎁 v4.21.0 サバイバーが大幅パワーアップ! ①レベルアップの3択に「なかまの召喚」が登場: 最大3体のなかまが自機の周りを回って自動攻撃します(攻撃力はあなたの呪文に併走・固有スキルも反映: 守り手は被弾を軽減、吸血や再生は自機を癒します) ②ときどき🎁宝箱スライムが横切ります。倒すと🪙+ちからの3択、逃すと消えます ③時間が経つとエリート個体(強いが🪙4倍)が混ざります ④📜「サバイバーの心得」: 🪙で買える永続強化(体力・威力・詠唱・集中・金運を各Lv5まで) ⑤📅日替わりチャレンジ: 毎日ちがうステージ×ルール(大群/重装/神速/痛撃)×品詞しばりで、初回勝利に🪙ボーナス!"},
  {d:"2026-08-12", t:"💫 v4.20.0 新モード「単語のサバイバー」(β)が冒険タブに登場! 全方位から押し寄せる敵を、呪文の自動詠唱と正解の一斉バーストでしのぐサバイバー系ローグライクです。正解で◆ジェムが貯まり、レベルアップのたびに3択(威力・連射・バースト・回復・守り・金運)でそのランの間だけ強くなれます。180秒生きのびるとボスが出現、倒せば勝利! 倒した敵の🪙は勝っても負けても全額持ち帰り。時間が流れるのは問題を考えている間だけなので、答え合わせや3択はじっくりどうぞ。解いた分はふつうの学習として記録されます(今日の目安・🎫・カードすべて)。※タワーディフェンス「単語の防衛線」(β)はこのモードに置き換わりました(実績も「サバイバー生還」に刷新。βでの試行にお付き合いありがとうございました!)"},
  {d:"2026-08-10", t:"🏃 v4.19.0 防衛線の戦場が「マス」から「連続フィールド」に! なかまと敵はにゃんこ大戦争のようにフィールドをなめらかに進み、射程に入ると足を止めて戦います。重なりも自由になり、何体たまってもレーンの高さは一定=クイズが圧迫されません(全員のHPバーもそれぞれ表示)。ボスはゆっくり迫ってきます"},
  {d:"2026-08-10", t:"🏹 v4.18.0 防衛線に「射程」が登場! 弓・魔法・唄タイプのなかまは離れた敵を攻撃できます(狩人=射程2・大魔導士=射程3など。近接の壁の後ろから撃つ後衛運用が可能に)。なかまの攻撃は青いダメージ表示で見えるようになりました。またクイズの単語枠を固定サイズにして、出題中と答え合わせ中で選択肢の位置がずれないように・選択肢が画面下部の余白いっぱいまで広がるように改善しました"},
  {d:"2026-08-10", t:"⚡ v4.17.0 防衛線のゲームシステムを刷新! 砲撃は⚡チャージ制(正解3回で自動発射)になり、さらに「なかまが1体もいないと撃てない」ようになりました ─ なかまで戦線を支え、貯めた砲撃で薙ぎ払う、が防衛の基本形です。戦況の文字ログは廃止し(出来事はダメージポップ・爆発・カットインなどの演出で伝わります)、そのぶんクイズを広く・「次へ」ボタンまでスクロールなしで収まるようにしました"},
  {d:"2026-08-10", t:"🎖 v4.16.0 防衛線が「なかま出撃」方式に進化! クイズの正解で💠言霊を稼ぎ(+100・コンボで増加/ミスでも+30)、💠を払ってなかまを出撃させて敵と戦わせられます(何体でも・コストはレア度でN100/R150/SR250/SSR400)。なかまは同じマスの敵を足止めして殴り合い、固有スキルも反映(攻撃UP・守り・対ボス・与ダメ回復・自己再生)。出撃デッキ(最大6体)はステージ選択画面から編成できます。呪文の砲撃はそのまま(威力は控えめに調整)。クイズには学習タブと同じ「今日 ◯/◯問」「これまで・定着」表示も追加しました"},
  {d:"2026-08-10", t:"⚔ v4.15.0 防衛線が大幅パワーアップ! ①呪文の動詞で撃ち方が変わるように: 強撃=一点/【貫通】=レーン全体を薙ぎ払う(ビーム演出)/【吸収】=与ダメの45%だけ城を回復/【連撃】=前から2体。反復(副詞)はもう一度撃つ ②ボス出現でカットイン演出 ③連続正解が続くほど射撃の閃光が派手に(3段階) ④復習期限切れの野生語は砲台が錆びて威力-6%/枚(復習で研ぎ直し) ⑤編成の変更がウェーブの合間と戦闘に戻ったときに反映されるように ⑥実績に「防衛線クリア」を追加(🪙)"},
  {d:"2026-08-10", t:"⚔ v4.14.1 防衛線を改善! ①画面上部をコンパクトにしてクイズを大きく(城HPはヘッダーの小さなバーに) ②射撃の演出を追加: ダメージポップ・撃破の爆発・レーンの閃光・被弾時の振動 ③少し手ごわく: 敵が6/8/10体に増え、城への一撃も重くなりました(漏らすと痛い!)"},
  {d:"2026-08-10", t:"⚔ v4.14.0 新モード「単語の防衛線」(β)が冒険タブに登場! クイズの正解が呪文の一斉射撃になるタワーディフェンスです。1問解くごとに敵は1マス進軍(ボスは2問で1マス)・ミスすると呪文は沈黙。3ウェーブ守り切れば🪙。時間制限はないので、じっくり思い出す方が有利。解いた分はふつうの学習として記録されます(今日の目安・🎫・カードドロップすべて)。砲撃の威力はいまの呪文(編成)と属性相性で決まります。βのため、感想を踏まえて大きく変わる(または取り下げる)ことがあります"},
  {d:"2026-08-10", t:"🖼 v4.13.1 なかまのカスタムアイコンが「カードアート」に! 設定した画像が、なかま一覧・詳細・図鑑・ガチャ結果のカード面いっぱいに表示されます(保存画質も引き上げ)。以前に設定した画像は小さいままのことがあるので、設定し直すときれいになります"},
  {d:"2026-08-10", t:"🏅 v4.13.0 「覚えた」の基準を見直し! 7日間あけた復習にも正解してはじめて「覚えた」になります(従来は3日後まで)。これにより覚えた単語の数が一時的に減って見えますが、学習記録は消えていません。クイズには「定着 ◯/5」の進捗表示と、覚えた瞬間のお祝いを追加。また出題対象がない時の先取り出題では定着段階が上がらないようにしました(忘却曲線どおりの間隔をあけた正解だけが段階を進めます)"},
  {d:"2026-08-10", t:"🧊 v4.13.0 連続学習フリーズが登場! 学習できなかった日を自動で埋めて連続記録を守ります(ログインボーナス7日目で入手・最大2個)。さらに「るすばん探索」も追加: アプリを開くだけで、前回から経過した時間ぶんの🪙がもらえます(クリア済みダンジョンが深いほど時給アップ・最大24時間ぶん)"},
  {d:"2026-08-10", t:"📕 v4.13.0 図鑑がパワーアップ! 単語の英字検索と、覚えた/学習中/未学習の絞り込みができるようになりました。なかまのアイコンは好きな画像に変更できます(なかま詳細→アイコンを変更)。設定には「学習記録とカードだけリセット」(なかま・通貨・レベルは残る)を追加"},
  {d:"2026-08-10", t:"🔧 v4.13.0 ホームの目安に「いまの時刻までの小目標」を追加(8時〜20時を学習時間帯として按分)。直近100問が復習ばかりのときに分析が「まだ分析中」になる表示を修正。カードの分解機能は廃止しました(単語=1カード化で、カードは持っているほど強くなるため。手持ちの✨かけらは今までどおり「重ねる」に使えます)。ホーム画面起動時に画面上部が灰色になる不具合の自動復旧を強化(日をまたいだ最初の起動でも復旧します)"},
  {d:"2026-08-06", t:"📊 v4.12.0 学習のあゆみに全期間の新規/復習別の正答率を追加! 今日から解答の内訳を記録し、記録開始日以降のすべての解答から集計します(過去の分は内訳が残っていないため対象外)。「累計解答(全期間)」=アプリを使いはじめてからのすべての記録です"},
  {d:"2026-08-06", t:"📊 v4.11.1 学習のあゆみに「正答率(直近100問)」を追加! 新規と復習それぞれの正答率を確認できます(学習ペースの逆算に使っているのと同じ分析です)"},
  {d:"2026-08-06", t:"📊 v4.11.0 学習のあゆみで過去の記録もさかのぼれるように! グラフ上の◀▶で14日ずつ移動できます(期間の合計問数つき)。記録の数え方の説明も追加: 日付は端末の時計で0時に切り替わり、複数端末で同じ日に学習した場合は多い方の端末の数が残ります(合算はされません)"},
  {d:"2026-08-06", t:"📊 v4.10.0 「学習のあゆみ」が登場! 直近14日の学習量と目安の達成をグラフで振り返れます(ホームの目安パネル→「学習のあゆみ」、または⚙設定から)。目安は毎日「残りの問題数÷残り日数」で引き直すので、今日がんばった分だけ明日からの目安は軽くなります。また「アップデートを確認」を押しても新版がいつまでも取り込めないことがある不具合を修正し、ボタンの表記も整理しました"},
  {d:"2026-08-05", t:"🔧 v4.9.1 無限回廊の説明文「10階ごとに🪙1000」を2行目に改行(1行が長く読みにくかったため)"},
  {d:"2026-08-05", t:"🎆 v4.9.0 まとめてアップデート! ①「今日の目安」はその日の最初に決まった数で固定(ミスしても途中で増えません。翌日に自動で引き直し) ②限定キャラは開催終了後に冒険者召喚(恒常)へ収録されるように! 8/8からは新限定「🎆夏祭りの召喚」が開催 ③正誤確認中に上の単語をタップすると辞書(Weblio)で意味を確認できます ④コインの桁が増えても⚙がずれないよう表記を短縮(30万など) ⑤学習画面の表示を整理(連続日数は非表示・「今日◯/◯問」は位置固定)"},
  {d:"2026-08-05", t:"🃏 v4.8.0 カードは「単語ごとに1枚」に! レア度が違っても同じ単語なら1枚のカードに合流します(レア=これまでの最高・Lv=全部の合計枚数)。ばらばらだったカードが自動でまとまり、高いレアを引くとカードがその場で★ランクアップ。同じ単語を呪文に2枚置ける不具合(自分自身との共鳴)も修正"},
  {d:"2026-08-05", t:"🔧 v4.7.2 目標日が端末間で正しく同期されるように修正(設定した端末の内容が必ず届きます。他の端末では次回同期後に反映)。ホームの「今日の目安」をキャラパネルの直下に移動"},
  {d:"2026-08-05", t:"🔧 v4.7.1 学習画面の「今日の目安」パネルを撤去(クイズが下に押し出されるため)。目安メーターはホームで・学習中の進捗はクイズ上部の「今日 ◯/◯問」表記で確認できます"},
  {d:"2026-08-05", t:"🎯 v4.7.0 学習ペース管理が登場! 「いつまでに全部覚えるか」を決めると、あなたの正答率から1日の目安を毎日逆算してメーターで案内(ホーム・学習画面から設定)。出題も賢く: 忘れかけた単語を優先・よく覚えていた単語はミスしても半分から再開・新規単語は目標日から逆算したペースで登場"},
  {d:"2026-08-04", t:"🔧 v4.6.2 クイズ正解時の結果バーの🎫+1表示を削除(チケットは今までどおり正解1問ごとに貯まります)"},
  {d:"2026-08-04", t:"🎫 v4.6.1 限定ガチャが常時2バナー開催に! それぞれ2週間ごとに更新されます(☄️星降る夜=8/7まで・🍁秋宵=8/14まで)。編成画面のキャラパネルの角に白い四角が見える表示も修正"},
  {d:"2026-08-04", t:"🌟 v4.6.0 大型アップデート! ①新ダンジョン6種追加(逆さまの魔戯場〜原初の言霊神殿) ②バトル刷新: 敵のHPが厚く・一撃は軽くなり、数ターンの攻防に(守り・回復キャラの個性が活きる。戦闘中の回復は1ターン最大HP25%まで) ③クイズ正解1問ごとに🎫1! ④通貨の分離: 限定召喚=🎫(学習でだけ入手)/恒常召喚=🪙(冒険・任務で大量入手。初クリア🪙3000など増額) ⑤限定ガチャは2週間ごとに2バナー交互開催に"},
  {d:"2026-08-04", t:"🔧 v4.5.1 呪文画面の出撃キャラパネルの彩色が枠からずれる表示を修正・「出撃キャラを選ぶ」の一覧が左に寄っていたのを修正・ログインボーナスが一瞬で閉じてしまう不具合を修正(受け取りそびれた分は今日の分から正常に出ます)"},
  {d:"2026-08-04", t:"⚔ v4.5.0 呪文画面の出撃キャラ選択を刷新! 現在の出撃キャラを1枚のパネルで表示し、「変更」からなかまを選ぶ方式に(彩色がはみ出す不具合もこれで解消)。タブが持ち上がる・設定の文字が隠れる不具合を修正。インストール直後の初回起動の灰色帯は自動で復旧するように"},
  {d:"2026-08-04", t:"🔧 v4.4.3 突破彩色がカード下端からはみ出す表示を根本修正・インストール直後の初回起動で画面上部が灰色になる不具合を修正(タブの位置はそのまま)"},
  {d:"2026-08-04", t:"🔧 v4.4.2 突破+10以上のカードで箔の光沢がカード下端からわずかにはみ出す表示を修正"},
  {d:"2026-08-04", t:"🔧 v4.4.1 編成のキャラカードで突破の彩色がカード下端まで届かないことがある表示を修正"},
  {d:"2026-08-04", t:"🔧 v4.4.0 図鑑のなかまにもソート(図鑑順/レア/力/突破)を追加・画面下部のタブが上にずれる不具合を修正・外部リンクから戻ると画面下端が持ち上がる不具合を修正"},
  {d:"2026-08-04", t:"🔧 v4.3.0 なかま一覧にソート(レア/力/突破/図鑑順)を追加・出撃中のなかまをもう一度タップで詳細表示・図鑑の切り替えが1タップで確実に・ホーム画面アプリ起動時に上部へ灰色の帯が出る不具合とガチャ結果の角の白いはみ出しを修正"},
  {d:"2026-08-03", t:"🔮 v4.2.0 なかまをタップで能力詳細が見られるように! 限定キャラは開催終了後に恒常入り・限定ガチャはSSR5%/SR15%に率UP・単発ガチャの結果を大きく表示・図鑑を軽量化"},
  {d:"2026-08-03", t:"📕 v4.1.0 図鑑が登場! カード・なかまの集まり具合をホームから確認。ガチャは1枚ずつめくれる開封に・突破の瞬間もポップに。新アイコン・細かな不具合修正も"},
  {d:"2026-08-03", t:"🎉 v4.0.0 カードは「重ねるだけ」で強くなる新育成! 同じカードを引くたびLv+1(上限なし・旧+Lvは自動変換)。全32キャラに固有スキル追加・突破は上限なしに・突破カードの彩りも明るく・新しい仲間「星の旅人 アルク」登場"},
  {d:"2026-08-03", t:"📈 v3.7.0 学習がもっとお得に! 正解10問ごとに🎫1・連続正解コンボでXP&ドロップ★UP・ログインボーナス増額(毎日🎫1以上)・新任務と実績追加"},
  {d:"2026-08-03", t:"🔧 v3.6.0 使い心地の改善! 同期が1タップで完了・10連ガチャの結果が1画面に・アップデート確認がより確実に・新アイコン"},
  {d:"2026-08-03", t:"✨ v3.5.1 突破を重ねたなかまのカードが豪華に! おまかせ編成は「不発」を残さないように改善"},
  {d:"2026-08-03", t:"🔔 v3.5.0 お知らせをこのベルに移動! おまかせ編成を強化・連続ミス強化がミスごとに効くように・新しい仲間6人が恒常ガチャに登場"},
  {d:"2026-08-02", t:"🔥 v3.4.0 連続学習ボーナス! 続けた日数だけ獲得XPアップ(最大×2)。任務報酬はホームから一括受取"},
  {d:"2026-08-02", t:"🐺 v3.3.0 野生語システム! 語根のない単語は「覚えているほど強くなる」。編成中の単語は優先出題"},
  {d:"2026-08-02", t:"🧬 v3.2.0 語源辞書を大幅拡充! 語根333種・全単語の52%に正確な語源タグ"},
  {d:"2026-08-02", t:"🧬 v3.1.0 語源システム! 同じ語根の単語を並べると「共鳴」で強化。語根から単語を覚えよう"},
  {d:"2026-08-02", t:"📜 v3.0.0 呪文文法システム! カードを「文」に並べてダメージ式を組み立てよう"},
  {d:"2026-08-02", t:"⚔ v2.3.0 属性相性・技タイプ・敵の特性を追加! 敵の弱点に合わせて編成しよう"},
  {d:"2026-08-02", t:"🌤️ v2.2.0 白×青の新デザイン! 初回🎫10プレゼント・任務の一括受取も"},
  {d:"2026-08-02", t:"✨ v2.1.0 UI刷新! パック開封演出・カードのホロ光沢を追加"},
  {d:"2026-08-02", t:"🎉 v2.0.0 「LEXICA」に改名! ホーム画面・人型編成・新ダンジョン6種を追加"},
];
function newsEvents(){
  const t=todayKey(), ev=[];
  const fmtSpan=b=>b.start.slice(5).replace("-","/")+"〜"+b.end.slice(5).replace("-","/");
  // 一回きりの特別開催(BANNERS)は開催中も予告も出す
  BANNERS.forEach(b=>{
    if(t>b.end) return; // 終了したバナーは出さない
    const started=t>=b.start;
    const remain=Math.max(1, Math.ceil((new Date(b.end+"T23:59:59")-Date.now())/864e5));
    ev.push({d:fmtSpan(b),
             t:(started? "🔥開催中(残り"+remain+"日)" : "📣予告")+" "+b.name+" ─ "+b.desc});
  });
  // 常設2枠(v4.6.1): 各枠の開催中+(内容が変わる場合のみ)次回予告
  LTD_SLOTS.forEach(s=>{
    const b=slotBannerAt(s, t); if(!b) return;
    const remain=Math.max(1, Math.ceil((new Date(b.end+"T23:59:59")-Date.now())/864e5));
    ev.push({d:fmtSpan(b), t:"🔥開催中(残り"+remain+"日)"+" "+b.name+" ─ "+b.desc});
    const nb=slotBannerAt(s, addDays(b.end, 1));
    if(nb && nb.id!==b.id) ev.push({d:fmtSpan(nb), t:"📣予告 "+nb.name+" ─ "+nb.desc});
  });
  return ev.concat(EVENTS);
}
function xpNeedFor(lv){ return lv<=1? 0 : Math.ceil(50*Math.pow(lv-1, 1/0.55)); }
function renderHome(){
  const P=playerStats();
  const ch=byChar[G.party.char];
  const d=dayRec();
  const lv=accountLevel();
  const cur=xpNeedFor(lv), next=xpNeedFor(lv+1);
  const pct=Math.min(100, Math.round(100*(G.xp-cur)/Math.max(1, next-cur)));
  const b=activeBanner();
  const run=G.inf.run;
  const stk=studyStreak();
  const mn=claimableCount();
  const cdx=cardDexStats(), xdx=charDexStats();
  $("homeBox").innerHTML=
    // ヒーロー(出撃キャラ)
    '<div class="panel hero" data-go="party">'+
      '<div class="heroface">'+(ch?charFace(ch):"🗡️")+'</div>'+
      '<div class="grow">'+
        '<div style="font-weight:800; font-size:16px">'+(ch?esc(ch.name):"-")+'</div>'+
        '<div class="small" style="margin-top:2px">戦闘力 <b style="color:var(--accent); font-size:15px">'+fmt(P.power)+'</b></div>'+
        '<div class="small" style="margin-top:6px">📖 Lv'+lv+
          (stk>=2? ' <span style="color:var(--accent); font-weight:800">🔥'+stk+'日連続(XP×'+(+streakXpMult().toFixed(2))+')</span>':'')+
          (G.frz? ' <span title="連続学習フリーズ">🧊'+G.frz+'</span>':'')+'</div>'+
        '<div class="mbar" style="margin-top:3px"><i style="width:'+pct+'%"></i></div>'+
      '</div></div>'+
    // 学習ペース管理: 今日の目安メーター/未設定なら設定への導線
    // (キャラパネルと学習CTAの間に置く=v4.7.2でユーザー指定の並び)
    '<div class="panel pacebar" id="homePace" style="margin-top:12px"></div>'+
    // 学習CTA
    '<button id="homeStudy" class="studycta shine">📖 学習をはじめる'+
      '<span class="ctasub">今日 '+d.a+'問(正解'+d.c+')</span></button>'+
    // 任務報酬の一括受取(受け取れるものがあるときだけ出す)
    (mn? '<button id="homeClaim" class="claimbtn homeclaim">🎁 任務報酬をすべて受け取る</button>':'')+
    // 同期リマインダー(最終同期3日超+未同期変更ありのときだけ)
    (syncReminderNeeded()?
      '<div class="panel syncnag" id="homeSync">📥 最終同期から'+
        Math.floor((Date.now()-lastSyncAt())/864e5)+'日 ─ タップして同期</div>':'')+
    // ショートカット
    '<div class="tilegrid">'+
      '<div class="tile" data-go="adv"><div class="tic">🗺️</div><div class="tname">冒険</div>'+
        '<div class="tsub">'+(run? "🌀 "+run.floor+"F探索中" : "ダンジョンへ")+'</div></div>'+
      '<div class="tile'+(b?" ltd":"")+'" data-go="gacha"><div class="tic">🔮</div><div class="tname">ガチャ</div>'+
        '<div class="tsub">'+(b? "☄️ 限定開催中!" : "🎫"+fmt(G.tickets))+'</div></div>'+
      '<div class="tile" data-go="party"><div class="tic">📜</div><div class="tname">編成</div>'+
        '<div class="tsub">呪文・カード</div></div>'+
      '<div class="tile'+(mn?" claim":"")+'" data-go="mission"><div class="tic">📜'+(mn?'<span class="dot" style="position:static; display:inline-block; margin-left:4px"></span>':'')+'</div><div class="tname">任務</div>'+
        '<div class="tsub">'+(mn? '<b style="color:var(--accent)">達成'+mn+'件!</b>' : "デイリー・実績")+'</div></div>'+
      '<div class="tile" id="homeDex" style="grid-column:1/-1"><div class="tic">📕</div><div class="tname">図鑑</div>'+
        '<div class="tsub">カード '+cdx.owned+'/'+cdx.total+'種 ・ なかま '+xdx.owned+'/'+xdx.total+'体</div></div>'+
    '</div>';
  $("homeBox").querySelectorAll("[data-go]").forEach(el=>{
    el.onclick=()=>switchTab(el.dataset.go);
  });
  $("homeStudy").onclick=()=>switchTab("quiz");
  fillPaceEl($("homePace"));
  $("homeDex").onclick=()=>openDex();
  if(mn) $("homeClaim").onclick=()=>{ claimAllCurrent(); renderHome(); };
  const sn=$("homeSync");
  if(sn){ ensureGis(()=>{}); sn.onclick=syncNow; } // GIS事前ロード=タップ時のポップアップブロック防止
}

/* ---- 編成タブ(そうび / カード / なかま) ---- */
let partyMode="equip";
function setPartyMode(m){
  partyMode=m;
  $("partySeg").querySelectorAll("button").forEach(x=>x.classList.toggle("active", x.dataset.p===m));
}
function renderParty(){
  $("pEquip").classList.toggle("hidden", partyMode!=="equip");
  $("pCards").classList.toggle("hidden", partyMode!=="cards");
  $("pChars").classList.toggle("hidden", partyMode!=="chars");
  if(partyMode==="equip"){ renderEqChars(); renderEqSlots(); }
  else if(partyMode==="cards") renderCards();
  else renderChars();
}
$("partySeg").querySelectorAll("button").forEach(b=>{
  b.onclick=()=>{ setPartyMode(b.dataset.p); renderParty(); };
});

function refreshHeader(){
  $("resLv").textContent="Lv"+accountLevel();
  // 桁が増えても⚙や🔔を押し出さないよう短縮表記(30万など)。正確な残高はガチャ画面で
  $("resGold").textContent=fmtShort(G.gold);
  $("resTicket").textContent=fmtShort(G.tickets);
  refreshMissionDot();
}

/* ---- お知らせ(ヘッダーの🔔にまとめる・未読は赤点) ---- */
const NEWS_SEEN_KEY="tq_newsSeen";
function newsCount(){ return NEWS.length+newsEvents().length; }
function refreshBellDot(){
  $("bellDot").classList.toggle("hidden", (+localStorage.getItem(NEWS_SEEN_KEY)||0)>=newsCount());
}
function newsRows(list){
  return list.map(n=>
    '<div class="newsrow"><span class="small" style="flex:0 0 auto">'+n.d.slice(5)+'</span>'+
    '<span style="font-size:13px">'+n.t+'</span></div>').join("");
}
function openNews(){
  try{ localStorage.setItem(NEWS_SEEN_KEY, String(newsCount())); }catch(e){}
  refreshBellDot();
  const ev=newsEvents();
  openModal('<h3>🔔 お知らせ</h3>'+
    (ev.length? '<h2 style="margin-top:4px">📅 イベント</h2><div class="panel evpanel">'+newsRows(ev)+'</div>':'')+
    '<h2>🔧 アップデート</h2><div class="panel">'+newsRows(NEWS)+'</div>');
}
$("bellBtn").onclick=openNews;

/* ---- 定期処理: 無限回廊の進行・ピル更新 ---- */
setInterval(()=>{
  infTick();
  refreshInfPill();
  if(!$("advView").classList.contains("hidden")) renderInfPanel();
}, 5000);

/* ---- 起動 ---- */
/* 灰色帯対策の自動リロード判定は state.js 冒頭(全初期化の前)で実施(v4.5.1→v4.13.0拡張) */
/* るすばん探索(放置報酬)とフリーズの自動適用(v4.13.0)。
   どちらも起きたときだけ1つのトーストにまとめる(上書きされないように) */
function settleIdleAndFreeze(){
  const msgs=[];
  const idle=idleGain(G);
  if(idle) msgs.push("💤 るすばん探索: 🪙+"+fmt(idle.gold)+"("+(Math.round(idle.hours*10)/10)+"時間ぶん)");
  const frozen=applyStreakFreeze(G);
  if(frozen) msgs.push("🧊 フリーズが連続学習を守った("+frozen+"日ぶん)");
  if(msgs.length){ saveG(); refreshHeader(); toast(msgs.join(" ／ ")); }
}
refreshHeader();
refreshBellDot();
newQuestion();          // 学習タブを開いた瞬間に出題できるよう先に準備
infTick();              // 放置分の探索を反映
refreshInfPill();
settleIdleAndFreeze();  // renderHomeの前(連続日数・🪙の表示に反映するため)
renderHome();           // ホームがランディング
/* リロード確定中はログボを出さない(モーダルがリロードに巻き込まれて
   「一瞬出てすぐ消える」ため)。未受取のままなのでリロード後に改めて出る */
if(!TQ_REBOOTING) checkLogin();
saveG();

/* PWAを閉じずに日をまたいだ場合: 復帰時に日付が変わっていたらログインボーナスを付与。
   るすばん探索・フリーズも復帰時に精算する */
document.addEventListener("visibilitychange", ()=>{
  if(document.hidden) return;
  settleIdleAndFreeze();
  if(G.login.last!==todayKey()){
    checkLogin();
    refreshHeader();
  }
});

/* iOS(ホーム画面起動): 外部リンクのアプリ内ブラウザや通知シェードから戻った直後、
   ビューポートが誤ったまま復帰して画面の下端が持ち上がって見えることがある。
   復帰のたびにスクロール位置を戻し再レイアウトを促して回復させる
   (min-heightの微変更→即戻しは描画されないため、ちらつかない) */
function nudgeLayout(){
  window.scrollTo(0,0);
  const b=document.body;
  b.style.minHeight="100.01%"; void b.offsetHeight; b.style.minHeight="";
}
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) nudgeLayout(); });
window.addEventListener("pageshow", e=>{ if(e.persisted) nudgeLayout(); });
if(window.visualViewport) visualViewport.addEventListener("resize", ()=>window.scrollTo(0,0));

if("serviceWorker" in navigator && location.protocol==="https:"){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}

/* 同期を使っている端末はGISを先読みしておく(同期ボタン1タップで完了させるため) */
if(syncClientId() && (lastSyncAt()>0 || localStorage.getItem("tq_gAuthed"))){
  setTimeout(()=>ensureGis(()=>{}), 2000);
}

/* セルフテスト(tests/)用: let/const宣言はwindowに載らないため明示公開 */
window.G=G; window.WORDS=WORDS; window.DUNGEONS=DUNGEONS; window.BANNERS=BANNERS; window.CHARS=CHARS;
window.LTD_SLOTS=LTD_SLOTS;
window.ROOT_DEFS=ROOT_DEFS; window.PREFIX_DEFS=PREFIX_DEFS; window.APP_VERSION=APP_VERSION;
window.LOGIN_BONUS=LOGIN_BONUS; window.ACH_DEFS=ACH_DEFS;
window.DAILY_DEFS=DAILY_DEFS; window.WEEKLY_DEFS=WEEKLY_DEFS;
window.MASTER_BOX=MASTER_BOX; window.INTERVALS=INTERVALS; window.FRZ_MAX=FRZ_MAX;
window.SV_STAGE_SEC=SV_STAGE_SEC; window.SV_REACH=SV_REACH; window.SV_TOUCH_CD=SV_TOUCH_CD;
window.SV_CD=SV_CD; window.SV_UPGRADES=SV_UPGRADES; window.SV_AUTO=SV_AUTO; window.SV_BURST=SV_BURST;
window.SV_HEAL_CAP=SV_HEAL_CAP; window.SV_MAXFOES=SV_MAXFOES; window.SV_SPAWN0=SV_SPAWN0; window.SV_SPAWN1=SV_SPAWN1;
window.SV_SAT_MAX=SV_SAT_MAX; window.SV_SAT_CD=SV_SAT_CD; window.SV_SAT_DMG=SV_SAT_DMG;
window.SV_CHEST_IV=SV_CHEST_IV; window.SV_CHEST_TTL=SV_CHEST_TTL; window.SV_CHEST_GOLD=SV_CHEST_GOLD;
window.SV_META=SV_META; window.SV_META_COST=SV_META_COST; window.SV_DAILY_MODS=SV_DAILY_MODS;
window.SV_DAILY_GOLD=SV_DAILY_GOLD;
