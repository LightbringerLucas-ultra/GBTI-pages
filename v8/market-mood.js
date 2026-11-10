/* GBTI 今日市场人格
 * 把判定个股人格的同一套中位数规则，反过来量整个市场：
 * 408 只逐只判四维，每维取多数，得到「今天 A 股是什么人格」。
 * 只用当日行情快照，不预测行情，不给操作建议。
 */
(function () {
  "use strict";

  var root = window;
  /* market-data.js 用 const 声明，不挂到 window 上，所以要先按全局词法名取，取不到再退回 window。 */
  var MARKET = typeof GBTI_MARKET !== "undefined" ? GBTI_MARKET : (root.GBTI_MARKET || null);
  var ALLOC = typeof GBTI_ALLOC !== "undefined" ? GBTI_ALLOC : (root.GBTI_ALLOC || null);
  var PROGRESS_KEY = "gbti-progress-v6-20261013";

  var DIMENSIONS = typeof dimensions !== "undefined" ? dimensions : [];
  var PERSONALITIES = typeof personalities !== "undefined" ? personalities : [];
  var calcResult = typeof calculateResult === "function" ? calculateResult : null;

  var ART = {
    bull: { src: "assets/display/market-bull.webp", alt: "低多边形红色公牛插画，表示当日上涨家数多于下跌家数" },
    bear: { src: "assets/display/market-bear.webp", alt: "低多边形绿色熊插画，表示当日下跌家数多于上涨家数" }
  };

  function isNum(v) { return typeof v === "number" && !isNaN(v); }

  function median(list) {
    var arr = list.filter(isNum).slice().sort(function (a, b) { return a - b; });
    if (!arr.length) return null;
    var mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }

  function nameOf(code) {
    for (var i = 0; i < PERSONALITIES.length; i++) {
      if (PERSONALITIES[i].code === code) return PERSONALITIES[i].name;
    }
    return "";
  }

  /* 逐只判人格，每维统计票数，取多数。返回人格码、票数、以及当日涨跌统计。 */
  function computeMood() {
    if (!MARKET || !MARKET.quotes || !ALLOC || !ALLOC.stockPersonalityOf) return null;
    var quotes = MARKET.quotes;
    var codes = Object.keys(quotes);
    if (!codes.length) return null;
    var t = ALLOC.stockThresholds(quotes);
    var tally = [{}, {}, {}, {}];
    var up = 0, down = 0, flat = 0, total = 0;
    var chgs = [], turnovers = [], amounts = 0;

    codes.forEach(function (code) {
      var q = quotes[code];
      if (!q) return;
      var p = ALLOC.stockPersonalityOf(q, t);
      if (p && p.code && p.code.length === 4) {
        total++;
        for (var i = 0; i < 4; i++) {
          var letter = p.code.charAt(i);
          tally[i][letter] = (tally[i][letter] || 0) + 1;
        }
      }
      if (isNum(q.chgPct)) {
        chgs.push(q.chgPct);
        if (q.chgPct > 0) up++;
        else if (q.chgPct < 0) down++;
        else flat++;
      }
      if (isNum(q.turnover)) turnovers.push(q.turnover);
      if (isNum(q.amountYi)) amounts += q.amountYi;
    });

    if (!total) return null;

    /* 逐维算票数与差距：差距很小的维度说明市场在这一维上分裂，值得单独点出来。 */
    var dims = DIMENSIONS.map(function (d, i) {
      var l = tally[i][d.left] || 0;
      var r = tally[i][d.right] || 0;
      var gap = Math.abs(l - r);
      return {
        name: d.name, left: d.left, right: d.right,
        leftName: d.leftName, rightName: d.rightName,
        l: l, r: r, total: l + r,
        winner: l >= r ? d.left : d.right,
        /* 差距不足 6% 或不足 6 只，就算接近对半。 */
        split: gap <= Math.max(6, Math.round((l + r) * 0.06))
      };
    });
    var code = dims.map(function (d) { return d.winner; }).join("");

    var midChg = median(chgs);
    /* 涨家数多、或中位涨跌幅为正 → 算上涨日，用公牛图；否则用熊图。 */
    var mood = (up > down || (up === down && midChg !== null && midChg > 0)) ? "bull" : "bear";

    var maxCount = Math.max.apply(null, dims.map(function (d) { return Math.max(d.l, d.r); }));
    var splits = dims.filter(function (d) { return d.split; });

    return {
      code: code,
      name: nameOf(code),
      mood: mood,
      total: total,
      up: up, down: down, flat: flat,
      midChg: midChg,
      midTurnover: median(turnovers),
      amountYi: amounts,
      tally: tally,
      dims: dims,
      splits: splits,
      maxCount: maxCount,
      thresholds: t,
      asOf: MARKET.asOf,
      source: MARKET.source
    };
  }

  /* 当前用户四维：优先网址四码，其次本机答题记录。没有就返回空。 */
  function resolveUser() {
    var m = /[?&]code=([A-Za-z]{4})/.exec(location.search || "");
    if (m) return { code: m[1].toUpperCase(), from: "链接里的四码" };
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      var p = raw ? JSON.parse(raw) : null;
      if (p && Array.isArray(p.answers) && p.answers.length && calcResult) {
        var r = calcResult(p.answers);
        if (r && r.axisCode) return { code: r.axisCode, from: "本机答题记录" };
      }
    } catch (e) { /* 无痕模式或被禁用时静默跳过。 */ }
    return null;
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(v, digits) { return isNum(v) ? v.toFixed(digits) : "--"; }
  function signed(v, digits) {
    if (!isNum(v)) return "--";
    return (v > 0 ? "+" : "") + v.toFixed(digits) + "%";
  }

  function chipsHtml(code) {
    return '<div class="gb-codechips mm-chips">' + DIMENSIONS.map(function (d, i) {
      var letter = String(code || "").charAt(i);
      var name = letter === d.left ? d.leftName : d.rightName;
      return '<span class="gb-codechip"><b>' + escapeHtml(letter) + "</b>" + escapeHtml(name) + "</span>";
    }).join("") + "</div>";
  }

  /* 对照文案：只描述四维重合情况，不评价好坏。 */
  function compareText(mood, user) {
    if (!user) return null;
    var hits = 0, diffs = [];
    for (var i = 0; i < 4; i++) {
      if (user.code.charAt(i) === mood.code.charAt(i)) hits++;
      else if (DIMENSIONS[i]) diffs.push(DIMENSIONS[i].name);
    }
    var headline;
    if (hits === 4) headline = "四个维度一个不差，你和今天的大盘完全同频。";
    else if (hits === 3) headline = "四维里有三维同向，只有「" + diffs.join("」「") + "」不一致。";
    else if (hits === 2) headline = "两维相同、两维不同，你和市场算是半路同行。";
    else if (hits === 1) headline = "只有一维相同，你和今天的大盘基本走反方向。";
    else headline = "四维全部相反，你和今天的大盘完全不是一路人。";
    return { hits: hits, diffs: diffs, headline: headline };
  }

  function statsText(mood) {
    return "涨 " + mood.up + " 家 · 跌 " + mood.down + " 家 · 中位涨跌 " + signed(mood.midChg, 2) +
      " · 有报价 " + mood.total + " 只";
  }

  /* ---------- 渲染 ---------- */
  var state = { mood: null, user: null };

  function renderBand() {
    var band = document.getElementById("market-mood");
    if (!band) return;
    var m = state.mood;
    if (!m) { band.hidden = true; return; }
    band.hidden = false;
    band.setAttribute("data-mood", m.mood);
    var art = ART[m.mood];
    var thumb = document.getElementById("mm-thumb");
    if (thumb) { thumb.src = art.src; thumb.alt = art.alt; }
    var dateEl = document.getElementById("mm-date");
    if (dateEl) dateEl.textContent = m.asOf || "--";
    var nameEl = document.getElementById("mm-name");
    if (nameEl) nameEl.textContent = m.code + " " + (m.name || "");
    var statsEl = document.getElementById("mm-stats");
    if (statsEl) statsEl.textContent = statsText(m);

    var side = document.getElementById("mm-side");
    if (!side) return;
    if (!state.user) {
      side.innerHTML = '<span class="mm-side-kicker">还不知道你的人格</span>' +
        '<span class="mm-side-main">答完 28 题即可对照</span>';
      return;
    }
    var cmp = compareText(m, state.user);
    side.innerHTML = '<span class="mm-side-kicker">你的四维 ' + escapeHtml(state.user.code) + "</span>" +
      '<span class="mm-side-main">' + (cmp.hits === 4 ? "和你完全同频" : cmp.hits + " / 4 维与大市相同") + "</span>";
  }

  function renderDialog() {
    var box = document.getElementById("mm-dialog-body");
    if (!box || !state.mood) return;
    var m = state.mood;
    var art = ART[m.mood];
    var cmp = compareText(m, state.user);
    var sideNote = m.mood === "bull"
      ? "上涨家数多于下跌家数，用公牛示意。"
      : "下跌家数不少于上涨家数，用熊示意。";

    var axes = m.dims.map(function (d) {
      var lw = Math.round(d.l / (d.total || 1) * 100);
      return '<div class="gb-axis" title="' + escapeHtml(d.name + "：" + d.leftName + " " + d.l + " 只，" +
          d.rightName + " " + d.r + " 只") + '">' +
        '<div class="gb-axis-head"><span>' + escapeHtml(d.leftName) + " <b>" + d.l + "</b></span>" +
        '<span class="gb-axis-r"><b>' + d.r + "</b> " + escapeHtml(d.rightName) + "</span></div>" +
        '<span class="gb-axis-track"><i class="gb-axis-l-fill" style="width:' + lw + '%"></i>' +
        '<i class="gb-axis-r-fill" style="width:' + (100 - lw) + '%"></i></span></div>';
    }).join("");

    var splitNote = m.splits.length
      ? '<p class="mm-split-note">' + m.splits.map(function (d) {
          return "「" + d.name + "」";
        }).join("、") + "这几维两边几乎对半（相差不超过 " +
          Math.max.apply(null, m.splits.map(function (d) { return Math.abs(d.l - d.r); })) +
          " 只），今天市场在这些点上分成两半，代码只是按多数勉强定了一边。</p>"
      : "";

    box.innerHTML =
      '<div class="mm-hero-card">' +
        '<div class="mm-hero-art"><img src="' + art.src + '" alt="' + escapeHtml(art.alt) + '" width="946" height="946"></div>' +
        '<div class="mm-hero-main">' +
          '<p class="mm-hero-kicker">今日 A 股人格 · ' + escapeHtml(m.asOf || "") + "</p>" +
          '<h2 class="mm-hero-code">' + escapeHtml(m.code) + "</h2>" +
          '<p class="mm-hero-name">' + escapeHtml(m.name || "") + "</p>" +
          '<p class="mm-hero-desc">' + m.total + " 只逐只按当日行情判出四维，每维取多数票拼成这一型。</p>" +
          '<div class="gb-axes mm-axes">' + axes + "</div>" +
          splitNote +
        "</div>" +
      "</div>" +
      '<ul class="mm-facts">' +
        '<li><span>涨 / 跌 / 平</span><strong>' + m.up + " / " + m.down + " / " + m.flat + "</strong></li>" +
        '<li><span>中位涨跌幅</span><strong>' + signed(m.midChg, 2) + "</strong></li>" +
        '<li><span>中位换手率</span><strong>' + fmt(m.midTurnover, 2) + "%</strong></li>" +
        '<li><span>全池成交额</span><strong>' + fmt(m.amountYi / 10000, 2) + " 万亿</strong></li>" +
      "</ul>" +
      '<p class="mm-art-note">' + sideNote + "</p>" +
      (cmp
        ? '<div class="mm-compare">' +
            '<p class="mm-compare-kicker">你的 ' + escapeHtml(state.user.code) + " × 市场 " + escapeHtml(m.code) + "</p>" +
            '<p class="mm-compare-hits"><b>' + cmp.hits + "</b><span>/ 4 维相同</span></p>" +
            '<p class="mm-compare-text">' + escapeHtml(cmp.headline) + "</p>" +
            '<a class="mm-compare-link" href="workbench.html?code=' + encodeURIComponent(state.user.code) + '">去工作台看同人格标的 →</a>' +
          "</div>"
        : '<div class="mm-compare is-empty">' +
            "<p>做完 28 题，这里会显示你的四维和今天的大盘差在哪几维。</p>" +
            '<a class="mm-compare-link" href="#quiz-heading" data-mm-start>去做测试 →</a>' +
          "</div>") +
      '<p class="mm-foot">人格由当日行情按公开阈值映射而来，是风格对照，不是市场预测，也不构成任何建议。' +
        "行情截止 " + escapeHtml(m.asOf || "--") + "，来源 " + escapeHtml(m.source || "--") + "。" +
        "阈值取全池当期市盈率、换手率、总市值、振幅的中位数：" + fmt(m.thresholds.pe, 2) + " 倍 / " +
        fmt(m.thresholds.turnover, 2) + "% / " + fmt(m.thresholds.mcapYi, 1) + " 亿 / " +
        fmt(m.thresholds.amplitude, 2) + "%。</p>";
  }

  function openDialog() {
    var dlg = document.getElementById("mm-dialog");
    if (!dlg) return;
    if (state.mood) dlg.setAttribute("data-mood", state.mood.mood);
    renderDialog();
    if (typeof dlg.showModal === "function") {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
    }
  }
  function closeDialog() {
    var dlg = document.getElementById("mm-dialog");
    if (!dlg) return;
    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
  }

  function bind() {
    var open = document.getElementById("mm-open");
    if (open) open.addEventListener("click", openDialog);
    var close = document.getElementById("mm-close");
    if (close) close.addEventListener("click", closeDialog);
    var dlg = document.getElementById("mm-dialog");
    if (dlg) {
      /* 点遮罩关闭：只在点到 dialog 本身（不是内部内容）时生效。 */
      dlg.addEventListener("click", function (e) {
        if (e.target === dlg) closeDialog();
      });
    }
    var body = document.getElementById("mm-dialog-body");
    if (body) {
      body.addEventListener("click", function (e) {
        var t = e.target.closest ? e.target.closest("[data-mm-start]") : null;
        if (!t) return;
        e.preventDefault();
        closeDialog();
        var cta = document.getElementById("start-cta");
        if (cta) cta.click();
      });
    }
  }

  function init() {
    state.mood = computeMood();
    state.user = resolveUser();
    renderBand();
    bind();
  }

  root.GBTI_MARKET_MOOD = {
    compute: computeMood,
    compareText: compareText,
    resolveUser: resolveUser,
    _state: state,
    refresh: init
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
