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
    status.push(current ? "本周持续更新" : "往期资讯");
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
      source.append(element("span", "", item.source + (item.publisher !== item.source ? " / " + item.publisher : "") + (item.sources.length > 1 ? " · " + item.sources.length + " 家来源报道" : "")));
      const read = element("a", "news-read", "阅读原文 ↗");
      read.href = item.url; read.target = "_blank"; read.rel = "noopener noreferrer";
      read.setAttribute("aria-label", "阅读原文：" + item.title);
      source.append(read);
      body.append(meta, heading, summary, why, source);
      card.append(number, body); list.append(card);
    });
    const fetched = digest.fetchedAt && Number.isFinite(Date.parse(digest.fetchedAt)) ? dateText(digest.fetchedAt, true) : "暂无";
    const partial = (snapshot.sources || []).some(s => s.state === "error" || s.truncated);
    $("news-data-note").textContent = "数据更新：" + fetched + "（北京时间）" + (partial ? " · 部分信源不可用或采集范围有限" : "") + "。资讯仅供阅读参考，不构成投资建议。";
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
      // 手动刷新时，先请本地更新服务真正采集一轮（静态部署下这个接口不存在，会快速失败并跳过）；
      // 浏览器不持有数据源密钥，采集只在服务端进行。
      if (manual) {
        $("news-status").textContent = "正在采集最新资讯，约需一两分钟……";
        try {
          const trigger = await fetch("/api/news/refresh", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(240000) });
          if (trigger.ok && version === requestVersion) $("news-status").textContent = "采集完成，正在读取最新快照……";
        } catch (_) { /* 静态部署或服务未开：退化为只读快照。 */ }
      }
      // 静态部署与本地更新服务都读同一份 JSON。
      const response = await fetch("news-data.json?t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("snapshot unavailable");
      const data = await response.json();
      if (data.schemaVersion !== 1 || !Array.isArray(data.articles)) throw new Error("invalid snapshot");
      if (version !== requestVersion || !outcome) return;
      snapshot = data;
      renderCards();
      if (manual) $("news-status").textContent += " · 已读取最新可用快照";
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
