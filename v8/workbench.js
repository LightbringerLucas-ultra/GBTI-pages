/* GBTI 标的筛选工作台 · 人格联动版
 * 只读取现有快照与答题记录，不改动答题流程，不生成任何新的数字。
 * 筛选分直接复用 allocation.js 的 scoreStock，与结果页示例标的同源同规则。
 */
(function () {
  "use strict";

  /* 顶层 const 不挂在 window 上，必须用裸标识符配 typeof 守卫。 */
  var POOL = typeof GBTI_POOL !== "undefined" ? GBTI_POOL : [];
  var FUNDS = typeof GBTI_POOL_FUND !== "undefined" ? GBTI_POOL_FUND : [];
  var INDEX = typeof GBTI_POOL_INDEX !== "undefined" ? GBTI_POOL_INDEX : [];
  var META = typeof GBTI_POOL_INDEX_META !== "undefined" ? GBTI_POOL_INDEX_META : null;
  var MARKET = typeof GBTI_MARKET !== "undefined" ? GBTI_MARKET : null;
  var ALLOC = window.GBTI_ALLOC || null;
  var deriveStyles = ALLOC && ALLOC._internal ? ALLOC._internal.deriveStyles : null;
  var scoreStock = ALLOC && ALLOC._internal ? ALLOC._internal.scoreStock : null;
  var styleFor = ALLOC ? ALLOC.styleFor : null;
  var stockPersonalityOf = ALLOC ? ALLOC.stockPersonalityOf : null;
  var stockThresholds = ALLOC ? ALLOC.stockThresholds : null;
  var STYLE_NAME = ALLOC && ALLOC.STYLE_NAME ? ALLOC.STYLE_NAME : {
    value: "价值稳健", quality: "质量成长", steady: "大盘稳健", trend: "趋势动量"
  };
  var PERSONALITIES = typeof personalities !== "undefined" ? personalities : [];
  var DIMENSIONS = typeof dimensions !== "undefined" ? dimensions : [];
  var calcResult = typeof calculateResult === "function" ? calculateResult : null;

  var PROGRESS_KEY = "gbti-progress-v6-20261013";
  var FAV_KEY = "gbti-workbench-favs";
  /* 每页条数：408 行一次铺完又长又卡，按 20 条分页。导出仍走全部筛选结果，不受分页影响。 */
  var PAGE_SIZE = 20;
  var GROUP_NAME = { manual: "人工候选池", index: "指数成分", fund: "配置载体" };
  var COLUMNS = [
    { key: "pick", label: "对比", kind: "pick" },
    { key: "fav", label: "收藏", kind: "fav" },
    { key: "code", label: "代码", kind: "text", sort: "code" },
    { key: "name", label: "名称", kind: "text", sort: "name" },
    { key: "score", label: "筛选分", kind: "score", sort: "score" },
    { key: "groupName", label: "标的来源", kind: "text", sort: "groupName" },
    { key: "belong", label: "行业 / 指数", kind: "text", sort: "belong" },
    { key: "close", label: "收盘价", kind: "num", sort: "close", digits: 2 },
    { key: "chgPct", label: "涨跌幅 %", kind: "chg", sort: "chgPct", digits: 2 },
    { key: "amountYi", label: "成交额 亿", kind: "num", sort: "amountYi", digits: 2 },
    { key: "turnover", label: "换手率 %", kind: "num", sort: "turnover", digits: 2 },
    { key: "pe", label: "市盈率", kind: "pe", sort: "pe", digits: 2 },
    { key: "pePct", label: "PE 分位 %", kind: "num", sort: "pePct", digits: 1 },
    { key: "pb", label: "市净率", kind: "num", sort: "pb", digits: 2 },
    { key: "mcapYi", label: "总市值 亿", kind: "num", sort: "mcapYi", digits: 1 },
    { key: "personaCode", label: "股票人格", kind: "persona", sort: "personaCode" },
    { key: "styles", label: "风格标签", kind: "styles" }
  ];

  var state = {
    sortKey: "score",
    sortDir: -1,
    favs: readFavs(),
    compare: [],
    rows: [],
    view: [],
    persona: null,
    answerCode: null,
    answerScores: null,
    cleared: false,
    styleFilterOn: false,
    sameOnly: false,
    thresholds: null,
    scoreCacheKey: null,
    page: 1
  };

  function readFavs() {
    try {
      var raw = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      return new Set(Array.isArray(raw) ? raw : []);
    } catch (e) { return new Set(); }
  }
  function saveFavs() {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(state.favs))); } catch (e) { /* 无痕模式静默跳过 */ }
  }
  function $(id) { return document.getElementById(id); }
  function isNum(v) { return typeof v === "number" && !isNaN(v); }
  function fmt(v, digits) { return isNum(v) ? v.toFixed(digits) : "--"; }
  function quoteOf(code) { return MARKET && MARKET.quotes ? (MARKET.quotes[code] || null) : null; }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? "--" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- 人格来源：网址四码优先，其次本机答题记录重算 ---------- */
  function personaFromCode(code, scores, source) {
    var p = PERSONALITIES.filter(function (x) { return x.code === code; })[0];
    if (!p || !styleFor) return null;
    return {
      code: code,
      name: p.name,
      scores: scores || null,
      style: styleFor(code),
      basis: code.charAt(0) === "M" ? "M" : "F",
      term: code.charAt(1) === "S" ? "S" : "L",
      source: source
    };
  }
  function resolvePersona() {
    state.persona = null;
    if (state.cleared) return;

    var urlCode = "";
    try { urlCode = (new URLSearchParams(window.location.search).get("code") || "").toUpperCase(); } catch (e) { urlCode = ""; }
    var validCode = /^[FM][LS][DA][OJ]$/.test(urlCode) &&
      PERSONALITIES.some(function (p) { return p.code === urlCode; });

    var fromAnswers = null;
    try {
      var raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      if (raw && Array.isArray(raw.answers) && calcResult) {
        var out = calcResult(raw.answers);
        fromAnswers = { code: out.axisCode, scores: out.scores };
      }
    } catch (e) { /* 未答完 28 题或记录异常，走降级 */ }
    state.answerCode = fromAnswers ? fromAnswers.code : null;
    state.answerScores = fromAnswers ? fromAnswers.scores : null;

    if (validCode) {
      var same = fromAnswers && fromAnswers.code === urlCode;
      state.persona = personaFromCode(urlCode, same ? fromAnswers.scores : null,
        same ? "本机答题记录与网址四码一致" : "网址四码（未提供逐题作答）");
    } else if (fromAnswers) {
      state.persona = personaFromCode(fromAnswers.code, fromAnswers.scores, "本机答题记录");
    }
  }

  /* ---------- 数据装配：36 人工 + 368 指数 + 4 载体，按代码去重 ---------- */
  function buildRows() {
    var rows = [];
    var seen = new Set();

    POOL.forEach(function (item) {
      if (seen.has(item.code)) return;
      seen.add(item.code);
      rows.push({
        code: item.code, name: item.name, group: "manual", groupName: GROUP_NAME.manual,
        industry: item.industry || null, indexes: [], belong: item.industry || "--",
        quote: quoteOf(item.code), styles: (item.styles || []).slice(), styleSource: "预设",
        score: null, parts: null, hit: false
      });
    });

    INDEX.forEach(function (item) {
      if (seen.has(item.code)) return;
      seen.add(item.code);
      var q = quoteOf(item.code);
      rows.push({
        code: item.code, name: item.name, group: "index", groupName: GROUP_NAME.index,
        industry: null, indexes: (item.indexes || []).slice(),
        belong: (item.indexes || []).join(" · ") || "--",
        quote: q, styles: deriveStyles ? deriveStyles(q) : [], styleSource: "推导",
        score: null, parts: null, hit: false
      });
    });

    FUNDS.forEach(function (item) {
      if (seen.has(item.code)) return;
      seen.add(item.code);
      rows.push({
        code: item.code, name: item.name, group: "fund", groupName: GROUP_NAME.fund,
        industry: null, indexes: [], belong: "--",
        quote: quoteOf(item.code), styles: [], styleSource: "载体",
        score: null, parts: null, hit: false
      });
    });
    return rows;
  }

  /* ---------- 筛选分：与结果页示例标的同一套 scoreStock ---------- */
  /* ---------- 股票人格：给每只标的贴四位代码 ---------- */
  var PERSONA_NAME = {};
  PERSONALITIES.forEach(function (p) { PERSONA_NAME[p.code] = p.name; });
  function annotateStockPersona() {
    if (!stockPersonalityOf || !stockThresholds || !MARKET || !MARKET.quotes) return;
    if (!state.thresholds) state.thresholds = stockThresholds(MARKET.quotes);
    state.rows.forEach(function (row) {
      var p = stockPersonalityOf(row.quote, state.thresholds);
      row.stockPersona = p;
      row.personaCode = p ? p.code : "";
      row.personaName = p ? (PERSONA_NAME[p.code] || "") : "";
    });
  }

  function computeScores() {
    state.rows.forEach(function (row) {
      row.score = null; row.parts = null; row.hit = false;
      if (!state.persona || !scoreStock || row.group === "fund") return;
      var item = { code: row.code, name: row.name };
      if (row.group === "manual") item.styles = row.styles.slice();
      var ctx = { style: state.persona.style, basis: state.persona.basis, term: state.persona.term };
      var r = scoreStock(item, row.quote, ctx);
      row.score = r.score;
      row.parts = r.parts;
      row.hit = row.styles.indexOf(state.persona.style) >= 0;
    });
    state.scoreCacheKey = state.persona ? state.persona.code : "none";
  }
  function computeIfNeeded() {
    var key = state.persona ? state.persona.code : "none";
    if (state.scoreCacheKey !== key) computeScores();
  }

  /* ---------- 公示文案：数量与权重全部取自现有文件 ---------- */
  function renderNotice() {
    var box = $("wb-notice-body");
    var asof = $("wb-asof");
    if (!MARKET) {
      if (asof) asof.textContent = "--";
      box.innerHTML = "<p>行情快照未加载，本页无法工作。请确认数据脚本与本页面在同一目录。</p>";
      return;
    }
    if (asof) asof.textContent = MARKET.asOf;
    var indexNames = META && META.indexes ? META.indexes.join("／") : "指数";
    var lines = [
      "本页标的来自三部分：产品人工候选池 " + POOL.length + " 只、" + indexNames + " 成分股 " + INDEX.length +
        " 只、债券货币黄金配置载体 " + FUNDS.length + " 只，按代码去重后合计 " + state.rows.length +
        " 只。全部按页面公开条件自动筛选与排序，无人为干预。",
      "风格标签中，人工候选池按产品预设规则归入；指数成分股按当日行情指标推导，阈值写在 allocation.js；配置载体不参与风格筛选。",
      "行情数据截止 " + MARKET.asOf + " 收盘，来源 " + MARKET.source + "，抓取时间 " + MARKET.fetchedAt +
        "。数据非实时，以交易所披露为准。" +
        (MARKET.hasPercentile ? "" : " 当前快照不含市盈率与市净率历史分位，相关列显示 --。"),
      "股票人格列的判定规则：市盈率为正且不高于全池正值中位数记 F，否则记 M；换手率不高于全池中位数记 L，否则记 S；总市值不低于全池中位数记 D，否则记 A；当日振幅不高于全池中位数记 O，否则记 J。四个阈值随快照当期数据变化，取中位数，可在导出的 CSV 里逐只复算。" +
        (state.thresholds
          ? "当前阈值：市盈率 " + fmt(state.thresholds.pe, 2) + " 倍、换手率 " + fmt(state.thresholds.turnover, 2) +
            "%、总市值 " + fmt(state.thresholds.mcapYi, 1) + " 亿、振幅 " + fmt(state.thresholds.amplitude, 2) + "%。"
          : ""),
      "股票人格是把本次测试的四维规则搬到标的上做的趣味对照，只表示这只标的在当日数据上落在这四个区间，不代表它的质地，不代表任何评价，也不构成对标的的推荐。",
      "本页仅作公开数据整理与信息展示，不构成投资建议，也不构成对任何证券的推荐或要约。本页不包含交易时机判断，不承诺收益，不代客理财。"
    ];
    if (state.persona) {
      var p = state.persona;
      var wVal = p.basis === "F" ? "45%" : "20%";
      var wLiq = p.basis === "F" ? "15%" : "40%";
      lines.splice(2, 0,
        "筛选分按 allocation.js 的公开规则计算，与结果页示例标的同源：风格归属 40%、估值位置 " + wVal +
        "、流动性 " + wLiq + "。当前 " + p.code + " 属" + (p.basis === "F" ? "基本面" : "市场面") +
        "型、" + (p.term === "S" ? "短期" : "长期") + "周期。" +
        (MARKET.hasPercentile ? "" : "当前快照无估值历史分位，估值项按市盈率绝对值映射，60 倍及以上计 0 分。") +
        "分数只用于排序，不代表投资适当性或收益预测。"
      );
    } else {
      lines.splice(2, 0, "公开浏览模式不计算筛选分。完成 28 题测试或选定一种人格后，本页按同一套公开规则计算并排序。");
    }
    box.innerHTML = lines.map(function (t) { return "<p>" + t + "</p>"; }).join("");
  }

  /* ---------- 人格条与风格分布卡 ---------- */
  function renderPersona() {
    var title = $("wb-persona-title"), bars = $("wb-persona-bars"), note = $("wb-persona-note");
    var sel = $("wb-code");
    var face = $("wb-persona-face");
    if (!sel.options.length) {
      fillSelect("wb-code", [{ value: "", label: "公开浏览" }].concat(PERSONALITIES.map(function (p) {
        return { value: p.code, label: p.code + " " + p.name };
      })));
    }
    var filterBtn = $("wb-style-filter"), clearBtn = $("wb-persona-clear");
    var sameBtn = $("wb-same-filter");
    if (!state.persona) {
      title.innerHTML = "公开浏览模式<span>尚未关联人格测试结果</span>";
      bars.innerHTML = "";
      if (face) { face.innerHTML = ""; face.hidden = true; }
      note.innerHTML = "完成 28 题测试后，本页会按你的四维偏好计算筛选分并排序。" +
        '<a href="index.html">去做测试</a>，或从下拉任选一种人格查看。';
      sel.value = "";
      filterBtn.disabled = true; clearBtn.disabled = true;
      if (sameBtn) { sameBtn.disabled = true; sameBtn.classList.remove("is-on"); }
      filterBtn.classList.remove("is-on");
      return;
    }
    var p = state.persona;
    title.innerHTML = escapeHtml(p.name) + "<span>" + p.code + " · " +
      escapeHtml(STYLE_NAME[p.style] || "--") + " · " + escapeHtml(p.source) + "</span>";
    if (face) {
      var fig = window.GBTI_LOOK ? window.GBTI_LOOK.figure(p.code) : "";
      face.innerHTML = fig || "";
      face.hidden = !fig;
    }
    if (p.scores) {
      bars.innerHTML = DIMENSIONS.map(function (d) {
        var l = Number(p.scores[d.left]) || 0;
        var r = Number(p.scores[d.right]) || 0;
        var total = l + r || 1;
        var lw = Math.round(l / total * 100);
        return '<div class="gb-axis">' +
          '<div class="gb-axis-head"><span>' + escapeHtml(d.leftName) + " <b>" + l + "</b></span>" +
          '<span class="gb-axis-r"><b>' + r + "</b> " + escapeHtml(d.rightName) + "</span></div>" +
          '<span class="gb-axis-track"><i class="gb-axis-l-fill" style="width:' + lw + '%"></i>' +
          '<i class="gb-axis-r-fill" style="width:' + (100 - lw) + '%"></i></span></div>';
      }).join("");
    } else {
      /* 只有四码时给四维字母胶囊，比一行占位文字有信息量。 */
      bars.innerHTML = '<div class="gb-codebox"><div class="gb-codechips">' + DIMENSIONS.map(function (d, i) {
        var letter = String(p.code || "").charAt(i);
        var name = letter === d.left ? d.leftName : d.rightName;
        return '<span class="gb-codechip"><b>' + escapeHtml(letter) + "</b>" + escapeHtml(name) + "</span>";
      }).join("") + "</div></div>";
    }
    var sameCount = state.rows.filter(function (r) { return r.personaCode === p.code; }).length;
    note.innerHTML = "筛选分与风格命中随人格实时重算。点按我的风格筛一遍，只看归入当前风格桶的标的；" +
      "点找出和我同人格的标的，只看四维代码与你完全相同的标的（当前 " + sameCount +
      " 只）。股票人格由当日行情按公开阈值判定，规则见页脚公示。条件可随时清除。";
    sel.value = p.code;
    filterBtn.disabled = false; clearBtn.disabled = state.cleared;
    filterBtn.classList.toggle("is-on", state.styleFilterOn);
    if (sameBtn) {
      sameBtn.disabled = false;
      sameBtn.classList.toggle("is-on", state.sameOnly);
      sameBtn.textContent = state.sameOnly ? "只看同类（已开）· " + sameCount + " 只" : "找出和我同人格的标的";
    }
  }

  function medianOf(rows, getter) {
    var a = rows.map(getter).filter(isNum).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function peOf(r) { var v = r.quote && r.quote.pe; return isNum(v) && v > 0 ? v : null; }
  function toOf(r) { var v = r.quote && r.quote.turnover; return isNum(v) ? v : null; }
  function renderInsight() {
    var box = $("wb-insight");
    if (!state.persona) { box.hidden = true; return; }
    box.hidden = false;
    var scorable = state.rows.filter(function (r) { return r.group !== "fund"; });
    var hit = scorable.filter(function (r) { return r.hit; });
    var pct = scorable.length ? (hit.length / scorable.length * 100).toFixed(1) : "--";
    var sameOf = scorable.filter(function (r) { return r.personaCode === state.persona.code; });
    var samePct = scorable.length ? (sameOf.length / scorable.length * 100).toFixed(1) : "--";
    var cells = [
      ["归入当前风格桶", hit.length + " 只", "可评分标的共 " + scorable.length + " 只"],
      ["占可评分标的", pct + "%", "按当前风格标签统计"],
      ["与你同人格", sameOf.length + " 只", "四维代码同为 " + state.persona.code + "，占 " + samePct + "%"],
      ["中位市盈率", fmt(medianOf(hit, peOf), 1) + " / " + fmt(medianOf(scorable, peOf), 1), "命中组 / 全池（倍）"],
      ["中位换手率", fmt(medianOf(hit, toOf), 2) + "% / " + fmt(medianOf(scorable, toOf), 2) + "%", "命中组 / 全池"]
    ];
    box.innerHTML = "<h2>你的风格在全池中的位置</h2>" +
      '<div class="wb-insight-grid">' + cells.map(function (c) {
        return '<div class="wb-insight-cell"><b>' + escapeHtml(c[1]) + "</b><span>" +
          escapeHtml(c[0]) + " · " + escapeHtml(c[2]) + "</span></div>";
      }).join("") + "</div>" +
      '<p class="wb-insight-note">以上按当前快照当场计算，亏损与无数据不参与中位数。可导出 CSV 逐只核验。</p>';
  }

  /* ---------- 下拉选项 ---------- */
  function fillSelect(id, options) {
    $(id).innerHTML = options.map(function (o) {
      return '<option value="' + o.value + '">' + o.label + "</option>";
    }).join("");
  }
  function setupSelects() {
    fillSelect("wb-group", [
      { value: "", label: "全部" }, { value: "manual", label: "人工候选池" },
      { value: "index", label: "指数成分" }, { value: "fund", label: "配置载体" }
    ]);
    var idxOptions = [{ value: "", label: "全部" }];
    (META && META.indexes ? META.indexes : []).forEach(function (name) {
      idxOptions.push({ value: name, label: name });
    });
    fillSelect("wb-index", idxOptions);
    var styleOptions = [{ value: "", label: "全部" }];
    Object.keys(STYLE_NAME).forEach(function (key) {
      styleOptions.push({ value: key, label: STYLE_NAME[key] });
    });
    fillSelect("wb-style", styleOptions);
    fillSelect("wb-chg", [
      { value: "", label: "全部" }, { value: "up", label: "上涨" }, { value: "down", label: "下跌" }
    ]);
  }

  /* ---------- 筛选 ---------- */
  function numberValue(id) {
    var raw = $(id).value.trim();
    if (raw === "") return null;
    var n = Number(raw);
    return isNaN(n) ? null : n;
  }
  function currentFilters() {
    return {
      search: $("wb-search").value.trim().toLowerCase(),
      group: $("wb-group").value,
      index: $("wb-index").value,
      style: $("wb-style").value,
      peMin: numberValue("wb-pe-min"), peMax: numberValue("wb-pe-max"),
      mcapMin: numberValue("wb-mcap-min"), amountMin: numberValue("wb-amount-min"),
      turnoverMin: numberValue("wb-turnover-min"), turnoverMax: numberValue("wb-turnover-max"),
      chg: $("wb-chg").value,
      favOnly: $("wb-fav-only").checked,
      sameOnly: state.sameOnly
    };
  }
  function pass(row, f) {
    if (f.search && (row.code + " " + row.name).toLowerCase().indexOf(f.search) === -1) return false;
    if (f.sameOnly && (!state.persona || row.personaCode !== state.persona.code)) return false;
    if (f.group && row.group !== f.group) return false;
    if (f.index && row.indexes.indexOf(f.index) === -1) return false;
    if (f.style && row.styles.indexOf(f.style) === -1) return false;
    if (f.favOnly && !state.favs.has(row.code)) return false;
    var q = row.quote || {};
    if (f.peMin !== null || f.peMax !== null) {
      if (!isNum(q.pe) || q.pe <= 0) return false;
      if (f.peMin !== null && q.pe < f.peMin) return false;
      if (f.peMax !== null && q.pe > f.peMax) return false;
    }
    if (f.mcapMin !== null && (!isNum(q.mcapYi) || q.mcapYi < f.mcapMin)) return false;
    if (f.amountMin !== null && (!isNum(q.amountYi) || q.amountYi < f.amountMin)) return false;
    if (f.turnoverMin !== null || f.turnoverMax !== null) {
      if (!isNum(q.turnover)) return false;
      if (f.turnoverMin !== null && q.turnover < f.turnoverMin) return false;
      if (f.turnoverMax !== null && q.turnover > f.turnoverMax) return false;
    }
    if (f.chg === "up" && !(isNum(q.chgPct) && q.chgPct > 0)) return false;
    if (f.chg === "down" && !(isNum(q.chgPct) && q.chgPct < 0)) return false;
    return true;
  }

  /* ---------- 排序：缺失值一律排最后 ---------- */
  function sortValue(row, key) {
    if (key === "score") return row.score;
    if (key === "styles") return row.styles.length;
    if (key === "code" || key === "name" || key === "groupName" || key === "belong") return row[key];
    if (key === "personaCode") return row.personaCode || null;
    return row.quote ? row.quote[key] : null;
  }
  function sortRows(rows) {
    var key = state.sortKey, dir = state.sortDir;
    return rows.slice().sort(function (a, b) {
      var av = sortValue(a, key), bv = sortValue(b, key);
      var aMissing = av === null || av === undefined || (typeof av === "number" && isNaN(av));
      var bMissing = bv === null || bv === undefined || (typeof bv === "number" && isNaN(bv));
      if (aMissing && bMissing) return a.code < b.code ? -1 : 1;
      if (aMissing) return 1;
      if (bMissing) return -1;
      var cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "zh-CN");
      if (cmp === 0) return a.code < b.code ? -1 : 1;
      return cmp * dir;
    });
  }

  /* ---------- 单元格 ---------- */
  function numberCell(v, digits) {
    return isNum(v) ? '<span class="wb-num">' + v.toFixed(digits) + "</span>" : '<span class="wb-muted">--</span>';
  }
  function peCell(v) {
    if (!isNum(v)) return '<span class="wb-muted">--</span>';
    if (v <= 0) return '<span class="wb-muted">亏损</span>';
    return '<span class="wb-num">' + v.toFixed(2) + "</span>";
  }
  function chgCell(v) {
    if (!isNum(v)) return '<span class="wb-muted">--</span>';
    var cls = v > 0 ? "wb-up" : (v < 0 ? "wb-down" : "");
    var sign = v > 0 ? "+" : "";
    return '<span class="wb-num ' + cls + '">' + sign + v.toFixed(2) + "</span>";
  }
  function stylesCell(row) {
    if (!row.styles.length) return '<span class="wb-muted">--</span>';
    return row.styles.map(function (s) {
      var cls = row.styleSource === "推导" ? "wb-tag wb-tag-derived" : "wb-tag";
      return '<span class="' + cls + '">' + (STYLE_NAME[s] || s) + "</span>";
    }).join("");
  }
  function personaCell(row) {
    if (!row.personaCode) return '<span class="wb-muted">--</span>';
    var same = state.persona && row.personaCode === state.persona.code;
    var tip = (row.personaName || "") + " · 代码 " + row.personaCode + " · 点击查看人格卡";
    var head = window.GBTI_LOOK ? window.GBTI_LOOK.avatar(row.personaCode, 16) : "";
    return '<span class="wb-ptag' + (same ? " is-same" : "") + '" data-card="' + escapeHtml(row.code) +
      '" title="' + escapeHtml(tip) + '">' + head +
      escapeHtml(row.personaCode) + "<i>" + escapeHtml(row.personaName || "") + "</i></span>";
  }
  function cellHtml(row, col) {
    var q = row.quote || {};
    switch (col.kind) {
      case "pick":
        return '<input class="wb-compare-box" type="checkbox" data-compare="' + row.code + '"' +
          (state.compare.indexOf(row.code) >= 0 ? " checked" : "") + ' aria-label="加入对比">';
      case "fav":
        return '<button class="wb-fav' + (state.favs.has(row.code) ? " is-on" : "") + '" type="button" data-fav="' + row.code +
          '" aria-label="收藏">' + (state.favs.has(row.code) ? "★" : "☆") + "</button>";
      case "text": return escapeHtml(row[col.key]);
      case "score":
        if (!isNum(row.score)) return '<span class="wb-muted">--</span>';
        return '<span class="wb-score">' + row.score.toFixed(1) + "</span>" +
          (row.hit ? '<span class="wb-hit-mark">命中</span>' : "");
      case "num": return numberCell(q[col.key], col.digits);
      case "pe": return peCell(q.pe);
      case "chg": return chgCell(q.chgPct);
      case "styles": return stylesCell(row);
      case "persona": return personaCell(row);
      default: return "";
    }
  }

  /* ---------- 渲染 ---------- */
  function renderHead() {
    $("wb-head-row").innerHTML = COLUMNS.map(function (col) {
      if (!col.sort) return "<th>" + col.label + "</th>";
      var mark = state.sortKey === col.sort ? (state.sortDir === 1 ? " ▲" : " ▼") : "";
      return '<th data-sort="' + col.sort + '">' + col.label + mark + "</th>";
    }).join("");
  }
  function pageCount(total) {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }
  /* 只重画当前页；排序、筛选、清空条件时先把页码归位到第 1 页，收藏与对比不动页码。 */
  function render() {
    computeIfNeeded();
    var f = currentFilters();
    state.view = sortRows(state.rows.filter(function (row) { return pass(row, f); }));
    renderHead();
    var total = state.view.length;
    var pages = pageCount(total);
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * PAGE_SIZE;
    var slice = state.view.slice(start, start + PAGE_SIZE);
    $("wb-body").innerHTML = slice.map(function (row) {
      var cls = state.persona && row.hit ? ' class="wb-hit"' : "";
      return "<tr" + cls + ">" + COLUMNS.map(function (col) { return "<td>" + cellHtml(row, col) + "</td>"; }).join("") + "</tr>";
    }).join("");
    $("wb-empty").hidden = total > 0;
    $("wb-count").textContent = "筛选结果 " + total + " 只 / 全池 " + state.rows.length + " 只";
    $("wb-style-filter").classList.toggle("is-on", state.styleFilterOn);
    renderPager(total, pages);
    renderCompare();
  }
  function renderPager(total, pages) {
    var pager = $("wb-pager");
    if (!pager) return;
    pager.hidden = total === 0;
    var from = total ? (state.page - 1) * PAGE_SIZE + 1 : 0;
    var to = Math.min(total, state.page * PAGE_SIZE);
    $("wb-page-info").textContent = total
      ? "第 " + from + "–" + to + " 只，共 " + total + " 只 · 第 " + state.page + " / " + pages + " 页"
      : "没有符合条件的标的";
    $("wb-page-prev").disabled = state.page <= 1;
    $("wb-page-next").disabled = state.page >= pages;
    var jump = $("wb-page-input");
    if (jump) {
      jump.setAttribute("max", String(pages));
      /* 只在用户没在输入时才写回，避免边输入边被覆盖。 */
      if (document.activeElement !== jump) jump.value = String(state.page);
    }
  }
  function goPage(n) {
    var pages = pageCount(state.view.length);
    var next = Math.min(pages, Math.max(1, n));
    if (next === state.page) { renderPager(state.view.length, pages); return; }
    state.page = next;
    render();
    var table = $("wb-table");
    if (table && table.scrollIntoView) table.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function renderCompare() {
    var box = $("wb-compare");
    if (!state.compare.length) { box.hidden = true; return; }
    box.hidden = false;
    var picked = state.compare.map(function (code) {
      return state.rows.filter(function (r) { return r.code === code; })[0];
    }).filter(Boolean);
    var fields = [
      ["名称", function (r) { return r.name; }],
      ["标的来源", function (r) { return r.groupName; }],
      ["筛选分", function (r) { return isNum(r.score) ? r.score.toFixed(1) : "--"; }],
      ["行业 / 指数", function (r) { return r.belong; }],
      ["收盘价", function (r) { return fmt(r.quote && r.quote.close, 2); }],
      ["涨跌幅 %", function (r) { return fmt(r.quote && r.quote.chgPct, 2); }],
      ["成交额 亿", function (r) { return fmt(r.quote && r.quote.amountYi, 2); }],
      ["换手率 %", function (r) { return fmt(r.quote && r.quote.turnover, 2); }],
      ["市盈率", function (r) { var p = r.quote && r.quote.pe; return isNum(p) ? (p <= 0 ? "亏损" : p.toFixed(2)) : "--"; }],
      ["市净率", function (r) { return fmt(r.quote && r.quote.pb, 2); }],
      ["总市值 亿", function (r) { return fmt(r.quote && r.quote.mcapYi, 1); }],
      ["风格标签", function (r) { return r.styles.map(function (s) { return STYLE_NAME[s] || s; }).join("、") || "--"; }]
    ];
    var html = '<table class="wb-compare-table"><thead><tr><th>项目</th>' +
      picked.map(function (r) { return "<th>" + escapeHtml(r.name) + "</th>"; }).join("") + "</tr></thead><tbody>";
    fields.forEach(function (field) {
      html += "<tr><th>" + field[0] + "</th>" +
        picked.map(function (r) { return "<td>" + escapeHtml(field[1](r)) + "</td>"; }).join("") + "</tr>";
    });
    $("wb-compare-body").innerHTML = html + "</tbody></table>";
  }
  function refreshAll() {
    computeIfNeeded();
    renderNotice();
    renderPersona();
    renderInsight();
    render();
  }

  /* ---------- 导出：字段带来源、人格与分数拆解，便于人工核验 ---------- */
  function csvCell(v) {
    var s = String(v === null || v === undefined ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function filterSnapshot(f) {
    var parts = [];
    if (f.search) parts.push("关键词=" + f.search);
    if (f.group) parts.push("来源=" + GROUP_NAME[f.group]);
    if (f.index) parts.push("指数=" + f.index);
    if (f.style) parts.push("风格=" + (STYLE_NAME[f.style] || f.style));
    if (f.peMin !== null) parts.push("PE下限=" + f.peMin);
    if (f.peMax !== null) parts.push("PE上限=" + f.peMax);
    if (f.mcapMin !== null) parts.push("市值下限=" + f.mcapMin);
    if (f.amountMin !== null) parts.push("成交额下限=" + f.amountMin);
    if (f.turnoverMin !== null) parts.push("换手下限=" + f.turnoverMin);
    if (f.turnoverMax !== null) parts.push("换手上限=" + f.turnoverMax);
    if (f.chg) parts.push("涨跌=" + f.chg);
    if (f.favOnly) parts.push("只看收藏");
    if (f.sameOnly) parts.push("只看与我同人格（" + (state.persona ? state.persona.code : "--") + "）");
    return parts.length ? parts.join("; ") : "无条件";
  }
  function exportCsv() {
    if (!state.view.length) return;
    var f = currentFilters();
    var header = ["代码", "名称", "标的来源", "行业", "指数成分", "收盘价", "涨跌幅(%)", "成交额(亿元)",
      "换手率(%)", "市盈率", "市盈率历史分位(%)", "市净率", "总市值(亿元)", "股票人格", "股票人格名称", "风格标签", "风格来源",
      "人格代码", "筛选分", "风格分项", "估值分项", "流动性分项", "风格命中", "当前筛选条件",
      "行情日期", "行情截止日", "数据来源"];
    var lines = [header.join(",")];
    state.view.forEach(function (r) {
      var q = r.quote || {};
      lines.push([
        r.code, r.name, r.groupName, r.industry || "", r.indexes.join(" "),
        isNum(q.close) ? q.close.toFixed(2) : "",
        isNum(q.chgPct) ? q.chgPct.toFixed(2) : "",
        isNum(q.amountYi) ? q.amountYi.toFixed(2) : "",
        isNum(q.turnover) ? q.turnover.toFixed(2) : "",
        isNum(q.pe) ? q.pe.toFixed(2) : "",
        isNum(q.pePct) ? q.pePct.toFixed(2) : "",
        isNum(q.pb) ? q.pb.toFixed(2) : "",
        isNum(q.mcapYi) ? q.mcapYi.toFixed(2) : "",
        r.personaCode || "",
        r.personaName || "",
        r.styles.map(function (s) { return STYLE_NAME[s] || s; }).join(" "),
        r.styleSource,
        state.persona ? state.persona.code : "",
        isNum(r.score) ? r.score.toFixed(1) : "",
        r.parts ? r.parts.style.toFixed(1) : "",
        r.parts ? r.parts.valuation.toFixed(1) : "",
        r.parts ? r.parts.liquidity.toFixed(1) : "",
        r.hit ? "是" : "否",
        filterSnapshot(f),
        q.date || "", MARKET ? MARKET.asOf : "", MARKET ? MARKET.source : ""
      ].map(csvCell).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "GBTI筛选结果_" + (state.persona ? state.persona.code + "_" : "") + (MARKET ? MARKET.asOf : "快照") + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  /* ---------- 事件 ---------- */
  /* ---------- 配对玩法：相亲卡 / 组合体检 / 反向榜 ---------- */
  function matchStockOf(row) {
    return {
      code: row.code, name: row.name,
      industry: row.industry || "", belong: row.belong || "",
      personaCode: row.personaCode, personaName: row.personaName,
      asOf: MARKET ? MARKET.asOf : ""
    };
  }
  function meForMatch() {
    return state.persona ? { code: state.persona.code, name: state.persona.name } : null;
  }
  function matchReady() {
    return Boolean(window.GBTI_MATCH);
  }
  function openMatchCard(code) {
    if (!matchReady()) return;
    var row = state.rows.filter(function (r) { return r.code === code; })[0];
    if (!row || !row.personaCode) return;
    window.GBTI_MATCH.openCard(matchStockOf(row), meForMatch());
  }
  function bindMatch() {
    var combo = $("wb-match-combo");
    if (combo) combo.addEventListener("click", function () {
      if (!state.persona) { window.alert("先完成 28 题测试，或在下拉里选一个人格，再玩配对。"); return; }
      var favs = state.rows.filter(function (r) { return state.favs.has(r.code) && r.personaCode && r.group !== "fund"; });
      if (favs.length < 3) {
        window.alert("先在表格里星标至少 3 只标的，组合体检才有意义。当前收藏 " + favs.length + " 只。");
        return;
      }
      window.GBTI_MATCH.openCombo(favs.slice(0, 8).map(matchStockOf), meForMatch());
    });
    var reverse = $("wb-match-reverse");
    if (reverse) reverse.addEventListener("click", function () {
      if (!state.persona) { window.alert("先完成 28 题测试，或在下拉里选一个人格，再玩配对。"); return; }
      var pool = state.rows.filter(function (r) { return r.personaCode && r.group !== "fund"; });
      window.GBTI_MATCH.openReverse(pool.map(matchStockOf), meForMatch());
    });
    var random = $("wb-match-random");
    if (random) random.addEventListener("click", function () {
      var pool = state.rows.filter(function (r) { return r.personaCode && r.group !== "fund"; });
      if (!pool.length) return;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      openMatchCard(pick.code);
    });
  }

  function bind() {
    var ids = ["wb-search", "wb-group", "wb-index", "wb-style", "wb-pe-min", "wb-pe-max",
      "wb-mcap-min", "wb-amount-min", "wb-turnover-min", "wb-turnover-max", "wb-chg", "wb-fav-only"];
    ids.forEach(function (id) {
      var el = $(id);
      el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", function () {
        /* 条件一变，结果集就换了，页码回到第一页。 */
        state.page = 1;
        render();
      });
    });

    $("wb-page-prev").addEventListener("click", function () { goPage(state.page - 1); });
    $("wb-page-next").addEventListener("click", function () { goPage(state.page + 1); });
    $("wb-page-input").addEventListener("change", function () {
      var n = parseInt(this.value, 10);
      if (isNaN(n)) { renderPager(state.view.length, pageCount(state.view.length)); return; }
      goPage(n);
    });

    $("wb-code").addEventListener("change", function () {
      var code = this.value;
      state.cleared = false;
      state.styleFilterOn = false;
      state.sameOnly = false;
      $("wb-style").value = "";
      if (!code) {
        state.cleared = true;
        state.persona = null;
      } else {
        var same = code === state.answerCode;
        state.persona = personaFromCode(code, same ? state.answerScores : null,
          same ? "本机答题记录" : "手动切换（未提供逐题作答）");
      }
      state.page = 1;
      refreshAll();
    });

    $("wb-style-filter").addEventListener("click", function () {
      if (!state.persona) return;
      state.styleFilterOn = !state.styleFilterOn;
      if (state.styleFilterOn) state.sameOnly = false;
      $("wb-style").value = state.styleFilterOn ? state.persona.style : "";
      state.sortKey = "score";
      state.sortDir = -1;
      state.page = 1;
      refreshAll();
    });

    // 股票人格视图：只看与自己四维代码相同的标的，与风格筛选互斥。
    $("wb-same-filter").addEventListener("click", function () {
      if (!state.persona) return;
      state.sameOnly = !state.sameOnly;
      if (state.sameOnly) {
        state.styleFilterOn = false;
        $("wb-style").value = "";
      }
      state.sortKey = "score";
      state.sortDir = -1;
      state.page = 1;
      refreshAll();
    });

    $("wb-persona-clear").addEventListener("click", function () {
      state.cleared = true;
      state.persona = null;
      state.styleFilterOn = false;
      state.sameOnly = false;
      $("wb-style").value = "";
      state.page = 1;
      refreshAll();
    });

    $("wb-head-row").addEventListener("click", function (e) {
      var th = e.target.closest("th[data-sort]");
      if (!th) return;
      var key = th.getAttribute("data-sort");
      if (state.sortKey === key) state.sortDir = -state.sortDir;
      else { state.sortKey = key; state.sortDir = 1; }
      /* 换排序方式后，第一页的内容已经不同，回到第一页看新的头部。 */
      state.page = 1;
      render();
    });

    $("wb-body").addEventListener("click", function (e) {
      var tag = e.target.closest(".wb-ptag[data-card]");
      if (tag) { openMatchCard(tag.getAttribute("data-card")); return; }
      var btn = e.target.closest("button[data-fav]");
      if (!btn) return;
      var code = btn.getAttribute("data-fav");
      if (state.favs.has(code)) state.favs.delete(code); else state.favs.add(code);
      saveFavs();
      render();
    });

    $("wb-body").addEventListener("change", function (e) {
      var box = e.target.closest("input[data-compare]");
      if (!box) return;
      var code = box.getAttribute("data-compare");
      var at = state.compare.indexOf(code);
      if (box.checked && at === -1) {
        if (state.compare.length >= 3) {
          box.checked = false;
          window.alert("最多同时对比 3 只，请先取消一只。");
          return;
        }
        state.compare.push(code);
      } else if (!box.checked && at >= 0) {
        state.compare.splice(at, 1);
      }
      renderCompare();
    });

    $("wb-export").addEventListener("click", exportCsv);
    $("wb-reset").addEventListener("click", function () {
      ids.forEach(function (id) {
        var el = $(id);
        if (el.type === "checkbox") el.checked = false;
        else if (el.tagName === "SELECT") { el.selectedIndex = 0; el.value = ""; }
        else el.value = "";
      });
      state.styleFilterOn = false;
      state.page = 1;
      render();
    });
  }

  /* ---------- 启动 ---------- */
  state.rows = buildRows();
  annotateStockPersona();
  resolvePersona();
  setupSelects();
  bind();
  bindMatch();
  refreshAll();
})();
