/* ==========================================================================
   GBTI 玄学操盘适配度 · AI 模块（纯增量，不改动原有任何逻辑）
   --------------------------------------------------------------------------
   依赖（均为本页面已加载 / 随本模块一起引入的全局）：
   - window.Solar / window.Lunar  —— 由 lunar.js 提供（与 lunar-python 同作者的浏览器版）
   - personalities / dimensions   —— scoring.js / questions.js 中已定义的全局

   职责（对应课程要求的三件事）：
   1) 生成与 16 型呼应的玄学标签，合成「GBTI 四维 + 玄学维度」的双维画像；
   2) 结合「类型 + 当日卦象/节气/黄历」，输出 0–100 的操盘适配度与理由；
   3) 按适配度给投教建议：适合动手 / 适合复盘学习 / 适合观望。

   定位：投资者教育与传统文化体验，不构成投资建议。
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------- 八卦与六十四卦 ---------------- */

  var TRIGRAMS = { "111": "乾", "110": "兑", "101": "离", "100": "震", "011": "巽", "010": "坎", "001": "艮", "000": "坤" };
  var TRIGRAM_NATURE = { "乾": "天", "兑": "泽", "离": "火", "震": "雷", "巽": "风", "坎": "水", "艮": "山", "坤": "地" };

  // 文王卦序 64 卦。lines 为六爻自下而上，'1' 阳 '0' 阴。
  // momentum 为「动能分」，是本模块为投资语境设定的一组可调口径，非传统命理结论。
  var HEXAGRAMS = [
    { no: 1, name: "乾", pinyin: "qián", lines: "111111", keyword: "刚健进取", momentum: 85, hint: "势能最旺，宜主动布局，但忌刚愎满仓。" },
    { no: 2, name: "坤", pinyin: "kūn", lines: "000000", keyword: "柔顺承载", momentum: 45, hint: "宜承接守成、以静待动，忌争先冒进。" },
    { no: 3, name: "屯", pinyin: "zhūn", lines: "100010", keyword: "初创维艰", momentum: 35, hint: "起步多阻，宜小仓试错、逐步摸底。" },
    { no: 4, name: "蒙", pinyin: "méng", lines: "010001", keyword: "蒙昧待启", momentum: 35, hint: "信息不清，宜先做功课再动手。" },
    { no: 5, name: "需", pinyin: "xū", lines: "111010", keyword: "待时而动", momentum: 55, hint: "时机未到，宜耐心等待而非抢跑。" },
    { no: 6, name: "讼", pinyin: "sòng", lines: "010111", keyword: "争讼冲突", momentum: 30, hint: "分歧加剧，宜回避对抗、避免情绪化。" },
    { no: 7, name: "师", pinyin: "shī", lines: "010000", keyword: "统兵有序", momentum: 60, hint: "需要纪律与计划，忌无章法操作。" },
    { no: 8, name: "比", pinyin: "bǐ", lines: "000010", keyword: "亲比团结", momentum: 65, hint: "宜跟随主流共识，忌孤军深入。" },
    { no: 9, name: "小畜", pinyin: "xiǎo xù", lines: "111011", keyword: "小有积蓄", momentum: 55, hint: "宜积小胜为多，不宜一次性重仓。" },
    { no: 10, name: "履", pinyin: "lǚ", lines: "110111", keyword: "谨慎前行", momentum: 50, hint: "如履薄冰，宜严格控仓、设好止损。" },
    { no: 11, name: "泰", pinyin: "tài", lines: "111000", keyword: "通达顺遂", momentum: 88, hint: "上下通畅，宜顺势而为。" },
    { no: 12, name: "否", pinyin: "pǐ", lines: "000111", keyword: "闭塞不通", momentum: 22, hint: "内外阻隔，宜空仓观望、保存实力。" },
    { no: 13, name: "同人", pinyin: "tóng rén", lines: "101111", keyword: "同心协力", momentum: 70, hint: "宜借助共识与协作，忌独断专行。" },
    { no: 14, name: "大有", pinyin: "dà yǒu", lines: "111101", keyword: "大有所获", momentum: 85, hint: "处于收获期，宜落袋并重新评估。" },
    { no: 15, name: "谦", pinyin: "qiān", lines: "001000", keyword: "谦逊守成", momentum: 72, hint: "盈满当谦，忌因浮盈而膨胀。" },
    { no: 16, name: "豫", pinyin: "yù", lines: "000100", keyword: "和乐预备", momentum: 68, hint: "情绪偏乐观，仍需备好应对预案。" },
    { no: 17, name: "随", pinyin: "suí", lines: "100110", keyword: "随势而动", momentum: 60, hint: "宜顺势跟随，忌逆势硬抗。" },
    { no: 18, name: "蛊", pinyin: "gǔ", lines: "011001", keyword: "整顿积弊", momentum: 48, hint: "宜复盘纠错、清理不合理的持仓。" },
    { no: 19, name: "临", pinyin: "lín", lines: "110000", keyword: "临事而进", momentum: 70, hint: "机会临近，可考虑渐进式建仓。" },
    { no: 20, name: "观", pinyin: "guān", lines: "000011", keyword: "观察等待", momentum: 52, hint: "以观察为主，忌频繁交易。" },
    { no: 21, name: "噬嗑", pinyin: "shì kè", lines: "100101", keyword: "明断除障", momentum: 58, hint: "宜果断清除障碍，忌拖泥带水。" },
    { no: 22, name: "贲", pinyin: "bì", lines: "101001", keyword: "文饰修饰", momentum: 50, hint: "易重表象轻实质，宜回归基本面。" },
    { no: 23, name: "剥", pinyin: "bō", lines: "000001", keyword: "剥落衰退", momentum: 20, hint: "结构走弱，宜减仓避险。" },
    { no: 24, name: "复", pinyin: "fù", lines: "100000", keyword: "一阳来复", momentum: 68, hint: "触底回升，宜分批小步布局。" },
    { no: 25, name: "无妄", pinyin: "wú wàng", lines: "100111", keyword: "守正无妄", momentum: 72, hint: "守正待变，忌投机取巧。" },
    { no: 26, name: "大畜", pinyin: "dà xù", lines: "111001", keyword: "大有蓄积", momentum: 80, hint: "蓄势充足，宜谋定而后动。" },
    { no: 27, name: "颐", pinyin: "yí", lines: "100001", keyword: "养正待机", momentum: 55, hint: "宜养精蓄锐、补齐认知功课。" },
    { no: 28, name: "大过", pinyin: "dà guò", lines: "011110", keyword: "过载非常", momentum: 32, hint: "承压过重，宜降杠杆、卸负担。" },
    { no: 29, name: "坎", pinyin: "kǎn", lines: "010010", keyword: "险中求存", momentum: 28, hint: "风险叠加，宜极致防守。" },
    { no: 30, name: "离", pinyin: "lí", lines: "101101", keyword: "光明附丽", momentum: 72, hint: "景气明朗，宜择优而栖。" },
    { no: 31, name: "咸", pinyin: "xián", lines: "001110", keyword: "感应相通", momentum: 70, hint: "市场易共振，宜顺势联动。" },
    { no: 32, name: "恒", pinyin: "héng", lines: "011100", keyword: "恒久持守", momentum: 75, hint: "宜长期持有，忌频繁换手。" },
    { no: 33, name: "遁", pinyin: "dùn", lines: "001111", keyword: "退避隐忍", momentum: 35, hint: "宜主动撤退，保存实力。" },
    { no: 34, name: "大壮", pinyin: "dà zhuàng", lines: "111100", keyword: "强盛有力", momentum: 82, hint: "势强而正，宜顺势但设好止盈。" },
    { no: 35, name: "晋", pinyin: "jìn", lines: "000101", keyword: "晋升向上", momentum: 83, hint: "趋势向上，宜持有待涨。" },
    { no: 36, name: "明夷", pinyin: "míng yí", lines: "101000", keyword: "韬光养晦", momentum: 32, hint: "宜藏锋守拙，少动多看。" },
    { no: 37, name: "家人", pinyin: "jiā rén", lines: "101011", keyword: "内治有序", momentum: 70, hint: "宜先理清自己的交易规则再出手。" },
    { no: 38, name: "睽", pinyin: "kuí", lines: "110101", keyword: "乖离分歧", momentum: 38, hint: "方向背离，宜降低仓位。" },
    { no: 39, name: "蹇", pinyin: "jiǎn", lines: "001010", keyword: "险阻难行", momentum: 25, hint: "举步维艰，宜暂停操作。" },
    { no: 40, name: "解", pinyin: "jiě", lines: "010100", keyword: "舒缓解脱", momentum: 72, hint: "压力释放，宜逐步恢复参与。" },
    { no: 41, name: "损", pinyin: "sǔn", lines: "110001", keyword: "减损节制", momentum: 48, hint: "宜做减法，聚焦核心持仓。" },
    { no: 42, name: "益", pinyin: "yì", lines: "100011", keyword: "增益有利", momentum: 84, hint: "顺势增益，宜择机加码。" },
    { no: 43, name: "夬", pinyin: "guài", lines: "111110", keyword: "决断果行", momentum: 75, hint: "宜果断执行既定策略。" },
    { no: 44, name: "姤", pinyin: "gòu", lines: "011111", keyword: "不期而遇", momentum: 50, hint: "突发变量出现，宜保持警惕。" },
    { no: 45, name: "萃", pinyin: "cuì", lines: "000110", keyword: "聚集汇合", momentum: 70, hint: "资金汇聚，宜关注主线热点。" },
    { no: 46, name: "升", pinyin: "shēng", lines: "011000", keyword: "上升渐进", momentum: 80, hint: "稳步上行，宜持有并耐心。" },
    { no: 47, name: "困", pinyin: "kùn", lines: "010110", keyword: "困顿受制", momentum: 25, hint: "处处受掣，宜保持最小仓位。" },
    { no: 48, name: "井", pinyin: "jǐng", lines: "011010", keyword: "井养不穷", momentum: 68, hint: "稳定供给之象，宜用定投思维。" },
    { no: 49, name: "革", pinyin: "gé", lines: "101110", keyword: "变革更新", momentum: 74, hint: "宜顺势换仓、更新策略。" },
    { no: 50, name: "鼎", pinyin: "dǐng", lines: "011101", keyword: "鼎新稳固", momentum: 82, hint: "格局重塑，宜在新方向建仓。" },
    { no: 51, name: "震", pinyin: "zhèn", lines: "100100", keyword: "震动惊变", momentum: 40, hint: "波动剧烈，宜以静制动。" },
    { no: 52, name: "艮", pinyin: "gèn", lines: "001001", keyword: "止而不动", momentum: 35, hint: "宜及时止损、按兵不动。" },
    { no: 53, name: "渐", pinyin: "jiàn", lines: "001011", keyword: "循序渐进", momentum: 72, hint: "宜稳扎稳打、分批建仓。" },
    { no: 54, name: "归妹", pinyin: "guī mèi", lines: "110100", keyword: "急就失序", momentum: 38, hint: "急于求成易出错，宜放缓节奏。" },
    { no: 55, name: "丰", pinyin: "fēng", lines: "101100", keyword: "丰盛盈满", momentum: 80, hint: "宜享受趋势，同时警惕盛极而衰。" },
    { no: 56, name: "旅", pinyin: "lǚ", lines: "001101", keyword: "漂泊无依", momentum: 35, hint: "无根之象，宜轻仓短线。" },
    { no: 57, name: "巽", pinyin: "xùn", lines: "011011", keyword: "顺入渐进", momentum: 60, hint: "宜柔性渗透、稳步跟进。" },
    { no: 58, name: "兑", pinyin: "duì", lines: "110110", keyword: "和悦通畅", momentum: 72, hint: "氛围向好，宜适度参与。" },
    { no: 59, name: "涣", pinyin: "huàn", lines: "010011", keyword: "涣散流离", momentum: 38, hint: "人心涣散，宜规避不确定性。" },
    { no: 60, name: "节", pinyin: "jié", lines: "110010", keyword: "节制有度", momentum: 68, hint: "宜设定明确规则与纪律。" },
    { no: 61, name: "中孚", pinyin: "zhōng fú", lines: "110011", keyword: "诚信中实", momentum: 74, hint: "宜遵循已验证有效的逻辑。" },
    { no: 62, name: "小过", pinyin: "xiǎo guò", lines: "001100", keyword: "小有过越", momentum: 42, hint: "只宜小动作，忌大举进击。" },
    { no: 63, name: "既济", pinyin: "jì jì", lines: "101010", keyword: "事已成定", momentum: 60, hint: "阶段任务完成，宜总结与守成。" },
    { no: 64, name: "未济", pinyin: "wèi jì", lines: "010101", keyword: "未竟待续", momentum: 55, hint: "仍在途中，宜耐心收尾。" }
  ];

  var BY_LINES = {};
  HEXAGRAMS.forEach(function (h) { BY_LINES[h.lines] = h; });
  function byLines(lines) { return BY_LINES[lines] || HEXAGRAMS[0]; }
  function hexView(h) {
    var lower = TRIGRAMS[h.lines.slice(0, 3)], upper = TRIGRAMS[h.lines.slice(3)];
    return {
      no: h.no, name: h.name, pinyin: h.pinyin, lines: h.lines, keyword: h.keyword,
      hint: h.hint, momentum: h.momentum,
      upper: { name: upper, nature: TRIGRAM_NATURE[upper] },
      lower: { name: lower, nature: TRIGRAM_NATURE[lower] },
      full_name: TRIGRAM_NATURE[upper] + TRIGRAM_NATURE[lower] + h.name,
      unicode: String.fromCodePoint(0x4DC0 + h.no - 1)
    };
  }

  /* ---------------- 十六型 × 玄学标签（双维画像的「玄学维度」） ---------------- */

  var XUANXUE_MAP = {
    "FLDO": { element: "土", hexagram: 15, yinYang: "偏阴", aura: ["厚德", "持重", "守序"], essence: "土德载物，谦而守正——以规矩御时间，以稳健成长期。" },
    "FLDJ": { element: "土", hexagram: 2, yinYang: "偏阴", aura: ["厚德", "明辨", "藏慧"], essence: "坤厚载物，藏慧于静——洞察本质而不失从容。" },
    "FLAO": { element: "木", hexagram: 46, yinYang: "偏阳", aura: ["生发", "蓄势", "有节"], essence: "木性生发，循序而升——规划成长，日进有功。" },
    "FLAJ": { element: "木", hexagram: 24, yinYang: "偏阳", aura: ["萌动", "向新", "不息"], essence: "一阳来复，生机萌动——探索不止，向新而生。" },
    "FSDO": { element: "金", hexagram: 60, yinYang: "偏阴", aura: ["收敛", "入微", "有据"], essence: "金性收敛，节以有度——核验入微，行止有据。" },
    "FSDJ": { element: "金", hexagram: 39, yinYang: "偏阴", aura: ["知止", "谋定", "周全"], essence: "见险知止，谋定后动——研判周全而后行。" },
    "FSAO": { element: "火", hexagram: 49, yinYang: "偏阳", aura: ["炎上", "鼎新", "取势"], essence: "火性炎上，革故鼎新——研策于变，快意取势。" },
    "FSAJ": { element: "火", hexagram: 55, yinYang: "偏阳", aura: ["敏锐", "明察", "猎机"], essence: "丰盈之象，明察秋毫——敏锐出手，猎于先机。" },
    "MLDO": { element: "水", hexagram: 63, yinYang: "偏阴", aura: ["顺势", "守成", "有序"], essence: "水性顺势，既济守成——循势执行，稳中有序。" },
    "MLDJ": { element: "水", hexagram: 20, yinYang: "偏阴", aura: ["如镜", "观势", "待时"], essence: "水静如镜，观而待时——洞察趋势，不急于动。" },
    "MLAO": { element: "木", hexagram: 53, yinYang: "偏阳", aura: ["随势", "渐进", "登高"], essence: "木随势生，循序渐进——长期追踪，稳步登高。" },
    "MLAJ": { element: "木", hexagram: 11, yinYang: "偏阳", aura: ["通泰", "乘势", "领航"], essence: "天地交泰，顺畅通达——领航长势，乘势而行。" },
    "MSDO": { element: "金", hexagram: 9, yinYang: "偏阴", aura: ["积小", "守序", "有度"], essence: "小有积蓄，纪律为先——波段有度，积少成多。" },
    "MSDJ": { element: "金", hexagram: 33, yinYang: "偏阴", aura: ["知进", "知退", "有节"], essence: "见机而动，知退能守——波段观察，进退有节。" },
    "MSAO": { element: "火", hexagram: 21, yinYang: "偏阳", aura: ["明断", "迅捷", "不乱"], essence: "明断除障，当机立断——敏捷执行，快而不乱。" },
    "MSAJ": { element: "火", hexagram: 43, yinYang: "偏阳", aura: ["果决", "锐利", "猎风"], essence: "决而果行，锐不可当——捕捉先机，猎于风起。" }
  };

  /* ---------------- 打分口径（可调，非传统命理结论） ---------------- */

  var ZHIXING_SCORE = { "建": 5, "除": 2, "满": 8, "平": 3, "定": 6, "执": -2, "破": -12, "危": -6, "成": 10, "收": 2, "开": 8, "闭": -8 };
  var TIANSHEN_SCORE = { "黄道": 8, "黑道": -8 };
  var LIUYAO_SCORE = { "大安": 6, "友引": 3, "先勝": 5, "先胜": 5, "先負": -4, "先负": -4, "佛滅": -8, "佛灭": -8, "赤口": -10 };
  var FINANCE_KEYWORDS = ["开市", "交易", "纳财", "立券", "出货财", "开仓", "置产", "进人口", "纳畜", "经络", "安机械"];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---------------- 日期键（必须用本地年月日） ---------------- */
  // 不能改用 toISOString()：它取的是 UTC 日期，在东八区，本地 00:00 对应
  // UTC 前一日 16:00，于是「选 11 月 11 日」会被算成 11 月 10 日，日期输入框
  // 也会跟着回退一天。这里与 tarot.js 的 ymd()/noonOf() 保持完全一致。
  function ymd(date) {
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
  }
  // 统一取「当天正午」代表某一天：避开午夜换算落到前一日，也避开夏令时切换。
  function noonOf(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0, 0); }
  function todayNoon() {
    var now = new Date();
    return noonOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /* ---------------- 确定性起卦（三枚铜钱法） ---------------- */

  function hashString(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cast(seedKey, question) {
    var rng = mulberry32(hashString(seedKey));
    var primary = [], changing = [], lineValues = [];
    for (var pos = 0; pos < 6; pos++) {
      var total = 0;
      for (var c = 0; c < 3; c++) total += (rng() < 0.5 ? 2 : 3);
      lineValues.push(total);
      primary.push((total === 7 || total === 9) ? "1" : "0");
      if (total === 6 || total === 9) changing.push(pos + 1);
    }
    var primaryLines = primary.join("");
    var res = {
      method: "三枚铜钱法",
      question: question || "今日是否适合操盘",
      line_values: lineValues,
      changing_lines: changing,
      primary: hexView(byLines(primaryLines))
    };
    if (changing.length) {
      var flipped = primary.map(function (c, i) {
        return changing.indexOf(i + 1) >= 0 ? (c === "1" ? "0" : "1") : c;
      }).join("");
      res.resulting = hexView(byLines(flipped));
    }
    return res;
  }

  /* ---------------- 黄历（lunar.js） ---------------- */

  function buildAlmanac(date) {
    if (typeof Solar === "undefined") return { available: false, date: ymd(date) };
    var solar = Solar.fromYmd(date.getFullYear(), date.getMonth() + 1, date.getDate());
    var lu = solar.getLunar();
    function s(fn, dflt) {
      try { var v = lu[fn](); return (v == null || v === "") ? dflt : v; } catch (e) { return dflt; }
    }
    function arr(fn) { try { var v = lu[fn](); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
    function jqName(o) { try { return o && o.getName ? o.getName() : ""; } catch (e) { return ""; } }
    function jqDay(o) { try { return o && o.getSolar ? o.getSolar().toYmd() : ""; } catch (e) { return ""; } }

    var prevObj = null, nextObj = null;
    try { prevObj = lu.getPrevJieQi(); } catch (e) { /* 忽略 */ }
    try { nextObj = lu.getNextJieQi(); } catch (e) { /* 忽略 */ }
    var prev = jqName(prevObj), next = jqName(nextObj);
    var prevDay = jqDay(prevObj), nextDay = jqDay(nextObj);

    return {
      available: true,
      date: ymd(date),
      week: "星期" + (s("getWeekInChinese", "")),
      lunar: {
        year: s("getYearInChinese", ""), month: s("getMonthInChinese", ""), day: s("getDayInChinese", ""),
        text: s("getYearInChinese", "") + "年" + s("getMonthInChinese", "") + "月" + s("getDayInChinese", "")
      },
      ganzhi: { year: s("getYearInGanZhi", ""), month: s("getMonthInGanZhi", ""), day: s("getDayInGanZhi", "") },
      shengxiao: s("getYearShengXiao", ""),
      nayin: s("getDayNaYin", ""),
      yi: arr("getDayYi"),
      ji: arr("getDayJi"),
      jishen: arr("getDayJiShen"),
      xiongsha: arr("getDayXiongSha"),
      chong: s("getDayChongDesc", ""),
      sha: s("getDaySha", ""),
      zhixing: s("getZhiXing", ""),
      tianshen: s("getDayTianShen", ""),
      tianshen_type: s("getDayTianShenType", ""),
      tianshen_luck: s("getDayTianShenLuck", ""),
      liuyao: s("getLiuYao", ""),
      xiu: s("getXiu", ""),
      xiu_luck: s("getXiuLuck", ""),
      positions: {
        "财神": s("getDayPositionCaiDesc", ""), "喜神": s("getDayPositionXiDesc", ""),
        "福神": s("getDayPositionFuDesc", ""), "阳贵": s("getDayPositionYangGuiDesc", ""),
        "阴贵": s("getDayPositionYinGuiDesc", "")
      },
      pengzu: [s("getPengZuGan", ""), s("getPengZuZhi", "")],
      yuexiang: s("getYueXiang", ""),
      jieqi: {
        today: s("getJieQi", ""),
        prev: { name: prev, date: prevDay },
        next: { name: next, date: nextDay }
      },
      festivals: arr("getFestivals").concat(arr("getOtherFestivals"))
    };
  }

  function scoreAlmanac(al) {
    if (!al.available) return { score: 50, signals: [], good_hits: [], bad_hits: [] };
    var score = 50, signals = [];

    var zx = al.zhixing;
    if (ZHIXING_SCORE[zx] !== undefined) {
      var dz = ZHIXING_SCORE[zx]; score += dz;
      signals.push({ label: "建除十二神「" + zx + "」", delta: dz });
    }
    var tt = al.tianshen_type;
    if (TIANSHEN_SCORE[tt] !== undefined) {
      var dt = TIANSHEN_SCORE[tt]; score += dt;
      signals.push({ label: tt + "日（值神 " + al.tianshen + "）", delta: dt });
    }
    var ly = al.liuyao;
    if (LIUYAO_SCORE[ly] !== undefined) {
      var dl = LIUYAO_SCORE[ly]; score += dl;
      signals.push({ label: "六曜「" + ly + "」", delta: dl });
    }
    var good_hits = al.yi.filter(function (k) { return FINANCE_KEYWORDS.indexOf(k) >= 0; });
    var bad_hits = al.ji.filter(function (k) { return FINANCE_KEYWORDS.indexOf(k) >= 0; });
    if (good_hits.length) {
      var dg = Math.min(good_hits.length * 4, 12); score += dg;
      signals.push({ label: "黄历宜：" + good_hits.join("、"), delta: dg });
    }
    if (bad_hits.length) {
      var db = -Math.min(bad_hits.length * 5, 15); score += db;
      signals.push({ label: "黄历忌：" + bad_hits.join("、"), delta: db });
    }
    return { score: clamp(score, 0, 100), signals: signals, good_hits: good_hits, bad_hits: bad_hits };
  }

  /* ---------------- 适配度 ---------------- */

  function idealMomentum(code) {
    var risk = code[2], horizon = code[1];
    var base = (risk === "A") ? 74 : 44;
    return base + (horizon === "S" ? 6 : -4);   // A+S 80 / A+L 70 / D+S 50 / D+L 40
  }
  function riskPosture(code) {
    var risk = code[2], horizon = code[1];
    if (risk === "A") return horizon === "S" ? "高" : "中高";
    return horizon === "S" ? "中" : "低";
  }
  function levelOf(score) {
    if (score >= 70) return { code: "high", label: "高适配", advice: "适合动手", tone: "环境与你的风格较合拍，可适度参与，但仍建议先写下买入与退出的客观条件再按纪律执行。" };
    if (score >= 45) return { code: "mid", label: "中适配", advice: "适合复盘学习", tone: "机会与风险并存，更适合先复盘已有逻辑、补足功课，而非急于加码。" };
    return { code: "low", label: "低适配", advice: "适合观望", tone: "当下环境与你的风格不够合拍，宜以观望为主，保存实力、等待更合适的时机。" };
  }

  // 默认权重：风格契合为主导（45%），卦象势能次之，黄历环境再次。
  var DEFAULT_WEIGHTS = { hexagram: 30, almanac: 25, style: 45 };

  function computeFitness(gbti, almanac, castResult, weights) {
    weights = weights || DEFAULT_WEIGHTS;
    var hexa = castResult.primary;
    var hexaScore = hexa.momentum;
    var al = scoreAlmanac(almanac);
    var alScore = al.score;
    var ideal = idealMomentum(gbti.code);
    var styleFit = clamp(100 - Math.abs(hexaScore - ideal) * 1.5, 0, 100);

    var sum = (weights.hexagram || 0) + (weights.almanac || 0) + (weights.style || 0);
    if (sum <= 0) weights = DEFAULT_WEIGHTS, sum = 100;
    var wh = (weights.hexagram || 0) / sum;
    var wa = (weights.almanac || 0) / sum;
    var ws = (weights.style || 0) / sum;

    var fitness = Math.round(wh * hexaScore + wa * alScore + ws * styleFit);
    var changing = castResult.changing_lines || [];
    var volatility = changing.length <= 1 ? "低" : (changing.length <= 3 ? "中" : "高");

    function pct(w) { return Math.round(w * 100) + "%"; }

    return {
      fitness: clamp(fitness, 0, 100),
      level: levelOf(fitness),
      dimensions: [
        { key: "卦象势能", value: hexaScore, weight: pct(wh), note: "本卦「" + hexa.full_name + "」— " + hexa.keyword },
        { key: "黄历环境", value: alScore, weight: pct(wa), note: almanac.zhixing + "日 · " + almanac.tianshen_type },
        { key: "风格契合", value: Math.round(styleFit), weight: pct(ws), note: gbti.name + " 的理想势能约 " + ideal }
      ],
      weights: { hexagram: wh, almanac: wa, style: ws },
      volatility: volatility,
      changing_lines: changing,
      signals: al.signals,
      ideal: ideal,
      disclaimer: DISCLAIMER
    };
  }

  /* ---------------- AI 解读（复用原项目的本地引擎 + 可选大模型） ---------------- */

  function loadAiConfig() {
    try { return JSON.parse(localStorage.getItem("gbti-ai-config") || "null") || {}; } catch (e) { return {}; }
  }
  function remoteReady() {
    var c = loadAiConfig();
    return Boolean(c.base && c.key && c.model);
  }
  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function templateText(gbti, x, almanac, castResult, fit) {
    var hexa = castResult.primary;
    var lv = fit.level;
    var lines = [];

    lines.push("【结论】今日对你（" + gbti.name + "，五行属" + x.element + "、本命卦「" + hexName(x.hexagram) + "」）而言，属于 **" + lv.label + "**，投教建议：**" + lv.advice + "**。");

    var r1 = "【理由一】今日卦象为「" + hexa.full_name + "」——" + hexa.keyword + "，" + hexa.hint;
    if (castResult.resulting) {
      r1 += " 且出现 " + castResult.changing_lines.length + " 个动爻，向「" + castResult.resulting.full_name + "」演化，说明局面仍在变化之中。";
    }
    lines.push(r1);

    var sig = fit.signals.length
      ? fit.signals.map(function (s) { return s.label + "（" + (s.delta > 0 ? "＋" : "") + s.delta + "）"; }).join("；")
      : "今日黄历无明显的财经宜忌信号";
    lines.push("【理由二】黄历层面：" + almanac.zhixing + "日、" + almanac.tianshen_type + "日、六曜「" + almanac.liuyao + "」。" + sig + "。");

    lines.push("【建议】" + lv.tone);
    if (fit.volatility === "高") lines.push("【补充】今日动爻偏多、波动提示为高，无论适配度如何，都建议把仓位控制在明显低于平日的水平。");
    lines.push("（本内容仅供投资者教育与传统文化体验，不构成投资建议。）");
    return lines.join("\n\n");
  }

  function buildPrompt(gbti, x, almanac, castResult, fit) {
    return [
      "你是一位投资教育讲师，负责把传统历法与卦象的文化意象，翻译成温和、克制、可执行的投资者教育建议。",
      "严格规则：1) 绝不给出买卖点位、涨跌预测或收益承诺；2) 只输出适配度解读、心态提示与学习建议；3) 语气客观、不渲染迷信；4) 结尾注明「本内容仅供投资者教育，不构成投资建议」。",
      "",
      "用户类型：" + gbti.name + "（" + gbti.code + "）",
      "用户玄学底色：五行属" + x.element + "、本命卦「" + hexName(x.hexagram) + "」、" + x.yinYang + "（" + x.aura.join("、") + "）。",
      "今日黄历：" + almanac.date + " 农历" + almanac.lunar.text + "，" + almanac.ganzhi.year + "年" + almanac.ganzhi.month + "月" + almanac.ganzhi.day + "日，建除" + almanac.zhixing + "日，值神" + almanac.tianshen + "（" + almanac.tianshen_type + "），六曜" + almanac.liuyao + "。",
      "宜：" + (almanac.yi.slice(0, 6).join("、") || "无") + "；忌：" + (almanac.ji.slice(0, 6).join("、") || "无") + "。",
      "卦象：本卦「" + castResult.primary.full_name + "」(" + castResult.primary.keyword + ")：" + castResult.primary.hint + "；动爻：" + (castResult.changing_lines.join("、") || "无") + (castResult.resulting ? "，变卦「" + castResult.resulting.full_name + "」" : "") + "。",
      "算法结果：适配度 " + fit.fitness + "/100（" + fit.level.label + "，建议 " + fit.level.advice + "），波动提示 " + fit.volatility + "。",
      "请用简体中文输出三部分：一句结论、两条理由、一条行动建议，总字数 180 字以内，不要使用 markdown 标题。"
    ].join("\n");
  }

  function remoteText(payload) {
    var c = loadAiConfig();
    return fetch(c.base.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify({
        model: c.model, temperature: 0.7,
        messages: [{ role: "system", content: buildPrompt(payload.gbti, payload.x, payload.almanac, payload.cast, payload.fit) }]
      })
    }).then(function (resp) {
      if (!resp.ok) throw new Error("接口返回 " + resp.status);
      return resp.json();
    }).then(function (data) {
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error("接口未返回内容");
      return content.trim();
    });
  }

  /* ---------------- 状态与渲染 ---------------- */

  var DISCLAIMER = "本结果基于传统历法与卦象的文化化演绎，仅用于投资者教育与自我认知，不构成任何投资建议。市场有风险，决策需独立判断。";
  var WEIGHTS_KEY = "gbti-xuanxue-weights";
  var state = { outcome: null, date: null, reading: null, aiSource: "template", weights: loadWeights() };

  function loadWeights() {
    try {
      var w = JSON.parse(localStorage.getItem(WEIGHTS_KEY) || "null");
      if (w && typeof w === "object") {
        return {
          hexagram: clampNum(w.hexagram, DEFAULT_WEIGHTS.hexagram),
          almanac: clampNum(w.almanac, DEFAULT_WEIGHTS.almanac),
          style: clampNum(w.style, DEFAULT_WEIGHTS.style)
        };
      }
    } catch (e) { /* 忽略 */ }
    return { hexagram: DEFAULT_WEIGHTS.hexagram, almanac: DEFAULT_WEIGHTS.almanac, style: DEFAULT_WEIGHTS.style };
  }
  function clampNum(v, dflt) { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : dflt; }
  function saveWeights(w) {
    try { localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w)); } catch (e) { /* 忽略 */ }
  }

  function computeReading(outcome, date) {
    var gbti = outcome.personality;
    var x = XUANXUE_MAP[gbti.code] || XUANXUE_MAP.FLDO;
    var almanac = buildAlmanac(date);
    // 「当日卦象」按日期起卦，同一天所有人看到同一卦；个性化由「类型 × 卦象」的风格契合承载。
    var castResult = cast(ymd(date), "今日是否适合操盘");
    var fit = computeFitness(gbti, almanac, castResult, state.weights);
    return { gbti: gbti, xuanxue: x, almanac: almanac, cast: castResult, fitness: fit };
  }

  function colorOf(levelCode) {
    if (levelCode === "high") return "var(--red)";
    if (levelCode === "mid") return "var(--c-gold, #cf9b3f)";
    return "var(--green)";
  }

  function yaoLines(lines, changing) {
    var topToBottom = lines.split("").reverse();
    var set = {};
    (changing || []).forEach(function (n) { set[n] = true; });
    return topToBottom.map(function (ch, i) {
      var bottomPos = 6 - i;
      var cls = "mx-yao " + (ch === "1" ? "is-yang" : "is-yin") + (set[bottomPos] ? " is-changing" : "");
      var inner = ch === "1" ? "<i></i>" : "<i></i><i></i>";
      return '<div class="' + cls + '">' + inner + "</div>";
    }).join("");
  }

  function tagsHtml(list, cls) {
    return list.map(function (t) { return '<span class="' + cls + '">' + esc(t) + "</span>"; }).join("");
  }

  /* ---------- 片段生成（render 与局部刷新共用） ---------- */

  function adviceHtml(fit) {
    var lv = fit.level, color = colorOf(lv.code);
    return '<span class="mx-advice-tag" style="color:' + color + '">' + esc(lv.label) + '</span>'
      + '<span class="mx-advice-word" style="color:' + color + '">' + esc(lv.advice) + '</span>'
      + '<p class="mx-advice-tone">' + esc(lv.tone) + '</p>';
  }

  function dimsHtml(fit) {
    return fit.dimensions.map(function (dm) {
      return '<div class="mx-dim-bar"><div class="mx-dim-top"><span>' + esc(dm.key) + ' <em>权重 ' + dm.weight + '</em></span><b>' + dm.value + '</b></div>'
        + '<div class="mx-dim-track"><div class="mx-dim-fill" style="width:' + dm.value + '%"></div></div>'
        + '<div class="mx-dim-note">' + esc(dm.note) + '</div></div>';
    }).join("");
  }

  function weightPct(key) {
    var w = state.weights;
    var sum = w.hexagram + w.almanac + w.style;
    if (sum <= 0) return DEFAULT_WEIGHTS[key];
    return w[key] / sum * 100;
  }
  function weightItem(key, name) {
    return '<div class="mx-weight-item">'
      + '<label for="mx-w-' + key + '">' + name + '</label>'
      + '<input type="range" id="mx-w-' + key + '" min="0" max="100" step="1" value="' + state.weights[key] + '" aria-label="' + name + '权重">'
      + '<span class="mx-w-val" id="mx-wv-' + key + '">' + Math.round(weightPct(key)) + '%</span>'
      + '</div>';
  }
  function weightsHtml() {
    return '<div class="mx-weights">'
      + '<div class="mx-weights-head"><span>权重微调 · 实时重算适配度</span><button id="mx-weight-reset" class="mx-reset" type="button">恢复默认</button></div>'
      + weightItem("hexagram", "卦象势能")
      + weightItem("almanac", "黄历环境")
      + weightItem("style", "风格契合")
      + '</div>';
  }

  function render() {
    var body = document.getElementById("mx-body");
    var head = document.getElementById("mx-head-title");
    if (!body) return;
    if (!state.reading) { body.innerHTML = '<p class="mx-empty">完成答题后，这里会结合你的类型与当日卦象、节气给出操盘适配度。</p>'; return; }

    var d = state.reading;
    var g = d.gbti, x = d.xuanxue, al = d.almanac, cast = d.cast, fit = d.fitness;
    var lv = fit.level, color = colorOf(lv.code);

    if (head) head.textContent = "今日卦象 · 节气 · " + lv.advice;

    var gbtiTags = (g.tags || []).map(function (t) { return esc(t); }).join("　·　");

    var html = "";

    /* ---- 双维画像 ---- */
    html += '<div class="mx-section">'
      + '<h3 class="mx-h3">双维画像　<span class="mx-dim">GBTI 四维 × 玄学维度</span></h3>'
      + '<div class="mx-dual">'
      +   '<div class="mx-dual-col"><span class="mx-dual-k">GBTI 人格</span>'
      +     '<b>' + esc(g.name) + '（' + esc(g.code) + '）</b>'
      +     '<span class="mx-dual-tags">' + gbtiTags + '</span></div>'
      +   '<div class="mx-dual-col"><span class="mx-dual-k">玄学底色</span>'
      +     '<b>五行属' + esc(x.element) + ' · ' + esc(x.yinYang) + ' · 本命卦「' + hexName(x.hexagram) + '」</b>'
      +     '<span class="mx-dual-tags">' + tagsHtml(x.aura, "mx-tag") + '</span>'
      +     '<span class="mx-essence">' + esc(x.essence) + '</span></div>'
      + '</div></div>';

    /* ---- 适配度（数字在圆环内，建议卡片在右侧，避免文字穿模） ---- */
    html += '<div class="mx-section">'
      + '<h3 class="mx-h3">操盘适配度</h3>'
      + '<div class="mx-gauge-row">'
      +   '<div class="mx-gauge">'
      +     '<svg viewBox="0 0 180 180" role="img" aria-label="操盘适配度 ' + fit.fitness + ' 分">'
      +       '<circle cx="90" cy="90" r="74" fill="none" stroke="var(--line)" stroke-width="13"/>'
      +       '<circle class="mx-gauge-arc" cx="90" cy="90" r="74" fill="none" stroke="' + color + '" stroke-width="13" stroke-linecap="round" transform="rotate(-90 90 90)" stroke-dasharray="' + (2 * Math.PI * 74) + '" stroke-dashoffset="' + (2 * Math.PI * 74) + '" data-target="' + (2 * Math.PI * 74 * (1 - fit.fitness / 100)) + '"/>'
      +     '</svg>'
      +     '<div class="mx-gauge-center">'
      +       '<span class="mx-gauge-num" id="mx-gauge-num" style="color:' + color + '">' + fit.fitness + '</span>'
      +       '<span class="mx-gauge-unit">/100</span>'
      +     '</div></div>'
      +   '<div class="mx-gauge-side">'
      +     '<div class="mx-advice" id="mx-advice" data-code="' + lv.code + '">' + adviceHtml(fit) + '</div>'
      +     '<div class="mx-kv"><span>波动提示</span><b>' + esc(fit.volatility) + '</b></div>'
      +     '<div class="mx-kv"><span>本卦</span><b>' + esc(cast.primary.full_name) + '</b></div>'
      +     '<div class="mx-kv"><span>动爻</span><b>' + (cast.changing_lines.length ? cast.changing_lines.join("、") + " 爻" : "无") + '</b></div>'
      +     '<div class="mx-kv"><span>变卦</span><b>' + (cast.resulting ? esc(cast.resulting.full_name) : "—") + '</b></div>'
      +   '</div></div>'
      + '<div class="mx-dims" id="mx-dims">' + dimsHtml(fit) + '</div>'
      + weightsHtml()
      + '</div>';

    /* ---- 卦象 + 黄历 ---- */
    html += '<div class="mx-section"><h3 class="mx-h3">今日卦象 · 黄历</h3><div class="mx-two">'
      + '<div class="mx-col">'
      +   '<div class="mx-hexa-meta"><b>' + cast.primary.unicode + " " + esc(cast.primary.full_name) + '</b><span>第 ' + cast.primary.no + ' 卦 · ' + esc(cast.primary.keyword) + '</span></div>'
      +   '<div class="mx-hexa">' + yaoLines(cast.primary.lines, cast.changing_lines) + '</div>'
      +   '<p class="mx-hint">' + esc(cast.primary.hint) + '</p>'
      + '</div>'
      + '<div class="mx-col">'
      +   '<div class="mx-al">'
      +     '<div class="mx-al-row"><span>农历</span><b>' + esc(al.lunar.text) + '</b></div>'
      +     '<div class="mx-al-row"><span>干支</span><b>' + esc(al.ganzhi.year) + '年 ' + esc(al.ganzhi.month) + '月 ' + esc(al.ganzhi.day) + '日</b></div>'
      +     '<div class="mx-al-row"><span>建除 · 值神</span><b>' + esc(al.zhixing) + '日 · ' + esc(al.tianshen) + '（' + esc(al.tianshen_type) + '）</b></div>'
      +     '<div class="mx-al-row"><span>六曜 · 冲煞</span><b>' + esc(al.liuyao) + ' · 冲' + esc(al.chong) + ' 煞' + esc(al.sha) + '</b></div>'
      +     '<div class="mx-al-row"><span>吉神方位</span><b>财神 ' + esc(al.positions["财神"]) + '｜喜神 ' + esc(al.positions["喜神"]) + '</b></div>'
      +     '<div class="mx-al-row"><span>节气</span><b>' + esc(al.jieqi.prev.name) + '（' + esc(al.jieqi.prev.date) + '）→ ' + esc(al.jieqi.next.name) + '（' + esc(al.jieqi.next.date) + '）</b></div>'
      +     '<div class="mx-al-tags"><span class="mx-al-k mx-yi">宜</span>' + tagsHtml(al.yi.slice(0, 8), "mx-tag mx-yi") + '</div>'
      +     '<div class="mx-al-tags"><span class="mx-al-k mx-ji">忌</span>' + tagsHtml(al.ji.slice(0, 8), "mx-tag mx-ji") + '</div>'
      +   '</div></div>'
      + '</div></div>';

    /* ---- 信号 ---- */
    if (fit.signals.length) {
      html += '<div class="mx-section"><h3 class="mx-h3">今日信号</h3><div class="mx-signals">'
        + fit.signals.map(function (s) {
            return '<div class="mx-signal"><span>' + esc(s.label) + '</span><b class="' + (s.delta > 0 ? "mx-up" : "mx-down") + '">' + (s.delta > 0 ? "+" : "") + s.delta + '</b></div>';
          }).join("")
        + '</div></div>';
    }

    /* ---- AI 解读 ---- */
    html += '<div class="mx-section"><h3 class="mx-h3">AI 解读</h3>'
      + '<div class="mx-ai"><div class="mx-ai-src" id="mx-ai-src">' + (state.aiSource === "llm" ? "大模型生成" : "本地规则引擎生成") + '</div>'
      + '<div class="mx-ai-text" id="mx-ai-text"><div class="mx-typing"><i></i><i></i><i></i></div></div></div></div>';

    html += '<div class="mx-date"><label for="mx-date">换个日子：</label><input type="date" id="mx-date" value="' + esc(al.date) + '"></div>';
    html += '<p class="mx-disclaimer">' + esc(fit.disclaimer || "") + '</p>';
    html += '<p class="mx-disclaimer">本模块定位为投资者教育与传统文化体验，不构成投资建议；材料一律使用公开数据。</p>';

    body.innerHTML = html;

    requestAnimationFrame(function () {
      var arc = document.querySelector(".mx-gauge-arc");
      if (arc) animateArc(arc, fit.fitness);
    });

    bindEvents();
    interpret();
  }

  function hexName(no) {
    var h = HEXAGRAMS[no - 1];
    return h ? h.name : "乾";
  }

  function animateArc(arc, fitness) {
    var ringC = 2 * Math.PI * 74;
    var target = ringC * (1 - fitness / 100);
    arc.style.transition = "none";
    arc.setAttribute("stroke-dasharray", ringC);
    arc.setAttribute("stroke-dashoffset", ringC);
    requestAnimationFrame(function () {
      arc.style.transition = "stroke-dashoffset 0.9s cubic-bezier(.22,.61,.36,1)";
      arc.setAttribute("stroke-dashoffset", target);
    });
  }

  /* ---------- 权重调节：局部刷新，不重建滑块 ---------- */

  function rangeVal(id) {
    var el = document.getElementById(id);
    return el ? Math.max(0, Number(el.value) || 0) : 0;
  }
  function applyWeights() {
    var w = { hexagram: rangeVal("mx-w-hexagram"), almanac: rangeVal("mx-w-almanac"), style: rangeVal("mx-w-style") };
    state.weights = w;
    saveWeights(w);
    if (!state.reading) return;
    state.reading.fitness = computeFitness(state.reading.gbti, state.reading.almanac, state.reading.cast, w);
    refreshFitnessViews();
  }
  function resetWeights() {
    state.weights = { hexagram: DEFAULT_WEIGHTS.hexagram, almanac: DEFAULT_WEIGHTS.almanac, style: DEFAULT_WEIGHTS.style };
    saveWeights(state.weights);
    ["hexagram", "almanac", "style"].forEach(function (k) {
      var el = document.getElementById("mx-w-" + k);
      if (el) el.value = state.weights[k];
    });
    applyWeights();
  }

  function refreshFitnessViews() {
    var d = state.reading;
    if (!d) return;
    var fit = d.fitness, lv = fit.level, color = colorOf(lv.code);

    var numEl = document.getElementById("mx-gauge-num");
    if (numEl) { numEl.textContent = fit.fitness; numEl.style.color = color; }

    var arc = document.querySelector(".mx-gauge-arc");
    if (arc) { arc.setAttribute("stroke", color); animateArc(arc, fit.fitness); }

    var adv = document.getElementById("mx-advice");
    if (adv) { adv.setAttribute("data-code", lv.code); adv.innerHTML = adviceHtml(fit); }

    var dims = document.getElementById("mx-dims");
    if (dims) dims.innerHTML = dimsHtml(fit);

    ["hexagram", "almanac", "style"].forEach(function (k) {
      var el = document.getElementById("mx-wv-" + k);
      if (el) el.textContent = Math.round(weightPct(k)) + "%";
    });

    var head = document.getElementById("mx-head-title");
    if (head) head.textContent = "今日卦象 · 节气 · " + lv.advice;

    state.aiSource = "template";
    interpret();
  }

  function bindEvents() {
    var dateInput = document.getElementById("mx-date");
    if (dateInput) {
      dateInput.addEventListener("change", function () {
        if (!dateInput.value) return;
        var parts = dateInput.value.split("-");
        var d = noonOf(+parts[0], +parts[1], +parts[2]);
        if (isNaN(d.getTime())) return;
        state.date = d;
        state.reading = computeReading(state.outcome, d);
        state.aiSource = "template";
        render();
      });
    }
    ["hexagram", "almanac", "style"].forEach(function (k) {
      var el = document.getElementById("mx-w-" + k);
      if (el) el.addEventListener("input", applyWeights);
    });
    var reset = document.getElementById("mx-weight-reset");
    if (reset) reset.addEventListener("click", resetWeights);
  }

  /* ---------- AI 解读渲染 ---------- */

  function interpret() {
    var body = document.getElementById("mx-body");
    if (!body || !state.reading) return;
    var d = state.reading;
    var textEl = document.getElementById("mx-ai-text");
    var srcEl = document.getElementById("mx-ai-src");
    if (!textEl) return;

    var payload = { gbti: d.gbti, x: d.xuanxue, almanac: d.almanac, cast: d.cast, fit: d.fitness };
    var local = templateText(d.gbti, d.xuanxue, d.almanac, d.cast, d.fitness);

    if (remoteReady()) {
      remoteText(payload).then(function (text) {
        if (!document.getElementById("mx-ai-text")) return;
        state.aiSource = "llm";
        if (srcEl) srcEl.textContent = "大模型生成";
        textEl.innerHTML = renderMarkdown(text);
      }).catch(function () {
        state.aiSource = "template";
        if (srcEl) srcEl.textContent = "本地规则引擎生成（大模型不可用，已回退）";
        textEl.innerHTML = renderMarkdown(local);
      });
    } else {
      state.aiSource = "template";
      if (srcEl) srcEl.textContent = "本地规则引擎生成（离线，零配置）";
      textEl.innerHTML = renderMarkdown(local);
    }
  }

  function renderMarkdown(text) {
    return String(text).split(/\n{2,}/).map(function (block) {
      var lines = block.split("\n");
      var isList = lines.every(function (l) { return /^\s*[-·•]\s+/.test(l); });
      var inline = function (l) { return esc(l).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); };
      if (isList) return "<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-·•]\s+/, "")) + "</li>"; }).join("") + "</ul>";
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    }).join("");
  }

  /* ---------------- 挂载（不改动原有逻辑，靠 MutationObserver 感知结果） ---------------- */

  /* 合并入口：东方玄学 / 西方塔罗 共用同一个子页面，用分页切换。
     塔罗模块（tarot.js）会把内容挂进这里预留的 #tr-pane / #tr-body。 */

  function setTab(name, opts) {
    if (name !== "east" && name !== "west") name = "east";
    [["east", "mx-pane"], ["west", "tr-pane"]].forEach(function (pair) {
      var pane = document.getElementById(pair[1]);
      if (pane) pane.hidden = pair[0] !== name;
      var btn = document.querySelector('.mx-tab[data-tab="' + pair[0] + '"]');
      if (!btn) return;
      var on = pair[0] === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
    if (!opts || !opts.silent) {
      var url = new URL(location.href);
      if (url.searchParams.get("section") === "xuanxue") {
        if (name === "east") url.searchParams.delete("tab");
        else url.searchParams.set("tab", name);
        history.replaceState(history.state, "", url);
      }
    }
  }

  function bindTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll(".mx-tab"));
    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () { setTab(btn.getAttribute("data-tab")); });
      btn.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        var i = tabs.indexOf(btn);
        var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        setTab(next.getAttribute("data-tab"));
      });
    });
  }

  function buildPanel() {
    var result = document.getElementById("result");
    if (!result || document.getElementById("xuanxue")) return;
    var plan = document.getElementById("plan");

    var details = document.createElement("details");
    details.id = "xuanxue";
    details.className = "fold-section fold mx-panel";
    details.innerHTML =
      '<summary class="fold-head">'
      + '<span class="fold-mark" aria-hidden="true">玄学</span>'
      + '<span class="fold-text">'
      +   '<span class="section-kicker">东方玄学 · 西方塔罗</span>'
      +   '<span class="fold-title" id="mx-head-title">今日卦象 · 节气 · 是否适合操盘</span>'
      +   '<span class="fold-hint">东方玄学与西方塔罗合并为一个入口：可切换查看卦象、黄历、适配度与塔罗牌，并做东西合参。</span>'
      + '</span>'
      + '<span class="fold-chev" aria-hidden="true"></span>'
      + '</summary>'
      + '<div class="fold-body">'
      +   '<div class="mx-tabs" role="tablist" aria-label="玄学板块切换">'
      +     '<button type="button" class="mx-tab is-active" role="tab" id="mx-tab-east" data-tab="east" aria-selected="true" aria-controls="mx-body">东方玄学<em>卦象 · 黄历 · 适配度</em></button>'
      +     '<button type="button" class="mx-tab" role="tab" id="mx-tab-west" data-tab="west" aria-selected="false" aria-controls="tr-body" tabindex="-1">西方塔罗<em>本命牌 · 今日牌 · 东西合参</em></button>'
      +   '</div>'
      +   '<div id="mx-pane" class="mx-pane" role="tabpanel" aria-labelledby="mx-tab-east">'
      +     '<div id="mx-body" class="mx-body"></div>'
      +   '</div>'
      +   '<div id="tr-pane" class="mx-pane" role="tabpanel" aria-labelledby="mx-tab-west" hidden>'
      +     '<div id="tr-body" class="tr-body"></div>'
      +   '</div>'
      + '</div>';

    if (plan) result.insertBefore(details, plan.nextSibling);
    else result.appendChild(details);
    bindTabs();
    return details;
  }

  function injectHeroCta() {
    var top = document.querySelector("#result .hero-top");
    if (!top || document.getElementById("mx-hero-cta")) return;
    var btn = document.createElement("button");
    btn.id = "mx-hero-cta";
    btn.type = "button";
    btn.className = "pill-button";
    btn.textContent = "今日玄学 · 塔罗";
    btn.addEventListener("click", function () {
      if (window.GBTI_RESULT_PAGES) {
        window.GBTI_RESULT_PAGES.open("xuanxue");
        return;
      }
      var panel = document.getElementById("xuanxue");
      if (panel) {
        panel.open = true;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    top.appendChild(btn);
  }

  function codeFromResult() {
    var el = document.getElementById("result-code");
    return el ? el.textContent.trim().toUpperCase() : "";
  }
  function personalityByCode(code) {
    if (typeof personalities === "undefined") return null;
    for (var i = 0; i < personalities.length; i++) if (personalities[i].code === code) return personalities[i];
    return null;
  }

  function renderFor(code) {
    var p = personalityByCode(code);
    if (!p) return;
    state.outcome = { personality: p, scores: null, axisCode: code };
    state.date = todayNoon();
    state.reading = computeReading(state.outcome, state.date);
    state.aiSource = "template";
    render();
  }

  function init() {
    if (typeof Solar === "undefined") {
      console.warn("[GBTI玄学模块] 未找到 lunar.js，黄历功能不可用。请确认已引入 lunar.js。");
    }
    buildPanel();
    injectHeroCta();

    // 直接带 ?section=xuanxue&tab=west 打开时，落到「西方塔罗」分页。
    if (new URL(location.href).searchParams.get("tab") === "west") setTab("west", { silent: true });

    var code = codeFromResult();
    if (code && personalityByCode(code)) renderFor(code);

    var codeEl = document.getElementById("result-code");
    if (codeEl) {
      var observer = new MutationObserver(function () {
        var c = codeFromResult();
        if (c && personalityByCode(c)) renderFor(c);
      });
      observer.observe(codeEl, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.GBTI_XUANXUE = {
    init: init,
    renderFor: renderFor,
    // 合并入口的分页：'east' 东方玄学 / 'west' 西方塔罗
    setTab: setTab,
    readingFor: function (outcome, date) { return computeReading(outcome, date); },
    // 纯逻辑接口（供测试与后续扩展，不参与页面渲染）
    computeFitness: function (gbti, almanac, castResult, weights) { return computeFitness(gbti, almanac, castResult, weights || state.weights); },
    getWeights: function () { return { hexagram: state.weights.hexagram, almanac: state.weights.almanac, style: state.weights.style }; },
    setWeights: function (w) { state.weights = w; }
  };
})();
