# -*- coding: utf-8 -*-
# 語源辞書ジェネレータ: リポジトリ直下で実行する
#   python scripts/gen_roots.py report  -> scripts/root_families.txt (目視レビュー用)
#   python scripts/gen_roots.py genjs   -> js/roots.js を再生成
# 辞書を直したら report で確認 -> 誤タグは BLOCK に追記 -> genjs で反映
# 語根辞書 v2: 拡張+誤タグ修正+レビュー用レポート出力+js/roots.js生成
import io, collections, sys, re

PREFIXES = [
    ("trans","越えて"),("inter","間の"),("circum","周りに"),("counter","対抗して"),
    ("super","上に"),("under","下に"),("over","越えて"),("anti","反対の"),
    ("auto","自ら"),("bene","良い"),("mal","悪い"),("micro","小さい"),
    ("tele","遠い"),("mono","単一の"),("multi","多数の"),("semi","半分の"),
    ("hyper","過度に"),("hypo","下に・不足"),("meta","変化・超越"),("para","側に・逆らって"),
    ("peri","周りに"),("epi","上に"),("dia","通して"),("syn","共に"),("sym","共に"),
    ("retro","後ろへ"),("extra","外の"),("intro","中へ"),("fore","前の"),
    ("hetero","異なる"),("homo","同じ"),("neo","新しい"),("with","逆らって"),
    ("con","共に"),("com","共に"),("sub","下に"),("pre","前もって"),
    ("pro","前へ"),("per","通して"),("dis","離れて・否定"),("mis","誤って"),
    ("out","外へ・超えて"),("un","否定"),("en","中に・〜にする"),("em","中に・〜にする"),
    ("re","再び・後ろへ"),("de","下へ・離れて"),
    ("ex","外へ"),("in","中へ・否定"),("ob","逆らって"),("ad","〜の方へ"),("ab","離れて"),
]
ROOTS = [
    ("spec","見る",["spect","spec","spic"]),
    ("dict","言う",["dict"]),
    ("port","運ぶ",["port"]),
    ("duct","導く",["duct","duce"]),
    ("ject","投げる",["ject"]),
    ("mit","送る",["mitt","miss","mit"]),
    ("scrib","書く",["scrib","script"]),
    ("vert","回す・向ける",["vert","vers"]),
    ("cess","行く・譲る",["cede","ceed","cess"]),
    ("fer","運ぶ",["fer"]),
    ("tract","引く",["tract"]),
    ("struct","建てる",["struct"]),
    ("form","形",["form"]),
    ("press","押す",["press"]),
    ("pos","置く",["pose","posit","pound"]),
    ("tain","保つ",["tain","tinen","tenan"]),
    ("voc","呼ぶ・声",["voc","vok"]),
    ("gen","生む・種族",["gen"]),
    ("mort","死",["mort"]),
    ("viv","生きる",["viv","vital","vita"]),
    ("aud","聞く",["aud"]),
    ("vis","見る",["vis","vid"]),
    ("cred","信じる",["cred"]),
    ("cur","走る",["curr","curs","cours"]),
    ("cura","世話・注意",["cura","curat","ccura","secur","procur"]),
    ("flect","曲げる",["flect","flex"]),
    ("grad","歩む・段階",["grad","gress"]),
    ("junct","結ぶ",["junct","join"]),
    ("lect","選ぶ・読む・法",["lect","leg"]),
    ("loqu","話す",["loqu","locut"]),
    ("magn","大きい",["magn"]),
    ("man","手",["manu","mani"]),
    ("nov","新しい",["nov"]),
    ("path","感情・苦しみ",["path"]),
    ("phon","音",["phon"]),
    ("rupt","破る",["rupt"]),
    ("sci","知る",["sci"]),
    ("sect","切る",["sect"]),
    ("sens","感じる",["sens","sent"]),
    ("sequ","続く",["sequ","secut"]),
    ("solv","解く",["solv","solut"]),
    ("spir","息・魂",["spir"]),
    ("stat","立つ",["stat","stit","stab","stan","sist"]),
    ("tact","触れる",["tact","tang","tig"]),
    ("tempor","時",["tempor"]),
    ("terr","土地",["territ","terra","terrain","terrestr","subterr"]),
    ("terrere","怖がらせる",["terrif","terribl","deterr"]),
    ("therm","熱",["therm"]),
    ("tort","ねじる",["tort"]),
    ("vac","空の",["vac","vanis","vain"]),
    ("ven","来る",["vene","vent"]),
    ("volv","回る",["volv","volut"]),
    ("fac","作る・なす",["fact","fect","fic"]),
    ("cap","つかむ",["capt","cept","ceive","cip"]),
    ("clud","閉じる",["clud","clus","close"]),
    ("puls","押す・打つ",["pel","puls"]),
    ("pend","掛ける・払う",["pend","pens"]),
    ("plic","折る・重ねる",["plic","plex","ploy"]),
    ("rect","まっすぐ",["rect","reg"]),
    ("tend","伸ばす",["tend","tens"]),
    ("grat","喜び・感謝",["grat"]),
    ("corp","体",["corp"]),
    ("anim","心・命",["anim"]),
    ("aqua","水",["aqua","aqu"]),
    ("astr","星",["astr","aster"]),
    ("bio","生命",["bio"]),
    ("chron","時",["chron"]),
    ("dem","民衆",["democ","demogr","epidem","pandem"]),
    ("geo","地球・土地",["geo"]),
    ("graph","書く",["graph","gram"]),
    ("log","言葉・学問",["logy","logu"]),
    ("metr","測る",["meter","metr","mens"]),
    ("nym","名前",["nym","nomin"]),
    ("ped","足",["ped"]),
    ("phil","愛する",["phil"]),
    ("pot","力",["potent","poss"]),
    ("prim","第一の",["prim"]),
    ("psych","心",["psych"]),
    ("urb","都市",["urb"]),
    ("verb","言葉",["verb"]),
    ("fid","信頼",["fid"]),
    ("her","くっつく",["here","hes"]),
    ("lud","遊ぶ・欺く",["lud","lusi"]),
    ("mand","命じる",["mand"]),
    ("fort","強い",["fort"]),
    ("dur","続く・硬い",["dur"]),
    ("nat","生まれる",["nat","nasc"]),
    ("mem","記憶",["mem"]),
    ("popul","人々",["popul","publ"]),
    ("liber","自由",["liber"]),
    ("equ","等しい",["equi","equa"]),
    ("simil","似ている",["simil","simul","sembl"]),
    ("clam","叫ぶ",["claim","clam"]),
    ("don","与える",["donat","dot"]),
    ("mob","動く",["mob","mot","mov"]),
    ("clin","傾く",["clin"]),
    ("fin","終わり・限界",["fin"]),
    ("firm","固い",["firm"]),
    ("flu","流れる",["flu"]),
    ("fus","注ぐ・溶ける",["fus"]),
    ("lev","軽い・上げる",["lev"]),
    ("luc","光",["lucid","lumin"]),
    ("medi","中間",["medi"]),
    ("migr","移動する",["migra"]),
    ("noc","害する",["noc","nox"]),
    ("ora","口・話す",["orat","oracl"]),
    ("pati","苦しむ・耐える",["pati","passio"]),
    ("phan","現れる・見せる",["phan","phen"]),
    ("plen","満ちた",["plen","plet"]),
    ("prehend","つかむ",["prehen","pris"]),
    ("prob","試す・証明",["prob","prov"]),
    ("quir","求める・尋ねる",["quir","quis","quest"]),
    ("radi","光線・根",["radi"]),
    ("scend","登る",["scend","scens"]),
    ("trud","押し出す",["trud","trusi","truse"]),
    ("val","強い・価値",["val"]),
    ("veri","真実",["veri"]),
    ("vor","食べる",["vorac","vour","ivoro"]),
    ("bell","戦い",["belli","rebel"]),
    ("cid","切る・殺す",["cide","cis"]),
    ("crea","生み出す",["crea"]),
    ("cult","耕す・育てる",["culti","cultu"]),
    ("doc","教える",["doc"]),
    ("empt","取る・買う",["empt"]),
    ("greg","群れ",["greg"]),
    ("hab","持つ・住む",["hab","hibit"]),
    ("labor","働く",["labor"]),
    ("later","側面",["later"]),
    ("lig","縛る",["oblig","relig","liga"]),
    ("loc","場所",["loc"]),
    ("mut","変える",["mut"]),
    ("neg","否定する",["neg"]),
    ("oner","重い(負担)",["onero","onus"]),
    ("opt","選ぶ・見る",["opt"]),
    ("orig","生じる",["orig","orient"]),
    ("pen","罰・償い",["penal","puni"]),
    ("petit","求める",["petit","impet","appet","compet"]),
    ("plac","なだめる",["plac"]),
    ("sacr","神聖な",["sacr","sanct"]),
    ("sal","跳ぶ",["sault","sult"]),
    ("scrut","調べる",["scrut"]),
    ("sed","座る",["sid","sess","sed"]),
    ("sert","結ぶ・差し込む",["sert"]),
    ("sign","印",["sign"]),
    ("son","音",["sonor","resona","sonat","unison","sonic"]),
    ("sort","種類・運命",["sort"]),
    ("spers","まく",["spers"]),
    ("string","縛る",["string","strict","strain"]),
    ("tenu","細い",["tenu"]),
    ("test","証言する",["test"]),
    ("tim","恐れる",["timid","timor"]),
    ("trib","与える",["trib"]),
    ("turb","かき乱す",["turb"]),
    ("umbr","影",["umbr"]),
    ("und","波",["unda"]),
    ("util","使う",["util","usur","usual"]),
    ("cord","心",["cord","courag"]),
    ("ann","年",["annu","enni","anniv"]),
    ("cern","分ける",["cern","cret"]),
    ("norm","規範",["norm"]),
    ("term","境界",["term"]),
    ("part","部分",["part"]),
    ("ward","〜の方へ",["ward"]),
    # ---- v3.2 追加(正しい語源での拡張) ----
    ("cogn","知る",["cogn","gnos","gniz","gnor"]),
    ("err","さまよう・誤る",["err"]),
    ("the","神",["theo","athei","enthus","pantheo"]),
    ("thes","置く(ギリシャ)",["thesis","thet","thesi"]),
    ("esthe","感覚(ギリシャ)",["esthet","esthesi"]),
    ("arch","支配・最初",["arch"]),
    ("phob","恐れ",["phob"]),
    ("morph","形",["morph"]),
    ("soph","知恵",["soph"]),
    ("scop","見る(ギリシャ)",["scop"]),
    ("crat","支配",["crat","cracy"]),
    ("polis","都市(ギリシャ)",["polis","polit","polic"]),
    ("typ","型",["typ"]),
    ("techn","技術",["techn"]),
    ("top","場所(ギリシャ)",["topi","topo"]),
    ("cosm","宇宙・秩序",["cosm"]),
    ("hydr","水(ギリシャ)",["hydr"]),
    ("nomy","法・分配(ギリシャ)",["nomy","nomic","nomous"]),
    ("phys","自然",["phys"]),
    ("dox","意見",["dox"]),
    ("tom","切る(ギリシャ)",["tomy","atom","epitom"]),
    ("phras","言い回し",["phras"]),
    ("vinc","勝つ",["vinc","vict"]),
    ("vad","行く",["vade","vasi","vasio"]),
    ("vag","さまよう",["vagu","vagab","vagr","travag"]),
    ("vol","意志",["volunt","volen"]),
    ("via","道",["obvi","devi","trivi","previ","convey","voyag"]),
    ("vulg","大衆",["vulg"]),
    ("rog","尋ねる・要求",["rog"]),
    ("put","考える・刈る",["put"]),
    ("prec","祈る・価値",["preci","precat"]),
    ("pung","刺す",["pung","punct","poign"]),
    ("pug","戦う",["pugn"]),
    ("priv","切り離す",["priv"]),
    ("rid","笑う",["ridicul","derid","deris"]),
    ("sen","老い",["senil","senat","senior"]),
    ("sper","希望",["desper","prosper"]),
    ("asper","粗い",["asper"]),
    ("spond","誓う・応える",["spond","spons"]),
    ("stingu","消す・突く",["stingu","stinct"]),
    ("tail","切る",["tail"]),
    ("text","織る",["text"]),
    ("tut","守る・教える",["tutor","tuiti","tutel"]),
    ("jur","法・誓う",["jur","judic","justi"]),
    ("lat","運ぶ(latum)",["relat","translat","superlat"]),
    ("limin","敷居",["limin"]),
    ("liter","文字",["liter"]),
    ("luct","苦闘",["luct"]),
    ("lun","月",["lunar","lunat"]),
    ("mar","海",["marine","marit"]),
    ("mater","母",["matern","matri"]),
    ("pater","父",["patern","patri","patron"]),
    ("merg","沈む",["merg","mers"]),
    ("min","突き出る",["eminen","promin","imminen"]),
    ("minu","小さい",["minut","minish","minim","minor"]),
    ("mir","驚く",["mirac","admir","marvel"]),
    ("mod","尺度",["mod"]),
    ("mon","警告・示す",["monit","monish","monstr"]),
    ("mun","義務・贈与",["muni"]),
    ("nav","船",["navig","naval"]),
    ("nect","結ぶ",["nect","nex"]),
    ("noct","夜",["noct"]),
    ("not","印・知る",["notic","notif","notion","notor","denot","annot","notabl"]),
    ("numer","数",["numer"]),
    ("nutr","養う",["nutri","nurtu","nouris"]),
    ("ord","順序",["ordin","order"]),
    ("pac","平和",["pacif","appeas"]),
    ("par","見える",["appar","transpar"]),
    ("pari","等しい",["compar","dispar","parit"]),
    ("plor","叫ぶ・泣く",["plor"]),
    ("pred","獲物",["preda"]),
    ("dom","家・支配",["domin","domest","domic","domit"]),
    ("dorm","眠る",["dorm"]),
    ("dol","悲しみ",["condol","dolef","indolen"]),
    ("dub","疑う",["dubi"]),
    ("dyn","力",["dynam","dynast"]),
    ("fug","逃げる",["fug"]),
    ("fund","底・注ぐ",["fund","found"]),
    ("fract","壊す",["fract","frag","fring"]),
    ("fend","打つ",["fend","fens"]),
    ("flict","打つ",["flict"]),
    ("flor","花",["flor","flour"]),
    ("grav","重い",["grav","griev"]),
    ("hum","土・低い",["humili","humbl"]),
    ("insul","島",["insul","isolat"]),
    ("iter","行く(ire)",["transit","itiner","initi","ambiti"]),
    ("langu","弱る",["langui"]),
    ("maj","より大きい",["major","maxim","majest"]),
    ("ment","心",["mental","dement","mentio"]),
    ("omni","すべて",["omni"]),
    ("oper","働く",["oper"]),
    ("pand","広げる",["expand","expans"]),
    ("plaud","拍手",["plaud","plaus"]),
    ("propri","自分の",["propri"]),
    ("pud","恥",["repudi","impud"]),
    ("pur","清い",["purif","purit","impur"]),
    ("rig","硬い",["rigid","rigor"]),
    ("riv","川",["rival","deriv"]),
    ("rob","力強い",["robust","corrobor"]),
    ("rud","粗い",["rudim","erudit"]),
    ("salu","健康",["salut"]),
    ("sap","味わう・知る",["sapien","savor","insipid"]),
    ("semin","種",["semin"]),
    ("serv","仕える・保つ",["serv"]),
    ("soci","仲間",["soci"]),
    ("sol","ひとり",["solit","desolat","soliloqu"]),
    ("somn","眠り",["somn"]),
    ("stell","星",["stell"]),
    ("stig","印・刺す",["stigm","instig"]),
    ("suad","勧める",["suad","suas"]),
    ("sum","取る",["sume","sumpt"]),
    ("surg","立ち上がる",["surg","surrect"]),
    ("tac","黙る",["tacit","reticen"]),
    ("temper","調節する",["temper"]),
    ("tempt","試す",["tempt"]),
    ("temn","軽蔑する",["contempt","contemn"]),
    ("toler","耐える",["toler"]),
    ("torp","鈍い",["torp"]),
    ("trem","震える",["trem"]),
    ("trep","おののく",["trepid"]),
    ("trit","すり減る",["trite","attrit","contrit"]),
    ("ultim","最後",["ultim"]),
    ("veh","運ぶ",["vehic","vehem"]),
    ("vel","覆う",["veil","reveal","velop"]),
    ("verg","傾く",["verge","converg","diverg"]),
    ("vest","衣・投資",["vest"]),
    ("vig","活気",["vigor","vigil","invigor"]),
    ("vot","誓う",["devot","votio","vote"]),
    ("vuls","引き抜く",["vuls"]),
    # ---- レビューで判明した「正しい語根」の追加 ----
    ("ferv","沸き立つ",["ferv","ferment"]),
    ("fraud","欺く",["fraud"]),
    ("laud","褒める",["laud"]),
    ("audac","大胆(audere)",["audac"]),
    ("hered","相続",["hered","herit"]),
    ("dign","値する・威厳",["dign"]),
    ("crim","罪",["crim"]),
    ("juven","若い",["juven"]),
    ("melior","より良い",["melior"]),
    ("splend","輝く",["splend"]),
    ("linqu","残す・離れる",["linqu"]),
    ("flagr","燃える",["flagr"]),
    ("capit","頭",["capit","cipit"]),
    ("cresc","育つ・増える",["cresc","crement","accru"]),
    # ---- 未タグ語のレビューから追加(すべて実際の語源に基づく) ----
    ("alter","他の(alter)",["alter","altru"]),
    ("am","愛する(amare)",["amicab","amiab","enamor","amorous","enmit"]),
    ("acer","鋭い(acer)",["acerb","acrid","acrim"]),
    ("apt","適した(aptus)",["adept","inept","aptit"]),
    ("agon","闘い(ギリシャ)",["agon"]),
    ("alt","高い(altus)",["exalt","altitud","haught"]),
    ("alesc","育つ(alere)",["alesc","adolesc"]),
    ("ard","燃える(ardere)",["ardor","arden","ardu"]),
    ("auster","厳しい(ギリシャ)",["auster"]),
    ("aug","増やす(augere)",["augment"]),
    ("brev","短い(brevis)",["brevi","abbrevi","abridg"]),
    ("cand","白く輝く(candere)",["candid","candor","incandes"]),
    ("capr","山羊(caper)",["capric"]),
    ("caust","焼く(ギリシャ)",["caust"]),
    ("cinct","締める(cingere)",["cinct"]),
    ("clem","温和(clemens)",["clemen"]),
    ("clim","気候・傾き(ギリシャ)",["climat","climax"]),
    ("coerc","閉じ込める(arcere)",["coerc"]),
    ("cup","欲する(cupere)",["covet","cupid"]),
    ("culp","罪(culpa)",["culp"]),
    ("crypt","隠す(ギリシャ)",["crypt"]),
    ("deb","負う(debere)",["debt","duly","dutif"]),
    ("dogm","考え(ギリシャ)",["dogm"]),
    ("ev","時代(aevum)",["longev","mediev","primev"]),
    ("fab","話す(fari)",["affab","fabl","ineffab"]),
    ("fabr","職人(faber)",["fabric"]),
    ("fall","欺く(fallere)",["fallac","fallib","falsif"]),
    ("febr","熱(febris)",["fever"]),
    ("flam","炎(flamma)",["flamb","flamm","inflam"]),
    ("grand","大きい(grandis)",["grand"]),
    ("hemer","日(ギリシャ)",["ephemer"]),
    ("hom","人(homo)",["homag","homici"]),
    ("imper","命令・支配(imperare)",["imperiou","imperat"]),
    ("ira","怒り(ira)",["irate","irasc"]),
    ("jubil","歓呼(jubilare)",["jubil"]),
    ("lament","嘆く(lamentari)",["lament"]),
    ("latu","広い(latus)",["latitud","dilat"]),
    ("leth","忘却(ギリシャ)",["letharg"]),
    ("litig","訴訟(lis)",["litig"]),
    ("macul","染み(macula)",["macul"]),
    ("mal","悪(malus)",["malign","malic"]),
    ("mont","山・登る(mons)",["mount"]),
    ("mor","習慣(mos)",["moral","moros"]),
    ("nebul","霧(nebula)",["nebul"]),
    ("nihil","無(nihil/nullus)",["nihil","null"]),
    ("omin","前兆(omen)",["ominou","abomin"]),
    ("op","富・力(ops)",["opulen","copiou"]),
    ("ops","目(ギリシャ)",["myop","synops"]),
    ("palp","触れる(palpare)",["palp"]),
    ("pauc","少ない(paucus)",["paucit"]),
    ("pecc","罪を犯す(peccare)",["pecc"]),
    ("peril","危険(periculum)",["peril"]),
    ("phren","心(ギリシャ)",["phren","frenz"]),
    ("plant","植える(planta)",["plant"]),
    ("pragma","行う(ギリシャ)",["pragma"]),
    ("prompt","取り出す(promere)",["prompt"]),
    ("prud","先見(providere)",["pruden"]),
    ("queri","嘆く(queri)",["querul","quarrel"]),
    ("quies","静けさ(quies)",["quiesc","tranquil"]),
    ("ranc","腐る(rancere)",["rancor","rancid"]),
    ("rap","奪う(rapere)",["rapac","surrept","rapid","ravag","ravish"]),
    ("sag","鋭い・賢い(sagire)",["sagac"]),
    ("scrup","良心の呵責(scrupulus)",["scrup"]),
    ("seren","晴れた(serenus)",["serene","serenit"]),
    ("solac","慰める(solari)",["solace","consolat"]),
    ("solid","固い(solidus)",["solid"]),
    ("stup","呆然(stupere)",["stupor","stupef","stupend"]),
    ("suprem","最上(supremus)",["suprem"]),
    ("ted","飽きる(taedium)",["tediu","tedio"]),
    ("temer","無謀(temere)",["temeri"]),
    ("trunc","幹・切る(truncus)",["trunc"]),
    ("tyran","専制(ギリシャ)",["tyran"]),
    ("ubiqu","どこにでも(ubique)",["ubiqu"]),
    ("vic","交代・代理(vicis)",["vicar","viciss"]),
    ("vil","卑しい(vilis)",["vilif","revil"]),
    ("vindic","守る・報復(vindicare)",["vindic","vendett","venge"]),
    ("vir","男・力(vir)",["viril","virtu"]),
    ("virul","毒(virus)",["virul"]),
    ("vola","飛ぶ(volare)",["volatil"]),
    ("zeal","熱意(ギリシャzelos)",["zeal"]),
]
# レビューを踏まえた既存語根へのパターン追加
for _t,_pats in [
    ("sacr",["secrat"]),("vinc",["vanqu"]),("util",["utensil"]),("vig",["surveil"]),
    ("ven",["coven"]),("lat",["elat"]),("min",["menac"]),("tend",["ostent"]),
    ("pend",["penchan","ponder"]),("via",["pervi"]),("viv",["viab"]),("vol",["voliti"]),
    ("sal",["salien"]),("umbr",["somber","sombre"]),("spers",["spars"]),("sol",["sullen"]),
    ("tain",["tenac","tenet"]),("petit",["petulan"]),
]:
    for _i,(t,m,pats) in enumerate(ROOTS):
        if t==_t: ROOTS[_i]=(t,m,pats+_pats)
