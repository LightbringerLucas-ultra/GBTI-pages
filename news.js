(function () {
  "use strict";
  const engine = window.GBTI_NEWS_ENGINE;
  const section = document.querySelector("#weekly-news");
  if (!engine || !section) return;
  let snapshot = window.GBTI_NEWS_DATA || { articles: [] }, outcome = null, selectedWeek = null;
  let requestVersion = 0, newEdition = false;
  const $ = id => document.querySelector("#" + id);
  const dateText = (value, time) => new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {})
  });
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  const CHECKPOINTS = {
    earnings: "核对报告期、同比口径、扣非利润与经营现金流，区分预告和正式财报。",
    value: "核对分红或回购是否获批、实施期限和资金来源；估值比较应采用一致的统计时点。",
    growth: "核对订单金额、交付条件与收入确认时间，区分产业规划、研发进展和已实现收入。",
    policy: "核对政策发布主体、生效时间与适用范围，区分征求意见、正式文件和媒体解读。",
    event: "核对公告主体、审批阶段与完成条件，区分意向、签约和最终落地。",
    trend: "核对指数或资产范围、行情时点和成交量，区分单日波动与持续趋势。",
    flow: "核对资金统计口径、时间窗口与覆盖范围，区分成交额、净流入和实际持仓变化。",
    defensive: "核对期限、收益率口径与信用风险，观察利率和价格变化对配置的影响。",
    risk: "核对风险涉及主体、公告日期与处置进展，区分已确认事实、预警和待核实事项。"
  };
  function sourceLink(report, className, label) {
    const url = engine.safeUrl(report.url);
    if (!url) return null;
    const link = element("a", className, label);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }
  function evidenceDetails(item) {
    const details = element("details", "news-evidence");
    details.append(element("summary", "", "为什么推荐 · 来源与核验"));
    const panel = element("div", "news-evidence-panel");
    panel.append(element("p", "news-evidence-heading", "阅读核验点"));
    panel.append(element("p", "news-checkpoint", CHECKPOINTS[item.topic] || "核对原文发布主体、日期、统计口径和事件进展。"));
    const reports = Array.isArray(item.evidence) && item.evidence.length ? item.evidence : [item];
    const unique = new Set(), evidence = element("ul", "news-evidence-links");
    reports.forEach(report => {
      const url = engine.safeUrl(report && report.url);
      if (!url || unique.has(url)) return;
      unique.add(url);
      const li = element("li");
      const label = report.publisher || report.source || "原始报道";
      const link = sourceLink(report, "", label + " · " + (report.title || "查看报道") + " ↗");
      li.append(link);
      if (Number.isFinite(Date.parse(report.publishedAt))) li.append(element("span", "news-evidence-date", dateText(report.publishedAt, true)));
      evidence.append(li);
    });
    panel.append(element("p", "news-evidence-heading", "本事件的报道"), evidence);
    if (unique.size > 1) panel.append(element("p", "news-evidence-note", "已合并近似报道；多个网址可能转述同一信息，仍需核对原始出处。"));
    const breakdown = item.breakdown || {};
    const labels = { match: "风格匹配", quality: "资料质量", importance: "金融重要性", freshness: "时效", heat: "报道热度" };
    const scores = element("dl", "news-score-grid");
    Object.keys(labels).forEach(key => {
      if (!Number.isFinite(breakdown[key])) return;
      const cell = element("div");
      cell.append(element("dt", "", labels[key]), element("dd", "", String(Math.round(breakdown[key]))));
      scores.append(cell);
    });
    if (scores.childElementCount) panel.append(element("p", "news-evidence-heading", "这条资讯如何排到这里"), scores,
      element("p", "news-evidence-note", "各项为 0–100 的规则评分，用来解释阅读排序；不是事实可信度概率或投资评级。"));
    details.append(panel);
    return details;
  }
  function renderMethod() {
    const method = section.querySelector(".news-method");
    if (!method) return;
    const weights = engine.SCORE_WEIGHTS || { match: .4, quality: .2, importance: .15, freshness: .15, heat: .1 };
    const scoreText = "排序权重：风格匹配 " + Math.round(weights.match * 100) + "%、资料质量 " + Math.round(weights.quality * 100) + "%、金融重要性 " + Math.round(weights.importance * 100) + "%、时效 " + Math.round(weights.freshness * 100) + "%、报道热度 " + Math.round(weights.heat * 100) + "%。这些权重是设计规则，尚未通过用户阅读数据训练。";
    method.replaceChildren(element("summary", "", "这些资讯为什么推荐给我？"),
      element("p", "", "先检查金融相关性、来源、时间与正文，再合并同一事件的近似报道。根据测试中的信息依据、持有周期、风险偏好和决策方式匹配内容，并结合金融重要性、资料质量、时效与报道热度排序。"),
      element("p", "", "每期最多 6 条，优先保留一条风险或防御视角。同一发布方最多 3 条，同一主题最多 2 条；合格内容不足时少推。资讯范围为北京时间周一至周日，只对已采集内容排序。"),
      element("p", "", scoreText),
      element("p", "", "每条卡片可以展开查看核验点、报道原文和评分分项。人格仅影响阅读顺序；当前使用可解释规则，没有运行大模型双评分或预测收益。算法版本：" + engine.VERSION + "。"));
  }
  renderMethod();
  const sourceHealth = element("details", "news-source-health news-method");
  $("news-data-note").before(sourceHealth);
  function renderSourceHealth() {
    sourceHealth.replaceChildren(element("summary", "", "查看各信源的采集状态"));
    const states = { ok: "已读取", empty: "未取得有效内容", error: "本次采集失败", not_configured: "未配置访问凭证" };
    const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
    const list = element("ul", "news-source-health-list");
    sources.forEach(source => {
      const retained = (snapshot.articles || []).filter(a => a && (a.sourceId === source.id || a.source === source.name))
        .map(a => Date.parse(a.publishedAt)).filter(Number.isFinite);
      const latest = Date.parse(source.latestPublishedAt);
      const stamp = Number.isFinite(latest) ? latest : retained.length ? Math.max(...retained) : NaN;
      const label = Number.isFinite(latest) ? "本次取得的最新报道" : "保留快照中的最新报道";
      const row = element("li");
      row.append(element("span", "news-source-health-name", source.name || source.id || "信源"));
      row.append(element("span", "", (states[source.state] || "状态未知") + (source.truncated ? " · 范围有限" : "") +
        (Number.isFinite(source.count) ? " · 本次 " + source.count + " 条" : "")));
      row.append(element("span", "news-source-health-date", Number.isFinite(stamp) ? label + "：" +
        new Date(stamp).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "暂无可核实的报道日期"));
      list.append(row);
    });
    sourceHealth.append(list, element("p", "news-evidence-note", "快照生成时间仅表示本地整理时间；各来源的报道日期与采集状态需分别查看。采集失败时可继续保留此前取得的内容。"));
    sourceHealth.hidden = !sources.length;
  }
  function rememberEdition() {
    try {
      const week = engine.weekOf(Date.now()).id;
      const previous = localStorage.getItem("gbti-news-last-week");
      newEdition = !!previous && previous !== week;
      localStorage.setItem("gbti-news-last-week", week);
    } catch (_) { /* 存储关闭时仍可阅读。 */ }
  }
  function renderCards() {
    if (!outcome) return;
    const now = Date.now(), code = outcome.personality.code;
    const weeks = engine.weeks(snapshot, now);
    if (selectedWeek && !weeks.includes(selectedWeek)) selectedWeek = null;
    const digest = engine.recommend(snapshot, code, { scores: outcome.scores, now, week: selectedWeek });
    const current = engine.weekOf(now).id === digest.week.id;
    $("news-edition").textContent = dateText(digest.week.start) + " — " + dateText(digest.week.end - 1);
    $("news-style").textContent = outcome.personality.name + " · " + code;
    $("news-lens").textContent = digest.profile.lens;
    $("news-focus").replaceChildren(...digest.profile.focus.map(key => element("span", "", engine.TOPICS[key].label)));
    $("news-week").replaceChildren(...weeks.map(week => {
      const option = element("option", "", week + (week === engine.weekOf(now).id ? " · 本周" : " · 往期"));
      option.value = week;
      option.selected = week === digest.week.id;
      return option;
    }));
    const status = [];
    if (newEdition && current) status.push("新一期已开始");
    status.push(current ? "本周精选" : "往期资讯");
    status.push("已选 " + digest.items.length + " 条");
    if (digest.stale) status.push("快照超过 24 小时或尚未更新，阅读时请核对原文日期");
    $("news-status").textContent = status.join(" · ");
    $("news-status").classList.toggle("is-stale", digest.stale);
    const list = $("news-list");
    list.replaceChildren();
    if (!digest.items.length) {
      list.append(element("p", "news-empty", "这一期还没有符合筛选条件的资讯。可稍后检查更新，或选择往期阅读。"));
    }
    digest.items.forEach((item, index) => {
      const card = element("article", "news-item" + (item.role === "perspective" ? " news-perspective" : ""));
      const number = element("span", "news-number", String(index + 1).padStart(2, "0"));
      number.setAttribute("aria-hidden", "true");
      const body = element("div", "news-item-body");
      const meta = element("div", "news-meta");
      meta.append(element("span", "news-category", item.role === "perspective" ? "换个视角 · " + engine.TOPICS[item.topic].label : engine.TOPICS[item.topic].label));
      const time = element("time", "", dateText(item.publishedAt, true));
      time.dateTime = item.publishedAt;
      meta.append(time);
      const heading = element("h3");
      const link = element("a", "news-title-link", item.title);
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      heading.append(link);
      const summary = element("p", "news-summary", item.summary);
      const why = element("p", "news-reason", item.role === "perspective" ? "换个视角：补充风险或防御信息，帮助复核你当前的判断。" : item.reason);
      const source = element("div", "news-source");
      source.append(element("span", "", item.source + (item.publisher !== item.source ? " / " + item.publisher : "") + (item.sources.length > 1 ? " · " + item.sources.length + " 个发布方" : "")));
      const read = element("a", "news-read", "阅读原文 ↗");
      read.href = item.url; read.target = "_blank"; read.rel = "noopener noreferrer";
      read.setAttribute("aria-label", "阅读原文：" + item.title);
      source.append(read);
      body.append(meta, heading, summary, why, source, evidenceDetails(item));
      card.append(number, body); list.append(card);
    });
    const fetched = digest.fetchedAt && Number.isFinite(Date.parse(digest.fetchedAt)) ? dateText(digest.fetchedAt, true) : "暂无";
    const partial = (snapshot.sources || []).some(s => s.state !== "ok" || s.truncated);
    $("news-data-note").textContent = "快照生成：" + fetched + "（北京时间）" + (partial ? " · 部分信源未取得数据或采集范围有限" : "") + "。资讯仅供阅读参考，不构成投资建议。";
    renderSourceHealth();
  }
  async function refresh(manual) {
    if (!outcome) return;
    const version = ++requestVersion;
    const button = $("news-refresh");
    button.disabled = true;
    if (manual) $("news-status").textContent = "正在检查最新资讯……";
    if (location.protocol === "file:") {
      button.disabled = false;
      if (manual) $("news-status").textContent = "当前为离线快照。运行 tools 中的「启动每周资讯服务.cmd」后，可在线检查更新。";
      return;
    }
    try {
      let collectionNote = "";
      // 手动刷新时，先请本地更新服务真正采集一轮（静态部署下这个接口不存在，会快速失败并跳过）；
      // 浏览器不持有数据源密钥，采集只在服务端进行。
      if (manual) {
        $("news-status").textContent = "正在采集最新资讯，约需一两分钟……";
        try {
          const trigger = await fetch("/api/news/refresh", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(240000) });
          const isJson = (trigger.headers.get("content-type") || "").includes("application/json");
          const result = isJson ? await trigger.json() : null;
          if (trigger.ok && result && result.ok) {
            collectionNote = "已完成采集";
            if (version === requestVersion) $("news-status").textContent = "采集完成，正在读取最新快照……";
          } else collectionNote = "本次未完成采集，仅显示可用快照";
        } catch (_) { collectionNote = "采集服务暂不可用，仅显示可用快照"; }
      }
      // 静态部署与本地更新服务都读同一份 JSON。
      const response = await fetch("news-data.json?t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("snapshot unavailable");
      const data = await response.json();
      if (data.schemaVersion !== 1 || !Array.isArray(data.articles)) throw new Error("invalid snapshot");
      if (version !== requestVersion || !outcome) return;
      snapshot = data;
      renderCards();
      if (manual) $("news-status").textContent += " · " + collectionNote;
    } catch (_) {
      if (version !== requestVersion || !outcome) return;
      renderCards();
      $("news-status").textContent += " · 网络暂不可用，保留已有内容";
    } finally {
      if (version === requestVersion) button.disabled = false;
    }
  }
  $("news-refresh").addEventListener("click", () => refresh(true));
  $("news-week").addEventListener("change", () => { selectedWeek = $("news-week").value; renderCards(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && outcome) { selectedWeek = null; rememberEdition(); renderCards(); refresh(false); }
  });
  window.GBTI_NEWS = {
    render(value) { outcome = value; selectedWeek = null; rememberEdition(); section.hidden = false; renderCards(); refresh(false); },
    hide() { outcome = null; requestVersion++; section.hidden = true; $("news-refresh").disabled = false; },
    refresh: () => refresh(true)
  };
})();
