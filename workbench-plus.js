/* ==========================================================================
   GBTI 工作台 · 玩法增强
   三件事，全部只读现有数据，不改筛选与打分规则：
   1) 今日人格龙虎榜：把 408 只按 16 型分组，比当日平均涨跌
   2) 一键预设：把常用条件组合成一个有性格的按钮
   3) 人格嘴替：鼠标停到表格的人格标签上，给一句大白话吐槽
   依赖 workbench.js 暴露的 window.GBTI_WB（行数据、当前人格、筛选应用）。
   ========================================================================== */
(function () {
  "use strict";

  var W = window.GBTI_WB || null;
  if (!W) return;

  var PERSONAS = typeof personalities !== "undefined" ? personalities : [];
  var NAME_OF = {};
  PERSONAS.forEach(function (p) { NAME_OF[p.code] = p.name; });

  /* ---------- 嘴替台词：一人一句，只吐槽习惯，不评价标的 ---------- */
  var QUIP = {
    FLDO: "等它跌到 8 倍 PE 再说，等到现在还没买。",
    FLAO: "三张表翻完才肯下手，翻完发现已经涨了三成。",
    FLDJ: "买了就忘，忘了就赚，唯一的操作是不操作。",
    FLAJ: "嘴上说拿三年，心里想的是三天。",
    FSDO: "赚两毛就跑，跑完回头看它翻倍。",
    FSAO: "每个季度都算一遍，算完还是不敢重仓。",
    FSDJ: "一天看八十次盘，最后在最低点卖了。",
    FSAJ: "报表一出就冲，冲完发现看的是去年那份。",
    MLDO: "指数涨它跟上，指数跌它先跌，主打一个跟随。",
    MLAO: "趋势明了才上车，上车那站往往就是顶。",
    MLDJ: "不看财报看盘口，收盘后复盘到半夜。",
    MLAJ: "热点追到第三天，才想起自己是慢热型。",
    MSDO: "换手一高就拉黑，拉黑完它涨了一倍。",
    MSAO: "什么热都敢碰，碰完才开始研究它是什么。",
    MSDJ: "涨了怕追高，跌了怕接刀，横盘最难受。",
    MSAJ: "今天买明天卖，手续费够买一周咖啡。"
  };

  function $(id) { return document.getElementById(id); }
  function isNum(v) { return typeof v === "number" && !isNaN(v); }
  function esc(s) {
    return String(s === null || s === undefined ? "--" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pct(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%"; }

  /* ---------- 一、龙虎榜 ---------- */

  var rankOpen = false;

  function aggregate() {
    var rows = W.rows();
    var map = {};
    var upStocks = 0, downStocks = 0;
    rows.forEach(function (r) {
      var q = r.quote;
      if (!q || !isNum(q.chgPct) || !r.personaCode) return;
      if (q.chgPct > 0) upStocks += 1;
      else if (q.chgPct < 0) downStocks += 1;
      var a = map[r.personaCode] || (map[r.personaCode] = {
        code: r.personaCode, n: 0, sum: 0, up: 0, down: 0, best: null, worst: null
      });
      a.n += 1;
      a.sum += q.chgPct;
      if (q.chgPct > 0) a.up += 1; else if (q.chgPct < 0) a.down += 1;
      if (!a.best || q.chgPct > a.best.chg) a.best = { name: r.name, chg: q.chgPct };
      if (!a.worst || q.chgPct < a.worst.chg) a.worst = { name: r.name, chg: q.chgPct };
    });
    var list = Object.keys(map).map(function (k) {
      var a = map[k];
      a.avg = a.sum / a.n;
      return a;
    }).sort(function (x, y) { return y.avg - x.avg; });
    return { list: list, upStocks: upStocks, downStocks: downStocks };
  }

  function barWidth(v, maxAbs) {
    if (!maxAbs) return 0;
    return Math.max(3, Math.round(Math.abs(v) / maxAbs * 50));
  }

  function rankRow(a, i, maxAbs) {
    var dir = a.avg > 0 ? "up" : a.avg < 0 ? "down" : "flat";
    var tip = a.n + " 只 · 涨 " + a.up + " 跌 " + a.down +
      " · 最爽 " + a.best.name + " " + pct(a.best.chg) +
      " · 最惨 " + a.worst.name + " " + pct(a.worst.chg);
    return '<div class="wb-rank-row" data-dir="' + dir + '" title="' + esc(tip) + '">' +
      '<span class="wb-rank-pos">' + (i + 1) + "</span>" +
      '<span class="wb-rank-name"><b>' + esc(a.code) + "</b>" + esc(NAME_OF[a.code] || "") + "</span>" +
      '<span class="wb-rank-track"><i class="is-' + dir + '" style="width:' + barWidth(a.avg, maxAbs) + '%"></i></span>' +
      '<span class="wb-rank-val is-' + dir + '">' + pct(a.avg) + "</span>" +
      '<span class="wb-rank-n">' + a.n + " 只</span>" +
      "</div>";
  }

  function renderRank() {
    var box = $("wb-rank");
    if (!box) return;
    var agg = aggregate();
    if (!agg.list.length) { box.hidden = true; return; }
    box.hidden = false;

    var downTypes = agg.list.filter(function (a) { return a.avg < 0; }).length;
    var upTypes = agg.list.filter(function (a) { return a.avg > 0; }).length;
    var flatTypes = agg.list.length - upTypes - downTypes;
    var mood = agg.upStocks > agg.downStocks * 1.4 ? "普涨日"
      : agg.downStocks > agg.upStocks * 1.4 ? "集体挨打日" : "分化日";
    var meta = $("wb-rank-meta");
    if (meta) meta.textContent = mood + " · " + agg.list.length + " 型 · " + (agg.upStocks + agg.downStocks) + " 只有当日行情";

    var lead = $("wb-rank-lead");
    if (lead) {
      lead.innerHTML = "全池 <b>" + agg.upStocks + "</b> 只上涨、<b>" + agg.downStocks + "</b> 只下跌，" +
        "16 型里 <b>" + upTypes + "</b> 型平均收涨、<b>" + downTypes + "</b> 型平均收跌" +
        (flatTypes ? "、<b>" + flatTypes + "</b> 型持平" : "") + "。" +
        "最爽的是 <b>" + esc(agg.list[0].code) + " " + esc(NAME_OF[agg.list[0].code] || "") + "</b>（" + pct(agg.list[0].avg) + "），" +
        "最惨的是 <b>" + esc(agg.list[agg.list.length - 1].code) + " " + esc(NAME_OF[agg.list[agg.list.length - 1].code] || "") +
        "</b>（" + pct(agg.list[agg.list.length - 1].avg) + "）。";
    }

    var maxAbs = agg.list.reduce(function (m, a) { return Math.max(m, Math.abs(a.avg)); }, 0);
    var collapsed = !rankOpen && agg.list.length > 6;
    var shown = collapsed ? agg.list.slice(0, 3).concat(agg.list.slice(-3)) : agg.list;
    var parts = [];
    shown.forEach(function (a, idx) {
      if (collapsed && idx === 3) {
        parts.push('<p class="wb-rank-gap">中间 ' + (agg.list.length - 6) + " 型省略</p>");
      }
      parts.push(rankRow(a, agg.list.indexOf(a), maxAbs));
    });
    $("wb-rank-body").innerHTML = parts.join("");

    /* 今日之最：三条固定看点，方便一眼扫完截图 */
    var most = $("wb-rank-top");
    if (most) {
      var best = agg.list[0], worst = agg.list[agg.list.length - 1];
      /* 最分裂 = 同型里涨跌家数最接近的一型，说明这一型内部走势最不一致 */
      var split = agg.list.slice().sort(function (x, y) {
        return Math.abs(x.up - x.down) - Math.abs(y.up - y.down);
      })[0];
      most.innerHTML =
        '<div class="wb-rank-pick"><span class="wb-rank-tag is-up">最爽</span><b>' + esc(best.code) + " " + esc(NAME_OF[best.code] || "") +
        "</b><span>平均 " + pct(best.avg) + "，代言股 " + esc(best.best.name) + " " + pct(best.best.chg) + "</span></div>" +
        '<div class="wb-rank-pick"><span class="wb-rank-tag is-down">最惨</span><b>' + esc(worst.code) + " " + esc(NAME_OF[worst.code] || "") +
        "</b><span>平均 " + pct(worst.avg) + "，拖后腿的是 " + esc(worst.worst.name) + " " + pct(worst.worst.chg) + "</span></div>" +
        '<div class="wb-rank-pick"><span class="wb-rank-tag is-flat">最分裂</span><b>' + esc(split.code) + " " + esc(NAME_OF[split.code] || "") +
        "</b><span>" + split.n + " 只里 " + split.up + " 涨 " + split.down + " 跌" +
        (split.n - split.up - split.down > 0 ? " " + (split.n - split.up - split.down) + " 平" : "") +
        "，同型不同命</span></div>";
    }

    var toggle = $("wb-rank-toggle");
    if (toggle) {
      toggle.textContent = rankOpen ? "收起，只看头尾" : "展开全部 " + agg.list.length + " 型";
      toggle.setAttribute("aria-expanded", String(rankOpen));
    }
  }

  /* ---------- 二、一键预设 ---------- */

  var FILTER_IDS = ["wb-search", "wb-group", "wb-index", "wb-style", "wb-pe-min", "wb-pe-max",
    "wb-mcap-min", "wb-amount-min", "wb-turnover-min", "wb-turnover-max", "wb-chg", "wb-fav-only"];

  var PRESETS = {
    farmer: {
      label: "抄底老农",
      tip: "低估值、换手安静、体量不小：便宜又没人抢的那种",
      values: { "wb-pe-max": "12", "wb-turnover-max": "3", "wb-mcap-min": "500" }
    },
    elephant: {
      label: "大象慢走",
      tip: "市值 2000 亿以上、换手低于 2%：几乎不动，但也不折腾你",
      values: { "wb-mcap-min": "2000", "wb-turnover-max": "2" }
    },
    casino: {
      label: "高换手赌场",
      tip: "换手 8% 以上、成交额 5 亿以上：人声鼎沸的地方",
      values: { "wb-turnover-min": "8", "wb-amount-min": "5" }
    },
    red: {
      label: "只看红盘",
      tip: "当日上涨、成交额 3 亿以上：先看谁在涨，再问为什么",
      values: { "wb-chg": "up", "wb-amount-min": "3" }
    }
  };

  function applyPreset(key) {
    var preset = PRESETS[key];
    if (!preset) return;
    var values = {};
    FILTER_IDS.forEach(function (id) { values[id] = id === "wb-fav-only" ? false : ""; });
    Object.keys(preset.values).forEach(function (id) { values[id] = preset.values[id]; });
    W.applyFilters(values);
    renderRank();
    var note = $("wb-preset-note");
    if (note) {
      var m = String(W.countText() || "").match(/筛选结果\s*(\d+)\s*只/);
      note.innerHTML = "已套用「" + esc(preset.label) + "」" + (m ? "，命中 <b>" + m[1] + "</b> 只" : "") +
        "　<span>" + esc(preset.tip) + "</span>";
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-preset]"), function (b) {
      b.classList.toggle("is-on", b.getAttribute("data-preset") === key);
    });
  }

  function bindPresets() {
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-preset]") : null;
      if (!btn) return;
      var key = btn.getAttribute("data-preset");
      if (btn.classList.contains("is-on")) {
        /* 再点一次收回：把条件清空，回到全池 */
        var blank = {};
        FILTER_IDS.forEach(function (id) { blank[id] = id === "wb-fav-only" ? false : ""; });
        W.applyFilters(blank);
        btn.classList.remove("is-on");
        var note = $("wb-preset-note");
        if (note) note.textContent = "已清空预设，回到全池。";
        renderRank();
        return;
      }
      applyPreset(key);
    });
  }

  /* ---------- 三、人格嘴替 ---------- */

  function bindQuip() {
    var tip = document.createElement("div");
    tip.className = "wb-quip";
    tip.hidden = true;
    document.body.appendChild(tip);

    var codeOf = {};
    W.rows().forEach(function (r) { if (r.personaCode) codeOf[r.code] = r.personaCode; });

    function show(el) {
      var code = codeOf[el.getAttribute("data-card")];
      var line = code && QUIP[code];
      if (!line) return;
      tip.innerHTML = "<b>" + esc(code) + "</b>" + esc(line);
      tip.hidden = false;
      var r = el.getBoundingClientRect();
      var width = 268;
      var left = Math.max(10, Math.min(r.left, window.innerWidth - width - 12));
      var top = r.bottom + 8;
      if (top + 76 > window.innerHeight) top = r.top - 76;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }
    function hide() { tip.hidden = true; }

    document.addEventListener("mouseover", function (e) {
      var el = e.target && e.target.closest ? e.target.closest(".wb-ptag") : null;
      if (el) show(el); else hide();
    });
    document.addEventListener("mouseout", function (e) {
      var el = e.target && e.target.closest ? e.target.closest(".wb-ptag") : null;
      if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) hide();
    });
    document.addEventListener("focusin", function (e) {
      var el = e.target && e.target.closest ? e.target.closest(".wb-ptag") : null;
      if (el) show(el);
    });
    document.addEventListener("focusout", function (e) {
      var el = e.target && e.target.closest ? e.target.closest(".wb-ptag") : null;
      if (el) hide();
    });
    window.addEventListener("scroll", hide, true);
    document.addEventListener("click", hide, true);
  }

  /* ---------- 启动 ---------- */

  function boot() {
    renderRank();
    bindPresets();
    bindQuip();
    var toggle = $("wb-rank-toggle");
    if (toggle) toggle.addEventListener("click", function () {
      rankOpen = !rankOpen;
      renderRank();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.GBTI_PLUS = { renderRank: renderRank, applyPreset: applyPreset, QUIP: QUIP, _internal: { aggregate: aggregate } };
})();
