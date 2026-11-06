/**
 * GBTI 资产配置引擎
 *
 * 设计原则：所有数字由本文件的规则表算出，任何语言模型只负责措辞，不得生成新的比例或标的。
 * 因此同一份答卷任何时候生成的结果完全一致，每个数字都能追到具体规则。
 *
 * 四维分工：
 *   风险偏好 D / A  → 决定债券与黄金中枢（配置主轴）
 *   持有周期 L / S  → 在权益与货币之间做调整
 *   信息依据 F / M  → 决定筛选时的因子权重（估值位置 vs 流动性活跃度）
 *   决策方式 O / J  → 决定呈现方式（量化纪律清单 vs 情境权衡要点）
 */
(function (root) {
  "use strict";

  /* ---------- 资产类别 ---------- */

  const SLEEVES = [
    { key: "equity", name: "权益类", note: "A 股股票与股票型基金" },
    { key: "bond", name: "债券类", note: "国债、短融与信用债基金" },
    { key: "money", name: "货币类", note: "场内货币基金，随时可用" },
    { key: "gold", name: "黄金类", note: "黄金 ETF，与权益相关性低" }
  ];

  /* ---------- 大类比例规则表 ---------- */

  // 风险偏好决定中枢：稳健型权益中枢 32%，进取型 65%。
  // 黄金固定中枢 12% / 8%，取低相关对冲作用。货币由差额补足。
  const CENTER = {
    D: { equity: 32, bond: 40, gold: 12 },
    A: { equity: 65, bond: 17, gold: 8 }
  };

  // 持有周期在权益与货币之间平移 5 个百分点：长期多配权益，短期留更多流动性。
  const TERM_SHIFT = { L: 5, S: -5 };

  /* ---------- 风格桶 ---------- */

  const STYLE_NAME = {
    value: "价值稳健",
    quality: "质量成长",
    steady: "大盘稳健",
    trend: "趋势动量"
  };

  const STYLE_BY_AXIS = {
    F: { D: "value", A: "quality" },
    M: { D: "steady", A: "trend" }
  };

  function styleFor(code) {
    const basis = STYLE_BY_AXIS[code[0]];
    return basis ? basis[code[2]] : null;
  }

  /* ---------- 大类比例 ---------- */

  function allocationFor(code) {
    const risk = code.charAt(2) === "A" ? "A" : "D";   // 第三位是风险偏好
    const term = code.charAt(1) === "L" ? "L" : "S";   // 第二位是持有周期
    const center = CENTER[risk];
    const shift = TERM_SHIFT[term];

    const equity = center.equity + shift;
    const bond = center.bond;
    const gold = center.gold;
    const money = 100 - equity - bond - gold;

    const map = { equity: equity, bond: bond, money: money, gold: gold };
    return SLEEVES.map(function (sleeve) {
      return {
        key: sleeve.key,
        name: sleeve.name,
        note: sleeve.note,
        pct: map[sleeve.key]
      };
    });
  }

  /* ---------- 情景调整（使用者手动微调，仍由规则计算，不引入任何模型生成的数字） ---------- */

  // 权益比例按 delta 平移，货币类作为缓冲垫并保底 5%，
  // 缓冲不足时由债券与黄金按原比例吸收，结果四舍五入后仍严格合计 100%。
  function withOffset(allocation, delta) {
    const d = Number(delta) || 0;
    if (!d) {
      return allocation.map(function (sleeve) {
        return { key: sleeve.key, name: sleeve.name, note: sleeve.note, pct: sleeve.pct };
      });
    }

    const map = {};
    allocation.forEach(function (sleeve) { map[sleeve.key] = sleeve.pct; });

    const equity = clamp(map.equity + d, 5, 95);
    const money = clamp(map.money - d, 5, 100);
    const rest = 100 - equity - money;

    const otherBase = map.bond + map.gold;
    const bond = otherBase > 0 ? Math.round(rest * map.bond / otherBase) : rest;
    const gold = rest - bond;
    const next = { equity: equity, bond: bond, money: money, gold: gold };

    return allocation.map(function (sleeve) {
      return {
        key: sleeve.key,
        name: sleeve.name,
        note: sleeve.note,
        pct: next[sleeve.key]
      };
    });
  }

  /* ---------- 标的打分 ---------- */

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  // 换手率适配：长期持有偏好低换手，短期参与偏好换手适中偏高。
  function turnoverFit(turnover, term) {
    if (typeof turnover !== "number" || isNaN(turnover)) return 0.5;
    if (term === "L") return clamp((2.6 - turnover) / 2.2, 0, 1);
    return clamp(1 - Math.abs(turnover - 2.6) / 2.6, 0, 1);
  }

  // 指数扩展池的风格推导规则（只用当日快照里的可核验字段，阈值写明在这里）：
  //   value   价值稳健：0 < PE ≤ 15，或 0 < PB ≤ 1.5（绝对估值低）
  //   steady  大盘稳健：总市值 ≥ 2000 亿；或成交额 ≥ 20 亿且振幅 ≤ 2.5%（大且稳）
  //   trend   趋势动量：换手率 ≥ 2.5%，或振幅 ≥ 4.5%（交易活跃、弹性大）
  //   quality 质量成长：15 < PE ≤ 45 且振幅 ≤ 4%（估值有溢价但交易不狂热，近似代理）
  // quality 没有盈利能力数据可用，是最弱的一条代理规则，措辞上只做"归入"不做评价。
  function deriveStyles(q) {
    if (!q) return [];
    const out = [];
    const pe = q.pe, pb = q.pb, amp = q.amplitude, to = q.turnover, amt = q.amountYi, mcap = q.mcapYi;
    const hasNum = function (v) { return typeof v === "number" && !isNaN(v); };
    if ((hasNum(pe) && pe > 0 && pe <= 15) || (hasNum(pb) && pb > 0 && pb <= 1.5)) out.push("value");
    if ((hasNum(mcap) && mcap >= 2000)
        || (hasNum(amt) && amt >= 20 && (!hasNum(amp) || amp <= 2.5))) out.push("steady");
    if ((hasNum(to) && to >= 2.5) || (hasNum(amp) && amp >= 4.5)) out.push("trend");
    if (hasNum(pe) && pe > 15 && pe <= 45 && (!hasNum(amp) || amp <= 4)) out.push("quality");
    return out;
  }

  function scoreStock(item, quote, ctx) {
    const pePct = quote && typeof quote.pePct === "number" ? quote.pePct : null;
    const peAbs = quote && typeof quote.pe === "number" ? quote.pe : null;
    const amountYi = quote && typeof quote.amountYi === "number" ? quote.amountYi : 0;
    const turnover = quote ? quote.turnover : null;

    // A 风格匹配：属于该人格对应的风格桶。
    // 人工池（pool.js）自带 styles；指数扩展池（pool-index.js）没有标签，
    // 按当日行情指标现场推导（规则见下方 deriveStyles），并在结果里标注 derived。
    const styles = item.styles ? item.styles : deriveStyles(quote);
    const styleHit = styles.indexOf(ctx.style) >= 0 ? 1 : 0;

    // B 估值位置：优先 PE 历史分位（neodata 通道），越低越靠前；
    // 没有分位时（免密钥通道 / 指数扩展池）退回 PE 绝对值映射：PE 60 倍以上视为 0 分，
    // 亏损（PE 为负或缺）按中位处理。这样大池里低估值标的才能真正排到前面。
    const valuation = pePct !== null
      ? clamp(1 - pePct / 100, 0, 1)
      : (peAbs !== null && peAbs > 0 ? clamp(1 - peAbs / 60, 0.05, 1) : 0.5);

    // C 流动性与换手适配
    const liquidity = 0.55 * clamp(amountYi / 40, 0, 1) + 0.45 * turnoverFit(turnover, ctx.term);

    // 因子权重随信息依据变化：基本面型看估值，市场面型看流动性
    const w = ctx.basis === "F"
      ? { style: 0.40, valuation: 0.45, liquidity: 0.15 }
      : { style: 0.40, valuation: 0.20, liquidity: 0.40 };

    const score = 100 * (w.style * styleHit + w.valuation * valuation + w.liquidity * liquidity);

    return {
      code: item.code,
      name: item.name,
      industry: item.industry || null,
      styles: styles.slice(),
      derived: !item.styles,
      styleName: STYLE_NAME[ctx.style],
      score: Math.round(score * 10) / 10,
      metrics: {
        close: quote ? quote.close : null,
        chgPct: quote ? quote.chgPct : null,
        pe: quote ? quote.pe : null,
        pePct: pePct,
        pbPct: quote ? quote.pbPct : null,
        turnover: turnover,
        amountYi: amountYi,
        date: quote ? quote.date : null
      },
      parts: {
        style: Math.round(styleHit * w.style * 1000) / 10,
        valuation: Math.round(valuation * w.valuation * 1000) / 10,
        liquidity: Math.round(liquidity * w.liquidity * 1000) / 10
      }
    };
  }

  // 小于 1% 的分位保留一位小数，否则取整，避免出现“0%”这种看不出差别的写法。
  function formatPct(value) {
    if (typeof value !== "number" || isNaN(value)) return "--";
    return (value < 1 ? value.toFixed(1) : String(Math.round(value))) + "%";
  }

  // 入选理由必须引用可追溯的字段，不使用“表现优异”“质地优良”一类无法验证的措辞。
  function reasonsFor(pick) {
    const m = pick.metrics;
    const out = [];

    if (typeof m.pePct === "number") {
      const level = m.pePct <= 30 ? "处于历史偏低区间"
        : (m.pePct >= 70 ? "处于历史偏高区间" : "处于历史中间区间");
      out.push("滚动市盈率 " + (typeof m.pe === "number" ? m.pe.toFixed(1) : "--")
        + " 倍，位于该股自身历史 " + formatPct(m.pePct) + " 分位，" + level);
    }
    if (typeof m.amountYi === "number" && m.amountYi > 0) {
      out.push("成交额 " + m.amountYi.toFixed(1) + " 亿元，流动性" + (m.amountYi >= 30 ? "充裕" : "一般"));
    }
    if (typeof m.turnover === "number") {
      out.push("换手率 " + m.turnover.toFixed(2) + "%，" + (m.turnover <= 1.5 ? "换手偏低，更接近长期持有型标的" : "换手相对活跃"));
    }
    if (typeof m.pbPct === "number") {
      out.push("市净率历史分位 " + formatPct(m.pbPct));
    }
    if (pick.derived) {
      out.push("按当日行情指标归入" + STYLE_NAME[pick.styleKey] + "风格（指数扩展池标的，规则阈值见 allocation.js）");
    } else {
      out.push("按产品预设规则归入" + STYLE_NAME[pick.styleKey] + "风格");
    }
    return out;
  }

  function pickStocks(code, market, pool, count) {
    const ctx = {
      style: styleFor(code),
      basis: code[0] === "M" ? "M" : "F",
      term: code[1] === "S" ? "S" : "L"
    };
    const quotes = (market && market.quotes) || {};

    const scored = pool.map(function (item) {
      const quote = quotes[item.code] || null;
      const result = scoreStock(item, quote, ctx);
      result.styleKey = ctx.style;
      return result;
    });

    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.code < b.code ? -1 : 1;
    });

    // 同行业最多取 2 只，避免清单过度集中在单一行业。
    // 指数扩展池没有行业字段，用代码占位，相当于不参与行业限制。
    const industryCount = {};
    const picked = [];
    scored.forEach(function (item) {
      if (picked.length >= count) return;
      const indKey = item.industry || ("idx:" + item.code);
      const used = industryCount[indKey] || 0;
      if (used >= 2) return;
      industryCount[indKey] = used + 1;
      picked.push(item);
    });

    // 行业限制导致不足时按分数补齐，并如实标注。
    if (picked.length < count) {
      scored.forEach(function (item) {
        if (picked.length >= count) return;
        if (picked.indexOf(item) === -1) picked.push(item);
      });
    }

    picked.forEach(function (item) { item.reasons = reasonsFor(item); });
    return { ctx: ctx, picks: picked.slice(0, count) };
  }

  /* ---------- 债券 / 货币 / 黄金载体 ---------- */

  function vehicleFor(code, funds) {
    const term = code.charAt(1) === "S" ? "S" : "L";
    const bySleeve = {};
    funds.forEach(function (f) { bySleeve[f.sleeve] = f; });

    const bondLong = funds.filter(function (f) { return f.sleeve === "bond"; });

    return [
      {
        key: "bond",
        name: "债券类",
        vehicle: term === "L" ? "国债 ETF" : "短融 ETF",
        code: term === "L" ? (bondLong[0] ? bondLong[0].code : "") : (bondLong[1] ? bondLong[1].code : ""),
        why: term === "L" ? "久期较长，与长期持有的判断相匹配" : "久期短、波动小，便于随时调整"
      },
      {
        key: "money",
        name: "货币类",
        vehicle: bySleeve.money ? bySleeve.money.name : "场内货币基金",
        code: bySleeve.money ? bySleeve.money.code : "",
        why: "场内申购赎回方便，作为等待机会的现金仓位"
      },
      {
        key: "gold",
        name: "黄金类",
        vehicle: bySleeve.gold ? bySleeve.gold.name : "黄金 ETF",
        code: bySleeve.gold ? bySleeve.gold.code : "",
        why: "与 A 股权益相关性低，用于降低组合整体波动"
      }
    ];
  }

  /* ---------- 呈现方式：O 给纪律，J 给权衡 ---------- */

  function disciplineFor(code) {
    const isRule = code[3] === "O";
    const allocation = allocationFor(code);
    const equity = allocation[0].pct;

    if (isRule) {
      return {
        mode: "rule",
        title: "按规则执行的动作清单",
        items: [
          "再平衡阈值：任一类别实际占比偏离目标 " + equity + "% 超过 5 个百分点时调整回目标。",
          "单只标的上限：不超过权益仓位的 1/3，避免单一标的决定整体结果。",
          "行业上限：同一行业不超过权益仓位的 1/3。",
          "复核频率：每季度核对一次各类别实际占比与目标占比的偏离。"
        ]
      };
    }
    return {
      mode: "judge",
      title: "需要你自己权衡的几件事",
      items: [
        "这笔钱在未来多长时间内确定不用？如果一年内可能要用，权益比例应低于本页给出的中枢。",
        "清单里的行业你是否看得懂？看不懂的行业即使比例合适，也建议降低权重或换成宽基。",
        "出现多大回撤你会真正睡不着？按这个数字倒推权益上限，比按测试结果定上限更可靠。",
        "是否已有房产、房贷或其他集中持仓？如果有，本页的比例需要相应下调。"
      ]
    };
  }

  /* ---------- 风险提示（固定文案，不随人格变化） ---------- */

  const DISCLAIMER = [
    "本页内容基于公开数据与预设规则生成，用于自我探索与信息整理，不构成投资建议，也不构成对任何证券的推荐或要约。",
    "人格与资产配置的对应关系是产品设计规则，未经实证检验，不代表该配置适合你的实际情况。",
    "历史估值分位反映的是过去价格区间，不代表未来表现，也不代表估值会回归。",
    "本页不包含任何交易时机判断，不承诺收益，不代客理财。",
    "请结合自身资金状况、负债情况、收入稳定性与风险承受能力独立判断，必要时咨询持牌专业机构。"
  ];

  function dataNote(market) {
    if (!market) return "行情数据暂不可用。";
    return "行情数据截止 " + market.asOf + " 收盘，来源 " + market.source
      + "，抓取时间 " + market.fetchedAt + "。数据非实时，以交易所披露为准。";
  }

  /* ---------- 对外入口 ---------- */

  function buildPlan(code, market, pool, fundPool, count) {
    const n = count || 5;
    const allocation = allocationFor(code);
    const result = pickStocks(code, market, pool, n);
    return {
      axisCode: code,
      style: result.ctx.style,
      styleName: STYLE_NAME[result.ctx.style],
      allocation: allocation,
      stocks: result.picks,
      funds: vehicleFor(code, fundPool || []),
      discipline: disciplineFor(code),
      disclaimer: DISCLAIMER.slice(),
      dataNote: dataNote(market),
      asOf: market ? market.asOf : null,
      source: market ? market.source : null
    };
  }

  const API = {
    SLEEVES: SLEEVES,
    STYLE_NAME: STYLE_NAME,
    DISCLAIMER: DISCLAIMER,
    styleFor: styleFor,
    allocationFor: allocationFor,
    withOffset: withOffset,
    buildPlan: buildPlan,
    _internal: { scoreStock: scoreStock, turnoverFit: turnoverFit, pickStocks: pickStocks, deriveStyles: deriveStyles }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root) root.GBTI_ALLOC = API;
})(typeof window !== "undefined" ? window : null);
