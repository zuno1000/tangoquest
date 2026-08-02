"use strict";
/* ================= 語源(語根・接辞)辞書 =================
   綴りからのパターンマッチで語源タグを決定的に導出(保存せず導出の思想)。
   厳密な語源学ではなく、学習のフックになる代表パターンを狙う近似。
   語根タグは「共鳴」(同語根が同じ節に並ぶと強化)の判定にも使う。接頭辞は表示のみ。 */
const ROOT_DEFS=[
  {t:"spec", m:"見る", pat:["spect","spec","spic"]},
  {t:"dict", m:"言う", pat:["dict"]},
  {t:"port", m:"運ぶ", pat:["port"]},
  {t:"duct", m:"導く", pat:["duct","duce"]},
  {t:"ject", m:"投げる", pat:["ject"]},
  {t:"mit", m:"送る", pat:["mitt","miss","mit"]},
  {t:"scrib", m:"書く", pat:["scrib","script"]},
  {t:"vert", m:"回す・向ける", pat:["vert","vers"]},
  {t:"cess", m:"行く・譲る", pat:["cede","ceed","cess"]},
  {t:"fer", m:"運ぶ", pat:["fer"]},
  {t:"tract", m:"引く", pat:["tract"]},
  {t:"struct", m:"建てる", pat:["struct"]},
  {t:"form", m:"形", pat:["form"]},
  {t:"press", m:"押す", pat:["press"]},
  {t:"pos", m:"置く", pat:["pose","posit","pound"]},
  {t:"tain", m:"保つ", pat:["tain","tinen","tenan"]},
  {t:"voc", m:"呼ぶ・声", pat:["voc","vok"]},
  {t:"gen", m:"生む・種族", pat:["gen"]},
  {t:"mort", m:"死", pat:["mort"]},
  {t:"viv", m:"生きる", pat:["viv","vital","vita"]},
  {t:"aud", m:"聞く", pat:["aud"]},
  {t:"vis", m:"見る", pat:["vis","vid"]},
  {t:"cred", m:"信じる", pat:["cred"]},
  {t:"cur", m:"走る", pat:["curr","curs","cours"]},
  {t:"flect", m:"曲げる", pat:["flect","flex"]},
  {t:"grad", m:"歩む・段階", pat:["grad","gress"]},
  {t:"junct", m:"結ぶ", pat:["junct","join"]},
  {t:"lect", m:"選ぶ・読む・法", pat:["lect","leg"]},
  {t:"loqu", m:"話す", pat:["loqu","locut"]},
  {t:"magn", m:"大きい", pat:["magn"]},
  {t:"man", m:"手", pat:["manu","mani"]},
  {t:"nov", m:"新しい", pat:["nov"]},
  {t:"path", m:"感情・苦しみ", pat:["path"]},
  {t:"phon", m:"音", pat:["phon"]},
  {t:"rupt", m:"破る", pat:["rupt"]},
  {t:"sci", m:"知る", pat:["sci"]},
  {t:"sect", m:"切る", pat:["sect"]},
  {t:"sens", m:"感じる", pat:["sens","sent"]},
  {t:"sequ", m:"続く", pat:["sequ","secut"]},
  {t:"solv", m:"解く", pat:["solv","solut"]},
  {t:"spir", m:"息・魂", pat:["spir"]},
  {t:"stat", m:"立つ", pat:["stat","stit","stab","stan"]},
  {t:"tact", m:"触れる", pat:["tact","tang","tig"]},
  {t:"tempor", m:"時", pat:["tempor"]},
  {t:"terr", m:"土地", pat:["terr"]},
  {t:"therm", m:"熱", pat:["therm"]},
  {t:"tort", m:"ねじる", pat:["tort"]},
  {t:"vac", m:"空の", pat:["vac","vanis","vain"]},
  {t:"ven", m:"来る", pat:["vene","vent"]},
  {t:"volv", m:"回る", pat:["volv","volut"]},
  {t:"fac", m:"作る・なす", pat:["fact","fect","fic"]},
  {t:"cap", m:"つかむ", pat:["capt","cept","ceive","cip"]},
  {t:"clud", m:"閉じる", pat:["clud","clus","close"]},
  {t:"puls", m:"押す・打つ", pat:["pel","puls"]},
  {t:"pend", m:"掛ける・払う", pat:["pend","pens"]},
  {t:"plic", m:"折る・重ねる", pat:["plic","plex","ploy"]},
  {t:"rect", m:"まっすぐ", pat:["rect","reg"]},
  {t:"tend", m:"伸ばす", pat:["tend","tens"]},
  {t:"grat", m:"喜び・感謝", pat:["grat"]},
  {t:"corp", m:"体", pat:["corp"]},
  {t:"anim", m:"心・命", pat:["anim"]},
  {t:"aqua", m:"水", pat:["aqua","aqu"]},
  {t:"astr", m:"星", pat:["astr","aster"]},
  {t:"bio", m:"生命", pat:["bio"]},
  {t:"chron", m:"時", pat:["chron"]},
  {t:"dem", m:"民衆", pat:["democ","demogr","epidem","pandem"]},
  {t:"geo", m:"地球・土地", pat:["geo"]},
  {t:"graph", m:"書く", pat:["graph","gram"]},
  {t:"log", m:"言葉・学問", pat:["logy","logu"]},
  {t:"metr", m:"測る", pat:["meter","metr","mens"]},
  {t:"nym", m:"名前", pat:["nym","nomin"]},
  {t:"ped", m:"足", pat:["ped"]},
  {t:"phil", m:"愛する", pat:["phil"]},
  {t:"pot", m:"力", pat:["potent","poss"]},
  {t:"prim", m:"第一の", pat:["prim"]},
  {t:"psych", m:"心", pat:["psych"]},
  {t:"urb", m:"都市", pat:["urb"]},
  {t:"verb", m:"言葉", pat:["verb"]},
  {t:"fid", m:"信頼", pat:["fid"]},
  {t:"her", m:"くっつく", pat:["here","hes"]},
  {t:"lud", m:"遊ぶ・欺く", pat:["lud","lusi"]},
  {t:"mand", m:"命じる", pat:["mand"]},
  {t:"fort", m:"強い", pat:["fort"]},
  {t:"dur", m:"続く・硬い", pat:["dur"]},
  {t:"nat", m:"生まれる", pat:["nat"]},
  {t:"mem", m:"記憶", pat:["mem"]},
  {t:"popul", m:"人々", pat:["popul","publ"]},
  {t:"liber", m:"自由", pat:["liber"]},
  {t:"equ", m:"等しい", pat:["equi","equa"]},
  {t:"simil", m:"似ている", pat:["simil","simul","sembl"]},
  {t:"clam", m:"叫ぶ", pat:["claim","clam"]},
  {t:"don", m:"与える", pat:["donat","dot"]},
  {t:"mob", m:"動く", pat:["mob","mot","mov"]},
  {t:"clin", m:"傾く", pat:["clin"]},
  {t:"fin", m:"終わり・限界", pat:["fin"]},
  {t:"firm", m:"固い", pat:["firm"]},
  {t:"flu", m:"流れる", pat:["flu"]},
  {t:"fus", m:"注ぐ・溶ける", pat:["fus"]},
  {t:"lev", m:"軽い・上げる", pat:["lev"]},
  {t:"luc", m:"光", pat:["luc","lumin"]},
  {t:"medi", m:"中間", pat:["medi"]},
  {t:"migr", m:"移動する", pat:["migra"]},
  {t:"noc", m:"害する", pat:["noc","nox"]},
  {t:"ora", m:"口・話す", pat:["orat","oracl"]},
  {t:"pati", m:"苦しむ・耐える", pat:["pati","passio"]},
  {t:"phan", m:"現れる・見せる", pat:["phan","phen"]},
  {t:"plen", m:"満ちた", pat:["plen","plet"]},
  {t:"prehend", m:"つかむ", pat:["prehen","pris"]},
  {t:"prob", m:"試す・証明", pat:["prob","prov"]},
  {t:"quir", m:"求める・尋ねる", pat:["quir","quis","quest"]},
  {t:"radi", m:"光線・根", pat:["radi"]},
  {t:"scend", m:"登る", pat:["scend","scens"]},
  {t:"trud", m:"押し出す", pat:["trud","trusi","truse"]},
  {t:"val", m:"強い・価値", pat:["val"]},
  {t:"veri", m:"真実", pat:["veri"]},
  {t:"vor", m:"食べる", pat:["vorac","vour","ivoro"]},
  {t:"bell", m:"戦い", pat:["belli","rebel"]},
  {t:"cid", m:"切る・殺す", pat:["cide","cis"]},
  {t:"crea", m:"生み出す", pat:["crea"]},
  {t:"cult", m:"耕す・育てる", pat:["culti","cultu"]},
  {t:"doc", m:"教える", pat:["doc"]},
  {t:"empt", m:"取る・買う", pat:["empt"]},
  {t:"greg", m:"群れ", pat:["greg"]},
  {t:"hab", m:"持つ・住む", pat:["hab","hibit"]},
  {t:"labor", m:"働く", pat:["labor"]},
  {t:"later", m:"側面", pat:["later"]},
  {t:"lig", m:"縛る", pat:["oblig","relig","liga"]},
  {t:"loc", m:"場所", pat:["loc"]},
  {t:"mut", m:"変える", pat:["mut"]},
  {t:"neg", m:"否定する", pat:["neg"]},
  {t:"oner", m:"重い(負担)", pat:["onero","onus"]},
  {t:"opt", m:"選ぶ・見る", pat:["opt"]},
  {t:"orig", m:"生じる", pat:["orig","orient"]},
  {t:"pen", m:"罰・償い", pat:["penal","puni"]},
  {t:"petit", m:"求める", pat:["petit","impet","appet","compet"]},
  {t:"plac", m:"なだめる", pat:["plac"]},
  {t:"sacr", m:"神聖な", pat:["sacr","sanct"]},
  {t:"sal", m:"跳ぶ", pat:["sault","sult"]},
  {t:"scrut", m:"調べる", pat:["scrut"]},
  {t:"sed", m:"座る", pat:["sid","sess","sed"]},
  {t:"sert", m:"結ぶ・差し込む", pat:["sert"]},
  {t:"sign", m:"印", pat:["sign"]},
  {t:"son", m:"音", pat:["sonor"]},
  {t:"sort", m:"種類・運命", pat:["sort"]},
  {t:"spers", m:"まく", pat:["spers"]},
  {t:"string", m:"縛る", pat:["string","strict","strain"]},
  {t:"tenu", m:"細い", pat:["tenu"]},
  {t:"test", m:"証言する", pat:["test"]},
  {t:"tim", m:"恐れる", pat:["timid","timor"]},
  {t:"trib", m:"与える", pat:["trib"]},
  {t:"turb", m:"かき乱す", pat:["turb"]},
  {t:"umbr", m:"影", pat:["umbr"]},
  {t:"und", m:"波", pat:["unda"]},
  {t:"util", m:"使う", pat:["util"]},
  {t:"cord", m:"心", pat:["cord","courag"]},
  {t:"ann", m:"年", pat:["annu","enni","anniv"]},
  {t:"cern", m:"分ける", pat:["cern","cret"]},
  {t:"norm", m:"規範", pat:["norm"]},
  {t:"term", m:"境界", pat:["term"]},
  {t:"part", m:"部分", pat:["part"]},
  {t:"ward", m:"〜の方へ", pat:["ward"]},
];
const PREFIX_DEFS=[
  {t:"trans", m:"越えて"},
  {t:"inter", m:"間の"},
  {t:"circum", m:"周りに"},
  {t:"counter", m:"対抗して"},
  {t:"super", m:"上に"},
  {t:"under", m:"下に"},
  {t:"over", m:"越えて"},
  {t:"anti", m:"反対の"},
  {t:"auto", m:"自ら"},
  {t:"bene", m:"良い"},
  {t:"mal", m:"悪い"},
  {t:"micro", m:"小さい"},
  {t:"tele", m:"遠い"},
  {t:"mono", m:"単一の"},
  {t:"multi", m:"多数の"},
  {t:"semi", m:"半分の"},
  {t:"con", m:"共に"},
  {t:"com", m:"共に"},
  {t:"sub", m:"下に"},
  {t:"pre", m:"前もって"},
  {t:"pro", m:"前へ"},
  {t:"per", m:"通して"},
  {t:"dis", m:"離れて・否定"},
  {t:"mis", m:"誤って"},
  {t:"out", m:"外へ・超えて"},
  {t:"un", m:"否定"},
  {t:"re", m:"再び・後ろへ"},
  {t:"de", m:"下へ・離れて"},
  {t:"ex", m:"外へ"},
  {t:"in", m:"中へ・否定"},
  {t:"ob", m:"逆らって"},
  {t:"ad", m:"〜の方へ"},
  {t:"ab", m:"離れて"},
];

