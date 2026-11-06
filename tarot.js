/* ==========================================================================
   GBTI 塔罗映照 · 西方象征系统（纯增量模块）
   --------------------------------------------------------------------------
   定位：与现有「玄学操盘适配度」并列，不进入 0–100 适配度，不改动原有算法。
   职责：
   1) 16 型人格各对应一张大阿卡纳，作为「本命塔罗」；
   2) 按日期确定性抽取「今日牌」，同一天所有人看到同一张，保证可复现；
   3) 与东方卦象做「东西合参」，输出一段并置阅读；
   4) 复用原项目「本地规则引擎 + 可选大模型」的 AI 解读方式。

   依赖（均为页面已有全局）：
   - window.GBTI_XUANXUE.readingFor(outcome, date) —— 可选，拿当日卦象与黄历
   - personalities / dimensions —— scoring.js / questions.js 中已定义

   免责：塔罗是象征系统与自我反思工具，不预测涨跌，不构成投资建议。
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------- 22 张大阿卡纳 ---------------- */

  // momentum / tone 为本模块为投资者教育语境设定的一组可调口径，非传统命理结论。
  // tone 只描述牌面的「行动倾向」：进取 / 平衡 / 守成 / 观望，不等同于好坏。
  var TAROT_CARDS = [
    { id: 0, roman: "0", name: "愚者", en: "The Fool", glyph: "☉", element: "风",
      keywords: ["启程", "未知", "开放"], momentum: 65, tone: "进取",
      upright: "新的开始。适合用小仓位验证想法，把未知拆成几个可承受的小步骤。",
      reversed: "想出发但方向未明。先确认边界与退出条件，再决定要不要迈出第一步。",
      investHint: "把「想试」变成「可承受的一次小实验」。" },

    { id: 1, roman: "I", name: "魔术师", en: "The Magician", glyph: "☿", element: "风",
      keywords: ["整合", "行动", "创造"], momentum: 75, tone: "进取",
      upright: "手上的资源比想象中多。适合把已有信息、工具和计划整合起来，主动推进一小步。",
      reversed: "工具齐全但用得散。先停下来整理方法与优先级，避免为了行动而行动。",
      investHint: "先盘点你已有的信息与工具，再决定怎么用。" },

    { id: 2, roman: "II", name: "女祭司", en: "The High Priestess", glyph: "☽", element: "水",
      keywords: ["直觉", "内省", "隐藏信息"], momentum: 45, tone: "观望",
      upright: "信息尚未完全浮出水面。适合多观察、少表态，让判断在安静中成形。",
      reversed: "直觉被噪音盖住。先区分「事实」与「感觉」，再决定是否相信自己的判断。",
      investHint: "今天更适合收集信息，而不是下结论。" },

    { id: 3, roman: "III", name: "皇后", en: "The Empress", glyph: "♀", element: "土",
      keywords: ["滋养", "丰盛", "长期"], momentum: 72, tone: "平衡",
      upright: "适合经营与积累。把注意力放回长期能生长的事物，而不是追逐短期热闹。",
      reversed: "过度投入或过度照顾。检查是否在某件事上花了不相称的时间与仓位。",
      investHint: "把资源留给能长期生长的部分。" },

    { id: 4, roman: "IV", name: "皇帝", en: "The Emperor", glyph: "♂", element: "火",
      keywords: ["秩序", "规则", "结构"], momentum: 70, tone: "平衡",
      upright: "规则与结构是你的优势。适合按既定标准执行，把模糊的想法落成可检查的条款。",
      reversed: "规则可能过僵，或你在硬撑一个不再适用的框架。定期复核，而不是机械执行。",
      investHint: "先检查规则是否仍然适用，再谈执行。" },

    { id: 5, roman: "V", name: "教皇", en: "The Hierophant", glyph: "♃", element: "土",
      keywords: ["体系", "传统", "学习"], momentum: 55, tone: "守成",
      upright: "适合回到被验证过的框架与常识。向有经验的人学习，比自创方法更省力。",
      reversed: "对权威或旧方法的依赖需要松动。保留有用的部分，别把「一直如此」当成理由。",
      investHint: "用成熟框架校验自己的想法，而不是替代思考。" },

    { id: 6, roman: "VI", name: "恋人", en: "The Lovers", glyph: "♊", element: "风",
      keywords: ["选择", "价值", "契合"], momentum: 60, tone: "平衡",
      upright: "面临一个需要取舍的选择。回到你真正看重的标准，而不是被选项的数量牵着走。",
      reversed: "选择困难或价值排序不清。先把「最重要的一件事」写下来，再做决定。",
      investHint: "先明确你在为什么做选择。" },

    { id: 7, roman: "VII", name: "战车", en: "The Chariot", glyph: "♋", element: "水",
      keywords: ["目标", "意志", "推进"], momentum: 80, tone: "进取",
      upright: "方向明确时，推进力很强。适合按计划执行，但记得给冲动装上刹车。",
      reversed: "想冲但缰绳松了。先确认目标与节奏，避免用速度掩盖方向上的不确定。",
      investHint: "把「快」建立在「方向清楚」之上。" },

    { id: 8, roman: "VIII", name: "力量", en: "Strength", glyph: "♌", element: "火",
      keywords: ["耐心", "克制", "内在力量"], momentum: 68, tone: "平衡",
      upright: "真正的力量来自克制。适合用耐心处理波动，而不是用情绪回应波动。",
      reversed: "耐心被消耗，容易用力过猛。先照顾好自己的状态，再处理账户里的事。",
      investHint: "今天比拼的不是速度，而是情绪成本。" },

    { id: 9, roman: "IX", name: "隐士", en: "The Hermit", glyph: "♍", element: "土",
      keywords: ["独处", "洞察", "反思"], momentum: 40, tone: "观望",
      upright: "适合独处与复盘。把外界的噪音关小，答案往往在你自己已有的经验里。",
      reversed: "独处变成了回避。给自己一个复盘的截止时间，然后回到现实里验证。",
      investHint: "用一段安静的时间，换一个更清楚的判断。" },

    { id: 10, roman: "X", name: "命运之轮", en: "Wheel of Fortune", glyph: "☸", element: "火",
      keywords: ["周期", "转折", "顺势"], momentum: 70, tone: "平衡",
      upright: "周期感很强的一天。适合顺势调整，而不是假设趋势会永远持续。",
      reversed: "节奏被打乱。先接受变化，再决定哪些部分值得保留、哪些需要重来。",
      investHint: "把注意力放在周期位置，而不是单日噪音。" },

    { id: 11, roman: "XI", name: "正义", en: "Justice", glyph: "♎", element: "风",
      keywords: ["权衡", "规则", "客观"], momentum: 62, tone: "平衡",
      upright: "适合用同一把尺子衡量所有选项。把情绪和事实分开，决定会更稳。",
      reversed: "标准可能出现了双标。检查你是否对某个想法格外宽容，或格外苛刻。",
      investHint: "先写下判断标准，再看结论。" },

    { id: 12, roman: "XII", name: "倒吊人", en: "The Hanged Man", glyph: "♆", element: "水",
      keywords: ["暂停", "换视角", "等待"], momentum: 35, tone: "观望",
      upright: "暂停不是失败。换个角度看，可能会发现之前忽略的条件。",
      reversed: "等待变成了拖延。给自己设一个明确的观察期限，到期就做决定。",
      investHint: "今天可以什么都不做，但要知道自己在等什么。" },

    { id: 13, roman: "XIII", name: "死神", en: "Death", glyph: "♏", element: "水",
      keywords: ["结束", "转化", "换仓"], momentum: 50, tone: "平衡",
      upright: "一个阶段正在结束。适合清理不再适用的持仓、方法或假设，为新的东西腾位置。",
      reversed: "抗拒结束会让成本变高。承认某些东西已经完成使命，反而更轻松。",
      investHint: "先做减法，再谈下一步。" },

    { id: 14, roman: "XIV", name: "节制", en: "Temperance", glyph: "♐", element: "火",
      keywords: ["平衡", "配比", "耐心"], momentum: 65, tone: "平衡",
      upright: "适合调整配比与节奏。不是所有问题都要用「更多」来解决，有时是「更合适」。",
      reversed: "配比失衡。检查时间、仓位与注意力是否被某一件事件过度占用。",
      investHint: "把「更多」换成「更合适」。" },

    { id: 15, roman: "XV", name: "恶魔", en: "The Devil", glyph: "♑", element: "土",
      keywords: ["执念", "杠杆", "诱惑"], momentum: 30, tone: "观望",
      upright: "留意让你停不下来的东西：杠杆、执念或某种「必须赢」的冲动。看见它，才有选择。",
      reversed: "束缚开始松动。适合逐步减少让你不舒服的暴露，而不是一次性硬断。",
      investHint: "先识别执念，再决定要不要继续。" },

    { id: 16, roman: "XVI", name: "塔", en: "The Tower", glyph: "⚡", element: "火",
      keywords: ["突变", "风险", "崩塌"], momentum: 25, tone: "观望",
      upright: "结构可能受到冲击。今天不适合假设一切照旧，先把风险敞口和应急预案想清楚。",
      reversed: "冲击被延后或内化。别用「暂时没事」安慰自己，该检查的地方仍然要检查。",
      investHint: "先想清楚最坏情况，再决定仓位。" },

    { id: 17, roman: "XVII", name: "星星", en: "The Star", glyph: "♒", element: "风",
      keywords: ["希望", "修复", "长期"], momentum: 68, tone: "平衡",
      upright: "修复与希望之象。适合做长期有益但短期不显眼的事，慢慢把状态调回来。",
      reversed: "信心不足。先完成一件小事，用可验证的进展恢复节奏，而不是等待感觉变好。",
      investHint: "用一件小事的完成，换回节奏感。" },

    { id: 18, roman: "XVIII", name: "月亮", en: "The Moon", glyph: "♓", element: "水",
      keywords: ["不确定", "情绪", "迷雾"], momentum: 38, tone: "观望",
      upright: "信息模糊、情绪容易放大。今天更适合放慢判断，避免在迷雾里做重决定。",
      reversed: "迷雾开始散开，但仍有余波。把事实、推测和情绪分开记录，会看得更清楚。",
      investHint: "看不清的时候，先别加大筹码。" },

    { id: 19, roman: "XIX", name: "太阳", en: "The Sun", glyph: "☀", element: "火",
      keywords: ["明朗", "景气", "乐观"], momentum: 85, tone: "进取",
      upright: "明朗与顺畅之象。适合推进已经想清楚的事，同时记得为「顺利」保留一份清醒。",
      reversed: "乐观里夹着一点盲点。享受进展，但别把好状态当成可以省略检查的理由。",
      investHint: "顺利的时候，也要保留检查清单。" },

    { id: 20, roman: "XX", name: "审判", en: "Judgement", glyph: "♇", element: "火",
      keywords: ["复盘", "清算", "觉醒"], momentum: 60, tone: "平衡",
      upright: "适合复盘与清算。把过去的决定摊开看，哪些有效、哪些只是运气，会很有帮助。",
      reversed: "容易反复回放过去。复盘的目的是更新判断，不是给自己打分。",
      investHint: "复盘是为了更新判断，不是为了责备自己。" },

    { id: 21, roman: "XXI", name: "世界", en: "The World", glyph: "♄", element: "土",
      keywords: ["完成", "闭环", "全局"], momentum: 78, tone: "平衡",
      upright: "一个阶段接近完成。适合收尾、总结、把经验固化成下次可用的规则。",
      reversed: "还差最后一步。别急着开新局，先把未闭环的部分处理干净。",
      investHint: "先收尾，再出发。" }
  ];

  // 按 id 索引，避免数组顺序调整后映射错位。
  var CARD_BY_ID = {};
  TAROT_CARDS.forEach(function (c) { CARD_BY_ID[c.id] = c; });

  /* ---------------- 16 型 × 本命塔罗 ---------------- */

  var TAROT_MAP = {
    FLDO: { card: 4, reason: "以规则与结构建立秩序，先定标准再行动。" },
    FLDJ: { card: 9, reason: "以内省与洞察理解情境，判断来自安静处。" },
    FLAO: { card: 7, reason: "以目标与纪律推进长期计划。" },
    FLAJ: { card: 0, reason: "以开放与探索面对未知，愿意先迈一步。" },
    FSDO: { card: 11, reason: "以同一把尺子核验信息，重视客观与公平。" },
    FSDJ: { card: 2, reason: "以直觉与研判处理尚未完全浮出的信息。" },
    FSAO: { card: 1, reason: "擅长整合资源、快速催化想法。" },
    FSAJ: { card: 19, reason: "在景气与机会中捕捉产业方向。" },
    MLDO: { card: 14, reason: "以平衡与配比维持稳定执行。" },
    MLDJ: { card: 12, reason: "以暂停与换视角等待更好的观察点。" },
    MLAO: { card: 10, reason: "顺着周期与趋势做长期追踪。" },
    MLAJ: { card: 21, reason: "以全局视角领航长期方向。" },
    MSDO: { card: 5, reason: "依靠成熟体系与规则做波段。" },
    MSDJ: { card: 18, reason: "在不确定中保持观察，等待迷雾散开。" },
    MSAO: { card: 8, reason: "以克制与内在力量支撑敏捷执行。" },
    MSAJ: { card: 6, reason: "在多个机会之间做价值取舍。" }
  };

  // 与 metaphysics.js 的 64 卦名保持一致，仅用于三维画像展示。
  var HEX_NAMES = [
    "乾", "坤", "屯", "蒙", "需", "讼", "师", "比", "小畜", "履", "泰", "否",
    "同人", "大有", "谦", "豫", "随", "蛊", "临", "观", "噬嗑", "贲", "剥", "复",
    "无妄", "大畜", "颐", "大过", "坎", "离", "咸", "恒", "遁", "大壮", "晋", "明夷",
    "家人", "睽", "蹇", "解", "损", "益", "夬", "姤", "萃", "升", "困", "井",
    "革", "鼎", "震", "艮", "渐", "归妹", "丰", "旅", "巽", "兑", "涣", "节",
    "中孚", "小过", "既济", "未济"
  ];

  function hexName(no) {
    var i = Number(no) - 1;
    return HEX_NAMES[i] || ("第" + no + "卦");
  }

  /* ---------------- 确定性抽牌（与 metaphysics.js 同一套 PRNG） ---------------- */

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

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function drawCard(seedKey) {
    var rng = mulberry32(hashString(seedKey));
    var index = Math.floor(rng() * TAROT_CARDS.length);
    var reversed = rng() < 0.38;
    return { card: TAROT_CARDS[index], index: index, reversed: reversed };
  }

  // 行动倾向由低到高：观望 < 守成 < 平衡 < 进取。逆位视为能量向内或受阻，降一档。
  var TONE_ORDER = ["观望", "守成", "平衡", "进取"];

  function effectiveTone(draw) {
    if (!draw.reversed) return draw.card.tone;
    var i = TONE_ORDER.indexOf(draw.card.tone);
    return i > 0 ? TONE_ORDER[i - 1] : draw.card.tone;
  }

  function effectiveMomentum(draw) {
    return draw.reversed ? clamp(draw.card.momentum - 12, 0, 100) : draw.card.momentum;
  }

  /* ---------------- 与东方玄学合参 ---------------- */

  function xuanxueReading(outcome, date) {
    try {
      if (window.GBTI_XUANXUE && typeof window.GBTI_XUANXUE.readingFor === "function") {
        return window.GBTI_XUANXUE.readingFor(outcome, date);
      }
    } catch (e) { /* 东方模块不可用时静默降级 */ }
    return null;
  }

  function buildCross(xuan, draw) {
    if (!xuan || !xuan.cast || !xuan.cast.primary) return null;
    var hex = xuan.cast.primary;
    var hexM = hex.momentum;
    var tarotM = effectiveMomentum(draw);
    var tone = effectiveTone(draw);
    var hexActive = hexM >= 60;
    var tarotActive = tarotM >= 60;
    var title, text;

    if (hexActive && tarotActive) {
      title = "内外同频";
      text = "卦象「" + hex.full_name + "」势能偏强（" + hex.keyword + "），今日牌「" + draw.card.name + "」的倾向也偏" + tone + "——内外同频，适合按既定计划推进；但别把「顺势」误当成「加满」。";
    } else if (hexActive && !tarotActive) {
      title = "外热内收";
      text = "卦象「" + hex.full_name + "」显示外部机会不弱（" + hex.keyword + "），今日牌「" + draw.card.name + "」却偏" + tone + "——不是没机会，而是你的状态还没准备好；宜小步试错、留有余量。";
    } else if (!hexActive && tarotActive) {
      title = "内动外静";
      text = "卦象「" + hex.full_name + "」提示外部时机未到（" + hex.keyword + "），今日牌「" + draw.card.name + "」却偏" + tone + "——先把动作拆小，等一个可验证的信号再出手。";
    } else {
      title = "双重收缩";
      text = "卦象「" + hex.full_name + "」与今日牌「" + draw.card.name + "」同向收缩——今天更适合观望、复盘和补功课，不必强行找机会。";
    }

    if (draw.reversed) {
      text += " 牌为逆位，提示这股能量当前更多向内或受阻，先处理内部条件。";
    }

    return {
      title: title,
      text: text,
      hexMomentum: hexM,
      tarotMomentum: tarotM,
      hexName: hex.full_name,
      hexKeyword: hex.keyword,
      cardName: draw.card.name,
      reversed: draw.reversed,
      tone: tone
    };
  }

  /* ---------------- 读取与状态 ---------------- */

  var DISCLAIMER = "塔罗是西方文化传统中的象征系统，本模块仅用于投资者教育与自我反思，不具备预测能力，也不构成任何投资建议。市场有风险，决策需独立判断。";

  var state = {
    outcome: null,
    date: null,
    reading: null,
    luck: null,          // 手气随机牌：{ key, draw, revealed }
    aiSource: "template",
    renderedCode: ""
  };

  // 与 metaphysics.js 使用同一个日期键，确保「今日牌」和「当日卦象」指向同一天。
  // 注意：这里必须用本地年月日，不能用 toISOString()。
  // toISOString() 取的是 UTC 日期，在东八区，本地 00:00 对应 UTC 前一日 16:00，
  // 于是「选 11 月 7 日」会被算成 11 月 6 日，输入框也跟着回退一天。
  function ymd(date) {
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
  }

  // 统一取「当天正午」来代表某一天：
  // 1) 避开午夜在换算黄历/卦象时落到前一日；
  // 2) 避开夏令时切换当天的 00:00 不存在或重复的问题。
  function noonOf(y, m, d) { return new Date(y, m - 1, d, 12, 0, 0, 0); }

  function todayNoon() {
    var now = new Date();
    return noonOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  function computeReading(outcome, date) {
    var gbti = outcome.personality;
    var birthEntry = TAROT_MAP[gbti.code] || TAROT_MAP.FLDO;
    var birthCard = CARD_BY_ID[birthEntry.card] || TAROT_CARDS[0];
    var daily = drawCard("tarot-global:" + ymd(date));
    var xuan = xuanxueReading(outcome, date);
    return {
      gbti: gbti,
      // 四维得分与偏好在解读层用来做个体化提示（牌是当天所有人共用的，四维才是自己的）。
      scores: outcome.scores || null,
      axisCode: outcome.axisCode || gbti.code,
      date: date,
      ymd: ymd(date),
      birth: { card: birthCard, entry: birthEntry },
      daily: daily,
      xuan: xuan,
      cross: buildCross(xuan, daily)
    };
  }

  /* ---------------- 双引擎公共设施 ---------------- */

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

  /* ---------------- AI 解读 ----------------
     链路：确定性关系判定（relationsOf）→ 本地五段解读 → 可选大模型把同一批事实写成话。
     两个引擎输出同一个五段 schema，切换引擎时版式不变，只换措辞。 */

  var AI_CACHE_PREFIX = "gbti-tarot-ai:";
  var AI_TIMEOUT_MS = 12000;
  var AI_MAX_CACHE = 12;

  // 五段的固定标签。本地引擎和大模型都用这套标签，渲染层因此只有一条路径。
  var AI_LABEL_TEXT = { judge: "判断", relation: "关系", caution: "提醒", question: "自省问题", close: "收束" };

  /* 牌面语族：把 22 张牌归到五族，用于判定两张牌之间的关系。
     这是本模块的确定性规则，不涉及命理，只描述「动作方向」。
     进＝推进，建＝立规则，稳＝守与配比，拆＝结束与清理，观＝观察与等待。 */
  var FAMILY = {
    0: "进", 1: "进", 2: "观", 3: "稳", 4: "建", 5: "建", 6: "观", 7: "进",
    8: "稳", 9: "观", 10: "进", 11: "建", 12: "观", 13: "拆", 14: "稳",
    15: "拆", 16: "拆", 17: "稳", 18: "观", 19: "进", 20: "观", 21: "稳"
  };
  var FAMILY_ORDER = ["建", "拆", "进", "稳", "观"];

  var FAMILY_SAME = {
    "建": "两张都在强调结构，规则已经够用，不必再另起一套。",
    "拆": "两张都在做减法，今天的方向是清理，不是加法。",
    "进": "两张都在往前推，动能一致，但要留意推得太快。",
    "稳": "两张都在求稳，节奏一致，不必勉强加速。",
    "观": "两张都在等。等本身没问题，问题是有没有等的期限。"
  };

  // 关系表：key 为两族按 FAMILY_ORDER 排序后的组合。
  var REL_RULE = {
    "建|拆": ["承接", "一个在立规矩，一个在结束旧规矩，是同一件事的两端。"],
    "建|进": ["同向", "先立规则再推进，顺序是顺的。"],
    "建|稳": ["同向", "结构与耐心同向，适合按既定节奏执行。"],
    "建|观": ["承接", "规则已明确，判断还在成形，先别急着落地。"],
    "拆|进": ["张力", "一边想加速，一边在收场，方向未定。"],
    "拆|稳": ["同向", "两张都在降低动作幅度，一起指向「收」。"],
    "拆|观": ["承接", "先看清，再结束；顺序对了就不算拖。"],
    "进|稳": ["张力", "推进的冲动和克制的本能在同一张桌上，容易反复。"],
    "进|观": ["张力", "一个想动，一个想看清楚，节奏互相拉扯。"],
    "稳|观": ["同向", "都在等，等的过程中更该关注什么正在变。"]
  };

  function familyOf(card) { return FAMILY[card.id] || "稳"; }

  function relationOf(a, b) {
    var fa = familyOf(a.card), fb = familyOf(b.card);
    if (fa === fb) return { kind: "同向", text: FAMILY_SAME[fa] || "" };
    var ia = FAMILY_ORDER.indexOf(fa), ib = FAMILY_ORDER.indexOf(fb);
    var key = ia <= ib ? fa + "|" + fb : fb + "|" + fa;
    var rule = REL_RULE[key];
    if (!rule) return { kind: "承接", text: "两张牌的指向不完全一致，适合并置着一起看。" };
    return { kind: rule[0], text: rule[1] };
  }

  /* 四维极值：找出得分最高的一端，给一句针对性的提醒。
     这是「个性化」最实在的落点——牌是当天所有人共用的，四维才是自己的。 */
  var AXIS_INSIGHT = {
    F: "你在「基本面」上得分最高，习惯先看数据再下结论——今天缺的可能不是数据，而是承认数据已经够了的时点。",
    M: "你在「市场面」上得分最高，对盘面变化敏感——敏感是优势，但今天要留意别把噪音当信号。",
    L: "你在「长期」上得分最高，愿意等——那就给这份等待一个复核节点，而不是无限续期。",
    S: "你在「短期」上得分最高，反应快——快的前提是退出条件已经写好。",
    D: "你在「稳健」上得分最高，倾向控制波动——别把「没有波动」本身当成目标。",
    A: "你在「进取」上得分最高，能承受起伏——承受力不等于该承受，先确认这笔风险是你自己选的。",
    O: "你在「客观规则」上得分最高，靠事先设定的条件做决定——规则是用来减少犹豫的，不是用来替代判断的。",
    J: "你在「主观判断」上得分最高，依赖具体背景——背景越多，越要小心只挑支持自己的那部分。"
  };

  var AXIS_KEYS = ["F", "M", "L", "S", "D", "A", "O", "J"];

  function topAxis(scores) {
    if (!scores) return "";
    var best = "";
    AXIS_KEYS.forEach(function (k) {
      if (typeof scores[k] !== "number") return;
      if (!best || scores[k] > scores[best]) best = k;
    });
    return best;
  }

  function axisInsight(scores) {
    var k = topAxis(scores);
    if (!k || !AXIS_INSIGHT[k]) return null;
    return { axis: k, text: AXIS_INSIGHT[k] };
  }

  /* 自省问题题库：按「日期 + 今日牌」确定性抽取，同一天同一张牌永远同一句。 */
  var QUESTIONS = [
    "如果一个月后回头看，你会希望今天少做的那一件事是什么？",
    "如果这周它没有按你的预期走，你会先改判断，还是先改仓位？",
    "你现在持有的理由，三个月后还成立吗？",
    "今天让你最不舒服的那个念头，具体指向哪一条假设？",
    "如果只能留下一条规则，你会留哪一条、删掉哪一条？",
    "这次的退出条件，你在动手之前写下来了吗？"
  ];

  function pickQuestion(d) {
    var i = hashString(d.ymd + ":" + d.daily.card.id) % QUESTIONS.length;
    if (d.daily.reversed) i = (i + 2) % QUESTIONS.length;
    return QUESTIONS[i];
  }

  /* 本地解读：产出五段文本，格式与模型输出一致（标签｜内容），渲染层不必区分来源。 */
  function localBlocks(d, luck) {
    var tone = effectiveTone(d.daily);
    var r1 = relationOf({ card: d.birth.card }, d.daily);
    var r2 = luck ? relationOf(d.daily, luck) : null;
    var r3 = luck ? relationOf({ card: d.birth.card }, luck) : null;
    var conflict = r1.kind === "张力" || (r2 && r2.kind === "张力") || (r3 && r3.kind === "张力");

    var judge;
    if (conflict) {
      judge = "牌面没有站在同一边，今天更适合先把矛盾看清楚，而不是急着做决定。";
    } else if (tone === "进取") {
      judge = "牌面整体偏进取，今天适合把已经想清楚的事往前推一小步，但别一次推到底。";
    } else if (tone === "守成") {
      judge = "牌面整体偏守成，今天以守住已经验证有效的部分为主。";
    } else if (tone === "观望") {
      judge = "牌面整体偏观望，今天不必急着找机会，先把条件看清楚。";
    } else {
      judge = "牌面整体偏平衡，今天适合整理手上的事，而不是开新局。";
    }

    var relation = "本命「" + d.birth.card.name + "」与今日「" + d.daily.card.name + "」" + r1.kind
      + "——" + r1.text;
    if (luck) {
      // 若与前一组同型，不再重复整句解释，避免同一段里出现两句一样的话。
      relation += "随机「" + luck.card.name + "」接在后面，与今日牌" + r2.kind
        + (r2.kind === r1.kind ? "，方向与上一组一致。" : "——" + r2.text);
    } else {
      relation += "随机牌还没翻开，这里先只对比本命与今日这两张。";
    }

    var caution;
    if (conflict) {
      caution = "拉扯本身就是信息：说明你对这件事的标准还没定下来。先写下判定条件，再谈动作。";
    } else {
      caution = "几张牌指向同一边时，最该警惕的不是判断错，而是把「同向」读成「确定」——同向只说明你此刻的心态一致，不说明外部条件已经成熟。";
    }
    if (d.daily.reversed) caution += "今日牌为逆位，这股能量目前更多向内，先处理内部条件。";
    var axis = axisInsight(d.scores);
    if (axis) caution += axis.text;

    return {
      judge: judge,
      relation: relation,
      caution: caution,
      question: pickQuestion(d),
      close: conflict
        ? "把「二选一」换成「先定标准」：标准清楚了，选项自己会收敛。"
        : "把「要不要动」换成「动之前先写清楚退出条件」。"
    };
  }

  function localText(d, luck) {
    var b = localBlocks(d, luck);
    return AI_LABEL_TEXT.judge + "｜" + b.judge + "\n"
      + AI_LABEL_TEXT.relation + "｜" + b.relation + "\n"
      + AI_LABEL_TEXT.caution + "｜" + b.caution + "\n"
      + AI_LABEL_TEXT.question + "｜" + b.question + "\n"
      + AI_LABEL_TEXT.close + "｜" + b.close;
  }

  /* ---------------- 大模型引擎 ---------------- */

  function buildSystemPrompt() {
    return [
      "你是一位投资教育讲师，用塔罗的象征语言帮人看清自己的决策习惯。",
      "红线：不预测涨跌、不给点位、不承诺收益、不评判用户的理性程度或投资能力；塔罗不是预测工具，只作为自我提问的方式；不编造牌义。",
      "用简体中文输出，语气克制，不用 markdown 标题、不用 emoji。"
    ].join("");
  }

  function relationsText(d, luck) {
    var r1 = relationOf({ card: d.birth.card }, d.daily);
    var trim = function (s) { return String(s || "").replace(/。$/, ""); };
    var out = ["本命×今日=" + r1.kind + "（" + trim(r1.text) + "）"];
    if (luck) {
      var r2 = relationOf(d.daily, luck);
      var r3 = relationOf({ card: d.birth.card }, luck);
      out.push("今日×随机=" + r2.kind + "（" + trim(r2.text) + "）");
      out.push("本命×随机=" + r3.kind + "（" + trim(r3.text) + "）");
      var conflict = r1.kind === "张力" || r2.kind === "张力" || r3.kind === "张力";
      out.push("整体=" + (conflict ? "存在拉扯，非同向" : "三张方向一致"));
    } else {
      out.push("整体=" + (r1.kind === "张力" ? "本命与今日存在拉扯"
        : r1.kind === "同向" ? "本命与今日同向，随机牌未翻开"
          : "本命与今日承接、不冲突，随机牌未翻开"));
    }
    return out.join("；") + "。";
  }

  /* 页面上下文：与 ai.js 的注入保持同一口径，失败一律静默跳过。 */
  function planContext() {
    try {
      var plan = window.GBTI_PLAN && window.GBTI_PLAN.plan;
      if (!plan || !plan.allocation) return "";
      var sleeves = plan.allocation.map(function (s) { return s.name + " " + s.pct + "%"; }).join("、");
      return "【页面配置】" + (plan.styleName || "") + "风格，资产配置：" + sleeves
        + "。这是按规则生成的趣味示例，不是投资建议。";
    } catch (e) { return ""; }
  }

  function marketContext() {
    try {
      if (typeof GBTI_MARKET === "undefined" || !GBTI_MARKET) return "";
      return "【页面行情】数据截至 " + GBTI_MARKET.asOf + "，覆盖 " + (GBTI_MARKET.coverage || "未知") + "。";
    } catch (e) { return ""; }
  }

  function buildUserPrompt(d, luck) {
    var p = d.gbti;
    var lines = [];
    lines.push("【用户】" + p.name + "（" + p.code + "）" + (p.tags && p.tags.length ? "：" + p.tags.join("·") : ""));
    if (d.scores) {
      lines.push("【四维得分】" + AXIS_KEYS.map(function (k) { return k + (d.scores[k] || 0); }).join(" ")
        + "（F 基本面／M 市场面／L 长期／S 短期／D 稳健／A 进取／O 客观规则／J 主观判断）");
    }
    lines.push("【本命牌】「" + d.birth.card.name + "」关键词 " + d.birth.card.keywords.join("、")
      + "；为什么是这张：" + d.birth.entry.reason);
    lines.push("【今日牌】「" + d.daily.card.name + "」" + (d.daily.reversed ? "逆位" : "正位")
      + "，关键词 " + d.daily.card.keywords.join("、") + "，行动倾向 " + effectiveTone(d.daily)
      + "。牌面：" + (d.daily.reversed ? d.daily.card.reversed : d.daily.card.upright));
    if (luck) {
      lines.push("【随机牌】「" + luck.card.name + "」" + (luck.reversed ? "逆位" : "正位")
        + "，关键词 " + luck.card.keywords.join("、")
        + "。牌面：" + (luck.reversed ? luck.card.reversed : luck.card.upright)
        + " —— 这是凭手气抽到的第三张，代表计划外的变量。");
    } else {
      lines.push("【随机牌】用户还没有翻开，不要在解读里提及这一张。");
    }
    lines.push("【已算好的关系】" + relationsText(d, luck));

    var x = d.xuan ? d.xuan.xuanxue : null;
    var hex = d.xuan && d.xuan.cast ? d.xuan.cast.primary : null;
    var al = d.xuan ? d.xuan.almanac : null;
    if (x) {
      lines.push("【东方底色】五行属" + x.element + "、本命卦「" + hexName(x.hexagram) + "」、" + x.yinYang + "。");
    }
    if (hex) lines.push("【今日卦象】「" + hex.full_name + "」（" + hex.keyword + "）：" + hex.hint);
    if (al && al.available) {
      lines.push("【今日黄历】" + al.date + "，建除" + al.zhixing + "日，值神" + al.tianshen
        + "（" + al.tianshen_type + "），六曜" + al.liuyao + "。");
    }
    if (d.cross) lines.push("【东西合参】" + d.cross.title + "。" + d.cross.text);

    var extra = [planContext(), marketContext()].filter(Boolean);
    if (extra.length) lines.push(extra.join(""));

    lines.push("要求：只叙述上面给出的事实，不要新增牌义、不要预测涨跌。"
      + "严格输出五段，每段单独一行，以「标签｜」开头，标签依次为 判断、关系、提醒、自省问题、收束。"
      + "每段一到两句，全文 260 字以内。其中「自省问题」那一段必须是一个问句。");
    return lines.join("\n");
  }

  /* 未加载 ai.js 时的兜底请求（非流式）。正常情况下走 GBTI_AI.complete，共用同一份配置。 */
  function remoteText(opts) {
    var c = loadAiConfig();
    var base = String(c.base || "").replace(/\/+$/, "");
    return fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify({
        model: c.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        stream: false,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user }
        ]
      }),
      signal: opts.signal
    }).then(function (resp) {
      if (!resp.ok) throw new Error("接口返回 " + resp.status);
      return resp.json();
    }).then(function (data) {
      var content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error("接口未返回内容");
      return content.trim();
    });
  }

  function hasSharedEngine() {
    return Boolean(window.GBTI_AI && typeof window.GBTI_AI.complete === "function"
      && typeof window.GBTI_AI.isRemote === "function" && window.GBTI_AI.isRemote());
  }

  /* ---------------- 缓存（按日期 + 人格 + 三张牌） ---------------- */

  function aiCacheKey(d, luck) {
    return AI_CACHE_PREFIX + [
      d.ymd,
      d.gbti.code,
      d.daily.card.id,
      d.daily.reversed ? 1 : 0,
      luck ? luck.card.id : "-",
      luck && luck.reversed ? 1 : 0,
      d.cross ? d.cross.title : "-"
    ].join("|");
  }

  function readAiCache(key, ymd) {
    try {
      var raw = JSON.parse(localStorage.getItem(key) || "null");
      if (raw && raw.day === ymd && raw.text) return raw.text;
    } catch (e) { /* 忽略解析失败。 */ }
    return "";
  }

  function writeAiCache(key, ymd, text) {
    try {
      localStorage.setItem(key, JSON.stringify({ day: ymd, text: text }));
    } catch (e) { return; }
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(AI_CACHE_PREFIX) === 0) keys.push(k);
      }
      while (keys.length > AI_MAX_CACHE) localStorage.removeItem(keys.shift());
    } catch (e) { /* 忽略清理失败。 */ }
  }

  /* ---------------- 渲染五段 ---------------- */

  var BLOCK_RE = /(?:^|\n)\s*(判断|关系|提醒|自省问题|收束)\s*[｜|:：]\s*/g;

  function parseBlocks(text) {
    var src = String(text || "");
    var marks = [];
    var m;
    BLOCK_RE.lastIndex = 0;
    while ((m = BLOCK_RE.exec(src)) !== null) {
      marks.push({ label: m[1], start: m.index, end: BLOCK_RE.lastIndex });
    }
    if (marks.length < 2) return null;
    var out = [];
    for (var i = 0; i < marks.length; i++) {
      var stop = i + 1 < marks.length ? marks[i + 1].start : src.length;
      var bodyText = src.slice(marks[i].end, stop).trim();
      if (bodyText) out.push({ label: marks[i].label, text: bodyText });
    }
    return out.length >= 2 ? out : null;
  }

  function paintAi(text) {
    var el = document.getElementById("tr-ai-text");
    if (!el) return;
    var blocks = parseBlocks(text);
    if (!blocks) {
      el.innerHTML = '<p>' + esc(text).replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>") + '</p>';
      return;
    }
    el.innerHTML = blocks.map(function (b) {
      var cls = b.label === "自省问题" ? "tr-ai-block is-q" : "tr-ai-block";
      return '<div class="' + cls + '">'
        + '<span class="tr-ai-label">' + transEsc(b.label) + '</span>'
        + '<p>' + esc(b.text).replace(/\n/g, "<br>") + '</p>'
        + '</div>';
    }).join("");
  }

  // 标签来自白名单常量，这里再转义一次只是防止未来被改成动态输入。
  function transEsc(s) { return esc(s); }

  /* ---------------- 请求生命周期 ---------------- */

  var aiReq = { ctrl: null, key: "" };

  function cancelAi() {
    if (aiReq.ctrl) {
      try { aiReq.ctrl.abort(); } catch (e) { /* 忽略。 */ }
    }
    aiReq.ctrl = null;
  }

  function setRetry(btn, show) {
    if (!btn) return;
    if (show) btn.classList.remove("is-hidden");
    else btn.classList.add("is-hidden");
  }

  function requestAi(opts) {
    cancelAi();
    var d = opts.d, luck = opts.luck;
    var srcEl = opts.srcEl, retryBtn = opts.retryBtn, textEl = opts.textEl;
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    aiReq.ctrl = ctrl;
    aiReq.key = opts.key;

    var timer = null;
    if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, AI_TIMEOUT_MS);

    var alive = function () {
      return textEl && textEl.isConnected && document.getElementById("tr-ai-text") === textEl;
    };
    var finish = function () { if (timer) { clearTimeout(timer); timer = null; } };

    var payload = {
      system: buildSystemPrompt(),
      user: buildUserPrompt(d, luck),
      temperature: 0.4,
      maxTokens: 600,
      signal: ctrl ? ctrl.signal : undefined,
      onDelta: function (acc) {
        if (!alive()) return;
        paintAi(acc);
        if (srcEl) srcEl.textContent = "大模型生成中…";
      }
    };

    var run = hasSharedEngine()
      ? function () { return window.GBTI_AI.complete(payload); }
      : function () { return remoteText(payload); };

    run().then(function (text) {
      finish();
      if (!alive()) return;
      var clean = String(text || "").trim();
      if (!clean) throw new Error("接口返回空内容");
      paintAi(clean);
      if (srcEl) srcEl.textContent = "大模型生成 · " + ((loadAiConfig().model) || "已配置模型");
      setRetry(retryBtn, false);
      state.aiSource = "llm";
      writeAiCache(opts.key, d.ymd, clean);
    }).catch(function (err) {
      finish();
      if (!alive()) return;
      paintAi(opts.localText);
      state.aiSource = "template";
      if (srcEl) {
        if (err && err.name === "AbortError") {
          srcEl.textContent = "大模型请求超时（" + Math.round(AI_TIMEOUT_MS / 1000) + " 秒），已保留本地解读";
        } else {
          srcEl.textContent = "大模型不可用（" + ((err && err.message) || "未知错误") + "），已保留本地解读";
        }
      }
      setRetry(retryBtn, true);
    });
  }

  /* ---------------- 入口 ---------------- */

  function interpret(force) {
    var textEl = document.getElementById("tr-ai-text");
    var srcEl = document.getElementById("tr-ai-src");
    var retryBtn = document.getElementById("tr-ai-retry");
    if (!textEl || !state.reading) return;

    var d = state.reading;
    var luck = state.luck && state.luck.revealed ? state.luck.draw : null;
    var local = localText(d, luck);
    var key = aiCacheKey(d, luck);

    cancelAi();
    // 先落本地解读：无论后面远程成功、失败还是挂起，这一屏都不会是空白或三个点。
    paintAi(local);
    state.aiSource = "template";

    if (!remoteReady()) {
      if (srcEl) srcEl.textContent = "本地规则引擎生成（离线，零配置）";
      setRetry(retryBtn, false);
      return;
    }

    var cached = force ? "" : readAiCache(key, d.ymd);
    if (cached) {
      paintAi(cached);
      state.aiSource = "cache";
      if (srcEl) srcEl.textContent = "大模型生成 · 今日缓存";
      setRetry(retryBtn, false);
      return;
    }

    if (srcEl) srcEl.textContent = "本地解读已生成，正在请求大模型…";
    requestAi({ key: key, d: d, luck: luck, localText: local, textEl: textEl, srcEl: srcEl, retryBtn: retryBtn });
  }

  /* ---------------- 渲染 ---------------- */

  /* 牌面素材：RWS 1909 初版扫描（公有领域），22 张大阿卡纳，
     已裁掉原扫描的白边/黑框/底部标题带并统一比例，存于 web/assets/tarot/。 */
  var TAROT_ART_DIR = "assets/tarot/";

  function tarotArtSrc(card) {
    var n = card.id < 10 ? "0" + card.id : String(card.id);
    return TAROT_ART_DIR + n + ".webp";
  }

  function faceHtml(card, reversed) {
    return '<div class="tr-face-inner">'
      + '<div class="tr-art">'
      +   '<img src="' + tarotArtSrc(card) + '" alt=""'
      +        ' width="400" height="652" loading="lazy" decoding="async">'
      + '</div>'
      + '<div class="tr-caption">'
      +   '<b>' + esc(card.name) + '<i>' + esc(card.element) + '</i></b>'
      +   '<span><em>' + esc(card.roman) + '</em>' + esc(card.en) + '</span>'
      + '</div>'
      + (reversed ? '<span class="tr-rev-badge">逆位</span>' : '')
      + '</div>';
  }

  function cardWrapHtml(card, reversed, opts) {
    opts = opts || {};
    var classes = "tr-card-wrap";
    if (opts.faceUp) classes += " is-flipped";
    if (opts.isStatic) classes += " is-static";

    var attrs = "";
    if (opts.id) attrs += ' id="' + esc(opts.id) + '"';
    attrs += ' data-reversed="' + (reversed ? "true" : "false") + '"';

    var flipAttrs = "";
    if (opts.interactive) {
      flipAttrs = ' role="button" tabindex="0" aria-label="' + esc(opts.label || "翻开塔罗牌") + '" aria-pressed="false"';
    }
    var faceAttrs = opts.interactive ? ' aria-hidden="true"' : "";

    return '<div class="' + classes + '"' + attrs + '>'
      + '<div class="tr-card-flip"' + flipAttrs + '>'
      +   '<div class="tr-card-back" aria-hidden="true">'
      +     '<span class="tr-back-glyph">✦</span>'
      +     '<span class="tr-back-moon">☾</span>'
      +     '<span class="tr-back-line"></span>'
      +   '</div>'
      +   '<div class="tr-card-face"' + faceAttrs + '>' + faceHtml(card, reversed) + '</div>'
      + '</div></div>';
  }

  function portraitHtml(d) {
    var g = d.gbti;
    var x = d.xuan ? d.xuan.xuanxue : null;
    var birth = d.birth.card;
    var east = x
      ? "五行属" + esc(x.element) + " · 本命卦「" + esc(hexName(x.hexagram)) + "」"
      : "东方玄学模块未加载";
    var eastNote = x ? esc((x.aura || []).join(" · ")) : "仅展示 GBTI 与塔罗";

    return '<div class="tr-section">'
      + '<h3 class="tr-h3">三维画像 <span class="tr-dim">GBTI × 东方玄学 × 西方塔罗</span></h3>'
      + '<div class="tr-portrait">'
      +   '<div class="tr-portrait-col"><span>GBTI 人格</span><b>' + esc(g.name) + '（' + esc(g.code) + '）</b><em>' + esc((g.tags || []).join(" · ")) + '</em></div>'
      +   '<div class="tr-portrait-col"><span>东方底色</span><b>' + east + '</b><em>' + eastNote + '</em></div>'
      +   '<div class="tr-portrait-col"><span>西方塔罗</span><b>本命牌「' + esc(birth.name) + '」</b><em>' + esc(birth.keywords.join(" · ")) + '</em></div>'
      + '</div></div>';
  }

  /* ---------------- 手气随机牌 ---------------- */

  // 与前两张不同，随机牌不看日期、不看人格，现场 Math.random() 抽。
  // 抽牌时避开「本命牌」和「今日牌」，否则随机牌抽到本命牌会显得像没抽。
  function drawLuckCard(d) {
    var avoid = [d.birth.card.id, d.daily.card.id];
    var idx = 0;
    for (var i = 0; i < 12; i++) {
      idx = Math.floor(Math.random() * TAROT_CARDS.length);
      if (avoid.indexOf(TAROT_CARDS[idx].id) < 0) break;
    }
    return { card: TAROT_CARDS[idx], index: idx, reversed: Math.random() < 0.38 };
  }

  function luckKey(d) {
    return (d.ymd || "") + "|" + (d.gbti ? d.gbti.code : "");
  }

  // 同一张「日期 + 人格」组合内保持同一张随机牌，切日期或换结果才会重抽，
  // 避免每次重渲染都偷偷换牌。
  function ensureLuck(d) {
    var key = luckKey(d);
    if (!state.luck || state.luck.key !== key) {
      state.luck = { key: key, draw: drawLuckCard(d), revealed: false };
    }
    return state.luck;
  }

  function luckColHtml(d) {
    var dr = ensureLuck(d).draw;
    return '<div class="tr-card-label">随机牌 · <span id="tr-luck-pos">待抽取</span></div>'
      + cardWrapHtml(dr.card, dr.reversed, { interactive: true, id: "tr-luck-card", label: "抽取随机塔罗牌" })
      + '<div class="tr-luck-detail is-hidden" id="tr-luck-detail" aria-live="polite">'
      +   '<div class="tr-daily-head"><b>' + esc(dr.card.name) + '</b>'
      +     '<span>' + (dr.reversed ? "逆位" : "正位") + ' · 倾向' + esc(effectiveTone(dr)) + '</span></div>'
      +   '<p>' + esc(dr.reversed ? dr.card.reversed : dr.card.upright) + '</p>'
      +   '<p class="tr-invest-hint">' + esc(dr.card.investHint) + '</p>'
      + '</div>'
      + '<button type="button" class="tr-luck-btn is-hidden" id="tr-luck-redraw">再抽一张</button>'
      + '<p class="tr-card-note tr-muted" id="tr-luck-hint">凭手气随机抽取，与本命牌和日期无关</p>';
  }

  // 翻牌 + 展开说明。抽牌后与「再抽一张」重渲染后共用同一段逻辑。
  function revealLuck() {
    var lk = state.luck;
    var wrap = document.getElementById("tr-luck-card");
    if (!lk || !wrap) return;

    wrap.classList.add("is-flipped");
    var flip = wrap.querySelector(".tr-card-flip");
    if (flip) {
      flip.setAttribute("aria-pressed", "true");
      flip.setAttribute("aria-label", "随机牌：" + lk.draw.card.name + (lk.draw.reversed ? "，逆位" : "，正位"));
    }

    var pos = document.getElementById("tr-luck-pos");
    if (pos) pos.textContent = lk.draw.reversed ? "逆位" : "正位";

    ["tr-luck-detail", "tr-luck-redraw"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove("is-hidden");
    });

    var hint = document.getElementById("tr-luck-hint");
    if (hint) hint.classList.add("is-hidden");

    // 随机牌翻开后，第三张才进入解读上下文，这里重跑一次解读。
    interpret();
  }

  function rerenderLuck() {
    var col = document.getElementById("tr-luck-col");
    if (!col || !state.reading) return;
    col.innerHTML = luckColHtml(state.reading);
    bindLuck();
    if (state.luck && state.luck.revealed) {
      // 新牌先以背面插入，下一帧再加 is-flipped，让翻牌动画真的跑一遍，
      // 而不是直接闪成正面。
      var run = function () { revealLuck(); };
      if (window.requestAnimationFrame) window.requestAnimationFrame(run);
      else setTimeout(run, 16);
    }
  }

  function bindLuck() {
    var wrap = document.getElementById("tr-luck-card");
    if (wrap) {
      var flip = wrap.querySelector(".tr-card-flip");
      var draw = function () {
        if (!state.luck || state.luck.revealed) return;
        state.luck.revealed = true;
        revealLuck();
      };
      if (flip) {
        flip.addEventListener("click", draw);
        flip.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            draw();
          }
        });
      }
    }

    var again = document.getElementById("tr-luck-redraw");
    if (again) {
      again.addEventListener("click", function () {
        if (!state.reading || !state.luck) return;
        state.luck = {
          key: luckKey(state.reading),
          draw: drawLuckCard(state.reading),
          revealed: true
        };
        rerenderLuck();
      });
    }
  }

  function cardsHtml(d) {
    var birth = d.birth, daily = d.daily;
    var pos = daily.reversed ? "逆位" : "正位";
    var tone = effectiveTone(daily);
    var dailyText = daily.reversed ? daily.card.reversed : daily.card.upright;

    return '<div class="tr-section">'
      + '<h3 class="tr-h3">本命塔罗 · 今日一牌 <span class="tr-dim">本命与今日牌由日期确定，同一天所有人相同；随机牌凭手气</span></h3>'
      + '<div class="tr-cards-row">'
      +   '<div class="tr-card-col">'
      +     '<div class="tr-card-label">本命牌 · 你的塔罗底色</div>'
      +     cardWrapHtml(birth.card, false, { faceUp: true, isStatic: true })
      +     '<p class="tr-card-note">' + esc(birth.entry.reason) + '</p>'
      +     '<p class="tr-card-note tr-muted">' + esc(birth.card.keywords.join(" · ")) + '</p>'
      +   '</div>'
      +   '<div class="tr-card-col">'
      +     '<div class="tr-card-label">今日牌 · <span id="tr-daily-pos">待翻开</span></div>'
      +     cardWrapHtml(daily.card, daily.reversed, { interactive: true, id: "tr-daily-card", label: "翻开今日塔罗牌" })
      +     '<div class="tr-daily-detail is-hidden" id="tr-daily-detail" aria-live="polite">'
      +       '<div class="tr-daily-head"><b>' + esc(daily.card.name) + '</b><span>' + esc(pos) + ' · 倾向' + esc(tone) + '</span></div>'
      +       '<p>' + esc(dailyText) + '</p>'
      +       '<p class="tr-invest-hint">' + esc(daily.card.investHint) + '</p>'
      +     '</div>'
      +   '</div>'
      +   '<div class="tr-card-col" id="tr-luck-col">' + luckColHtml(d) + '</div>'
      + '</div></div>';
  }

  function crossHtml(d) {
    var cross = d.cross;
    if (!cross) {
      return '<div class="tr-section"><h3 class="tr-h3">东西合参</h3>'
        + '<div class="tr-cross"><p>未找到东方玄学模块的当日卦象，合参暂不可用；塔罗部分仍可独立阅读。</p></div></div>';
    }
    return '<div class="tr-section">'
      + '<h3 class="tr-h3">东西合参 <span class="tr-dim">卦象势能 × 塔罗倾向</span></h3>'
      + '<div class="tr-cross">'
      +   '<div class="tr-cross-head"><b>' + esc(cross.title) + '</b>'
      +     '<span>卦象势能 ' + cross.hexMomentum + ' · 塔罗倾向 ' + esc(cross.tone) + '</span></div>'
      +   '<p>' + esc(cross.text) + '</p>'
      +   '<div class="tr-cross-meta">'
      +     '<span>卦象：' + esc(cross.hexName) + ' · ' + esc(cross.hexKeyword) + '</span>'
      +     '<span>塔罗：' + esc(cross.cardName) + (cross.reversed ? ' 逆位' : ' 正位') + '</span>'
      +   '</div>'
      + '</div></div>';
  }

  function render() {
    var body = document.getElementById("tr-body");
    if (!body) return;
    if (!state.reading) {
      body.innerHTML = '<p class="tr-empty">完成答题后，这里会结合你的类型与当日日期，给出一张本命牌、一张今日牌，并与东方卦象做一次合参。</p>';
      return;
    }

    var d = state.reading;
    var head = document.getElementById("tr-head-title");
    if (head) {
      head.textContent = "本命「" + d.birth.card.name + "」 · 今日「" + d.daily.card.name + "」 · " + (d.cross ? d.cross.title : "塔罗映照");
    }

    var html = "";
    html += portraitHtml(d);
    html += cardsHtml(d);
    html += crossHtml(d);
    html += '<div class="tr-section"><h3 class="tr-h3">AI 解读</h3>'
      + '<div class="tr-ai">'
      +   '<div class="tr-ai-head">'
      +     '<span class="tr-ai-src" id="tr-ai-src" role="status" aria-live="polite">本地规则引擎生成（离线，零配置）</span>'
      +     '<button type="button" class="tr-ai-retry is-hidden" id="tr-ai-retry">重新生成</button>'
      +   '</div>'
      +   '<div class="tr-ai-text" id="tr-ai-text" aria-live="polite" aria-atomic="false"></div>'
      + '</div></div>';
    html += '<div class="tr-date"><label for="tr-date">换个日子：</label><input type="date" id="tr-date" value="' + esc(d.ymd) + '"></div>';
    html += '<p class="tr-disclaimer">' + esc(DISCLAIMER) + '</p>';

    body.innerHTML = html;
    bindEvents();
    interpret();
  }

  /* ---------------- 交互 ---------------- */

  function bindEvents() {
    var wrap = document.getElementById("tr-daily-card");
    var flip = wrap ? wrap.querySelector(".tr-card-flip") : null;

    if (flip && wrap) {
      var doFlip = function () {
        if (wrap.classList.contains("is-flipped")) return;
        wrap.classList.add("is-flipped");
        flip.setAttribute("aria-pressed", "true");

        var daily = state.reading ? state.reading.daily : null;
        if (daily) {
          flip.setAttribute("aria-label", "今日塔罗牌：" + daily.card.name + (daily.reversed ? "，逆位" : "，正位"));
        }
        var pos = document.getElementById("tr-daily-pos");
        if (pos && daily) pos.textContent = daily.reversed ? "逆位" : "正位";
        var detail = document.getElementById("tr-daily-detail");
        if (detail) detail.classList.remove("is-hidden");
      };

      flip.addEventListener("click", doFlip);
      flip.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          doFlip();
        }
      });
    }

    var retryBtn = document.getElementById("tr-ai-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () { interpret(true); });
    }

    var dateInput = document.getElementById("tr-date");
    if (dateInput) {
      dateInput.addEventListener("change", function () {
        if (!dateInput.value) return;
        var parts = dateInput.value.split("-");
        var dt = noonOf(+parts[0], +parts[1], +parts[2]);
        if (isNaN(dt.getTime())) return;
        state.date = dt;
        state.reading = computeReading(state.outcome, dt);
        state.aiSource = "template";
        render();
      });
    }

    bindLuck();
  }

  /* ---------------- 挂载（纯增量，不改动原有逻辑） ---------------- */

  function buildPanel() {
    var result = document.getElementById("result");
    if (!result || document.getElementById("tarot")) return;
    var anchor = document.getElementById("xuanxue") || document.getElementById("plan");

    var details = document.createElement("details");
    details.id = "tarot";
    details.className = "fold-section fold tr-panel";
    details.innerHTML =
      '<summary class="fold-head">'
      + '<span class="fold-mark" aria-hidden="true">塔罗</span>'
      + '<span class="fold-text">'
      +   '<span class="section-kicker">塔罗映照 · 西方象征系统</span>'
      +   '<span class="fold-title" id="tr-head-title">本命牌 · 今日牌 · 东西合参</span>'
      +   '<span class="fold-hint">用一张本命牌与一张今日牌，和东方卦象做一次并置阅读；塔罗只作为自我反思的提问方式，不预测涨跌。</span>'
      + '</span>'
      + '<span class="fold-chev" aria-hidden="true"></span>'
      + '</summary>'
      + '<div class="fold-body"><div id="tr-body" class="tr-body"></div></div>';

    if (anchor) anchor.parentNode.insertBefore(details, anchor.nextSibling);
    else result.appendChild(details);
    return details;
  }

  function injectHeroCta() {
    var top = document.querySelector("#result .hero-top");
    if (!top || document.getElementById("tr-hero-cta")) return;
    var btn = document.createElement("button");
    btn.id = "tr-hero-cta";
    btn.type = "button";
    btn.className = "pill-button";
    btn.textContent = "今日塔罗";
    btn.addEventListener("click", function () {
      if (window.GBTI_RESULT_PAGES) window.GBTI_RESULT_PAGES.open("tarot");
    });
    top.appendChild(btn);
  }

  function codeFromResult() {
    var el = document.getElementById("result-code");
    return el ? el.textContent.trim().toUpperCase() : "";
  }

  function personalityByCode(code) {
    if (typeof personalities === "undefined") return null;
    for (var i = 0; i < personalities.length; i++) {
      if (personalities[i].code === code) return personalities[i];
    }
    return null;
  }

  function renderFor(code, outcome) {
    var p = (outcome && outcome.personality) || personalityByCode(code);
    if (!p) return;
    var keep = (!outcome && state.outcome && state.outcome.personality
      && state.outcome.personality.code === p.code) ? state.outcome : null;
    state.outcome = {
      personality: p,
      scores: (outcome && outcome.scores) || (keep && keep.scores) || null,
      axisCode: (outcome && outcome.axisCode) || code
    };
    state.date = todayNoon();
    state.reading = computeReading(state.outcome, state.date);
    state.aiSource = "template";
    state.renderedCode = p.code;
    render();
  }

  // 由 test.js 在结果生成时同步传入完整 outcome（含四维得分）。
  // 塔罗自身不依赖它也能运行，拿到后解读会多一句针对个人倾向的提醒。
  function setOutcome(outcome) {
    if (!outcome || !outcome.personality) return;
    if (state.renderedCode === outcome.personality.code && state.date) {
      state.outcome = outcome;
      state.reading = computeReading(outcome, state.date);
      render();
      return;
    }
    renderFor(outcome.personality.code, outcome);
  }

  function init() {
    buildPanel();
    injectHeroCta();

    var code = codeFromResult();
    if (code && personalityByCode(code)) renderFor(code);

    var codeEl = document.getElementById("result-code");
    if (codeEl) {
      var observer = new MutationObserver(function () {
        var c = codeFromResult();
        if (c && personalityByCode(c) && c !== state.renderedCode) renderFor(c);
      });
      observer.observe(codeEl, { childList: true, characterData: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.GBTI_TAROT = {
    init: init,
    renderFor: renderFor,
    setOutcome: setOutcome,
    readingFor: function (outcome, date) { return computeReading(outcome, date); },
    drawFor: function (date) { return drawCard("tarot-global:" + ymd(date)); },
    cards: TAROT_CARDS,
    map: TAROT_MAP,
    // 纯逻辑接口（供测试与后续扩展，不参与页面渲染）
    effectiveTone: function (draw) { return effectiveTone(draw); },
    effectiveMomentum: function (draw) { return effectiveMomentum(draw); },
    crossFor: function (xuan, draw) { return buildCross(xuan, draw); },
    // 关系判定与本地解读：暴露出来便于离线测试，也让远程提示词可被外部检查。
    relationFor: function (a, b) { return relationOf(a, b); },
    localTextFor: function (reading, luck) { return localText(reading, luck); },
    promptFor: function (reading, luck) { return buildUserPrompt(reading, luck); }
  };
})();
