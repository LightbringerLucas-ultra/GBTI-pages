/* GBTI 历史起伏 · 公开指数的波动与回撤
 * 只读取 index-history.js 的真实日线收盘价，不构造组合，不计算累计收益率，不做排名。
 * 十字光标读数仅显示公开指数当日点位、当日变动与距区间高点的回撤。
 * 人格只用于把公开风格指数曲线挂到风格桶上，代理关系由产品规则设定，未经实证检验。
 */
(function () {
  "use strict";

  var HISTORY = typeof GBTI_INDEX_HISTORY !== "undefined" ? GBTI_INDEX_HISTORY : null;
  var PERSONALITIES = typeof personalities !== "undefined" ? personalities : [];
  var DIMENSIONS = typeof dimensions !== "undefined" ? dimensions : [];
  var calcResult = typeof calculateResult === "function" ? calculateResult : null;
  var ALLOC = window.GBTI_ALLOC || null;
  var styleFor = ALLOC ? ALLOC.styleFor : null;
  var STYLE_NAME = ALLOC && ALLOC.STYLE_NAME ? ALLOC.STYLE_NAME : {
    value: "价值稳健", quality: "质量成长", steady: "大盘稳健", trend: "趋势动量"
  };

  var PROGRESS_KEY = "gbti-progress-v6-20261013";
  var STYLE_SERIES = { value: "sh000922", quality: "sz399006", steady: "sh000016", trend: "sh000852" };
  var STYLE_ORDER = ["value", "quality", "steady", "trend"];
  var BENCHMARKS = ["sh000300", "sh000001"];
  /* 曲线与网格颜色由 history.css 的 --hs-* 令牌提供，随皮肤切换 */
  var CURVE_VARS = {
    sh000922: "--hs-c1", sz399006: "--hs-c2", sh000016: "--hs-c3",
    sh000852: "--hs-c4", sh000300: "--hs-c5", sh000001: "--hs-c6"
  };
  var CURVE_FALLBACK = {
    sh000922: "#c44236", sz399006: "#cf9b3f", sh000016: "#416e83",
    sh000852: "#6b8f71", sh000300: "#52715b", sh000001: "#8b7a63"
  };
  var CHART_FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

  function cssVar(name, fallback) {
    var v = "";
    try {
      if (typeof getComputedStyle === "function" && document.documentElement) {
        v = (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim();
      }
    } catch (e) { /* 无样式计算环境时用亮色回退 */ }
    return v || fallback;
  }
  function colorFor(code) {
    return cssVar(CURVE_VARS[code] || "--hs-c6", CURVE_FALLBACK[code] || "#746b60");
  }
  function palette() {
    return {
      grid: cssVar("--hs-grid", "#eee7db"),
      gridSoft: cssVar("--hs-grid-soft", "#f5efe5"),
      axis: cssVar("--hs-axis", "#d9cfbf"),
      ink: cssVar("--hs-ink", "#7d7264"),
      inkStrong: cssVar("--hs-ink-strong", "#5a5044"),
      crosshair: cssVar("--hs-crosshair", "#8a7a64"),
      labelBg: cssVar("--hs-label-bg", "#332e28"),
      labelFg: cssVar("--hs-label-fg", "#ffffff")
    };
  }

  var state = {
    persona: null,
    answerCode: null,
    answerScores: null,
    years: 3,
    allStyles: false
  };
  /* 图表布局缓存与十字光标状态 */
  var chart = null;
  var hover = { index: -1, locked: false };

  function $(id) { return document.getElementById(id); }
  function isNum(v) { return typeof v === "number" && !isNaN(v); }
  function fmt(v, d) { return isNum(v) ? v.toFixed(d) : "--"; }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? "--" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function rgba(hex, a) {
    var h = String(hex).replace("#", "");
    if (h.length !== 6) return "rgba(120,105,88," + a + ")";
    return "rgba(" + parseInt(h.slice(0, 2), 16) + "," + parseInt(h.slice(2, 4), 16) + "," +
      parseInt(h.slice(4, 6), 16) + "," + a + ")";
  }

  /* ---------- 人格来源：网址四码优先，其次本机答题记录 ---------- */
  function personaFromCode(code, scores, source) {
    var p = PERSONALITIES.filter(function (x) { return x.code === code; })[0];
    if (!p || !styleFor) return null;
    return {
      code: code, name: p.name, scores: scores || null,
      style: styleFor(code), term: code.charAt(1) === "S" ? "S" : "L",
      decide: code.charAt(3) === "O" ? "O" : "J", source: source
    };
  }
  function resolvePersona() {
    var urlCode = "";
    try { urlCode = (new URLSearchParams(window.location.search).get("code") || "").toUpperCase(); } catch (e) { urlCode = ""; }
    var valid = /^[FM][LS][DA][OJ]$/.test(urlCode) &&
      PERSONALITIES.some(function (p) { return p.code === urlCode; });
    var fromAnswers = null;
    try {
      var raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
      if (raw && Array.isArray(raw.answers) && calcResult) {
        var out = calcResult(raw.answers);
        fromAnswers = { code: out.axisCode, scores: out.scores };
      }
    } catch (e) { /* 未答完 28 题或记录异常，走公开模式 */ }
    state.answerCode = fromAnswers ? fromAnswers.code : null;
    state.answerScores = fromAnswers ? fromAnswers.scores : null;

    if (valid) {
      var same = fromAnswers && fromAnswers.code === urlCode;
      state.persona = personaFromCode(urlCode, same ? fromAnswers.scores : null,
        same ? "本机答题记录与网址四码一致" : "网址四码（未提供逐题作答）");
    } else if (fromAnswers) {
      state.persona = personaFromCode(fromAnswers.code, fromAnswers.scores, "本机答题记录");
    } else {
      state.persona = null;
    }
    state.years = state.persona ? (state.persona.term === "L" ? 5 : 1) : 3;
    state.allStyles = !state.persona;
  }

  /* ---------- 数据口径与公示 ---------- */
  function renderNotice() {
    var box = $("hs-notice-body");
    var asof = $("hs-asof");
    if (asof) asof.textContent = HISTORY && HISTORY.asOf ? HISTORY.asOf : "--";
    if (!HISTORY || !HISTORY.series) {
      box.innerHTML = "<p>指数历史快照未加载，本页无法工作。请确认 index-history.js 与本页面在同一目录。</p>";
      return;
    }
    var keys = Object.keys(HISTORY.series);
    var counts = keys.map(function (k) { return HISTORY.series[k].count; });
    var firsts = keys.map(function (k) { return HISTORY.series[k].first; }).sort();
    var lasts = keys.map(function (k) { return HISTORY.series[k].last; }).sort();
    var lines = [
      "本页展示公开指数自身的历史波动与回撤，不是任何人格、任何组合或任何人的实际收益，也不构成对任何证券的推荐或要约。",
      "四条风格曲线与四类风格桶的对应关系由产品设计规则设定，未经实证检验；同一风格桶内的 4 种人格共用同一条公开指数曲线。价值稳健对应中证红利，质量成长对应创业板指，大盘稳健对应上证50，趋势动量对应中证1000。",
      "本页不展示累计收益率，不做收益排名，不比较跑赢或跑输，不提供买卖时机判断，不承诺收益。",
      "十字光标显示的是当日公开指数收盘点位、当日变动与距区间高点的回撤，均为公开行情读数，不是收益或业绩评价。",
      "数据来源：" + HISTORY.source + "。口径：" + HISTORY.method + "。行情截至 " + HISTORY.asOf +
        "，抓取时间 " + HISTORY.fetchedAt + "，共 " + HISTORY.count + " 条曲线，各 " + counts[0] +
        " 个交易日，覆盖 " + firsts[0] + " 至 " + lasts[lasts.length - 1] + "。"
    ];
    box.innerHTML = lines.map(function (t) { return "<p>" + t + "</p>"; }).join("");
  }

  /* ---------- 人格条 ---------- */
  function renderPersona() {
    var sel = $("hs-code");
    if (!sel.options.length) {
      sel.innerHTML = '<option value="">公开浏览（显示全部风格）</option>' +
        PERSONALITIES.map(function (p) {
          return '<option value="' + p.code + '">' + p.code + " " + p.name + "</option>";
        }).join("");
    }
    var title = $("hs-persona-title"), bars = $("hs-persona-bars"), note = $("hs-persona-note");
    if (!state.persona) {
      title.innerHTML = "公开浏览模式<span>尚未关联人格测试结果</span>";
      bars.innerHTML = "";
      var face0 = $("hs-persona-face");
      if (face0) { face0.innerHTML = ""; face0.hidden = true; }
      note.textContent = "完成 28 题测试后，本页会按你的风格桶与持有周期展示对应曲线；也可直接下拉选一种人格。";
      sel.value = "";
      return;
    }
    var p = state.persona;
    title.innerHTML = escapeHtml(p.name) + "<span>" + p.code + " · " +
      escapeHtml(STYLE_NAME[p.style] || "--") + " · " + escapeHtml(p.source) + "</span>";
    var face = $("hs-persona-face");
    if (face) {
      var fig = window.GBTI_LOOK ? window.GBTI_LOOK.figure(p.code) : "";
      face.innerHTML = fig || "";
      face.hidden = !fig;
    }
    bars.innerHTML = p.scores
      ? DIMENSIONS.map(function (d) {
          var l = Number(p.scores[d.left]) || 0;
          var r = Number(p.scores[d.right]) || 0;
          var total = l + r || 1;
          var lw = Math.round(l / total * 100);
          return '<div class="gb-axis">' +
            '<div class="gb-axis-head"><span>' + escapeHtml(d.leftName) + " <b>" + l + "</b></span>" +
            '<span class="gb-axis-r"><b>' + r + "</b> " + escapeHtml(d.rightName) + "</span></div>" +
            '<span class="gb-axis-track"><i class="gb-axis-l-fill" style="width:' + lw + '%"></i>' +
            '<i class="gb-axis-r-fill" style="width:' + (100 - lw) + '%"></i></span></div>';
        }).join("")
      : '<div class="gb-codebox"><div class="gb-codechips">' + DIMENSIONS.map(function (d, i) {
          var letter = String(p.code || "").charAt(i);
          var name = letter === d.left ? d.leftName : d.rightName;
          return '<span class="gb-codechip"><b>' + escapeHtml(letter) + "</b>" + escapeHtml(name) + "</span>";
        }).join("") + '</div>' +
        '<p class="gb-codehint">四码来自网址，没有逐题作答，故不显示四维得分。</p></div>';
    note.textContent = p.decide === "O"
      ? "你更依赖预设标准，下方数值表列出全部指标，便于逐项核对。"
      : "你更依赖情境综合判断，可先看曲线整体形状，再回看数值。";
    sel.value = p.code;
  }

  /* ---------- 区间与指标：只用收盘价，不产生收益率结论 ---------- */
  function slicePoints(points, years) {
    var last = points[points.length - 1][0];
    var d = new Date(last + "T00:00:00Z");
    d.setUTCFullYear(d.getUTCFullYear() - years);
    var start = d.toISOString().slice(0, 10);
    var i = 0;
    while (i < points.length && points[i][0] < start) i++;
    return points.slice(Math.max(0, i - 1));
  }
  function compute(points) {
    var closes = points.map(function (p) { return p[1]; });
    var dates = points.map(function (p) { return p[0]; });
    var peak = closes[0], hi = closes[0], lo = closes[0];
    var dd = [], rets = [], chg = [0], down = 0, maxDD = 0;
    for (var i = 0; i < closes.length; i++) {
      var c = closes[i];
      if (c > peak) peak = c;
      var cur = (c / peak - 1) * 100;
      dd.push(cur);
      if (cur < maxDD) maxDD = cur;
      if (c > hi) hi = c;
      if (c < lo) lo = c;
      if (i > 0) {
        var r = c / closes[i - 1] - 1;
        rets.push(r);
        chg.push(r * 100);
        if (r < 0) down++;
      }
    }
    var mean = rets.reduce(function (a, b) { return a + b; }, 0) / (rets.length || 1);
    var variance = rets.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) /
      Math.max(1, rets.length - 1);
    return {
      dates: dates, closes: closes, chg: chg, dd: dd, maxDD: maxDD,
      vol: Math.sqrt(variance) * Math.sqrt(252) * 100,
      amp: (hi - lo) / lo * 100,
      downPct: down / (rets.length || 1) * 100
    };
  }
  function activeCodes() {
    var codes = [];
    if (state.allStyles) {
      STYLE_ORDER.forEach(function (s) { codes.push(STYLE_SERIES[s]); });
    } else if (state.persona) {
      codes.push(STYLE_SERIES[state.persona.style]);
    }
    BENCHMARKS.forEach(function (c) { codes.push(c); });
    return codes;
  }
  function buildCurves() {
    if (!HISTORY || !HISTORY.series) return { list: [], window: null };
    var codes = activeCodes(), list = [], win = null;
    codes.forEach(function (code) {
      var s = HISTORY.series[code];
      if (!s || !s.points || !s.points.length) return;
      var pts = slicePoints(s.points, state.years);
      var m = compute(pts);
      list.push({ code: code, name: s.name, metrics: m, color: colorFor(code) });
      win = { start: m.dates[0], end: m.dates[m.dates.length - 1], days: m.dates.length };
    });
    return { list: list, window: win };
  }

  /* 当前人格对应的公开风格指数；勾选全部风格时依然标出自己那条 */
  function currentCode() {
    return state.persona ? STYLE_SERIES[state.persona.style] : null;
  }
  function suffixFor(code, cur) {
    if (code === cur && state.persona) return "（" + state.persona.name + "）";
    if (BENCHMARKS.indexOf(code) >= 0) return "（基准）";
    return "";
  }

  /* ---------- 高清画布 ---------- */
  function setupCanvas(canvas) {
    var cssW = 1080;
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (rect && rect.width > 0) cssW = rect.width;
    else if (canvas.clientWidth) cssW = canvas.clientWidth;
    else if (canvas.width) cssW = canvas.width;
    var cssH = cssW < 620 ? 300 : 400;
    var dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (canvas.style) canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext("2d");
    if (ctx && ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, W: cssW, H: cssH };
  }

  function drawChart(curves) {
    var canvas = $("hs-canvas");
    if (!canvas || !canvas.getContext) return;
    var sized = setupCanvas(canvas);
    var W = sized.W, H = sized.H;
    var pad = { l: 58, r: 20, t: 16, b: 40 };
    var plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;

    var minDD = 0;
    curves.forEach(function (c) {
      c.metrics.dd.forEach(function (v) { if (v < minDD) minDD = v; });
    });
    minDD = Math.floor(minDD / 5) * 5 - 5;
    if (minDD > -5) minDD = -5;
    var maxDD = 0;
    var yOf = function (v) { return pad.t + (maxDD - v) / (maxDD - minDD) * plotH; };
    var dates = curves.length ? curves[0].metrics.dates : [];
    var n = dates.length;
    var xOf = function (i) { return pad.l + (i / Math.max(1, n - 1)) * plotW; };

    chart = {
      ctx: sized.ctx, W: W, H: H, pad: pad, plotW: plotW, plotH: plotH,
      yOf: yOf, xOf: xOf, dates: dates, curves: curves, minDD: minDD, maxDD: maxDD,
      cur: currentCode()
    };
    if (hover.index >= 0 && n) {
      hover.index = Math.min(hover.index, n - 1);
      paint();
      updateTip();
    } else {
      hover.index = -1;
      paint();
      hideTip();
    }
  }

  /* ---------- 绘制：网格、曲线、十字光标 ---------- */
  function paint() {
    if (!chart || !chart.ctx) return;
    var ctx = chart.ctx, W = chart.W, H = chart.H, pad = chart.pad;
    var plotW = chart.plotW, plotH = chart.plotH, yOf = chart.yOf, xOf = chart.xOf;
    var dates = chart.dates, curves = chart.curves, n = dates.length;
    var pal = palette();
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    /* 纵向刻度按交易日等分，标年月 */
    var ticks = 5;
    for (var k = 0; k <= ticks; k++) {
      var i = Math.round(k * (Math.max(1, n - 1)) / ticks);
      var x = xOf(i);
      ctx.strokeStyle = k === 0 || k === ticks ? pal.axis : pal.gridSoft;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
      if (dates[i]) {
        ctx.fillStyle = pal.ink;
        ctx.font = '11px ' + CHART_FONT;
        ctx.textAlign = k === 0 ? "left" : (k === ticks ? "right" : "center");
        ctx.fillText(dates[i].slice(0, 7), x, H - 14);
      }
    }

    /* 横向网格与回撤刻度 */
    var steps = 5;
    for (var s = 0; s <= steps; s++) {
      var v = chart.minDD + (chart.maxDD - chart.minDD) * s / steps;
      var y = yOf(v);
      ctx.strokeStyle = v === 0 ? pal.axis : pal.grid;
      ctx.lineWidth = v === 0 ? 1.2 : 1;
      if (v !== 0 && ctx.setLineDash) ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.fillStyle = v === 0 ? pal.inkStrong : pal.ink;
      ctx.font = (v === 0 ? '600 11px ' : '11px ') + CHART_FONT;
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(0) + "%", pad.l - 9, y + 4);
    }

    /* 当前人格曲线下方淡色填充，先画在最底层 */
    curves.forEach(function (c) {
      if (!chart.cur || c.code !== chart.cur || !c.metrics.dd.length) return;
      var fill = rgba(c.color, 0.09);
      if (ctx.createLinearGradient) {
        var g = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
        if (g && typeof g.addColorStop === "function") {
          g.addColorStop(0, rgba(c.color, 0.05));
          g.addColorStop(1, rgba(c.color, 0.22));
          fill = g;
        }
      }
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(0));
      c.metrics.dd.forEach(function (vv, ii) { ctx.lineTo(xOf(ii), yOf(vv)); });
      ctx.lineTo(xOf(c.metrics.dd.length - 1), yOf(0));
      ctx.closePath();
      ctx.fill();
    });

    /* 非当前曲线先画，当前人格曲线压在最上层 */
    var ordered = curves.slice().sort(function (a, b) {
      return (a.code === chart.cur ? 1 : 0) - (b.code === chart.cur ? 1 : 0);
    });
    ordered.forEach(function (c) {
      var isCur = c.code === chart.cur;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = isCur ? 2.5 : 1.6;
      ctx.globalAlpha = isCur ? 1 : 0.88;
      ctx.beginPath();
      c.metrics.dd.forEach(function (vv, ii) {
        if (ii === 0) ctx.moveTo(xOf(ii), yOf(vv)); else ctx.lineTo(xOf(ii), yOf(vv));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      var lastI = c.metrics.dd.length - 1;
      if (lastI >= 0) {
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.arc(xOf(lastI), yOf(c.metrics.dd[lastI]), isCur ? 3.4 : 2.4, 0, Math.PI * 2); ctx.fill();
      }
    });

    /* 十字光标 */
    if (hover.index >= 0 && n) {
      var hi = Math.min(hover.index, n - 1);
      var hx = xOf(hi);
      ctx.strokeStyle = pal.crosshair;
      ctx.lineWidth = 1;
      if (ctx.setLineDash) ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(hx, pad.t); ctx.lineTo(hx, pad.t + plotH); ctx.stroke();
      var primary = curves[0];
      if (primary && isNum(primary.metrics.dd[hi])) {
        var hy = yOf(primary.metrics.dd[hi]);
        ctx.strokeStyle = pal.crosshair;
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.moveTo(pad.l, hy); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (ctx.setLineDash) ctx.setLineDash([]);
      curves.forEach(function (c) {
        var vv = c.metrics.dd[hi];
        if (!isNum(vv)) return;
        ctx.fillStyle = cssVar("--surface", "#ffffff");
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx, yOf(vv), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      /* 十字线底部的日期标签 */
      var label = dates[hi] || "";
      ctx.font = '600 11px ' + CHART_FONT;
      var tw = 84, lx = Math.max(pad.l, Math.min(W - pad.r - tw, hx - tw / 2));
      ctx.fillStyle = pal.labelBg;
      ctx.fillRect(lx, pad.t + plotH + 4, tw, 19);
      ctx.fillStyle = pal.labelFg;
      ctx.textAlign = "center";
      ctx.fillText(label, lx + tw / 2, pad.t + plotH + 17);
    }
  }

  /* ---------- 十字光标读数框 ---------- */
  function hideTip() {
    var tip = $("hs-tip");
    if (!tip) return;
    tip.hidden = true;
    tip.innerHTML = "";
  }
  function positionTip() {
    var tip = $("hs-tip");
    if (!tip || tip.hidden || !chart) return;
    var x = chart.xOf(Math.min(hover.index, Math.max(0, chart.dates.length - 1)));
    var boxW = chart.W < 620 ? 252 : 288;
    var left = x + 18 + boxW > chart.W ? x - 18 - boxW : x + 18;
    left = Math.max(4, Math.min(chart.W - boxW - 4, left));
    if (tip.style) { tip.style.left = left + "px"; }
  }
  function updateTip() {
    var tip = $("hs-tip");
    if (!tip) return;
    if (hover.index < 0 || !chart || !chart.curves.length || !chart.dates.length) { hideTip(); return; }
    var i = Math.min(hover.index, chart.dates.length - 1);
    var rows = chart.curves.map(function (c) {
      var m = c.metrics;
      var chg = m.chg[i];
      var cls = !isNum(chg) || chg === 0 ? "" : (chg > 0 ? " hs-tip-up" : " hs-tip-down");
      var sign = isNum(chg) && chg > 0 ? "+" : "";
      return '<div class="hs-tip-row"><span class="hs-tip-dot" style="background:' + c.color + '"></span>' +
        '<span class="hs-tip-name">' + escapeHtml(c.name + suffixFor(c.code, chart.cur)) + '</span>' +
        '<span class="hs-tip-val">' + fmt(m.dd[i], 2) + '%</span>' +
        '<span class="hs-tip-meta">' + fmt(m.closes[i], 2) + ' 点 · 当日变动 <b class="' +
        cls.trim() + '">' + sign + fmt(chg, 2) + '%</b></span></div>';
    }).join("");
    tip.innerHTML = '<div class="hs-tip-date">' + escapeHtml(chart.dates[i]) +
      '<span>回撤 / 收盘点位 / 当日变动</span></div>' + rows;
    tip.hidden = false;
    positionTip();
  }

  /* ---------- 图例、指标表与窗口说明 ---------- */
  function renderLegend(curves) {
    var cur = currentCode();
    $("hs-legend").innerHTML = curves.map(function (c) {
      return '<span class="hs-legend-item' + (c.code === cur ? " hs-legend-current" : "") +
        '"><span class="hs-legend-dot" style="background:' + c.color + '"></span>' +
        escapeHtml(c.name + suffixFor(c.code, cur)) + "</span>";
    }).join("");
  }
  function renderStats(curves) {
    var cur = currentCode();
    $("hs-stats-body").innerHTML = curves.map(function (c) {
      var m = c.metrics;
      var cls = c.code === cur ? ' class="hs-current"' : "";
      return "<tr" + cls + "><td>" + escapeHtml(c.name + suffixFor(c.code, cur)) +
        '</td><td class="hs-num">' + fmt(m.maxDD, 2) + '</td><td class="hs-num">' + fmt(m.vol, 2) +
        '</td><td class="hs-num">' + fmt(m.amp, 2) + '</td><td class="hs-num">' + fmt(m.downPct, 1) + "</td></tr>";
    }).join("");
    renderSummary(curves, cur);
  }

  /* 曲线顶部的四个大数字：先给结论感，再看下方明细表。 */
  function renderSummary(curves, cur) {
    var box = $("hs-summary");
    if (!box) return;
    var c = curves.filter(function (x) { return x.code === cur; })[0] || curves[0];
    if (!c) { box.innerHTML = ""; return; }
    var m = c.metrics;
    var cells = [
      ["最大回撤", m.maxDD, 2],
      ["年化波动率", m.vol, 2],
      ["区间振幅", m.amp, 2],
      ["下跌交易日", m.downPct, 1]
    ];
    box.innerHTML = cells.map(function (x, i) {
      return '<div class="hs-stat"><span>' + x[0] + '</span>' +
        '<b><em class="hs-stat-num" data-v="' + x[1] + '" data-d="' + x[2] + '">' + fmt(x[1], x[2]) +
        "</em><i>%</i></b></div>";
    }).join("");
    if (window.GBTI_LOOK && window.GBTI_LOOK.countUp) {
      Array.prototype.forEach.call(box.querySelectorAll(".hs-stat-num"), function (el) {
        var v = Number(el.getAttribute("data-v"));
        var d = Number(el.getAttribute("data-d"));
        if (isNaN(v)) return;
        window.GBTI_LOOK.countUp(el, v, { digits: d, suffix: "" });
      });
    }
  }
  function renderControls(win) {
    var buttons = $("hs-ranges").querySelectorAll("button[data-years]");
    Array.prototype.forEach.call(buttons, function (b) {
      b.classList.toggle("is-on", Number(b.getAttribute("data-years")) === state.years);
    });
    $("hs-all-styles").checked = state.allStyles;
    $("hs-window-note").textContent = win
      ? "当前窗口 " + win.start + " 至 " + win.end + "，共 " + win.days + " 个交易日"
      : "指数快照不可用";
  }

  function render() {
    hover.index = -1;
    hover.locked = false;
    renderNotice();
    renderPersona();
    var built = buildCurves();
    renderControls(built.window);
    drawChart(built.list);
    renderLegend(built.list);
    renderStats(built.list);
    hideTip();
  }

  /* ---------- 事件 ---------- */
  function indexFromEvent(e) {
    var canvas = $("hs-canvas");
    if (!canvas || !chart || !chart.dates.length) return -1;
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!rect || !rect.width) return -1;
    var clientX = e.clientX;
    if (e.touches && e.touches.length) clientX = e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length && clientX === undefined) clientX = e.changedTouches[0].clientX;
    if (typeof clientX !== "number") return -1;
    var x = clientX - rect.left;
    if (x < chart.pad.l - 12 || x > chart.pad.l + chart.plotW + 12) return -1;
    var i = Math.round((x - chart.pad.l) / chart.plotW * (chart.dates.length - 1));
    return Math.max(0, Math.min(chart.dates.length - 1, i));
  }
  function moveHover(i) {
    if (i < 0) return;
    hover.index = i;
    paint();
    updateTip();
  }
  function bindChart() {
    var canvas = $("hs-canvas");
    if (!canvas || !canvas.addEventListener) return;
    canvas.addEventListener("mousemove", function (e) {
      if (hover.locked) return;
      var i = indexFromEvent(e);
      if (i < 0) return;
      moveHover(i);
    });
    canvas.addEventListener("mouseleave", function () {
      if (hover.locked) return;
      hover.index = -1;
      paint();
      hideTip();
    });
    canvas.addEventListener("click", function (e) {
      var i = indexFromEvent(e);
      if (i < 0) return;
      if (hover.locked) { hover.locked = false; hover.index = -1; paint(); hideTip(); }
      else { hover.locked = true; moveHover(i); }
    });
    canvas.addEventListener("touchstart", function (e) {
      var i = indexFromEvent(e);
      if (i >= 0) { hover.locked = false; moveHover(i); }
    });
    canvas.addEventListener("touchmove", function (e) {
      var i = indexFromEvent(e);
      if (i >= 0) { hover.locked = false; moveHover(i); }
    });
    canvas.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.preventDefault) e.preventDefault();
      var n = chart ? chart.dates.length : 0;
      if (!n) return;
      var base = hover.index < 0 ? n - 1 : hover.index;
      hover.locked = true;
      moveHover(Math.max(0, Math.min(n - 1, base + (e.key === "ArrowRight" ? 1 : -1))));
    });
    /* 容器宽度变化时按新的像素比重画，已锁定的读数保留 */
    if (window.addEventListener) {
      window.addEventListener("resize", function () {
        if (chart && chart.curves) drawChart(chart.curves);
      });
      /* 换皮肤时重取曲线与网格颜色，保留当前十字光标位置 */
      window.addEventListener("gbti-theme-change", onThemeChange);
    }
  }
  function onThemeChange() {
    renderPersona();
    if (!chart || !chart.curves || !chart.curves.length) return;
    chart.curves.forEach(function (c) { c.color = colorFor(c.code); });
    drawChart(chart.curves);
    renderLegend(chart.curves);
    renderStats(chart.curves);
  }
  function bind() {
    $("hs-ranges").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-years]");
      if (!btn) return;
      state.years = Number(btn.getAttribute("data-years"));
      render();
    });
    $("hs-all-styles").addEventListener("change", function () {
      state.allStyles = this.checked;
      render();
    });
    $("hs-code").addEventListener("change", function () {
      var code = this.value;
      if (!code) {
        state.persona = null;
        state.allStyles = true;
      } else {
        var same = code === state.answerCode;
        state.persona = personaFromCode(code, same ? state.answerScores : null,
          same ? "本机答题记录" : "手动切换（未提供逐题作答）");
        state.allStyles = false;
      }
      render();
    });
    bindChart();
  }

  resolvePersona();
  bind();
  render();
})();
