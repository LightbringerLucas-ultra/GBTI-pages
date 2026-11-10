/* ==========================================================================
   GBTI 基金经理模拟器 · 一个季度
   --------------------------------------------------------------------------
   真行情：用 index-history.js 里 4 条风格指数的真实日线（中证红利 / 创业板指 /
   上证50 / 中证1000）做市场底子，每个交易日涨跌都是真的。
   真标的：408 只来自 pool.js + pool-index.js，人格、换手、振幅都是快照里的真值。
   假操作：你的买卖是虚构的，个股价格按「风格指数日收益 × 自身 β + 自身振幅决定的
   特质波动」重演，随机数全部由 seed 推导，同种子必然同结果。
   期末价格锚定快照里的真实收盘价，所以最后一格数字不是编的。

   不构成任何投资建议，也不承诺收益，纯教学用的历史重演。
   ========================================================================== */
(function (root) {
  "use strict";

  /* ---------- 常量 ---------- */

  var DAYS = 14;                 // 一局 14 个交易日
  var START_CASH = 1000000;      // 100 万
  var COMMISSION = 0.00025;      // 佣金万 2.5，最低 5 元
  var MIN_COMMISSION = 5;
  var STAMP = 0.0005;            // 卖出印花税
  var SLIP = 0.001;              // 滑点 0.1%
  var LIMIT = 10;                // 单日涨跌停 ±10%
  var MAX_POS = 4;               // 最多同时持有 4 只，够了但也不至于乱

  var STYLE_SERIES = { value: "sh000922", quality: "sz399006", steady: "sh000016", trend: "sh000852" };
  var STYLE_NAME = { value: "价值稳健", quality: "质量成长", steady: "大盘稳健", trend: "趋势动量" };
  var MARKET_SERIES = "sh000300";

  /* ---------- 随机：同种子同结果 ---------- */

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngFor(seed, key) { return mulberry32(hashStr(String(seed) + "|" + key)); }

  /* ---------- 世界：把行情、标的、指数日线揉成一份只读底稿 ---------- */

  function buildWorld(input) {
    var rows = input.rows || [];
    var market = input.market || null;
    var history = input.history || null;
    if (!history || !history.series) return null;

    var series = history.series;
    var dates = [];
    var ref = series[STYLE_SERIES.value];
    if (!ref || !ref.points || !ref.points.length) return null;
    ref.points.forEach(function (p) { dates.push(p[0]); });

    /* 每条风格指数的日收益（相对前一交易日，单位 %） */
    var chg = {};
    Object.keys(STYLE_SERIES).forEach(function (key) {
      var s = series[STYLE_SERIES[key]];
      var pts = s && s.points ? s.points : [];
      var arr = [];
      for (var i = 1; i < pts.length; i += 1) {
        var prev = pts[i - 1][1];
        arr.push(prev > 0 ? (pts[i][1] / prev - 1) * 100 : 0);
      }
      chg[key] = arr;
    });
    var marketPts = series[MARKET_SERIES] && series[MARKET_SERIES].points ? series[MARKET_SERIES].points : ref.points;
    var marketChg = [];
    for (var k = 1; k < marketPts.length; k += 1) {
      var p0 = marketPts[k - 1][1];
      marketChg.push(p0 > 0 ? (marketPts[k][1] / p0 - 1) * 100 : 0);
    }

    /* 只要股票：有报价、有四项行情、能判人格的标的 */
    var quotes = market && market.quotes ? market.quotes : {};
    var stocks = [];
    rows.forEach(function (r) {
      var q = quotes[r.code];
      if (!q || !r.personaCode) return;
      if (r.group === "fund") return;
      if (typeof q.close !== "number" || typeof q.amplitude !== "number") return;
      stocks.push({
        code: r.code,
        name: r.name,
        industry: r.industry || r.belong || "",
        personaCode: r.personaCode,
        personaName: r.personaName || "",
        style: r.style || (r.styles && r.styles[0]) || "steady",
        close: q.close,
        amplitude: Math.max(0.4, q.amplitude),
        turnover: typeof q.turnover === "number" ? q.turnover : 1
      });
    });
    if (stocks.length < 20) return null;

    return { dates: dates, chg: chg, marketChg: marketChg, stocks: stocks, asOf: market ? market.asOf : "" };
  }

  /* 每条风格指数的收益从「日期索引 i-1 → i」算，chg 数组下标是 i-1 */
  function styleReturn(world, style, dateIndex) {
    var arr = world.chg[style] || world.chg.steady;
    var idx = dateIndex - 1;
    if (idx < 0 || idx >= arr.length) return 0;
    return arr[idx];
  }
  function marketReturn(world, dateIndex) {
    var idx = dateIndex - 1;
    if (idx < 0 || idx >= world.marketChg.length) return 0;
    return world.marketChg[idx];
  }

  /* β：振幅越大，跟着指数放得越开；范围收在 0.6–1.6 */
  function betaOf(stock) {
    var b = 0.55 + Math.min(1.05, stock.amplitude / 4);
    return Math.round(b * 100) / 100;
  }

  /* ---------- 事件卡：每天一张，先文案后数字 ---------- */

  var EVENTS = [
    { id: "hike", scope: "market", delta: -1.2, text: "董事长在朋友圈发了张登山照，市场解读为要跑路。" },
    { id: "target", scope: "style", delta: 1.8, text: "某券商把目标价上调 40%，理由是：因为它跌了。" },
    { id: "buyback", scope: "stock", delta: 2.5, text: "公司公告回购 3 亿，股民：你先买。" },
    { id: "letter", scope: "stock", delta: -3.0, text: "交易所问询函到了，公司回复：一切正常，请放心。" },
    { id: "north", scope: "market", delta: 0.9, text: "北向资金突然买了 80 亿，没人知道为什么，但大家都跟着买。" },
    { id: "rival", scope: "style", delta: -1.5, text: "行业龙头发布新品，友商股价先跌为敬。" },
    { id: "anchor", scope: "market", delta: 0.6, text: "财经大 V 直播喊单，五分钟后删了视频，但截图已经传开。" },
    { id: "unlock", scope: "stock", delta: -2.2, text: "解禁日到了，大股东说“长期看好”，手很诚实地卖了。" },
    { id: "beat", scope: "stock", delta: 1.0, text: "中报超预期，股价高开低走，收盘还是绿的。" },
    { id: "rumor", scope: "market", delta: -0.8, text: "传闻被辟谣，股价跌得比传闻那会儿还多。" },
    { id: "dividend", scope: "style", delta: 1.1, text: "一批高股息公司同日公告分红，资金开始找“确定性”。" },
    { id: "lockup", scope: "style", delta: -0.9, text: "监管窗口指导，热门方向集体降温，评论区一片“早就说了”。" }
  ];

  /* ---------- 取一局 ---------- */

  function normalizeSeed(seed) {
    var s = String(seed || "").trim();
    if (!/^[0-9a-zA-Z-]{4,32}$/.test(s)) s = String(Date.now()).slice(-9);
    return s;
  }

  function create(opts) {
    var world = opts.world;
    if (!world) return null;
    var seed = normalizeSeed(opts.seed);
    var rand = rngFor(seed, "window");
    var total = world.dates.length;
    /* 默认最近 14 个交易日；换种子会换到历史里的随机一段 */
    var end = opts.recent === false
      ? Math.max(DAYS + 30, Math.floor(total - DAYS - Math.floor(rand() * Math.min(900, total - DAYS - 40))))
      : total;
    var start = end - DAYS;
    if (start < 30) { start = total - DAYS; end = total; }

    var game = {
      seed: seed,
      personaCode: opts.personaCode || "",
      startIndex: start,
      endIndex: end,
      day: 0,
      cash: START_CASH,
      positions: [],
      maxPos: 0,
      trades: [],
      fees: 0,
      log: [],
      equity: [START_CASH],
      prices: {},
      cands: [],
      event: null,
      pending: null,
      phase: "play"
    };
    buildPrices(game, world);
    openDay(game, world);
    return game;
  }

  /* 先把 14 天里每只票的价格序列算好：末价锚定真实收盘，往前往回推 */
  function buildPrices(game, world) {
    var total = world.dates.length;
    var dayCount = game.endIndex - game.startIndex;
    world.stocks.forEach(function (s) {
      var rand = rngFor(game.seed, s.code);
      var rets = [];
      for (var d = 0; d < dayCount; d += 1) {
        var dateIndex = game.startIndex + d;
        var r = styleReturn(world, s.style, dateIndex) * betaOf(s);
        var noise = (rand() * 2 - 1) * s.amplitude * 0.22;
        r += noise;
        if (r > LIMIT) r = LIMIT;
        if (r < -LIMIT) r = -LIMIT;
        rets.push(r);
      }
      /* 事件在每天 openDay 里叠加，这里只存基础收益；价格序列按天推进时再算 */
      game.prices[s.code] = { rets: rets };
    });
  }

  function priceAt(game, world, code, day) {
    var stock = stockOf(world, code);
    var pack = game.prices[code];
    if (!stock || !pack) return 0;
    var price = stock.close;
    for (var d = pack.rets.length - 1; d >= day; d -= 1) {
      price = price / (1 + pack.rets[d] / 100);
    }
    return price;
  }

  function stockOf(world, code) {
    for (var i = 0; i < world.stocks.length; i += 1) {
      if (world.stocks[i].code === code) return world.stocks[i];
    }
    return null;
  }

  /* ---------- 每日开盘：抽三张、出事件 ---------- */

  function affinity(stock, personaCode) {
    if (!personaCode || !stock.personaCode) return 0;
    var same = 0;
    for (var i = 0; i < 4; i += 1) {
      if (stock.personaCode.charAt(i) === personaCode.charAt(i)) same += 1;
    }
    return same;
  }

  function pickCandidates(game, world) {
    var rand = rngFor(game.seed, "cand-" + game.day);
    /* 已经在手上的不再出现在候选里，省得重复买 */
    var held = {};
    game.positions.forEach(function (p) { held[p.code] = true; });
    var pool = world.stocks.filter(function (s) { return !held[s.code]; });
    var picked = [];
    var used = {};
    while (picked.length < 3 && picked.length < pool.length) {
      /* 人格越接近，被抽中的概率越高：给 3 次机会取权重最大的一次 */
      var best = null;
      var bestScore = -1;
      for (var t = 0; t < 3; t += 1) {
        var cand = pool[Math.floor(rand() * pool.length)];
        if (!cand || used[cand.code]) continue;
        var score = 1 + affinity(cand, game.personaCode) * 1.6 + rand();
        if (score > bestScore) { bestScore = score; best = cand; }
      }
      if (!best) break;
      used[best.code] = true;
      picked.push(best.code);
    }
    return picked;
  }

  function drawEvent(game, world) {
    var rand = rngFor(game.seed, "event-" + game.day);
    var ev = EVENTS[Math.floor(rand() * EVENTS.length)];
    var out = { id: ev.id, scope: ev.scope, delta: ev.delta, text: ev.text, targetName: "" };
    if (ev.scope === "stock") {
      var stock = stockOf(world, game.cands[0]);
      out.targetCode = stock ? stock.code : "";
      out.targetName = stock ? stock.name : "";
    } else if (ev.scope === "style") {
      var styles = ["value", "quality", "steady", "trend"];
      var styleKey = styles[Math.floor(rand() * styles.length)];
      out.style = styleKey;
      out.targetName = STYLE_NAME[styleKey];
    } else {
      out.targetName = "全市场";
    }
    return out;
  }

  function eventEffect(game, world, code, day) {
    var ev = game.event;
    if (!ev) return 0;
    var stock = stockOf(world, code);
    if (!stock) return 0;
    if (ev.scope === "stock") return ev.targetCode === code ? ev.delta : 0;
    if (ev.scope === "style") return stock.style === ev.style ? ev.delta : 0;
    return ev.delta;
  }

  function openDay(game, world) {
    game.cands = pickCandidates(game, world);
    game.event = drawEvent(game, world);
    game.pending = null;
  }

  /* ---------- 一天的结算 ---------- */

  function dayReturn(game, world, code, day) {
    var pack = game.prices[code];
    if (!pack) return 0;
    var r = pack.rets[day] + eventEffect(game, world, code, day);
    if (r > LIMIT) r = LIMIT;
    if (r < -LIMIT) r = -LIMIT;
    return r;
  }

  function equityOf(game, world, day) {
    return game.cash + investedOf(game, world, day);
  }

  /* 持仓市值合计 */
  function investedOf(game, world, day) {
    var v = 0;
    game.positions.forEach(function (p) {
      v += p.shares * priceAt(game, world, p.code, day);
    });
    return v;
  }

  function positionOf(game, code) {
    for (var i = 0; i < game.positions.length; i += 1) {
      if (game.positions[i].code === code) return game.positions[i];
    }
    return null;
  }

  /* 口径：三成 / 六成指「这一次用掉总资产的多少」，满仓 = 把剩下的现金全买掉。
     同一只可以分批加仓：股数累加、成本按加权平均摊薄。 */
  function buy(game, world, code, weight) {
    if (game.phase !== "play") return { ok: false, msg: "这局已经结束了。" };
    var stock = stockOf(world, code);
    if (!stock) return { ok: false, msg: "这只不在池子里。" };
    var pos = positionOf(game, code);
    if (!pos && game.positions.length >= MAX_POS) {
      return { ok: false, msg: "最多同时持有 " + MAX_POS + " 只，先卖掉一只再买。" };
    }

    var w = typeof weight === "number" && weight > 0 ? Math.min(1, weight) : 1;
    var price = priceAt(game, world, code, game.day) * (1 + SLIP);
    var eq = equityOf(game, world, game.day);
    var room = Math.min(game.cash, eq * w);
    if (room <= 0) {
      return { ok: false, msg: "现金已经用完了，先卖一只腾点钱。" };
    }
    var lots = Math.floor(room / (price * 100));
    var shares = 0;
    var amount = 0;
    var fee = 0;
    while (lots >= 1) {
      shares = lots * 100;
      amount = shares * price;
      fee = Math.max(MIN_COMMISSION, amount * COMMISSION);
      if (amount + fee <= game.cash) break;
      lots -= 1;
    }
    if (lots < 1) {
      return {
        ok: false,
        msg: "这点钱买不了一手" + stock.name + "（一手约 " + Math.round(price * 100) +
          " 元），换只便宜的，或者先卖一只。"
      };
    }
    game.cash -= amount + fee;
    game.fees += fee;
    var avg;
    if (pos) {
      /* 加仓：股数相加，成本累加后再摊到每股，buyDay 重置为今天（本来也当天不能卖） */
      pos.shares += shares;
      pos.cost += amount + fee;
      pos.buyDay = game.day;
      avg = pos.cost / pos.shares;
    } else {
      avg = (amount + fee) / shares;
      game.positions.push({
        code: code, name: stock.name, shares: shares, cost: amount + fee,
        buyDay: game.day, fee: fee, adds: 1
      });
      if (game.positions.length > game.maxPos) game.maxPos = game.positions.length;
    }
    game.trades.push({ day: game.day, type: "buy", code: code, shares: shares, price: price, fee: fee });
    return {
      ok: true,
      code: code,
      added: !!pos,
      msg: pos ? addLine(game, stock, amount, avg) : buyLine(game, stock, amount)
    };
  }

  /* ratio = 1 清仓，0.5 卖一半；不足一手的余数按整手向下取，取不到就整只卖掉 */
  function sell(game, world, code, ratio) {
    if (game.phase !== "play") return { ok: false, msg: "这局已经结束了。" };
    var pos = code ? positionOf(game, code) : (game.positions.length === 1 ? game.positions[0] : null);
    if (!pos) return { ok: false, msg: code ? "你没有持仓这只。" : "先点一下要卖哪一只。" };
    if (pos.buyDay >= game.day) return { ok: false, msg: "T+1：今天买的，明天才能卖。" };

    var r = typeof ratio === "number" && ratio > 0 && ratio < 1 ? ratio : 1;
    var want = r < 1 ? Math.floor((pos.shares * r) / 100) * 100 : pos.shares;
    var all = want >= pos.shares || want < 100;
    var shares = all ? pos.shares : want;

    var price = priceAt(game, world, pos.code, game.day) * (1 - SLIP);
    var amount = shares * price;
    var fee = Math.max(MIN_COMMISSION, amount * COMMISSION) + amount * STAMP;
    var costPart = pos.cost * (shares / pos.shares);
    var pnl = amount - fee - costPart;
    game.cash += amount - fee;
    game.fees += fee;
    game.trades.push({
      day: game.day, type: "sell", code: pos.code, shares: shares,
      price: price, fee: fee, pnl: pnl, partial: !all
    });
    if (all) {
      game.positions = game.positions.filter(function (p) { return p.code !== pos.code; });
    } else {
      pos.shares -= shares;
      pos.cost -= costPart;
    }
    return {
      ok: true,
      pnl: pnl,
      code: pos.code,
      partial: !all,
      msg: all ? sellLine(pos.name, pnl, fee) : trimLine(pos.name, shares, pnl, fee)
    };
  }

  function wait(game) {
    if (game.phase !== "play") return { ok: false, msg: "这局已经结束了。" };
    return { ok: true, msg: waitLine(game) };
  }

  /* ---------- 推进一天 ---------- */

  function commit(game, world, decision) {
    if (game.phase !== "play") return { ok: false, msg: "这局已经结束了。" };
    var act = decision || { type: "wait" };
    var res;
    if (act.type === "buy") res = buy(game, world, act.code, act.weight);
    else if (act.type === "sell") res = sell(game, world, act.code, act.ratio);
    else res = wait(game);
    if (!res.ok) return res;

    /* 三张卡今天的实际表现，用来做“你没买的那两只” */
    var cards = game.cands.map(function (code) {
      var s = stockOf(world, code);
      return { code: code, name: s ? s.name : code, chg: dayReturn(game, world, code, game.day) };
    });
    /* 持仓今天是涨是跌：按市值加权，多只也不会算错 */
    var held = 0;
    if (game.positions.length) {
      var acc = 0;
      var weightSum = 0;
      game.positions.forEach(function (p) {
        var v = p.shares * priceAt(game, world, p.code, game.day);
        acc += dayReturn(game, world, p.code, game.day) * v;
        weightSum += v;
      });
      held = weightSum > 0 ? acc / weightSum : 0;
    }

    game.day += 1;
    var eq = equityOf(game, world, game.day);
    game.equity.push(eq);
    game.log.push({
      day: game.day,
      action: act.type,
      text: res.msg,
      cards: cards,
      held: held,
      positions: game.positions.length,
      equity: eq,
      event: game.event ? game.event.text : "",
      eventDelta: game.event ? game.event.delta : null,
      eventScope: game.event ? game.event.scope : "",
      taunt: tauntOf(game, cards, act)
    });
    game.pending = null;

    if (game.day >= game.endIndex - game.startIndex) {
      liquidate(game, world, game.day);
      game.phase = "end";
    } else {
      openDay(game, world);
    }
    return {
      ok: true, msg: res.msg, equity: eq,
      code: res.code || "", added: !!res.added, partial: !!res.partial, pnl: res.pnl
    };
  }

  /* 期末全部平仓，避免用浮盈吹牛 */
  function liquidate(game, world, day) {
    if (!game.positions.length) return;
    game.positions.slice().forEach(function (pos) {
      var price = priceAt(game, world, pos.code, day) * (1 - SLIP);
      var amount = pos.shares * price;
      var fee = Math.max(MIN_COMMISSION, amount * COMMISSION) + amount * STAMP;
      game.cash += amount - fee;
      game.fees += fee;
      game.trades.push({
        day: day, type: "sell", code: pos.code, shares: pos.shares, price: price,
        fee: fee, pnl: amount - fee - pos.cost, forced: true
      });
    });
    game.positions = [];
    game.equity[game.equity.length - 1] = game.cash;
  }

  /* ---------- 沙雕文案 ---------- */

  var BUY_TEMPLATES = [
    "成交。你买在了 14:57，一个理论上不可能更差的时间。",
    "买进去了。你的委托价像是照着当日最高价抄的。",
    "成交。券商给你发了条短信，这是今天唯一对你说“恭喜”的人。",
    "你按下了买入，手指比大脑快了两秒。"
  ];
  var SELL_TEMPLATES = [
    "卖掉{name}。手续费 {fee} 元，滑点又拿走一点，市场谢谢你。",
    "清掉{name}。你盯着成交价看了很久，然后决定不去看后来发生了什么。",
    "卖出{name}成功。这次操作唯一确定的结果，是券商今天的午饭有着落了。",
    "{name}出手了。你觉得自己卖在了一个聪明的位置，这种感觉一般只能维持两天。"
  ];
  var WAIT_DOWN = [
    "你选择了观望。今天指数往下走，你在岸上，心情复杂又庆幸。",
    "空仓。你看着 400 多只票变绿，觉得自己今天特别聪明。",
    "你没动手。账户纹丝不动，这在今天已经算一种胜利。"
  ];
  var WAIT_UP = [
    "空仓，指数却在涨。你安慰自己：不亏就是赚。",
    "你没买。收盘后你打开行情，看了一眼，又关掉了。",
    "观望。屏幕上全是红的，只有你的账户是平的。"
  ];

  function pickText(arr, game, salt) {
    var rand = rngFor(game.seed, "text-" + game.day + "-" + salt);
    return arr[Math.floor(rand() * arr.length)];
  }

  function buyLine(game, stock, amount) {
    var base = pickText(BUY_TEMPLATES, game, "buy");
    return base + "（" + stock.name + "，" + Math.round(amount / 10000) + " 万）";
  }

  var ADD_TEMPLATES = [
    "加仓成交。你和这只票的关系，从“看好”升级成了“更看好”。",
    "又补了一笔。摊薄的希望和加深的仓位，一起到了。",
    "你在下跌里加了一笔，这叫做纪律，也叫嘴硬。",
    "加仓完成。成本是往下走了，风险是往上走了，账面上很平衡。"
  ];

  function addLine(game, stock, amount, avg) {
    var base = pickText(ADD_TEMPLATES, game, "add");
    return base + "（" + stock.name + "，" + Math.round(amount / 10000) + " 万，成本摊到 ¥" + avg.toFixed(2) + "）";
  }

  function trimLine(name, shares, pnl, fee) {
    return "减掉 " + shares.toLocaleString("zh-CN") + " 股" + name + "，剩下的继续留在手上。手续费 " +
      fee.toFixed(0) + " 元，" + (pnl >= 0 ? "这一笔赚 " : "这一笔亏 ") + Math.round(Math.abs(pnl)) + " 元。";
  }
  function sellLine(name, pnl, fee) {
    var base = SELL_TEMPLATES[Math.floor(Math.abs(pnl) * 1000) % SELL_TEMPLATES.length];
    return base.replace("{name}", name).replace("{fee}", fee.toFixed(0)) +
      (pnl >= 0 ? "这笔赚了 " + Math.round(pnl) + " 元。" : "这笔亏了 " + Math.round(-pnl) + " 元。");
  }
  function waitLine(game) {
    var arr = game.equity[game.equity.length - 1] >= START_CASH ? WAIT_UP : WAIT_DOWN;
    return pickText(arr, game, "wait");
  }

  /* 你没买的那两只今天怎么样——这部分最扎心 */
  function tauntOf(game, cards, act) {
    if (!cards || cards.length < 2) return "";
    var others = cards.slice().sort(function (a, b) { return b.chg - a.chg; });
    var best = others[0];
    var worst = others[others.length - 1];
    if (act.type === "buy") {
      var mine = cards.filter(function (c) { return c.code === act.code; })[0];
      if (!mine) return "";
      if (mine.chg < best.chg) {
        return "你没买的那只 " + best.name + " 今天 " + fmtPct(best.chg) + "，" + mine.name + " " + fmtPct(mine.chg) + "。";
      }
      return mine.name + " 今天是三张里最好的，难得。";
    }
    return "你放走的三只：最好 " + best.name + " " + fmtPct(best.chg) + "，最差 " + worst.name + " " + fmtPct(worst.chg) + "。";
  }

  function fmtPct(v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%"; }

  /* ---------- 期末结算 ---------- */

  var TITLES = {
    empty: { name: "空仓哲学家", tone: "neutral" },
    god: { name: "天选之子", tone: "good" },
    rent: { name: "稳健收租", tone: "good" },
    flat: { name: "白忙一场", tone: "neutral" },
    churn: { name: "勤奋的韭菜", tone: "bad" },
    cut: { name: "割肉艺术家", tone: "bad" },
    fee: { name: "手续费慈善家", tone: "bad" },
    bag: { name: "重仓体验卡", tone: "bad" }
  };

  function statsOf(game) {
    var eq = game.equity;
    var peak = eq[0];
    var maxDD = 0;
    eq.forEach(function (v) {
      if (v > peak) peak = v;
      var dd = (v / peak - 1) * 100;
      if (dd < maxDD) maxDD = dd;
    });
    var sells = game.trades.filter(function (t) { return t.type === "sell"; });
    var wins = sells.filter(function (t) { return t.pnl > 0; }).length;
    return {
      final: eq[eq.length - 1],
      ret: (eq[eq.length - 1] / START_CASH - 1) * 100,
      maxDD: maxDD,
      trades: game.trades.length,
      buys: game.trades.filter(function (t) { return t.type === "buy"; }).length,
      winRate: sells.length ? (wins / sells.length) * 100 : 0,
      fees: game.fees,
      maxPos: game.maxPos || 0,
      days: eq.length - 1
    };
  }

  function titleOf(stats) {
    if (stats.trades === 0) return "empty";
    if (stats.ret >= 30) return "god";
    if (stats.maxDD <= -20) return "cut";
    if (stats.fees >= 5000) return "fee";
    if (stats.ret < 0 && stats.trades >= 16) return "churn";
    if (stats.ret >= 6) return "rent";
    if (stats.ret < -6) return "bag";
    return "flat";
  }

  var VERDICT = {
    empty: "你一次都没买。指数涨涨跌跌，你的 100 万还是 100 万。系统给你颁“最稳定的那个人”，附一句：这行不适合你，但很适合你的钱。",
    god: "你把 100 万做成了这么多。系统无法解释，只能标注为运气。建议立刻收手，把这段写进简历，别再打开第二次。",
    rent: "你跑赢了货币基金，也跑赢了你自己。交易次数少到这个程度，足以让券商客户经理沉默。",
    flat: "你没赚也没亏多少，像在泳池里游了 14 天，上岸时衣服是干的。这也是一种本事。",
    churn: "你交易得很勤，手续费交得很诚恳。净值像心电图，而手续费是唯一稳定上涨的东西。",
    cut: "你在最低点附近卖出，随后它涨了。这不是运气问题，这是人性的问题。",
    fee: "你为资本市场的基础设施建设做出了实际贡献。券商感谢你，交易所也感谢你。",
    bag: "你几乎一直在重仓，坚信时间会给你答案。答案到了，是负的。仓位本身没有错，错在你以为它不会跌。"
  };

  function settle(game, world) {
    var stats = statsOf(game);
    var title = titleOf(stats);
    return {
      stats: stats,
      title: TITLES[title],
      verdict: VERDICT[title],
      window: {
        from: world.dates[game.startIndex] || "",
        to: world.dates[game.endIndex - 1] || ""
      },
      log: game.log,
      seed: game.seed
    };
  }

  /* ---------- 续玩：只用存档里的状态重建，价格按种子重算 ---------- */
  function resume(saved, world) {
    if (!saved || !world || !saved.seed) return null;
    if (typeof saved.startIndex !== "number" || typeof saved.endIndex !== "number") return null;
    if (saved.endIndex - saved.startIndex !== DAYS) return null;
    var savedPositions = saved.positions ||
      (saved.holding ? [saved.holding] : []);
    var game = {
      seed: saved.seed,
      personaCode: saved.personaCode || "",
      startIndex: saved.startIndex,
      endIndex: saved.endIndex,
      day: Math.min(saved.day || 0, DAYS),
      cash: typeof saved.cash === "number" ? saved.cash : START_CASH,
      positions: savedPositions,
      maxPos: saved.maxPos || savedPositions.length,
      trades: saved.trades || [],
      fees: saved.fees || 0,
      log: saved.log || [],
      equity: saved.equity && saved.equity.length ? saved.equity : [START_CASH],
      prices: {},
      cands: saved.cands || [],
      event: saved.event || null,
      pending: null,
      phase: saved.phase === "end" ? "end" : "play"
    };
    buildPrices(game, world);
    if (game.phase === "play" && !game.cands.length) openDay(game, world);
    return game;
  }

  /* ---------- 对外 ---------- */

  var API = {
    DAYS: DAYS,
    START_CASH: START_CASH,
    MAX_POS: MAX_POS,
    buildWorld: buildWorld,
    create: create,
    resume: resume,
    commit: commit,
    settle: settle,
    statsOf: statsOf,
    priceAt: priceAt,
    dayReturn: dayReturn,
    equityOf: equityOf,
    investedOf: investedOf,
    positionOf: positionOf,
    betaOf: betaOf,
    fmtPct: fmtPct,
    STYLE_NAME: STYLE_NAME,
    _internal: { hashStr: hashStr, rngFor: rngFor, titleOf: titleOf, TITLES: TITLES, VERDICT: VERDICT, EVENTS: EVENTS, LIMIT: LIMIT }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (root) root.GBTI_SIM = API;
})(typeof window !== "undefined" ? window : this);
