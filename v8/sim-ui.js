/* ==========================================================================
   GBTI 基金经理模拟器 · 界面层
   引擎在 sim.js（纯计算、可在 node 里测），这里只管渲染与交互。
   入口：工作台「接管一只基金」卡片 → 全屏弹窗，不开新页面、不动导航。
   ========================================================================== */
(function () {
  "use strict";

  var SIM = window.GBTI_SIM || null;
  if (!SIM) return;

  var SAVE_KEY = "gbti-sim-v1";
  var world = null;
  var game = null;
  var target = "";   /* 当前选中的标的：可能是候选卡，也可能是持仓里的一只 */
  var dialog = null;
  var busy = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "--" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function money(v) { return (v / 10000).toFixed(1) + " 万"; }
  function pct(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%"; }
  function yuan(v) { return Math.round(v).toLocaleString("zh-CN"); }

  function rowsOf() {
    if (!window.GBTI_WB || typeof window.GBTI_WB.rows !== "function") return [];
    return window.GBTI_WB.rows();
  }

  function ensureWorld() {
    if (world) return world;
    if (typeof GBTI_INDEX_HISTORY === "undefined") return null;
    if (typeof GBTI_MARKET === "undefined") return null;
    world = SIM.buildWorld({
      rows: rowsOf(),
      market: GBTI_MARKET,
      history: GBTI_INDEX_HISTORY
    });
    return world;
  }

  function personaCode() {
    var code = window.GBTI_WB && window.GBTI_WB.personaCode ? window.GBTI_WB.personaCode() : "";
    if (code) return code;
    try {
      var raw = JSON.parse(localStorage.getItem("gbti-progress-v6-20261013") || "null");
      if (raw && Array.isArray(raw.answers) && typeof calculateResult === "function") {
        return calculateResult(raw.answers).axisCode;
      }
    } catch (e) { /* 未答题 */ }
    return "";
  }

  /* ---------- 存档 ---------- */

  function save() {
    if (!game) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        seed: game.seed, personaCode: game.personaCode,
        startIndex: game.startIndex, endIndex: game.endIndex,
        day: game.day, cash: game.cash, positions: game.positions, maxPos: game.maxPos,
        trades: game.trades, fees: game.fees, log: game.log,
        equity: game.equity, cands: game.cands, event: game.event, phase: game.phase
      }));
    } catch (e) { /* 无痕模式 */ }
  }
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); } catch (e) { return null; }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 弹窗骨架 ---------- */

  function ensureDialog() {
    if (dialog && document.body.contains(dialog)) return dialog;
    dialog = document.getElementById("sim-dialog");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.id = "sim-dialog";
    dialog.className = "modal sim-modal";
    dialog.innerHTML = '<div class="sim-shell"><button class="sim-close" type="button" aria-label="关闭">✕</button>' +
      '<div id="sim-body" class="sim-body"></div></div>';
    document.body.appendChild(dialog);
    dialog.querySelector(".sim-close").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener("click", onClick);
    return dialog;
  }

  /* ---------- 渲染：开局页 ---------- */

  function renderIntro() {
    var w = ensureWorld();
    var body = $("sim-body");
    if (!body) return;
    if (!w) {
      body.innerHTML = '<div class="sim-panel"><h2>暂时开不了局</h2>' +
        '<p class="sim-p">行情或指数日线没加载上，刷新一下页面再试。</p></div>';
      return;
    }
    var saved = loadSave();
    var resumeHtml = "";
    if (saved && saved.phase === "play" && saved.day > 0) {
      resumeHtml = '<div class="sim-resume">' +
        "<b>你有一局没打完</b><span>第 " + (saved.day + 1) + " / " + SIM.DAYS + " 天，净值 " +
        money(saved.equity[saved.equity.length - 1]) + "</span>" +
        '<button class="sp-btn sim-btn" type="button" data-sim="resume">接着打</button></div>';
    }
    body.innerHTML =
      '<div class="sim-intro">' +
        '<p class="sim-eyebrow">FUND MANAGER SIMULATOR</p>' +
        "<h2 class=\"sim-h2\">接管一只基金<span>14 个交易日 · 100 万虚拟资金</span></h2>" +
        '<p class="sim-lead">市场背景采用中证红利、创业板指、上证50、中证1000 的<strong>历史指数日线</strong>。' +
        "标的人格、换手和振幅来自行情快照，个股价格走势由模型模拟生成，买卖使用虚拟资金。</p>" +
        '<ul class="sim-rules">' +
          "<li>每天开盘三只候选，一天只能做一个动作：买一只、卖一只，或者观望。</li>" +
          "<li>最多同时持有 4 只。三成 / 六成是这一次用掉总资产的比例，没满仓就能接着买下一只。</li>" +
          "<li>同一只可以分批加仓，成本按加权平均摊薄；卖出时能只减一半，剩下的继续拿着。</li>" +
          "<li>买入付佣金和滑点，卖出再交印花税；当天买的第二天才能卖。</li>" +
          "<li>单日涨跌超过 ±10% 会被涨跌停截断；第 14 天收盘全部平仓，出称号和结算单。</li>" +
        "</ul>" +
        resumeHtml +
        '<div class="sim-intro-actions">' +
          '<button class="sp-btn sim-btn sim-btn-main" type="button" data-sim="start">开始一个新季度</button>' +
          '<button class="sp-btn sp-btn-ghost sim-btn" type="button" data-sim="start-random">换一段历史行情</button>' +
        "</div>" +
        '<p class="sim-foot">历史指数与模拟个股走势 + 虚拟资金，用于教学演示，不构成任何投资建议，也不承诺收益。' +
        "随机数由种子决定，同一种子必然同一结果。</p>" +
      "</div>";
  }

  /* ---------- 渲染：交易页 ---------- */

  function currentDate() {
    if (!game || !world) return "";
    var i = game.startIndex + game.day;
    return world.dates[Math.min(i, world.dates.length - 1)] || "";
  }

  function stockOf(code) {
    if (!world) return null;
    for (var i = 0; i < world.stocks.length; i += 1) {
      if (world.stocks[i].code === code) return world.stocks[i];
    }
    return null;
  }

  /* 选中项可能因为换日、卖出而失效，渲染前先兜一次 */
  function ensureTarget() {
    if (!game) { target = ""; return; }
    var ok = false;
    if (target) {
      ok = game.cands.indexOf(target) >= 0 || !!SIM.positionOf(game, target);
    }
    if (!ok) target = game.cands[0] || (game.positions[0] ? game.positions[0].code : "");
  }

  function cardsHtml() {
    var eq = SIM.equityOf(game, world, game.day);
    var invested = SIM.investedOf(game, world, game.day);
    var ratio = eq > 0 ? invested / eq : 0;
    /* 三只里最便宜的一手要多少钱，用来判断「还有没有钱买」 */
    var cheapest = Infinity;
    game.cands.forEach(function (code) {
      var p = SIM.priceAt(game, world, code, game.day) * 100 * 1.002;
      if (p < cheapest) cheapest = p;
    });
    return '<div class="sim-cards">' + game.cands.map(function (code) {
      var s = stockOf(code);
      if (!s) return "";
      var price = SIM.priceAt(game, world, code, game.day);
      var av = window.GBTI_LOOK ? window.GBTI_LOOK.avatar(s.personaCode, 30) : "";
      var held = !!SIM.positionOf(game, code);
      return '<button class="sim-card' + (code === target ? " is-on" : "") + '" type="button" data-sim="pick" data-code="' + esc(code) + '">' +
        '<span class="sim-card-top">' + av +
          '<span class="sim-card-name">' + esc(s.name) + "<i>" + esc(s.code) + "</i></span>" +
          (held ? '<span class="sim-badge">持仓中</span>' : "") +
        "</span>" +
        '<span class="sim-card-meta">' + esc(s.industry || "—") + " · " + esc(SIM.STYLE_NAME[s.style] || "") + "</span>" +
        '<span class="sim-card-row"><span>买入价 <b>¥' + price.toFixed(2) + "</b></span>" +
          "<span>振幅 <b>" + s.amplitude.toFixed(2) + "%</b></span>" +
          "<span>换手 <b>" + s.turnover.toFixed(2) + "%</b></span></span>" +
        '<span class="sim-card-code"><b>' + esc(s.personaCode) + "</b>" + esc(s.personaName || "") + "</span>" +
        "</button>";
    }).join("") + "</div>" + '<p class="sim-hintline">现金 ' + money(game.cash) +
      " · 仓位 " + Math.round(ratio * 100) + "%（" + game.positions.length + " / " + SIM.MAX_POS + " 只）" +
      (cheapest > game.cash && game.positions.length < SIM.MAX_POS
        ? '<b class="sim-warn">这三只都买不起一手了，先卖一只。</b>' : "") + "</p>";
  }

  /* 持仓区：一只一行，名字可点（选中后上面三个键就是加仓），各有减仓与清仓两个键 */
  function holdingsHtml() {
    if (!game.positions.length) {
      return '<div class="sim-hold is-empty"><span class="sim-hold-title">当前空仓</span>' +
        '<span class="sim-hold-sub">挑一只建仓，三成、六成或满仓，最多同时拿 ' + SIM.MAX_POS + " 只。</span></div>";
    }
    var rows = game.positions.map(function (p) {
      var price = SIM.priceAt(game, world, p.code, game.day);
      var value = p.shares * price;
      var pnl = value - p.cost;
      var pnlPct = p.cost > 0 ? (pnl / p.cost) * 100 : 0;
      var canSell = p.buyDay < game.day;
      var up = pnl >= 0;
      return '<li class="sim-hold-row' + (p.code === target ? " is-on" : "") + '">' +
        '<button class="sim-hold-id" type="button" data-sim="pick" data-code="' + esc(p.code) + '">' +
          "<b>" + esc(p.name) + "</b><i>" + esc(p.code) + "</i></button>" +
        '<span class="sim-hold-num"><i>股数</i><b>' + p.shares.toLocaleString("zh-CN") + "</b></span>" +
        '<span class="sim-hold-num"><i>成本</i><b>¥' + (p.cost / p.shares).toFixed(2) + "</b></span>" +
        '<span class="sim-hold-num"><i>现价</i><b>¥' + price.toFixed(2) + "</b></span>" +
        '<span class="sim-hold-pnl ' + (up ? "is-up" : "is-down") + '"><b>' + pct(pnlPct) + "</b><i>" +
          (up ? "+" : "−") + yuan(Math.abs(pnl)) + "</i></span>" +
        '<span class="sim-hold-acts">' +
          '<button class="sp-btn sp-btn-ghost sim-btn sim-hold-sell" type="button" data-sim="sell" data-ratio="0.5" data-code="' +
            esc(p.code) + '"' + (canSell ? "" : " disabled") + ">减半</button>" +
          '<button class="sp-btn sp-btn-ghost sim-btn sim-hold-sell" type="button" data-sim="sell" data-ratio="1" data-code="' +
            esc(p.code) + '"' + (canSell ? "" : " disabled") + ">" + (canSell ? "清仓" : "明天可卖") + "</button>" +
        "</span>" +
        "</li>";
    }).join("");
    return '<div class="sim-hold">' +
      '<div class="sim-hold-head"><span class="sim-hold-title">我的持仓</span>' +
      '<span class="sim-hold-sub">' + game.positions.length + " / " + SIM.MAX_POS +
        " 只 · 点名字选中它，上面三个键就变成加仓</span></div>" +
      '<ul class="sim-hold-list">' + rows + "</ul></div>";
  }

  function actionsHtml() {
    var heldTarget = !!SIM.positionOf(game, target);
    var full = game.positions.length >= SIM.MAX_POS && !heldTarget;
    var tPrice = target ? SIM.priceAt(game, world, target, game.day) * 100 * 1.002 : Infinity;
    var noMoney = !target || tPrice > game.cash;
    var buyOff = (full || noMoney) ? " disabled" : "";
    var label = heldTarget ? ["加三成", "加六成", "加满"] : ["买三成", "买六成", "满仓"];
    return '<div class="sim-actions">' +
      '<button class="sp-btn sim-btn" type="button" data-sim="buy" data-w="0.3"' + buyOff + ">" + label[0] + "</button>" +
      '<button class="sp-btn sim-btn" type="button" data-sim="buy" data-w="0.6"' + buyOff + ">" + label[1] + "</button>" +
      '<button class="sp-btn sim-btn' + (full || noMoney ? "" : " sim-btn-main") + '" type="button" data-sim="buy" data-w="1"' +
        buyOff + ">" + label[2] + "</button>" +
      '<button class="sp-btn sp-btn-ghost sim-btn" type="button" data-sim="wait">观望一天</button>' +
      "</div>" +
      '<p class="sim-hintline sim-act-hint">一天只能做一个动作：买一只、卖一只，或者什么都不做。' +
      "三成 / 六成是这一次用掉总资产的比例，满仓就是把现金全买掉。" +
      (full ? '<b class="sim-warn">现在 ' + SIM.MAX_POS + ' 只已满，先卖一只才能买新的。</b>' :
        noMoney ? '<b class="sim-warn">' + (target ? "现金不够买这一只的一手了" : "先选一只") + "。</b>" : "") + "</p>";
  }

  function logHtml() {
    var items = game.log.slice(-2).reverse();
    if (!items.length) return '<p class="sim-empty">第一天的三只已经摆在你面前了。选一只，或者什么都不做。</p>';
    return '<ul class="sim-log">' + items.map(function (it) {
      return "<li><b>第 " + it.day + " 天</b><span>" + esc(it.text) + "</span>" +
        (it.taunt ? '<em>' + esc(it.taunt) + "</em>" : "") +
        (it.event ? "<small>当天事件：" + esc(it.event) +
          (typeof it.eventDelta === "number" ? "（影响 " + pct(it.eventDelta) + "）" : "") + "</small>" : "") + "</li>";
    }).join("") + "</ul>";
  }

  /* ---------- 动效小工具 ---------- */

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* 数字滚动：rAF 不触发时（无头、后台标签）定时器兜底写终值 */
  function countTo(el, from, to, fmt, dur) {
    if (!el) return;
    if (reducedMotion() || !window.requestAnimationFrame) { el.textContent = fmt(to); return; }
    var span = dur || 520;
    var t0 = null;
    var done = false;
    function finish() { if (!done) { done = true; el.textContent = fmt(to); } }
    window.setTimeout(finish, span + 120);
    function step(ts) {
      if (done) return;
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / span);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * eased);
      if (p < 1) window.requestAnimationFrame(step); else finish();
    }
    window.requestAnimationFrame(step);
  }

  function shake() {
    var d = dialog;
    if (!d || reducedMotion()) return;
    d.classList.remove("is-shake");
    void d.offsetWidth;
    d.classList.add("is-shake");
    window.setTimeout(function () { d.classList.remove("is-shake"); }, 380);
  }

  function renderPlay(prev) {
    var body = $("sim-body");
    if (!body) return;
    ensureTarget();
    var eq = SIM.equityOf(game, world, game.day);
    var ret = (eq / SIM.START_CASH - 1) * 100;
    var ev = game.event;
    var from = prev && typeof prev.equity === "number" ? prev.equity : eq;
    var fromRet = (from / SIM.START_CASH - 1) * 100;
    var delta = eq - from;
    var showDelta = prev && Math.abs(delta) > 0.5;
    /* 先渲染上一刻的数值，再滚到新数值，避免第一帧先闪一下终值 */
    var shownEq = showDelta ? from : eq;
    var shownRet = showDelta ? fromRet : ret;
    body.innerHTML =
      '<div class="sim-top">' +
        '<div class="sim-top-l"><p class="sim-eyebrow">第 ' + (game.day + 1) + " / " + SIM.DAYS + " 天 · " +
          esc(currentDate()) + '</p><h3 class="sim-net"><b data-net data-from="' + from + '" data-to="' + eq + '">' +
          money(shownEq) + "</b><span class=\"" + (shownRet >= 0 ? "is-up" : "is-down") + '" data-ret data-rfrom="' + fromRet +
          '" data-rto="' + ret + '">' + pct(shownRet) + "</span>" +
          (showDelta ? '<em class="sim-delta ' + (delta >= 0 ? "is-up" : "is-down") + '">' +
            (delta >= 0 ? "+" : "−") + Math.abs(delta / 10000).toFixed(1) + " 万</em>" : "") +
          "</h3></div>" +
        '<div class="sim-top-r"><span>现金 ' + money(game.cash) + "</span><span>种子 " + esc(game.seed) + "</span></div>" +
      "</div>" +
      (game.log.length ? '<canvas id="sim-spark" class="sim-spark" height="86" aria-label="净值曲线"></canvas>' :
        '<p class="sim-hintline sim-hint-first">净值曲线从第二天的收盘开始画。</p>') +
      (ev ? "<div class=\"sim-event\"><span class=\"sim-event-tag\">今日事件 · " +
        (ev.scope === "stock" ? "个股" : ev.scope === "style" ? "风格" : "全市场") + "</span><p>" + esc(ev.text) +
        "</p><small>影响多少先不告诉你，收盘一起算。</small></div>" : "") +
      cardsHtml() + '<div class="sim-actbox" id="sim-actbox">' + actionsHtml() + "</div>" +
      holdingsHtml() + logHtml();

    var netEl = body.querySelector("[data-net]");
    if (netEl && from !== eq) {
      countTo(netEl, from, eq, function (v) { return (v / 10000).toFixed(1) + " 万"; });
      var retEl = body.querySelector("[data-ret]");
      if (retEl) countTo(retEl, fromRet, ret, function (v) { return pct(v); }, 520);
      var netBox = body.querySelector(".sim-net");
      if (netBox && !reducedMotion()) {
        netBox.classList.add("is-bump");
        window.setTimeout(function () { netBox.classList.remove("is-bump"); }, 460);
      }
    }
    drawSpark(true);
  }

  /* 曲线：逐段画出；不开动画或没有 rAF 时一次画完 */
  function drawSpark(animate) {
    var c = $("sim-spark");
    if (!c || !game) return;
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth || c.parentNode.clientWidth || 520;
    var h = 86;
    c.width = w * dpr;
    c.height = h * dpr;
    var ctx = c.getContext("2d");
    if (!ctx) return;
    var data = game.equity.concat([SIM.equityOf(game, world, game.day)]);
    var base = SIM.START_CASH;
    var min = Math.min.apply(null, data.concat([base]));
    var max = Math.max.apply(null, data.concat([base]));
    if (max - min < 1) { max = base + 1; min = base - 1; }
    var pad = 10;
    var yOf = function (v) { return h - pad - (v - min) / (max - min) * (h - pad * 2); };
    var xOf = function (i) { return data.length <= 1 ? 0 : (i / (data.length - 1)) * (w - 2 * pad) + pad; };
    var color = data[data.length - 1] >= base ? "#c44236" : "#2f7d5a";

    function paint(upto) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(120,110,95,.35)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad, yOf(base));
      ctx.lineTo(w - pad, yOf(base));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      var last = Math.max(1, Math.round((data.length - 1) * upto));
      for (var i = 0; i <= last; i += 1) {
        if (i === 0) ctx.moveTo(xOf(i), yOf(data[i]));
        else ctx.lineTo(xOf(i), yOf(data[i]));
      }
      ctx.stroke();
      ctx.fillStyle = color;
      for (var k = 0; k <= last; k += 1) {
        ctx.beginPath();
        ctx.arc(xOf(k), yOf(data[k]), k === last ? 3.4 : 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      /* 末端的光晕，落到最新一点时更明显 */
      if (last === data.length - 1) {
        ctx.beginPath();
        ctx.arc(xOf(last), yOf(data[last]), 8, 0, Math.PI * 2);
        ctx.fillStyle = color === "#c44236" ? "rgba(196,66,54,.16)" : "rgba(47,125,90,.16)";
        ctx.fill();
      }
    }

    if (!animate || reducedMotion() || !window.requestAnimationFrame || data.length < 3) {
      paint(1);
      return;
    }
    var t0 = null;
    var dur = 460;
    var done = false;
    window.setTimeout(function () { if (!done) { done = true; paint(1); } }, dur + 140);
    function step(ts) {
      if (done) return;
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      paint(1 - Math.pow(1 - p, 3));
      if (p < 1) window.requestAnimationFrame(step);
      else { done = true; paint(1); }
    }
    window.requestAnimationFrame(step);
  }

  /* ---------- 渲染：结算 ---------- */

  function renderEnd(report, prevEquity) {
    var body = $("sim-body");
    if (!body) return;
    var s = report.stats;
    var from = typeof prevEquity === "number" ? prevEquity : s.final;
    body.innerHTML =
      '<div class="sim-end">' +
        '<p class="sim-eyebrow">' + esc(report.window.from) + " → " + esc(report.window.to) + " · 14 个交易日</p>" +
        '<h2 class="sim-h2">你把它做成了 <span data-end-money>' + money(from) + "</span></h2>" +
        '<p class="sim-ret ' + (s.ret >= 0 ? "is-up" : "is-down") + '" data-end-ret>' + pct(s.ret) + "</p>" +
        '<div class="sim-title"><span>称号</span><b>' + esc(report.title.name) + "</b></div>" +
        '<p class="sim-verdict">' + esc(report.verdict) + "</p>" +
        '<div class="sim-stats">' +
          "<div><span>最大回撤</span><b>" + s.maxDD.toFixed(1) + "%</b></div>" +
          "<div><span>交易次数</span><b>" + s.trades + "</b></div>" +
          "<div><span>胜率</span><b>" + s.winRate.toFixed(0) + "%</b></div>" +
          "<div><span>手续费</span><b>" + yuan(s.fees) + " 元</b></div>" +
          "<div><span>最多持股</span><b>" + s.maxPos + " 只</b></div>" +
          "<div><span>期末净值</span><b>" + money(s.final) + "</b></div>" +
        "</div>" +
        '<canvas id="sim-spark" class="sim-spark" height="86" aria-label="净值曲线"></canvas>' +
        '<details class="sim-days"><summary>看每天发生了什么</summary><ul class="sim-log">' +
          report.log.map(function (it) {
            return "<li><b>第 " + it.day + " 天</b><span>" + esc(it.text) + "</span>" +
              (it.taunt ? "<em>" + esc(it.taunt) + "</em>" : "") + "</li>";
          }).join("") +
        "</ul></details>" +
        '<div class="sim-intro-actions">' +
          '<button class="sp-btn sim-btn sim-btn-main" type="button" data-sim="restart">再来一局</button>' +
          '<button class="sp-btn sim-btn" type="button" data-sim="save-img">保存结算单</button>' +
          '<button class="sp-btn sp-btn-ghost sim-btn" type="button" data-sim="close">关掉，回去选股</button>' +
        "</div>" +
        '<p class="sim-foot">种子 ' + esc(report.seed) + " · 同种子必然同结果。历史指数与模拟个股走势 + 虚拟资金，不构成任何投资建议，称号与评语只是玩笑。</p>" +
      "</div>";
    var moneyEl = body.querySelector("[data-end-money]");
    if (moneyEl && from !== s.final) countTo(moneyEl, from, s.final, function (v) { return (v / 10000).toFixed(1) + " 万"; }, 640);
    var retEl = body.querySelector("[data-end-ret]");
    if (retEl) countTo(retEl, 0, s.ret, function (v) { return pct(v); }, 700);
    drawSpark(true);
    window.__simReport = report;
  }

  /* ---------- 结算单图片 ---------- */

  function saveImage(report) {
    if (!report) return;
    var W = 720, H = 1040, dpr = 2;
    var c = document.createElement("canvas");
    c.width = W * dpr;
    c.height = H * dpr;
    var ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    var INK = "#332e28", MUTED = "#746b60", RED = "#c44236", GREEN = "#2f7d5a", PAPER = "#f7f3ea", LINE = "#e2d9cb";
    var SANS = '"Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, W - 32, H - 32);

    var y = 74;
    ctx.fillStyle = RED;
    ctx.font = "600 15px " + SANS;
    ctx.fillText("GBTI 基金经理模拟器", 56, y);
    y += 52;
    ctx.fillStyle = INK;
    ctx.font = "700 36px " + SANS;
    ctx.fillText("我的成绩单", 56, y);
    y += 44;
    ctx.fillStyle = MUTED;
    ctx.font = "400 14px " + SANS;
    ctx.fillText(report.window.from + " → " + report.window.to + "　14 个交易日", 56, y);

    y += 66;
    ctx.fillStyle = INK;
    ctx.font = "700 56px " + SANS;
    var finalTxt = (report.stats.final / 10000).toFixed(1) + " 万";
    ctx.fillText(finalTxt, 56, y);
    ctx.fillStyle = report.stats.ret >= 0 ? RED : GREEN;
    ctx.font = "700 26px " + SANS;
    ctx.fillText(pct(report.stats.ret), 56 + ctx.measureText(finalTxt).width + 150, y - 6);

    y += 44;
    ctx.fillStyle = RED;
    ctx.font = "700 24px " + SANS;
    ctx.fillText(report.title.name, 56, y);

    y += 30;
    ctx.fillStyle = INK;
    ctx.font = "400 16px " + SANS;
    wrap(ctx, report.verdict, W - 112).forEach(function (line) {
      ctx.fillText(line, 56, y);
      y += 27;
    });

    y += 18;
    var rows = [
      ["最大回撤", report.stats.maxDD.toFixed(1) + "%"],
      ["交易次数", String(report.stats.trades)],
      ["胜率", report.stats.winRate.toFixed(0) + "%"],
      ["手续费", yuan(report.stats.fees) + " 元"],
      ["最多持股", report.stats.maxPos + " 只"],
      ["种子", report.seed]
    ];
    rows.forEach(function (r) {
      ctx.fillStyle = MUTED;
      ctx.font = "400 14px " + SANS;
      ctx.fillText(r[0], 56, y);
      ctx.fillStyle = INK;
      ctx.font = "600 15px " + SANS;
      ctx.fillText(r[1], 200, y);
      y += 30;
    });

    /* 净值曲线 */
    var data = report.log.reduce(function (acc, it) { acc.push(it.equity); return acc; }, [SIM.START_CASH]);
    var gx = 56, gy = H - 260, gw = W - 112, gh = 120;
    var min = Math.min.apply(null, data.concat([SIM.START_CASH]));
    var max = Math.max.apply(null, data.concat([SIM.START_CASH]));
    if (max - min < 1) { max = SIM.START_CASH + 1; min = SIM.START_CASH - 1; }
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(gx, gy + (1 - (SIM.START_CASH - min) / (max - min)) * gh);
    ctx.lineTo(gx + gw, gy + (1 - (SIM.START_CASH - min) / (max - min)) * gh);
    ctx.stroke();
    ctx.strokeStyle = report.stats.ret >= 0 ? RED : GREEN;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    data.forEach(function (v, i) {
      var x = gx + (data.length <= 1 ? 0 : (i / (data.length - 1)) * gw);
      var yy = gy + (1 - (v - min) / (max - min)) * gh;
      if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    });
    ctx.stroke();

    ctx.fillStyle = MUTED;
    ctx.font = "400 12px " + SANS;
    ctx.fillText("历史指数与模拟个股走势 + 虚拟资金 · 不构成任何投资建议", 56, H - 54);
    ctx.fillText("同种子必然同结果 · seed " + report.seed, 56, H - 34);

    if (c.toBlob) {
      c.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "GBTI-基金经理-" + report.seed + ".png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }, "image/png");
    }
  }

  function wrap(ctx, text, maxWidth) {
    var out = [];
    var line = "";
    String(text || "").split("").forEach(function (ch) {
      if (ctx.measureText(line + ch).width > maxWidth) { out.push(line); line = ch; }
      else line += ch;
    });
    if (line) out.push(line);
    return out;
  }

  /* ---------- 流程 ---------- */

  function startGame(randomWindow) {
    var w = ensureWorld();
    if (!w) { renderIntro(); return; }
    clearSave();
    game = SIM.create({
      world: w,
      seed: String(Date.now()).slice(-6) + "-" + (randomWindow ? "R" : "N"),
      personaCode: personaCode(),
      recent: !randomWindow
    });
    target = "";
    save();
    renderPlay();
  }

  function resumeGame() {
    var w = ensureWorld();
    var saved = loadSave();
    if (!w || !saved) { renderIntro(); return; }
    game = SIM.resume(saved, w);
    if (!game) { clearSave(); renderIntro(); return; }
    if (game.phase === "end") { renderEnd(SIM.settle(game, w)); return; }
    target = "";
    renderPlay();
  }

  function act(decision) {
    if (!game || busy) return;
    var before = SIM.equityOf(game, world, game.day);
    var res = SIM.commit(game, world, decision);
    if (!res.ok) {
      flash(res.msg);
      shake();
      return;
    }
    save();
    if (game.phase === "end") {
      renderEnd(SIM.settle(game, world), before);
    } else {
      renderPlay({ equity: before });
    }
  }

  function flash(msg) {
    var body = $("sim-body");
    if (!body || !msg) return;
    var el = body.querySelector(".sim-flash");
    if (!el) {
      el = document.createElement("p");
      el.className = "sim-flash";
      body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("is-on");
    window.setTimeout(function () { el.classList.remove("is-on"); }, 2600);
  }

  function onClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-sim]") : null;
    if (!btn) return;
    var act0 = btn.getAttribute("data-sim");
    if (act0 === "start") { startGame(false); return; }
    if (act0 === "start-random") { startGame(true); return; }
    if (act0 === "resume") { resumeGame(); return; }
    if (act0 === "pick") {
      /* 只换高亮和按钮文案，不重绘整页，否则卡片会重播入场动画 */
      target = btn.getAttribute("data-code") || "";
      Array.prototype.forEach.call(document.querySelectorAll("[data-sim=\"pick\"]"), function (el) {
        var on = el.getAttribute("data-code") === target;
        var box = el.closest(".sim-card") || el.closest(".sim-hold-row");
        if (box) box.classList.toggle("is-on", on);
      });
      var box = document.getElementById("sim-actbox");
      if (box && game) box.innerHTML = actionsHtml();
      return;
    }
    if (act0 === "buy") {
      if (!game || game.phase !== "play") return;
      var code = target;
      if (!code) return;
      act({ type: "buy", code: code, weight: Number(btn.getAttribute("data-w")) || 1 });
      return;
    }
    if (act0 === "sell") {
      act({
        type: "sell",
        code: btn.getAttribute("data-code") || "",
        ratio: Number(btn.getAttribute("data-ratio")) || 1
      });
      return;
    }
    if (act0 === "wait") { act({ type: "wait" }); return; }
    if (act0 === "restart") { renderIntro(); return; }
    if (act0 === "save-img") { saveImage(window.__simReport); return; }
    if (act0 === "close") { if (dialog) dialog.close(); return; }
  }

  function open() {
    var d = ensureDialog();
    if (!d) return;
    var saved = loadSave();
    if (saved && saved.phase === "play" && saved.day > 0) {
      game = null;
      renderIntro();
    } else if (game && game.phase === "play") {
      renderPlay();
    } else {
      renderIntro();
    }
    if (d.showModal) d.showModal();
  }

  function bindEntry() {
    var btn = document.getElementById("wb-sim-open");
    if (!btn) return;
    btn.addEventListener("click", open);
    var saved = loadSave();
    var note = document.getElementById("wb-sim-note");
    if (note) {
      if (saved && saved.phase === "play" && saved.day > 0) {
        note.textContent = "你有一局没打完：第 " + (saved.day + 1) + " / " + SIM.DAYS + " 天，接着打？";
      } else {
        note.textContent = "14 个交易日、100 万虚拟资金、历史指数与模拟个股走势。点开即玩，不用注册。";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindEntry);
  } else {
    bindEntry();
  }

  window.GBTI_SIM_UI = { open: open, start: startGame, _internal: { ensureWorld: ensureWorld } };
})();