PREFIXES.extend([("be","すっかり・〜に(古英語)"),("eu","良い(ギリシャ)"),("post","後に")])

# 誤タグの抑制: 単語 → 付けない語根名のリスト(全250ファミリーの目視レビュー結果)
BLOCK = {
    # mit(送る)ではない
    "calamity":["mit"], "enmity":["mit"], "hermit":["mit"], "proximity":["mit"],
    "summit":["mit"], "mitigate":["mit"],
    # vert(回す)ではない(over-の誤爆)
    "overshadow":["vert"], "oversight":["vert"], "overstate":["vert"], "overthrow":["vert"],
    "overtly":["vert"], "overture":["vert"],
    # fer(運ぶ)ではない
    "coffer":["fer"], "effervescent":["fer"], "ferment":["fer"], "ferocity":["fer"],
    "fervor":["fer"], "inferno":["fer"], "pilfer":["fer"], "fervent":["ven","fer"],
    "formidable":["form"], "impound":["pos"],
    "taint":["tain"], "ascertain":["tain"], "havoc":["voc"],
    # gen(生む)ではない(agere等)
    "cogent":["gen"], "contingency":["gen"], "exigency":["gen"], "indulgent":["gen"],
    "intransigence":["gen"], "indigent":["gen"],
    "gravitate":["viv"], "gaudy":["aud"], "maudlin":["aud"],
    "avid":["vis"], "lavish":["vis"], "visceral":["vis"],
    "sacred":["cred"], "scurry":["cur"],
    "allegiance":["lect"], "apoplectic":["lect"], "deflect":["lect"], "elegy":["lect"],
    # sci(知る)ではない
    "oscillate":["sci"], "rescind":["sci"], "resuscitate":["sci"], "scintillating":["sci"],
    "irascible":["sci"],
    "disentangle":["sens","tact"],
    # tact(触れる)ではない(agere等)
    "castigate":["tact"], "indefatigable":["tact"], "litigation":["tact"], "prestige":["tact"],
    "vacillate":["vac"],
    "insolvent":["ven"], "veneer":["ven"], "venerable":["ven"], "venerate":["ven"],
    "fickle":["fac"], "reciprocate":["cap"], "pelt":["puls"], "stupendous":["pend"],
    "dregs":["rect"], "regale":["rect"], "regurgitate":["rect"], "utensil":["tend"],
    "conflagration":["grat"], "denigrate":["grat"], "opaque":["aqua"],
    "catastrophe":["astr"], "monastery":["astr"], "pandemonium":["dem"],
    "bludgeon":["geo"], "burgeon":["geo"], "peddle":["ped"], "stampede":["ped"],
    "reprimand":["prim","mand"], "curb":["urb"], "refurbish":["urb"],
    "overbearing":["verb"], "fidget":["fid"],
    "behest":["her"], "ethereal":["her"], "heresy":["her"], "orchestrate":["her"],
    "hereditary":["her"], "seclusion":["lud"], "forthright":["fort"], "henceforth":["fort"],
    # nat(生まれる)ではない(-nateの誤爆)
    "alienate":["nat"], "consternation":["nat"], "contaminate":["nat"], "culminate":["nat"],
    "culmination":["nat"], "detonate":["nat"], "emanate":["nat"], "hibernate":["nat"],
    "incriminate":["nat"], "indignation":["nat"], "indoctrinate":["nat"], "machination":["nat"],
    "obstinate":["nat"], "ornate":["nat"], "procrastinate":["nat"], "rejuvenate":["nat"],
    "ruminate":["nat"], "snatch":["nat"], "stagnate":["nat"],
    "caliber":["liber"],
    "obsequious":["equ"], "prerequisite":["equ"], "requisition":["equ"],
    "clamber":["clam"], "clammy":["clam"], "behemoth":["mob"], "smother":["mob"],
    "clinch":["clin"], "fluster":["flu"], "obfuscate":["fus"], "migraine":["migr"],
    # ora(口)ではない
    "ameliorate":["ora"], "corroborate":["ora"], "elaborate":["ora"], "invigorate":["ora"],
    "moratorium":["ora"], "pejorative":["ora"],
    "resplendent":["plen"], "splendor":["plen"],
    "pristine":["prehend"], "uprising":["prehend"],
    "improvise":["prob"], "provenance":["prob"], "provision":["prob"], "provocation":["prob"],
    "quirk":["quir"], "squirm":["quir"], "relinquish":["quir"], "vanquish":["quir"],
    "sequester":["quir"],
    "extradite":["radi"], "sporadic":["radi"], "trudge":["trud"],
    "avalanche":["val"], "cavalier":["val"], "chivalrous":["val"], "upheaval":["val"],
    # veri(真実)ではない
    "feverishly":["veri"], "impoverished":["veri"], "maverick":["veri"], "pulverize":["veri"],
    "reverie":["veri"],
    "embellish":["bell"], "cynicism":["cid"], "exorcise":["cid"], "vicissitude":["cid"],
    "unkempt":["empt"], "shabby":["hab"], "oligarchy":["lig"],
    "blockade":["loc"], "gridlock":["loc"], "gamut":["mut"], "massacre":["sacr"],
    "sultry":["sal"], "bemused":["sed"], "sidestep":["sed"], "seditious":["sed"],
    "impersonate":["son"], "diatribe":["trib"], "tribulation":["trib"],
    "encumbrance":["umbr"], "mundane":["und"], "futile":["util"], "mutilate":["util"],
    "annul":["ann"], "aftermath":["term"], "intermittently":["term"], "spartan":["part"],
    "errand":["err"], "interrogate":["err"], "overrule":["err"], "overrun":["err"],
    "underrate":["err"], "pathetic":["thes"], "parch":["arch"],
    "consecrate":["crat"], "desecrate":["crat"], "idiosyncratic":["crat"], "lucrative":["crat"],
    "devise":["via"],
    "precipice":["prec"], "precipitate":["prec"], "precipitous":["prec"],
    "fluctuate":["luct"], "ammunition":["mun"], "inexorable":["nect"],
    "apparel":["par"], "apparition":["pari"], "incrementally":["ment"],
    "insomnia":["omni"], "fragrant":["fract"], "engrave":["grav"],
    "surveillance":["vel"], "livestock":["vest"], "vestige":["vest"],
    "contempt":["tempt"], "plaudit":["laud"],
    "impersonate":["nat","son"], "acrimony":["crim"],
    "bedlam":["pre:be"], "behemoth":["mob","pre:be"],
    "postulate":["pre:post"], "posture":["pre:post"],
    "falter":["alter"], "warden":["ard"], "paragon":["agon"],
    "platitude":["latu"], "dilatory":["latu"],
    "extravagant":["rap"], "scavenge":["vindic"],
}

