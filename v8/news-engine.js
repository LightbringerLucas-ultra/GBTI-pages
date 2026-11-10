/* GBTI 资讯推荐 v1：可解释的内容排序。浏览器和 Node 测试共用同一实现。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GBTI_NEWS_ENGINE = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const DAY = 86400000;
  const VERSION = "content-rules-v1";
  const AXES = [["F", "M"], ["L", "S"], ["D", "A"], ["O", "J"]];
  const AXIS_WEIGHTS = [0.35, 0.25, 0.25, 0.15];
  // 向量分别为 F、L、D、O 的倾向；对侧为 1 - 此值。不是收益预测。
  const TOPICS = {
    earnings: { label: "财报与经营", pattern: /财报|业绩|净利润|营收|现金流|季报|年报|盈利|营业收入/, vector: [1, .8, .6, 1] },
    value: { label: "估值与分红", pattern: /估值|分红|股息|(?<!逆)回购|市盈率|市净率|红利|派息/, vector: [1, 1, .9, .85] },
    growth: { label: "产业与成长", pattern: /人工智能|半导体|芯片|研发|算力|新能源|机器人|光伏|产业链|产能|订单/, vector: [.9, .8, .15, .45] },
    policy: { label: "政策与宏观", pattern: /央行|货币政策|降息|降准|利率|美联储|通胀|财政|经济增长|GDP|出口|进口|进出口|商务部|IMF|统计局|制造业|投资需求|基础设施|中小企业|原油|油轮|OPEC/, vector: [.55, .8, .65, .45] },
    event: { label: "事件与催化", pattern: /并购|重组|收购|私有化|上市|IPO|获批|核准|签约|新规(?!划)|征求意见|新品|新一轮融资/, vector: [.85, .2, .25, .4] },
    trend: { label: "市场与趋势", pattern: /指数|股指|大盘|成交|收盘|开盘|沪指|深成指|涨幅|跌幅|上涨|下跌|震荡|突破|创新高|A股|港股|美股/, vector: [.05, .55, .4, .75] },
    flow: { label: "资金与情绪", pattern: /资金|净流入|净流出|两融|融资余额|ETF|换手|放量|缩量|涨停|跌停|情绪|主力/, vector: [.1, .2, .25, .75] },
    defensive: { label: "债券与配置", pattern: /国债|债券|固收|存款|储蓄|黄金|避险|配置|养老|利差|收益率/, vector: [.4, .8, 1, .8] },
    risk: { label: "风险与核验", pattern: /风险|警示|退市|违约|处罚|立案调查|诉讼|减持|亏损|下修|盈利预警|暴跌|回撤|商誉减值|监管问询|泡沫|资不抵债|削减债务/, vector: [.55, .45, 1, .85] }
  };
  const PROFILES = {
    FLDO: { focus: ["value", "earnings", "defensive"], lens: "先核对估值、分红和经营数据，再复核长期假设。" },
    FLDJ: { focus: ["value", "policy", "earnings"], lens: "结合行业与宏观背景，理解现金流和分红的可持续性。" },
    FLAO: { focus: ["earnings", "growth", "value"], lens: "用收入、盈利和订单数据检验长期成长预期。" },
    FLAJ: { focus: ["growth", "policy", "event"], lens: "跟踪产业方向，也寻找能推翻成长叙事的事实。" },
    FSDO: { focus: ["earnings", "risk", "value"], lens: "优先看短期可核验的经营变化与公告信息。" },
    FSDJ: { focus: ["policy", "earnings", "risk"], lens: "结合事件背景研判近期变化，留意信息确认的时间。" },
    FSAO: { focus: ["event", "earnings", "growth"], lens: "把催化事件拆成可以跟踪和验证的经营指标。" },
    FSAJ: { focus: ["growth", "event", "policy"], lens: "关注产业事件与预期差，同时核验消息是否已经兑现。" },
    MLDO: { focus: ["defensive", "trend", "value"], lens: "观察中长期市场方向，并定期复核波动和配置。" },
    MLDJ: { focus: ["policy", "defensive", "trend"], lens: "从宏观环境和跨资产变化理解市场趋势。" },
    MLAO: { focus: ["trend", "flow", "growth"], lens: "用指数、量能和资金数据检验趋势的持续性。" },
    MLAJ: { focus: ["growth", "trend", "policy"], lens: "结合产业叙事与市场方向，留意预期切换。" },
    MSDO: { focus: ["trend", "risk", "defensive"], lens: "先看量价与波动的可核验信息，避免把短期当作低风险。" },
    MSDJ: { focus: ["trend", "policy", "risk"], lens: "结合事件背景观察短期波动，区分噪声与新信息。" },
    MSAO: { focus: ["flow", "trend", "event"], lens: "关注量能和资金变化，并核验情绪背后的事实。" },
    MSAJ: { focus: ["event", "flow", "growth"], lens: "关注催化与市场情绪，同时检查拥挤和反转风险。" }
  };
  const SOURCE_QUALITY = { official: 100, established: 85, media: 75 };
  function safeUrl(value) {
    try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; }
    catch (_) { return null; }
  }
  function canonicalUrl(value) {
    const u = new URL(value);
    u.hash = "";
    [...u.searchParams.keys()].forEach(k => { if (/^(utm_|spm$|from$)/i.test(k)) u.searchParams.delete(k); });
    return u.href;
  }
  function classify(text) {
    let topics = Object.keys(TOPICS).filter(key => TOPICS[key].pattern.test(text));
    // 限定语境：突破投资额不是价格趋势，初创融资估值不是价值/分红主题。
    if (!/指数|股指|股价|股票|股市|大盘|沪指|深成指|A股|港股|美股|期货|交易|基金|ETF|ADR|债|黄金|涨幅|跌幅|停牌/.test(text)) topics = topics.filter(t => t !== "trend");
    if (/初创|新一轮融资|创投|风险投资/.test(text)) {
      topics = topics.filter(t => t !== "value");
      if (!topics.includes("growth")) topics.push("growth");
    }
    return topics;
  }
  function normalizedTitle(s) { return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, ""); }
  function numbers(s) { return (s.match(/\d+(?:\.\d+)?%?/g) || []).join("|"); }
  function similarity(a, b) {
    const grams = s => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
    const x = grams(a), y = grams(b);
    if (!x.size || !y.size) return a === b ? 1 : 0;
    const common = [...x].filter(g => y.has(g)).length;
    return 2 * common / (x.size + y.size);
  }
  function weekOf(now) {
    const local = new Date(Number(now) + 8 * 3600000);
    const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 8 * 3600000;
    const monday = start - ((local.getUTCDay() + 6) % 7) * DAY;
    return { id: new Date(monday + 8 * 3600000).toISOString().slice(0, 10), start: monday, end: monday + 7 * DAY };
  }
  function normalize(item, now) {
    if (!item || typeof item !== "object" || item.withdrawn) return null;
    const url = safeUrl(item.url);
    const published = Date.parse(item.publishedAt);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    const source = typeof item.source === "string" ? item.source.trim() : "";
    if (!url || !source || title.length < 6 || summary.length < 40 || !Number.isFinite(published) || published > now) return null;
    if (/大赛|赛项|演唱会|美食节|赛事/.test(title)) return null;
    if (!/金融|融资|财报|业绩|营收|营业收入|利润|现金流|股|证券|债|基金|ETF|IPO|并购|重组|收购|私有化|分红|估值|投资|产能|订单|利率|央行|通胀|财政|经济|贸易|外贸|商务部|进出口|美联储|IMF|出口|进口|关税|黄金|原油|油轮|涨幅|跌幅|停牌/.test(title + summary)) return null;
    const sourceQuality = SOURCE_QUALITY[item.sourceTier];
    if (!sourceQuality) return null;
    const topics = classify(title + " " + summary);
    if (!topics.length) return null;
    const quality = .7 * sourceQuality + 20 * Math.min(summary.length / 120, 1) + (/\d|公告|报告|发布|数据/.test(title + summary) ? 10 : 0);
    if (quality < 65) return null;
    const publisher = typeof item.publisher === "string" && item.publisher.trim() ? item.publisher.trim() : source;
    return { id: canonicalUrl(url), url, title: title.slice(0, 160), summary: summary.slice(0, 300), source, publisher,
      sourceTier: item.sourceTier, publishedAt: new Date(published).toISOString(), published, topics, quality,
      eventKey: typeof item.eventKey === "string" ? item.eventKey : "", normalized: normalizedTitle(title) };
  }
  function groupArticles(items, now) {
    // 先按日期/网址稳定排序，避免输入顺序改变排序；每个规范 URL 只算一次。
    const articles = items.map(x => normalize(x, now)).filter(Boolean).sort((a, b) => b.published - a.published || a.id.localeCompare(b.id));
    const groups = [], seen = new Set();
    for (const article of articles) {
      if (seen.has(article.id)) continue;
      seen.add(article.id);
      const group = groups.find(g => g.articles.some(other =>
        (article.eventKey && article.eventKey === other.eventKey) ||
        (Math.abs(article.published - other.published) <= 3 * DAY &&
          (article.normalized === other.normalized || (numbers(article.title) === numbers(other.title) && similarity(article.normalized, other.normalized) >= .82)))));
      if (group) group.articles.push(article);
      else groups.push({ articles: [article] });
    }
    return groups.map(g => {
      g.articles.sort((a, b) => SOURCE_QUALITY[b.sourceTier] - SOURCE_QUALITY[a.sourceTier] || b.quality - a.quality || a.published - b.published || a.id.localeCompare(b.id));
      const representative = g.articles[0];
      const sources = [...new Set(g.articles.map(a => a.publisher))];
      // 一家来源无论报道多少篇仅贡献一次；72 小时半衰期，4 家满分。
      const heat = Math.min(100, 25 * sources.reduce((sum, publisher) => sum + Math.max(...g.articles.filter(a => a.publisher === publisher).map(a => Math.pow(.5, (now - a.published) / (3 * DAY)))), 0));
      return { ...representative, topics: [...new Set(g.articles.flatMap(a => a.topics))], sources, heat,
        reports: g.articles.length, eventId: representative.eventKey || representative.normalized };
    });
  }
  function preference(code, scores) {
    return AXES.map((pair, i) => {
      const left = scores && scores[pair[0]], right = scores && scores[pair[1]];
      if (Number.isFinite(left) && Number.isFinite(right) && left >= 0 && right >= 0 && left + right > 0)
        return .7 * (code[i] === pair[0] ? 1 : 0) + .3 * left / (left + right);
      return code[i] === pair[0] ? 1 : 0;
    });
  }
  function scoreEvent(event, code, scores, now) {
    const profile = PROFILES[code], pref = preference(code, scores);
    const vector = AXES.map((_, i) => event.topics.reduce((s, key) => s + TOPICS[key].vector[i], 0) / event.topics.length);
    const text = event.title + event.summary;
    if (/盘中|开盘|尾盘|日内|短线/.test(text)) vector[1] = .15;
    if (/初创|新一轮融资|波动性过大|涨停|跌停|暴涨/.test(text)) vector[2] = .2;
    const axisMatch = vector.reduce((s, value, i) => s + AXIS_WEIGHTS[i] * (1 - Math.abs(pref[i] - value)), 0) * 100;
    const topicMatch = Math.max(0, ...event.topics.map(key => { const index = profile.focus.indexOf(key); return index < 0 ? 0 : [100, 80, 60][index]; }));
    const match = .7 * axisMatch + .3 * topicMatch;
    const freshness = 100 * Math.pow(.5, (now - event.published) / (3 * DAY));
    const score = .5 * match + .2 * event.quality + .2 * freshness + .1 * event.heat;
    const relevant = profile.focus.filter(t => event.topics.includes(t));
    return { ...event, score, match, freshness, topic: relevant[0] || event.topics[0],
      reason: relevant.length ? "与你关注的「" + relevant.map(t => TOPICS[t].label).join("、") + "」相关。" : "补充本周的市场背景，帮助交叉检验你的判断。",
      breakdown: { match, quality: event.quality, freshness, heat: event.heat } };
  }
  function recommend(snapshot, code, options) {
    if (!PROFILES[code]) throw new Error("未知投资风格：" + code);
    const opts = options || {}, now = opts.now == null ? Date.now() : Number(opts.now);
    const week = opts.week ? weekOf(Date.parse(opts.week + "T12:00:00+08:00")) : weekOf(now);
    const all = snapshot && Array.isArray(snapshot.articles) ? snapshot.articles : [];
    const eligible = all.filter(a => { const t = Date.parse(a && a.publishedAt); return t >= week.start && t < week.end && t <= now; });
    const rankingTime = Math.min(now, week.end);
    const ranked = groupArticles(eligible, rankingTime).map(e => scoreEvent(e, code, opts.scores, rankingTime))
      .sort((a, b) => b.score - a.score || b.published - a.published || a.id.localeCompare(b.id));
    const count = Math.max(1, Math.min(12, opts.limit || 6));
    // 单独预留一条风险/防御信息；没有合格内容时不编造、不强行补满。
    const perspective = ranked.find(e => e.topics.includes("risk")) || ranked.find(e => e.topics.includes("defensive"));
    const selected = [], sourceCounts = {}, topicCounts = {};
    const add = (e, role) => {
      if ((sourceCounts[e.publisher] || 0) >= 3 || (topicCounts[e.topic] || 0) >= 2) return false;
      selected.push({ ...e, role });
      sourceCounts[e.publisher] = (sourceCounts[e.publisher] || 0) + 1;
      topicCounts[e.topic] = (topicCounts[e.topic] || 0) + 1;
      return true;
    };
    if (perspective) add(perspective, "perspective");
    for (const event of ranked) {
      if (selected.length >= count) break;
      if (event !== perspective) add(event, "personalized");
    }
    selected.sort((a, b) => (a.role === "perspective") - (b.role === "perspective") || b.score - a.score || a.id.localeCompare(b.id));
    const fetched = Date.parse(snapshot && snapshot.fetchedAt);
    return { code, week, items: selected, eligibleCount: ranked.length, profile: PROFILES[code],
      stale: !Number.isFinite(fetched) || fetched > now || now - fetched > DAY, fetchedAt: snapshot && snapshot.fetchedAt,
      hasPerspective: selected.some(e => e.role === "perspective"), version: VERSION };
  }
  function weeks(snapshot, now) {
    const current = weekOf(now == null ? Date.now() : now).id;
    const available = (snapshot && Array.isArray(snapshot.articles) ? snapshot.articles : []).map(a => Date.parse(a && a.publishedAt))
      .filter(t => Number.isFinite(t) && t <= (now == null ? Date.now() : now)).map(t => weekOf(t).id);
    return [...new Set([current, ...available])].sort().reverse().slice(0, 9);
  }
  return { VERSION, TOPICS, PROFILES, safeUrl, weekOf, weeks, normalize, groupArticles, scoreEvent, recommend };
});