/* パターンを長い順に展開(短い綴りの誤爆を減らす)。同長は辞書順を保つ */
const _ROOT_PATS=(()=>{
  const a=[];
  ROOT_DEFS.forEach((r,i)=>r.pat.forEach(p=>a.push([p,i])));
  a.sort((x,y)=> y[0].length-x[0].length || 0);
  return a;
})();
const _PREFIX_ORDER=PREFIX_DEFS.map((p,i)=>i).sort((a,b)=>PREFIX_DEFS[b].t.length-PREFIX_DEFS[a].t.length);

const _rootsCache={};
/* 単語 → タグ列(最大2)。要素: {kind:"R"|"P", i:辞書index}。語根優先・接頭辞は1つまで */
function wordRoots(en){
  if(_rootsCache[en]) return _rootsCache[en];
  const w=en.toLowerCase();
  const tags=[], got={};
  for(const [p,i] of _ROOT_PATS){
    if(got[i]) continue;
    if(w.indexOf(p)>=0){ tags.push({kind:"R", i}); got[i]=1; if(tags.length>=2) break; }
  }
  if(tags.length<2){
    for(const i of _PREFIX_ORDER){
      const p=PREFIX_DEFS[i].t;
      if(w.startsWith(p) && w.length-p.length>=4){ tags.push({kind:"P", i}); break; }
    }
  }
  return _rootsCache[en]=tags;
}
/* 共鳴判定に使う語根IDのみ(接頭辞は家族が大きすぎるため対象外) */
function rootIdsOf(en){
  return wordRoots(en).filter(t=>t.kind==="R").map(t=>t.i);
}
/* 表示用テキスト: "🧬spec(見る)・pre(前もって)" */
function rootText(en){
  const tags=wordRoots(en);
  if(!tags.length) return "";
  return tags.map(t=> t.kind==="R"
    ? ROOT_DEFS[t.i].t+"("+ROOT_DEFS[t.i].m+")"
    : PREFIX_DEFS[t.i].t+"-("+PREFIX_DEFS[t.i].m+")").join("・");
}