def word_tags(w, block):
    tags=[]
    entries=[]
    for i,(t,m,pats) in enumerate(ROOTS):
        for p in pats:
            if len(p)>=3: entries.append((len(p),p,i))
    entries.sort(key=lambda x:(-x[0],x[2]))
    got=set()
    blocked=set(block.get(w,[]))
    for ln,p,i in entries:
        if i in got: continue
        if ROOTS[i][0] in blocked: continue
        if p in w:
            if ln<4 and len(tags)>=1: continue  # 3文字パターンは2つ目のタグには使わない
            tags.append(("R",i)); got.add(i)
            if len(tags)>=2: break
    if len(tags)<2:
        for i,(p,m) in sorted(enumerate(PREFIXES),key=lambda x:-len(x[1][0])):
            if w.startswith(p) and len(w)-len(p)>=4:
                if "pre:"+p in blocked: break
                tags.append(("P",i)); break
    return tags

words=re.findall(r'\{en:"([a-z-]+)"', io.open("js/words.js",encoding="utf-8").read())

mode=sys.argv[1] if len(sys.argv)>1 else "report"

cov=0; rootcov=0
fam=collections.defaultdict(list)
for w in words:
    tags=word_tags(w, BLOCK)
    if tags: cov+=1
    roots=[t for t in tags if t[0]=="R"]
    if roots: rootcov+=1
    for t in roots: fam[ROOTS[t[1]][0]].append(w)
