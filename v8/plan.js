/**
 * 资产配置建议渲染与交互。与 radar.js 同级，只负责把 allocation.js 算出的结果画到页面上。
 * 所有数字都来自 allocation.js 的规则表，本文件不生成任何新的比例或标的，只负责呈现与排序。
 * 配色从 CSS 变量读取，以便深浅主题自动切换。
 */
(function () {
  "use strict";

  const $ = function (id) { return document.getElementById(id); };

  /* ---------- 状态 ---------- */

  let basePlan = null;      // allocation.js 产出的原始方案
  let baseAllocation = [];  // 规则基准比例，微调时以它为起点
  let selectedSleeve = null; // 已点选的资产类别，null 表示未选中
  let hoverSleeve = null;    // 鼠标悬停的类别
  let offset = 0;            // 情景调整的权益偏移量
  let sortKey = "score";     // 标的排序方式
  let expanded = {};         // 每张标的卡的展开状态

  const OFFSETS = [
    { delta: 0, label: "规则默认", desc: "完全按测试结果给出的比例" },
    { delta: -10, label: "更保守", desc: "权益下调 10 个百分点" },
    { delta: 10, label: "更进取", desc: "权益上调 10 个百分点" }
  ];

  const SORT_NAME = { score: "匹配度", pePct: "估值分位", amount: "成交额" };

  /* 把百分比换成一万块里的具体金额：按最大余额法分配，四份相加正好等于总额。 */
  const SAMPLE_TOTAL = 10000;
  function moneySplit(allocation) {
    const list = allocation || [];
    const base = list.map(function (s) {
      const exact = SAMPLE_TOTAL * s.pct / 100;
      return { key: s.key, n: Math.floor(exact), frac: exact - Math.floor(exact) };
    });
    let rest = SAMPLE_TOTAL - base.reduce(function (a, b) { return a + b.n; }, 0);
    base.slice().sort(function (a, b) { return b.frac - a.frac; }).forEach(function (r) {
      if (rest > 0) { r.n += 1; rest -= 1; }
    });
    const out = {};
    base.forEach(function (r) { out[r.key] = r.n; });
    return out;
  }
  function moneyText(n) {
    return "¥" + Number(n).toLocaleString("en-US");
  }

  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const pick = function (name, fallback) {
      const v = (cs.getPropertyValue(name) || "").trim();
      return v || fallback;
    };
    return {
      equity: pick("--c-equity", "#c44236"),
      bond: pick("--c-bond", "#416e83"),
      money: pick("--c-money", "#6b8f71"),
      gold: pick("--c-gold", "#cf9b3f"),
      ink: pick("--ink", "#332e28"),
      muted: pick("--muted", "#746b60"),
      line: pick("--line", "#e7dfd2"),
      surface: pick("--surface", "#ffffff")
    };
  }

  /* ---------- 环形图 ---------- */

  function drawDonut(canvas, allocation) {
    if (!canvas || !allocation) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const size = 360;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "auto";

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const pal = palette();
    const cx = size / 2;
    const cy = size / 2;
    const outer = size * 0.44;
    const inner = size * 0.28;
    const colorOf = { equity: pal.equity, bond: pal.bond, money: pal.money, gold: pal.gold };
    const highlight = hoverSleeve || selectedSleeve;

    let start = -Math.PI / 2;
    const gap = 0.022;
    allocation.forEach(function (sleeve) {
      const span = (sleeve.pct / 100) * Math.PI * 2;
      const on = sleeve.key === highlight;
      const o = on ? outer + 9 : outer;
      const i = on ? inner - 3 : inner;

      ctx.globalAlpha = highlight && !on ? 0.42 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, o, start + gap / 2, start + span - gap / 2, false);
      ctx.arc(cx, cy, i, start + span - gap / 2, start + gap / 2, true);
      ctx.closePath();
      ctx.fillStyle = colorOf[sleeve.key] || pal.muted;
      ctx.fill();
      start += span;
    });
    ctx.globalAlpha = 1;
  }

  // 把点击位置换算成比例位置（0～1，从正上方顺时针），用于判定命中哪一类资产。
  function fractionAt(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return null;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const r = Math.sqrt(dx * dx + dy * dy) / rect.width;
    if (r > 0.48 || r < 0.20) return null;
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    return angle / (Math.PI * 2);
  }

  function sleeveAt(point, allocation) {
    if (point === null) return null;
    let acc = 0;
    for (let i = 0; i < allocation.length; i++) {
      const span = allocation[i].pct / 100;
      if (point >= acc && point < acc + span) return allocation[i].key;
      acc += span;
    }
    return null;
  }

  function bindDonut() {
    const canvas = $("plan-donut");
    if (!canvas || canvas.dataset.bound === "1") return;
    canvas.dataset.bound = "1";

    canvas.style.cursor = "pointer";
    canvas.addEventListener("mousemove", function (event) {
      const key = sleeveAt(fractionAt(canvas, event.clientX, event.clientY), basePlan ? basePlan.allocation : []);
      if (key === hoverSleeve) return;
      hoverSleeve = key;
      syncHighlight();
    });
    canvas.addEventListener("mouseleave", function () {
      if (!hoverSleeve) return;
      hoverSleeve = null;
      syncHighlight();
    });
    canvas.addEventListener("click", function (event) {
      const key = sleeveAt(fractionAt(canvas, event.clientX, event.clientY), basePlan ? basePlan.allocation : []);
      if (key) selectSleeve(selectedSleeve === key ? null : key);
    });
  }

  /* ---------- 选中联动 ---------- */

  function selectSleeve(key) {
    selectedSleeve = key;
    syncHighlight();
  }

  function syncHighlight() {
    if (!basePlan) return;
    const highlight = hoverSleeve || selectedSleeve;
    const sleeve = highlight
      ? basePlan.allocation.filter(function (s) { return s.key === highlight; })[0]
      : null;

    const value = $("plan-equity");
    const label = $("plan-donut-label");
    const amounts = moneySplit(basePlan.allocation);
    if (value) value.textContent = sleeve ? moneyText(amounts[sleeve.key] || 0) : moneyText(SAMPLE_TOTAL);
    if (label) label.textContent = sleeve ? sleeve.name + " " + sleeve.pct + "%" : "示例总额 · 四类合计";

    document.querySelectorAll(".plan-bar").forEach(function (li) {
      li.classList.toggle("is-on", li.dataset.sleeve === highlight);
      const btn = li.querySelector(".pb-btn");
      if (btn) btn.setAttribute("aria-pressed", li.dataset.sleeve === selectedSleeve ? "true" : "false");
    });
    document.querySelectorAll(".plan-vehicle").forEach(function (li) {
      li.classList.toggle("is-on", li.dataset.sleeve === highlight);
    });

    drawDonut($("plan-donut"), basePlan.allocation);
  }

  function equityPctText() {
    const equity = basePlan.allocation.filter(function (s) { return s.key === "equity"; })[0];
    return equity ? equity.pct + "%" : "--";
  }

  /* ---------- 各区块 ---------- */

  /* 配置区门面：先用人物与四维交代「你是什么人」，再给数字。 */
  function renderHero(outcome) {
    const box = $("plan-hero");
    if (!box) return;
    const look = window.GBTI_LOOK;
    const p = outcome && outcome.personality;
    if (!look || !p) { box.hidden = true; return; }
    box.hidden = false;
    const fig = $("plan-hero-figure");
    if (fig) fig.innerHTML = look.figure(p.code) || "";
    const name = $("plan-hero-name");
    if (name) name.textContent = p.name + "　" + p.code;
    const desc = $("plan-hero-desc");
    if (desc) desc.textContent = p.motto || "";
    const axes = $("plan-hero-axes");
    if (!axes) return;
    const scores = outcome.scores || {};
    const dims = typeof dimensions !== "undefined" ? dimensions : [];
    axes.innerHTML = dims.map(function (d) {
      const l = Number(scores[d.left]) || 0;
      const r = Number(scores[d.right]) || 0;
      const total = l + r || 1;
      const lw = Math.round(l / total * 100);
      const rw = 100 - lw;
      return '<div class="gb-axis">' +
        '<div class="gb-axis-head"><span>' + d.leftName + " <b>" + l + "</b></span>" +
        '<span class="gb-axis-r"><b>' + r + "</b> " + d.rightName + "</span></div>" +
        '<span class="gb-axis-track"><i class="gb-axis-l-fill" style="width:' + lw + '%"></i>' +
        '<i class="gb-axis-r-fill" style="width:' + rw + '%"></i></span></div>';
    }).join("");
  }

  function renderBars(allocation) {
    const box = $("plan-bars");
    if (!box) return;
    box.replaceChildren();
    allocation.forEach(function (sleeve) {
      const li = document.createElement("li");
      li.className = "plan-bar";
      li.dataset.sleeve = sleeve.key;

      const btn = document.createElement("button");
      btn.className = "pb-btn";
      btn.type = "button";
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", sleeve.name + " " + sleeve.pct + "%，点击查看对应载体");

      const amounts = moneySplit(allocation);

      const head = document.createElement("span");
      head.className = "pb-head";
      const dot = document.createElement("span");
      dot.className = "pb-dot";
      const name = document.createElement("span");
      name.className = "pb-name";
      name.textContent = sleeve.name;
      const money = document.createElement("strong");
      money.className = "pb-money";
      money.textContent = moneyText(amounts[sleeve.key] || 0);
      head.append(dot, name, money);

      const track = document.createElement("span");
      track.className = "pb-track";
      const fill = document.createElement("span");
      fill.className = "pb-fill";
      // 直接给最终宽度：条形长度是可核验的信息，不能因为动画没跑而变成空条。
      // 用户手动微调时，transition 仍会让宽度平滑变化。
      fill.style.width = sleeve.pct + "%";
      track.appendChild(fill);

      const note = document.createElement("span");
      note.className = "pb-note";
      const noteText = document.createElement("span");
      noteText.textContent = sleeve.note;
      const pct = document.createElement("span");
      pct.className = "pb-pct";
      pct.textContent = sleeve.pct + "%";
      note.append(noteText, pct);

      btn.append(head, track, note);
      btn.addEventListener("click", function () {
        selectSleeve(selectedSleeve === sleeve.key ? null : sleeve.key);
      });
      li.appendChild(btn);
      box.appendChild(li);
    });
  }

  function renderVehicles(plan) {
    const box = $("plan-vehicles");
    if (!box) return;
    box.replaceChildren();
    plan.funds.forEach(function (item) {
      const li = document.createElement("li");
      li.className = "plan-vehicle";
      li.dataset.sleeve = item.key;

      const top = document.createElement("div");
      top.className = "pv-top";
      const name = document.createElement("strong");
      name.textContent = item.vehicle;
      const code = document.createElement("span");
      code.className = "pv-code";
      code.textContent = item.code || "";
      top.append(name, code);

      const why = document.createElement("p");
      why.className = "pv-why";
      why.textContent = item.why;

      li.append(top, why);
      li.addEventListener("click", function () {
        selectSleeve(selectedSleeve === item.key ? null : item.key);
      });
      box.appendChild(li);
    });

    /* 权益类不走 ETF，直接落在下方示例标的上；不解释一句，右侧卡片会显得空。 */
    const equity = (plan.allocation || []).filter(function (s) { return s.key === "equity"; })[0];
    const note = document.createElement("div");
    note.className = "pv-equity-note";
    const noteTitle = document.createElement("strong");
    noteTitle.textContent = "权益类 · " + (equity ? equity.pct + "%" : "--");
    const noteText = document.createElement("p");
    noteText.textContent = "最大的一块不用 ETF 代替，直接拆到下方 5 只示例标的上，各占一份。";
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "pv-jump";
    jump.textContent = "看下方标的 ↓";
    jump.addEventListener("click", function () {
      const list = $("plan-stocks");
      if (list && list.scrollIntoView) list.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    note.append(noteTitle, noteText, jump);
    box.appendChild(note);

    /* 进攻 / 防守的比例尺：一眼看出这套分法是偏守还是偏攻。 */
    const alloc = plan.allocation || [];
    const equityPct = alloc.filter(function (s) { return s.key === "equity"; })
      .reduce(function (a, b) { return a + b.pct; }, 0);
    const defendPct = 100 - equityPct;
    const balance = document.createElement("div");
    balance.className = "pv-balance";
    const balanceTitle = document.createElement("p");
    balanceTitle.className = "pv-balance-title";
    balanceTitle.textContent = "进攻 / 防守";
    const bar = document.createElement("div");
    bar.className = "pv-balance-bar";
    const off = document.createElement("i");
    off.className = "pv-off";
    off.style.width = equityPct + "%";
    const def = document.createElement("i");
    def.className = "pv-def";
    def.style.width = defendPct + "%";
    bar.append(off, def);
    const legend = document.createElement("div");
    legend.className = "pv-balance-legend";
    const l1 = document.createElement("span");
    l1.textContent = "进攻 " + equityPct + "%";
    const l2 = document.createElement("span");
    l2.textContent = "防守 " + defendPct + "%";
    legend.append(l1, l2);
    balance.append(balanceTitle, bar, legend);
    box.appendChild(balance);
  }

  function fmt(value, digits, suffix) {
    if (typeof value !== "number" || isNaN(value)) return "--";
    return value.toFixed(digits) + (suffix || "");
  }

  // 小于 1% 的分位保留一位小数，否则取整。
  function fmtPct(value) {
    if (typeof value !== "number" || isNaN(value)) return "--";
    return (value < 1 ? value.toFixed(1) : String(Math.round(value))) + "%";
  }

  /* ---------- 标的列表 ---------- */

  function sortedStocks() {
    if (!basePlan) return [];
    const list = basePlan.stocks.slice();
    if (sortKey === "pePct") {
      list.sort(function (a, b) {
        const av = typeof a.metrics.pePct === "number" ? a.metrics.pePct : Infinity;
        const bv = typeof b.metrics.pePct === "number" ? b.metrics.pePct : Infinity;
        return av - bv;
      });
    } else if (sortKey === "amount") {
      list.sort(function (a, b) {
        return (b.metrics.amountYi || 0) - (a.metrics.amountYi || 0);
      });
    } else {
      list.sort(function (a, b) { return b.score - a.score; });
    }
    return list;
  }

  function stockPlainText(item) {
    const m = item.metrics;
    return [
      item.name + "（" + item.code + "）　" + item.industry,
      "匹配度 " + item.score.toFixed(1) + "／100　风格：" + item.styleName,
      "收盘 " + fmt(m.close, 2) + "　涨跌 " + (typeof m.chgPct === "number" && m.chgPct >= 0 ? "+" : "") + fmt(m.chgPct, 2, "%"),
      "滚动市盈率 " + fmt(m.pe, 1, " 倍") + "　PE 历史分位 " + fmtPct(m.pePct),
      "换手率 " + fmt(m.turnover, 2, "%") + "　成交额 " + fmt(m.amountYi, 1, " 亿"),
      "入选理由：" + item.reasons.join("；"),
      "行情截止 " + (m.date || "--") + "。仅为与风格相符的示例，不构成推荐。"
    ].join("\n");
  }

  function renderStocks(plan) {
    const box = $("plan-stock-list");
    if (!box) return;
    box.replaceChildren();

    sortedStocks().forEach(function (item, index) {
      const li = document.createElement("li");
      li.className = "plan-stock";
      li.dataset.code = item.code;
      li.dataset.open = expanded[item.code] ? "true" : "false";

      const bodyId = "ps-body-" + item.code.replace(/[^0-9A-Za-z]/g, "");
      const m = item.metrics;

      /* 折叠头：整行可点击 */
      const toggle = document.createElement("button");
      toggle.className = "ps-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", expanded[item.code] ? "true" : "false");
      toggle.setAttribute("aria-controls", bodyId);
      toggle.setAttribute("aria-label", item.name + "，匹配度 " + item.score.toFixed(1) + "，点击展开入选理由");

      const rank = document.createElement("span");
      rank.className = "ps-rank";
      rank.textContent = String(index + 1).padStart(2, "0");

      const name = document.createElement("span");
      name.className = "ps-name";
      name.textContent = item.name;

      const code = document.createElement("span");
      code.className = "ps-code";
      code.textContent = item.code;

      const industry = document.createElement("span");
      industry.className = "ps-industry";
      industry.textContent = item.industry;

      const chg = document.createElement("span");
      chg.className = "ps-chg " + (typeof m.chgPct === "number" && m.chgPct < 0 ? "down" : "up");
      chg.textContent = (typeof m.chgPct === "number" && m.chgPct >= 0 ? "+" : "") + fmt(m.chgPct, 2, "%");

      const meter = document.createElement("span");
      meter.className = "ps-meter";
      const meterFill = document.createElement("span");
      meterFill.className = "ps-meter-fill";
      meterFill.style.width = Math.max(4, Math.min(100, item.score)) + "%";
      meter.appendChild(meterFill);

      const score = document.createElement("span");
      score.className = "ps-score";
      score.textContent = item.score.toFixed(1);
      score.title = "匹配度：按风格归属、估值位置与流动性三项加权得出，满分 100，用于本页内部排序，不是收益预测。";

      const chev = document.createElement("span");
      chev.className = "ps-chev";
      chev.setAttribute("aria-hidden", "true");

      toggle.append(rank, name, code, industry, chg, meter, score, chev);
      toggle.addEventListener("click", function () {
        expanded[item.code] = !expanded[item.code];
        applyExpanded(li, item.code, bodyId, toggle);
      });

      /* 指标行，始终可见 */
      const metrics = document.createElement("div");
      metrics.className = "ps-metrics";
      [
        ["收盘", fmt(m.close, 2)],
        ["滚动市盈率", fmt(m.pe, 1, " 倍")],
        ["PE 历史分位", fmtPct(m.pePct)],
        ["换手率", fmt(m.turnover, 2, "%")],
        ["成交额", fmt(m.amountYi, 1, " 亿")],
        ["行情日期", m.date || "--"]
      ].forEach(function (pair) {
        const cell = document.createElement("span");
        cell.className = "ps-metric";
        const label = document.createElement("em");
        label.textContent = pair[0];
        const value = document.createElement("b");
        value.textContent = pair[1];
        cell.append(label, value);
        metrics.appendChild(cell);
      });

      /* 折叠体：入选理由与复制 */
      const body = document.createElement("div");
      body.className = "ps-body";
      body.id = bodyId;
      body.hidden = !expanded[item.code];

      const reasons = document.createElement("ul");
      reasons.className = "ps-reasons";
      item.reasons.forEach(function (text) {
        const r = document.createElement("li");
        r.textContent = text;
        reasons.appendChild(r);
      });

      const actions = document.createElement("div");
      actions.className = "ps-actions";
      const copy = document.createElement("button");
      copy.className = "pill-button ps-copy";
      copy.type = "button";
      copy.textContent = "复制这只标的的信息";
      copy.addEventListener("click", function (event) {
        event.stopPropagation();
        writeClipboard(stockPlainText(item), copy, "已复制");
      });
      actions.appendChild(copy);

      body.append(reasons, actions);
      li.append(toggle, metrics, body);
      li.setAttribute("data-rise", String(Math.min(index, 6) * 45));
      box.appendChild(li);
    });

    if (window.GBTI_LOOK) window.GBTI_LOOK.reveal(box);
  }

  function applyExpanded(li, codeValue, bodyId, toggle) {
    const body = document.getElementById(bodyId);
    const open = Boolean(expanded[codeValue]);
    li.dataset.open = open ? "true" : "false";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (body) body.hidden = !open;
  }

  // 排序控件的状态同步与事件绑定分离，避免重复渲染时叠加监听。
  function renderSort() {
    const group = $("plan-sort");
    const expandBtn = $("plan-expand");

    if (group && group.dataset.bound !== "1") {
      group.dataset.bound = "1";
      group.querySelectorAll(".seg-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (sortKey === btn.dataset.sort) return;
          sortKey = btn.dataset.sort;
          syncSort();
          renderStocks(basePlan);
          const lead = $("plan-stocks-lead");
          if (lead) lead.textContent = stocksLeadText();
        });
      });
    }
    if (expandBtn && expandBtn.dataset.bound !== "1") {
      expandBtn.dataset.bound = "1";
      expandBtn.addEventListener("click", function () {
        const turnOn = expandBtn.getAttribute("aria-pressed") !== "true";
        expandBtn.setAttribute("aria-pressed", turnOn ? "true" : "false");
        expandBtn.textContent = turnOn ? "收起全部理由" : "展开全部理由";
        (basePlan ? basePlan.stocks : []).forEach(function (item) { expanded[item.code] = turnOn; });
        renderStocks(basePlan);
      });
    }
    syncSort();
  }

  function syncSort() {
    const group = $("plan-sort");
    if (group) {
      group.querySelectorAll(".seg-btn").forEach(function (btn) {
        const on = btn.dataset.sort === sortKey;
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    const expandBtn = $("plan-expand");
    if (expandBtn) {
      const allOpen = basePlan && basePlan.stocks.length > 0
        && basePlan.stocks.every(function (item) { return expanded[item.code]; });
      expandBtn.setAttribute("aria-pressed", allOpen ? "true" : "false");
      expandBtn.textContent = allOpen ? "收起全部理由" : "展开全部理由";
    }
  }

  /* ---------- 情景微调 ---------- */

  function renderTweaks() {
    const box = $("plan-tweaks");
    if (!box) return;
    box.replaceChildren();
    OFFSETS.forEach(function (option) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "tweak-btn";
      btn.type = "button";
      const on = option.delta === offset;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");

      const label = document.createElement("strong");
      label.textContent = option.label;
      const desc = document.createElement("span");
      desc.textContent = option.desc;
      const preview = document.createElement("b");
      const trial = window.GBTI_ALLOC
        ? window.GBTI_ALLOC.withOffset(baseAllocation, option.delta)
        : baseAllocation;
      const eq = trial.filter(function (s) { return s.key === "equity"; })[0];
      preview.textContent = "权益 " + (eq ? eq.pct : "--") + "%";
      btn.append(label, desc, preview);

      btn.addEventListener("click", function () {
        offset = option.delta;
        applyOffset();
      });
      li.appendChild(btn);
      box.appendChild(li);
    });

    const reset = $("plan-reset");
    if (reset) {
      reset.hidden = offset === 0;
      reset.onclick = function () {
        offset = 0;
        applyOffset();
      };
    }
  }

  // 把偏移量应用到基准比例上，并同步所有视图。
  function applyOffset() {
    if (!basePlan || !window.GBTI_ALLOC) return;
    basePlan.allocation = window.GBTI_ALLOC.withOffset(baseAllocation, offset);
    basePlan.tweak = offset
      ? {
        offset: offset,
        note: (offset > 0 ? "权益较规则基准上调 " : "权益较规则基准下调 ") + Math.abs(offset) + " 个百分点"
      }
      : null;

    renderBars(basePlan.allocation);
    renderTweaks();
    syncHighlight();

    const lead = $("plan-lead");
    if (lead) lead.textContent = planLeadText();
  }

  function planLeadText() {
    if (!basePlan) return "";
    const note = basePlan.tweak
      ? "　" + basePlan.tweak.note + "，这是你自己按实际情况做的调整，不是测试结果。"
      : "";
    return "你的风格标签是" + basePlan.styleName
      + "。下面四类资产的比例由风险偏好与持有周期两个维度算出，合计 100%。" + note;
  }

  function stocksLeadText() {
    if (!basePlan) return "";
    const order = sortKey === "score" ? "按匹配度"
      : (sortKey === "pePct" ? "按估值分位从低到高" : "按成交额从高到低");
    return "从候选池中按" + basePlan.styleName + "风格筛选出的 5 只标的，"
      + order + "排序。它们是与该风格相符的示例，不是推荐买入名单。点任意一行可展开入选理由。";
  }

  /* ---------- 纪律与风险 ---------- */

  function renderDiscipline(plan) {
    const title = $("plan-discipline-title");
    const box = $("plan-discipline-list");
    if (!box) return;
    if (title) title.textContent = plan.discipline.title;
    box.replaceChildren();
    plan.discipline.items.forEach(function (text) {
      const li = document.createElement("li");
      li.textContent = text;
      box.appendChild(li);
    });
    const card = $("plan-discipline");
    if (card) card.dataset.mode = plan.discipline.mode;

    const copy = $("plan-discipline-copy");
    if (copy) {
      copy.onclick = function () {
        writeClipboard(
          plan.discipline.title + "\n" + plan.discipline.items.map(function (t) { return "· " + t; }).join("\n"),
          copy,
          "已复制"
        );
      };
    }
  }

  function renderRisk(plan) {
    const box = $("plan-disclaimer");
    if (box) {
      box.replaceChildren();
      plan.disclaimer.forEach(function (text) {
        const li = document.createElement("li");
        li.textContent = text;
        box.appendChild(li);
      });
      box.classList.add("is-clamped");
    }
    const note = $("plan-data-note");
    if (note) note.textContent = plan.dataNote;

    const toggle = $("plan-risk-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "展开全文";
      toggle.onclick = function () {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? "收起" : "展开全文";
        if (box) box.classList.toggle("is-clamped", !open);
      };
    }
  }

  /* ---------- 剪贴板 ---------- */

  function writeClipboard(text, button, doneLabel) {
    const fallback = function () {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch (error) { /* 忽略。 */ }
      document.body.removeChild(area);
    };
    const flash = function (ok) {
      if (!button) return;
      const origin = button.textContent;
      button.textContent = ok ? doneLabel : "复制失败，请手动选择";
      button.classList.add("is-done");
      window.setTimeout(function () {
        button.textContent = origin;
        button.classList.remove("is-done");
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(true); }, function () { fallback(); flash(true); });
    } else {
      fallback();
      flash(true);
    }
  }

  function planPlainText() {
    if (!basePlan) return "";
    const lines = ["GBTI 资产配置建议（" + basePlan.styleName + "）", ""];
    lines.push("四类资产比例" + (basePlan.tweak ? "（" + basePlan.tweak.note + "）" : ""));
    basePlan.allocation.forEach(function (sleeve) {
      lines.push("  " + sleeve.name + " " + sleeve.pct + "%　" + sleeve.note);
    });
    lines.push("", "载体：");
    basePlan.funds.forEach(function (item) {
      lines.push("  " + item.name + "：" + item.vehicle + (item.code ? "（" + item.code + "）" : ""));
    });
    lines.push("", "与你风格相符的标的示例（" + (SORT_NAME[sortKey] || "匹配度") + "排序）");
    sortedStocks().forEach(function (item, index) {
      lines.push("  " + (index + 1) + ". " + item.name + "（" + item.code + "）" + item.industry
        + "　匹配度 " + item.score.toFixed(1));
      lines.push("     " + item.reasons.join("；"));
    });
    lines.push("", basePlan.discipline.title);
    basePlan.discipline.items.forEach(function (text) { lines.push("  " + text); });
    lines.push("", "风险提示");
    basePlan.disclaimer.forEach(function (text) { lines.push("  " + text); });
    lines.push(basePlan.dataNote);
    return lines.join("\n");
  }

  /* ---------- 入口 ---------- */

  function render(outcome) {
    if (!outcome || !outcome.axisCode) return false;

    // 这些常量由普通脚本以顶层 const 声明，只存在于全局词法作用域，不会挂到 window 上，必须用裸引用读取。
    const ALLOC = typeof GBTI_ALLOC !== "undefined" ? GBTI_ALLOC : null;
    const MARKET = typeof GBTI_MARKET !== "undefined" ? GBTI_MARKET : null;
    const POOL = typeof GBTI_POOL !== "undefined" ? GBTI_POOL : null;
    const FUNDS = typeof GBTI_POOL_FUND !== "undefined" ? GBTI_POOL_FUND : [];
    // 指数扩展池（pool-index.js，build-pool.py 生成）：没有人工风格标签，打分引擎按行情指标现场推导。
    const INDEX_POOL = typeof GBTI_POOL_INDEX !== "undefined" ? GBTI_POOL_INDEX : [];

    if (!ALLOC || !MARKET || !POOL) return false;

    const plan = ALLOC.buildPlan(outcome.axisCode, MARKET, POOL.concat(INDEX_POOL), FUNDS, 5);
    if (!basePlan || basePlan.axisCode !== plan.axisCode) {
      offset = 0;
      expanded = {};
      selectedSleeve = null;
      sortKey = "score";
    }
    basePlan = plan;
    baseAllocation = plan.allocation.map(function (sleeve) {
      return { key: sleeve.key, name: sleeve.name, note: sleeve.note, pct: sleeve.pct };
    });
    plan.allocation = ALLOC.withOffset(baseAllocation, offset);
    plan.tweak = offset
      ? {
        offset: offset,
        note: (offset > 0 ? "权益较规则基准上调 " : "权益较规则基准下调 ") + Math.abs(offset) + " 个百分点"
      }
      : null;

    const section = $("plan");
    if (section) section.hidden = false;
    const wbLink = $("plan-workbench");
    if (wbLink) wbLink.href = "workbench.html?code=" + outcome.axisCode;
    const hsLink = $("plan-history");
    if (hsLink) hsLink.href = "history.html?code=" + outcome.axisCode;

    const lead = $("plan-lead");
    if (lead) lead.textContent = planLeadText();
    const stocksLead = $("plan-stocks-lead");
    if (stocksLead) stocksLead.textContent = stocksLeadText();

    renderHero(outcome);
    renderBars(plan.allocation);
    renderVehicles(plan);
    renderTweaks();
    renderStocks(plan);
    renderDiscipline(plan);
    renderRisk(plan);
    renderSort();
    syncHighlight();

    const copy = $("plan-copy");
    if (copy) {
      copy.onclick = function () { writeClipboard(planPlainText(), copy, "已复制整套方案"); };
    }
    const ask = $("plan-ask");
    if (ask) {
      ask.onclick = function () {
        if (window.GBTI_AI) {
          window.GBTI_AI.open("我的配置是权益 " + equityPctText() + "，其余为债券、货币和黄金，能说明一下为什么这样分吗？");
        }
      };
    }
    bindDonut();
    return true;
  }

  function refresh() {
    if (basePlan) {
      drawDonut($("plan-donut"), basePlan.allocation);
      syncHighlight();
    }
  }

  function hide() {
    const section = $("plan");
    if (section) section.hidden = true;
    basePlan = null;
    baseAllocation = [];
    selectedSleeve = null;
    hoverSleeve = null;
    offset = 0;
    expanded = {};
  }

  window.GBTI_PLAN = {
    render: render,
    refresh: refresh,
    hide: hide,
    drawDonut: drawDonut,
    plainText: planPlainText,
    get plan() { return basePlan; }
  };
})();