print("total %d / any %d (%.0f%%) / root %d (%.0f%%) / families %d"%(
    len(words),cov,100.0*cov/len(words),rootcov,100.0*rootcov/len(words),len(fam)))

if mode=="report":
    out=[]
    for t,m,pats in ROOTS:
        ws=fam.get(t,[])
        if ws: out.append("%s(%s)[%d]: %s"%(t,m,len(ws),", ".join(sorted(set(ws)))))
    io.open('scripts/root_families.txt','w',encoding='utf-8').write("\n".join(out))
    print("wrote scripts/root_families.txt (%d families)"%len(fam))
elif mode=="genjs":
    def js_str(s): return '"'+s+'"'
    lines=[]
    lines.append('"use strict";')
    lines.append('/* ================= 語源(語根・接辞)辞書 =================')
    lines.append('   綴りからのパターンマッチ+誤タグ抑制リストで語源タグを決定的に導出(保存せず導出)。')
    lines.append('   ファミリー一覧は目視レビュー済み(誤りを見つけたら BLOCK に追記)。')
    lines.append('   語根タグは「共鳴」(同語根が同じ節に並ぶと強化)の判定にも使う。接頭辞は表示のみ。 */')
    lines.append('const ROOT_DEFS=[')
    for t,m,pats in ROOTS:
        lines.append('  {t:%s, m:%s, pat:[%s]},'%(js_str(t),js_str(m),",".join(js_str(p) for p in pats if len(p)>=3)))
    lines.append('];')
    lines.append('const PREFIX_DEFS=[')
    for p,m in PREFIXES:
        lines.append('  {t:%s, m:%s},'%(js_str(p),js_str(m)))
    lines.append('];')
    lines.append('/* 誤タグの抑制: 単語 → 付けない語根名(レビューで確認した誤検出) */')
    lines.append('const ROOT_BLOCK={')
    for w in sorted(BLOCK):
        lines.append('  %s:[%s],'%(js_str(w),",".join(js_str(t) for t in BLOCK[w])))
    lines.append('};')
    lines.append('''
/* パターンを長い順に展開(短い綴りの誤爆を減らす)。3文字パターンは2つ目のタグには使わない */
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
  const blocked=ROOT_BLOCK[w]||[];
  const tags=[], got={};
  for(const [p,i] of _ROOT_PATS){
    if(got[i]) continue;
    if(blocked.indexOf(ROOT_DEFS[i].t)>=0) continue;
    if(p.length<4 && tags.length>=1) continue;
    if(w.indexOf(p)>=0){ tags.push({kind:"R", i}); got[i]=1; if(tags.length>=2) break; }
  }
  if(tags.length<2){
    for(const i of _PREFIX_ORDER){
      const p=PREFIX_DEFS[i].t;
      if(w.startsWith(p) && w.length-p.length>=4 && blocked.indexOf("pre:"+p)<0){
        tags.push({kind:"P", i}); break;
      }
    }
  }
  return _rootsCache[en]=tags;
}
/* 共鳴判定に使う語根IDのみ(接頭辞は家族が大きすぎるため対象外) */
function rootIdsOf(en){
  return wordRoots(en).filter(t=>t.kind==="R").map(t=>t.i);
}
/* 表示用テキスト: "spec(見る)・pre-(前もって)" */
function rootText(en){
  const tags=wordRoots(en);
  if(!tags.length) return "";
  return tags.map(t=> t.kind==="R"
    ? ROOT_DEFS[t.i].t+"("+ROOT_DEFS[t.i].m+")"
    : PREFIX_DEFS[t.i].t+"-("+PREFIX_DEFS[t.i].m+")").join("・");
}
''')
    io.open("js/roots.js","w",encoding="utf-8",newline="\n").write("\n".join(lines))
    print("wrote js/roots.js")
