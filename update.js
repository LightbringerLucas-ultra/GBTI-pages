/**
 * 数据维护面板。
 *
 * 页面本身是纯静态的，无法自己去抓行情。这里提供一条可点击的通道：
 * 由一个在本机后台运行的轻量服务（tools/update-server.py）负责调用抓取脚本，
 * 页面向它发一个请求即可触发更新，更新完成后重新读取 market-data.js。
 *
 * 没有服务时不会报错卡住，而是明确告诉使用者该怎么手动跑脚本。
 */
(function () {
  "use strict";

  const ENDPOINT_KEY = "gbti-update-endpoint";
  const DEFAULT_ENDPOINT = "http://127.0.0.1:8765";
  const DEFAULT_PORT = "8765";

  const $ = function (id) { return document.getElementById(id); };

  let busy = false;
  let checked = false;
  let serviceUp = false;   // 最近一次探测/检查是否连上了更新服务
  let waitingForService = false;   // file:// 下是否正在等服务启动（等待中会自动跳转）

  /* ---------- 服务地址 ---------- */

  function storedEndpoint() {
    try { return (localStorage.getItem(ENDPOINT_KEY) || "").trim(); } catch (error) { return ""; }
  }

  function saveEndpoint(value) {
    try {
      if (value) localStorage.setItem(ENDPOINT_KEY, value);
      else localStorage.removeItem(ENDPOINT_KEY);
    } catch (error) { /* 忽略。 */ }
  }

  // 网页由本地服务托管时用同一个地址；双击 HTML 打开时用本机默认端口。
  function endpoint() {
    const stored = storedEndpoint();
    if (stored) return stored.replace(/\/+$/, "");
    const host = location.hostname;
    // 只有本机托管时，「同址」才等于「更新服务」。
    // 线上静态站点也是 http(s)，但那里没有 /api/*，填同址必然连不上。
    if (location.protocol.indexOf("http") === 0
        && (host === "127.0.0.1" || host === "localhost" || host === "::1")) {
      return location.origin;
    }
    return DEFAULT_ENDPOINT;
  }

  // 双击打开时页面来源是 file://，浏览器会直接拦掉向 http 本机地址发的请求。
  // 这是浏览器策略，页面侧无法绕过，只能换成用服务地址访问。
  function openedFromFile() {
    return location.protocol === "file:";
  }

  function servedByLocalApi() {
    const host = location.hostname;
    return location.protocol.indexOf("http") === 0
      && (host === "127.0.0.1" || host === "localhost" || host === "::1");
  }

  // 线上静态站点：不是本机托管，也没有后台服务，只能靠浏览器直连行情接口。
  function onlineMode() {
    return location.protocol.indexOf("http") === 0 && !servedByLocalApi();
  }

  function liveReady() {
    return onlineMode() && !!window.GBTI_LIVE && typeof window.GBTI_LIVE.run === "function";
  }

  /* ---------- 本地快照信息 ---------- */

  function marketInfo() {
    // market-data.js 以顶层 const 声明，只在全局词法作用域里，必须裸引用读取。
    const data = typeof GBTI_MARKET !== "undefined" ? GBTI_MARKET : null;
    if (!data) return null;
    const quotes = data.quotes || {};
    let stale = 0;
    let noValuation = 0;
    Object.keys(quotes).forEach(function (code) {
      const q = quotes[code] || {};
      if (q.date !== data.asOf) stale += 1;
      if (q.pe == null && q.pb == null) noValuation += 1;
    });
    return {
      asOf: data.asOf || "--",
      fetchedAt: data.fetchedAt || "",
      coverage: data.coverage || "",
      source: data.source || "",
      count: Object.keys(quotes).length,
      stale: stale,
      noValuation: noValuation
    };
  }

  function shortTime(value) {
    if (!value) return "--";
    return String(value).replace("T", " ").slice(0, 16);
  }

  /* ---------- 渲染 ---------- */

  function renderStatus() {
    const box = $("data-status");
    const hint = $("data-fold-hint");
    const info = marketInfo();

    if (hint) {
      hint.textContent = info
        ? "本地快照：行情截止 " + info.asOf + " 收盘 · 覆盖 " + (info.coverage || info.count + " 只")
        : "未读到本地行情快照";
    }
    if (!box) return;

    if (!info) {
      box.innerHTML = "";
      const p = document.createElement("p");
      p.className = "hint warn";
      p.textContent = "没有读到 market-data.js。请先运行一次抓取脚本：python tools/fetch-market-data.py";
      box.appendChild(p);
      return;
    }

    const rows = [
      ["行情截止", info.asOf + " 收盘"],
      ["快照抓取于", shortTime(info.fetchedAt)],
      ["覆盖标的", info.coverage || info.count + " 只"],
      ["数据来源", info.source]
    ];
    // 完整性自检：日期不齐提示重新更新；ETF 没有估值字段属正常，仅说明。
    if (info.stale > 0) rows.push(["数据完整性", info.stale + " 只行情日期与快照不一致，建议点「立即更新行情数据」重新抓取"]);
    if (info.noValuation > 0) rows.push(["估值字段", info.noValuation + " 只（多为 ETF）无 PE/PB，属正常现象"]);
    // 指数扩展池新鲜度：指数每季度调样，超过 90 天提示重新生成候选池。
    if (typeof GBTI_POOL_INDEX_META !== "undefined" && GBTI_POOL_INDEX_META.generatedAt) {
      const age = Math.floor((Date.now() - new Date(GBTI_POOL_INDEX_META.generatedAt + "T00:00:00+08:00")) / 86400000);
      rows.push(["指数扩展池", GBTI_POOL_INDEX_META.count + " 只，生成于 " + GBTI_POOL_INDEX_META.generatedAt
        + (age > 90 ? "（已超过 90 天，指数可能已调样，双击 tools\\更新候选池.bat 重新生成）" : "")]);
    }

    box.replaceChildren();
    const list = document.createElement("dl");
    list.className = "data-facts";
    rows.forEach(function (pair) {
      if (!pair[1]) return;
      const dt = document.createElement("dt");
      dt.textContent = pair[0];
      const dd = document.createElement("dd");
      dd.textContent = pair[1];
      list.append(dt, dd);
    });
    box.appendChild(list);
  }

  function setLog(text, kind) {
    const box = $("data-log");
    if (!box) return;
    if (!text) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    box.textContent = text;
    box.dataset.kind = kind || "info";
  }

  function setBusy(value, label) {
    busy = value;
    ["data-refresh", "data-check"].forEach(function (id) {
      const button = $(id);
      if (button) button.disabled = value;
    });
    const refresh = $("data-refresh");
    if (refresh) refresh.textContent = value ? (label || "正在更新……") : "立即更新行情数据";
  }

  /* ---------- 请求 ---------- */

  function request(path, options, timeoutMs) {
    const url = endpoint() + path;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    const config = Object.assign({ cache: "no-store", credentials: "omit" }, options || {});
    if (controller) config.signal = controller.signal;

    return fetch(url, config).then(function (response) {
      if (timer) window.clearTimeout(timer);
      return response.text().then(function (text) {
        let data = null;
        try { data = JSON.parse(text); } catch (error) { data = null; }
        if (!data || typeof data !== "object") {
          throw new Error("服务返回的不是本页需要的 JSON，请确认地址填的是更新服务而不是其它网页。");
        }
        if (!response.ok) throw new Error(data.error || ("服务返回 HTTP " + response.status));
        return data;
      });
    }, function (error) {
      if (timer) window.clearTimeout(timer);
      const reason = error && error.name === "AbortError"
        ? "请求超时，服务可能正在更新数据。"
        : "连不上更新服务（" + endpoint() + "）。";
      throw new Error(reason);
    });
  }

  function unreachableHelp(error) {
    const head = error && error.message ? error.message + "\n\n" : "";
    return head
      + "没有连上更新服务。请确认：\n"
      + "一、已在本文件夹下运行 python tools\\update-server.py（或双击 tools\\启动更新服务.bat），"
      + "并且那个窗口还开着。\n"
      + "二、上面的服务地址与它打印的地址一致（默认 http://127.0.0.1:" + DEFAULT_PORT + "）。\n\n"
      + "也可以不用服务，直接运行 python tools\\fetch-market-data.py 抓一次，然后刷新本页。";
  }

  function onlineHelp(error) {
    const head = error && error.message ? error.message + "\n\n" : "";
    return head
      + "当前是线上静态站点，没有后台服务，所以「更新服务」连不上是必然的，不是地址填错。\n"
      + "点「立即更新行情数据」会改用浏览器直连行情接口（腾讯，免密钥）：\n"
      + "约 20 秒抓完 408 只，抓到的快照存在本机浏览器里，抓完自动刷新页面。";
  }

  const FILE_TIP = "当前是双击打开（file://），更新服务还没运行。\n"
    + "只需一步：回到这个文件夹，双击 tools 里的「启动更新服务.bat」。\n"
    + "服务一启动，本页会自动跳转过去，之后点「立即更新行情数据」即可。";

  // 双击打开时浏览器对 file:// 页面访问本机服务限制不一：服务端已放行该来源，
  // 所以先真的发一次探测，连得上就直接用，连不上再显示帮助，而不是一律判死。
  function probe() {
    if (!openedFromFile()) return Promise.resolve(false);
    return request("/api/status", { method: "GET" }, 2500)
      .then(function (data) {
        serviceUp = true;
        renderTransportNotice();
        renderSchedule(data && data.schedule);
        renderToken(data && data.token);
        renderLan(data && data.lanUrl);
        if (data && data.running) watchRunning(true);
        return true;
      })
      .catch(function () {
        serviceUp = false;
        renderTransportNotice();
        waitForServiceAndJump();
        return false;
      });
  }

  function failureHelp(error) {
    if (openedFromFile()) return FILE_TIP;
    if (onlineMode()) return onlineHelp(error);
    return unreachableHelp(error);
  }

  // file:// 下用户表达过更新意图（点了横幅或展开了面板）后，静默轮询等服务。
  // 服务一出现就跳到它托管的页面——那边所有按钮都能用。探测很轻，几秒钟一次。
  function waitForServiceAndJump() {
    if (waitingForService || !openedFromFile()) return;
    waitingForService = true;
    renderTransportNotice();
    const tick = function () {
      request("/api/status", { method: "GET" }, 2000)
        .then(function () {
          waitingForService = false;
          const wait = $("data-waiting");
          if (wait) wait.textContent = "已检测到更新服务，正在带你过去……";
          window.location.href = endpoint() + "/index.html";
        })
        .catch(function () {
          if (openedFromFile()) window.setTimeout(tick, 5000);
          else waitingForService = false;
        });
    };
    window.setTimeout(tick, 3000);
  }

  // 双击打开时，在面板里直接给出可以点的直达入口，省得使用者自己拼地址。
  // 但只有在探测确认连不上服务时才显示；能连上就与正常打开无异。
  function renderTransportNotice() {
    const box = $("data-transport");
    if (!box) return;
    if (onlineMode() && !serviceUp) { renderOnlineNotice(box); return; }
    if (!openedFromFile() || serviceUp) { box.hidden = true; box.replaceChildren(); return; }

    box.hidden = false;
    box.replaceChildren();

    const tip = document.createElement("p");
    tip.className = "hint warn";
    tip.style.whiteSpace = "pre-line";
    tip.textContent = FILE_TIP;

    const row = document.createElement("div");
    row.className = "data-actions";
    const open = document.createElement("button");
    open.className = "button-secondary";
    open.type = "button";
    open.textContent = "从 " + endpoint() + " 打开本页";
    open.addEventListener("click", function () {
      // 服务没在跑时直接跳转会落到"无法访问此页面"，先探一下再决定。
      open.disabled = true;
      open.textContent = "正在检查服务是否已启动……";
      request("/api/status", { method: "GET" }, 2500)
        .then(function () { window.location.href = endpoint() + "/index.html"; })
        .catch(function () {
          open.disabled = false;
          open.textContent = "从 " + endpoint() + " 打开本页";
          setLog("现在连不上 " + endpoint() + "：更新服务还没有运行。\n\n"
            + "请先双击 tools 文件夹里的「启动更新服务.bat」，它会启动服务并自动打开本页"
            + "（那个黑色窗口要一直开着，关掉服务就停了）。\n"
            + "服务启动后再来点这个按钮，或直接用自动弹出的页面。", "bad");
        });
    });
    const copy = document.createElement("button");
    copy.className = "button-ghost";
    copy.type = "button";
    copy.textContent = "复制服务启动命令";
    copy.addEventListener("click", function () {
      copyText("python tools\\update-server.py", copy);
    });
    row.append(open, copy);

    box.append(tip, row);

    if (waitingForService) {
      const wait = document.createElement("p");
      wait.className = "hint";
      wait.id = "data-waiting";
      wait.textContent = "正在自动探测本机服务……你现在去双击「启动更新服务.bat」，服务一启动本页就会自动跳过去。";
      box.append(wait);
    }
  }

  /* ---------- 过期提醒横幅 ---------- */

  // 近似取最近一个已收盘的交易日：16 点前算前一工作日，周末往前推。
  // 不考虑法定节假日，只用于提示是否该更新，不作为严格判断。
  function lastTradingDay() {
    const d = new Date();
    if (d.getHours() < 16) d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d;
  }

  function fmtDate(d) {
    const pad = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  // 快照日期之后（不含当天）到最近交易日之间隔了几个工作日。
  function tradingDaysBehind(asOf) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf || "");
    if (!m) return 0;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const end = lastTradingDay();
    let days = 0;
    while (d < end) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) days += 1;
    }
    return days;
  }

  function renderBanner() {
    const panel = $("data-panel");
    if (!panel) return;
    let banner = $("data-banner");
    const info = marketInfo();
    const stale = info && info.asOf && info.asOf < fmtDate(lastTradingDay());
    if (!stale) {
      if (banner) banner.remove();
      return;
    }
    const days = tradingDaysBehind(info.asOf);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "data-banner";
      banner.className = "data-banner";
      panel.before(banner);
    }
    banner.replaceChildren();
    const text = document.createElement("span");
    text.className = "data-banner-text";
    text.textContent = "行情数据停留在 " + info.asOf
      + (days > 0 ? "，已落后约 " + days + " 个交易日" : "");
    const action = document.createElement("button");
    action.className = "data-banner-button";
    action.type = "button";
    action.textContent = "一键更新";
    action.addEventListener("click", function () {
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      if (serviceUp || servedByLocalApi()) { refresh(); return; }
      // 服务状态未知时先探测，连上后可以在面板里更新。
      (openedFromFile() ? probe() : check()).then(function (up) {
        if (up) setLog("已连上更新服务，点下面的「立即更新行情数据」即可。", "ok");
      });
    });
    banner.append(text, action);
  }

  /* ---------- 每个交易日自动更新 ---------- */

  function renderSchedule(schedule) {
    const btn = $("data-schedule");
    if (!btn) return;
    if (!schedule || schedule.supported === false) {
      btn.hidden = !schedule;   // 还没查过状态时先藏着
      if (schedule && schedule.supported === false) {
        btn.hidden = false;
        btn.disabled = true;
        btn.textContent = schedule.note || "自动更新仅支持 Windows";
      }
      return;
    }
    btn.hidden = false;
    btn.disabled = false;
    btn.dataset.enabled = schedule.enabled ? "1" : "";
    btn.textContent = schedule.enabled
      ? "已开启每个交易日自动更新（工作日 " + (schedule.time || "17:35") + "）· 点击关闭"
      : "开启每个交易日自动更新（工作日 " + (schedule.time || "17:35") + "）";
  }

  function toggleSchedule() {
    const btn = $("data-schedule");
    if (!btn) return;
    const enable = !btn.dataset.enabled;
    btn.disabled = true;
    btn.textContent = enable ? "正在开启……" : "正在关闭……";
    // 不带自定义头，保持为简单请求，file:// 来源下也不需要预检。
    request("/api/schedule", { method: "POST", body: JSON.stringify({ enable: enable }) }, 30000)
      .then(function (data) {
        setLog(data.message || (data.ok ? "已完成。" : "操作失败。"), data.ok ? "ok" : "bad");
        renderSchedule(data);
      })
      .catch(function (error) {
        renderSchedule({ supported: true, enabled: !enable });
        setLog(failureHelp(error), "bad");
      });
  }

  /* ---------- 数据凭证 ---------- */

  function renderToken(token) {
    const box = $("data-token-box");
    const status = $("data-token-status");
    if (!box || !status) return;
    if (!token) { box.hidden = true; return; }
    box.hidden = false;
    let text = "数据凭证：" + (token.note || "状态未知");
    if (token.present && token.fresh && typeof token.ageMinutes === "number") {
      const remain = Math.max(0, 12 * 60 - token.ageMinutes);
      text = "数据凭证：有效，约剩 " + Math.floor(remain / 60) + " 小时 " + (remain % 60) + " 分钟";
    }
    status.textContent = text + "。过期或缺失时脚本会自动改用免密钥通道，只是字段会少一些。";
    status.classList.toggle("warn", !token.fresh);
  }

  function saveToken() {
    const input = $("data-token-input");
    const btn = $("data-token-save");
    const value = ((input && input.value) || "").trim();
    if (!value) { setLog("请先把凭证粘贴到输入框里。", "bad"); return; }
    if (btn) btn.disabled = true;
    request("/api/token", { method: "POST", body: JSON.stringify({ token: value }) }, 30000)
      .then(function (data) {
        setLog(data.message || (data.ok ? "凭证已保存。" : "保存凭证失败。"), data.ok ? "ok" : "bad");
        if (data.ok && input) input.value = "";
        renderToken(data);
      })
      .catch(function (error) { setLog(failureHelp(error), "bad"); })
      .then(function () { if (btn) btn.disabled = false; });
  }

  /* ---------- 手机（局域网）访问 ---------- */

  function renderLan(url) {
    const box = $("data-lan");
    if (!box) return;
    if (!url) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    box.replaceChildren();
    const text = document.createElement("span");
    text.textContent = "手机访问（同一 WiFi）：" + url;
    const copy = document.createElement("button");
    copy.className = "pill-button";
    copy.type = "button";
    copy.textContent = "复制";
    copy.addEventListener("click", function () { copyText(url, copy); });
    box.append(text, copy);
  }

  /* ---------- 后台更新监视（带进度） ---------- */

  // 服务端启动时会自动补抓过期数据；页面开着的时候轮询进度，抓完自动刷新。
  let watching = false;
  let watchPassive = false;

  function progressText(d) {
    const p = d && d.progress;
    if (p && p.total) return "正在更新行情：第 " + p.done + " / " + p.total + " 只（" + p.current + "）……";
    return "服务端正在更新数据……";
  }

  function showProgress(d) {
    setLog(progressText(d), "info");
    const banner = $("data-banner");
    const btn = banner ? banner.querySelector(".data-banner-button") : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = (d.progress && d.progress.total)
        ? "更新中 " + d.progress.done + "/" + d.progress.total
        : "更新中……";
    }
  }

  // passive=true：被动发现服务端在更新（比如启动时的自动补抓），完成后自动刷新页面；
  // passive=false：配合手动点按钮，只负责显示进度，收尾交给 refresh() 的响应。
  function watchRunning(passive) {
    if (watching) return;
    watching = true;
    watchPassive = !!passive;
    const tick = function () {
      request("/api/status", { method: "GET" }, 5000).then(function (d) {
        if (d.running) {
          showProgress(d);
          window.setTimeout(tick, 4000);
          return;
        }
        watching = false;
        renderSchedule(d.schedule);
        renderToken(d.token);
        if (!watchPassive) return;
        const info = marketInfo();
        if (d.asOf && info && d.asOf !== info.asOf) {
          setLog("后台更新完成（行情截止 " + d.asOf + "），正在刷新页面……", "ok");
          window.setTimeout(function () { window.location.reload(); }, 1500);
        } else {
          setLog("后台更新已结束，快照没有变化。", "info");
        }
      }).catch(function () { watching = false; });
    };
    window.setTimeout(tick, 3000);
  }

  // 线上模式的面板：不再让人反复填地址，直接把「浏览器直连」这条路给出来。
  function renderOnlineNotice(box) {
    box.hidden = false;
    box.replaceChildren();

    const tip = document.createElement("p");
    tip.className = "hint";
    tip.style.whiteSpace = "pre-line";
    tip.textContent = "当前是线上静态站点，没有后台服务，「更新服务」连不上是必然的。\n"
      + "这里改用浏览器直连行情接口（腾讯，免密钥），抓完自动刷新本页。";

    const row = document.createElement("div");
    row.className = "data-actions";

    const runButton = document.createElement("button");
    runButton.className = "button-secondary";
    runButton.type = "button";
    runButton.textContent = "在线更新行情数据";
    runButton.disabled = !liveReady();
    runButton.addEventListener("click", function () { refreshOnline(); });
    row.append(runButton);

    const saved = window.GBTI_LIVE && window.GBTI_LIVE.stored ? window.GBTI_LIVE.stored() : null;
    if (saved && saved.payload && saved.payload.asOf) {
      const reset = document.createElement("button");
      reset.className = "button-ghost";
      reset.type = "button";
      reset.textContent = "恢复内置快照（" + saved.payload.asOf + "）";
      reset.addEventListener("click", function () {
        if (window.GBTI_LIVE) window.GBTI_LIVE.clear();
        window.location.reload();
      });
      row.append(reset);
    }

    box.append(tip, row);
  }

  function refreshOnline() {
    if (busy) return;
    if (!liveReady()) {
      setLog("在线更新需要 live-refresh.js，页面上没加载到，刷新一次再试。", "bad");
      return;
    }
    setBusy(true, "正在抓取……");
    setLog("在线模式：浏览器直连行情接口，分 9 批抓取 408 只，大约 20 秒。", "info");
    window.GBTI_LIVE.run({
      onProgress: function (p) { setLog("已抓取 " + p.done + " / " + p.total + " 只……", "info"); }
    }).then(function (result) {
      setBusy(false);
      setLog("更新完成。行情截止 " + result.asOf + " 收盘，覆盖 " + result.coverage
        + "，用时约 " + Math.round(result.seconds) + " 秒。\n页面将在 2 秒后自动刷新。", "ok");
      window.setTimeout(function () { window.location.reload(); }, 2000);
    }).catch(function (error) {
      setBusy(false);
      setLog("在线更新失败：" + (error && error.message ? error.message : "未知原因"), "bad");
    });
  }

  /* ---------- 动作 ---------- */

  function check() {
    setLog("正在检查更新服务……", "info");
    return request("/api/status", { method: "GET" }, 5000)
      .then(function (data) {
        checked = true;
        serviceUp = true;
        renderTransportNotice();
        renderSchedule(data.schedule);
        renderToken(data.token);
        renderLan(data.lanUrl);
        if (data.running) watchRunning(true);
        const token = data.token || {};
        const tokenLine = token.present === false
          ? "数据凭证：尚未配置，脚本会自动改用免密钥通道。"
          : "数据凭证：" + (token.note || "状态未知") + "。";
        setLog(
          "连接成功。服务端看到的快照：行情截止 " + (data.asOf || "--") + " 收盘，抓取于 "
          + shortTime(data.fetchedAt) + "，覆盖 " + (data.coverage || "--") + "。\n" + tokenLine,
          "ok"
        );
        return data;
      })
      .catch(function (error) {
        checked = false;
        serviceUp = false;
        renderTransportNotice();
        setLog(failureHelp(error), "bad");
        if (openedFromFile()) waitForServiceAndJump();
        return null;
      });
  }

  function refresh() {
    if (busy) return;
    if (!serviceUp && liveReady()) { refreshOnline(); return; }
    setBusy(true, "正在更新……");
    setLog("已向更新服务发出请求，逐只抓取大约需要 1 至 3 分钟，请保持页面与窗口开着。", "info");
    watchRunning(false);   // 并行轮询进度，日志与横幅会实时显示第几只

    request("/api/refresh", { method: "POST" }, 600000)
      .then(function (data) {
        setBusy(false);
        if (!data.ok) {
          setLog("更新没有完成：" + (data.error || "未知原因") + "\n\n" + (data.tail || ""), "bad");
          return;
        }
        const failed = (data.failures || []).length;
        setLog(
          "更新完成。行情截止 " + data.asOf + " 收盘，覆盖 " + data.coverage
          + "，用时约 " + Math.round(data.seconds || 0) + " 秒。"
          + (failed ? "\n有 " + failed + " 只失败，其余已写入。" : "\n全部成功。")
          + "\n页面将在 2 秒后自动刷新。",
          "ok"
        );
        window.setTimeout(function () { window.location.reload(); }, 2000);
      })
      .catch(function (error) {
        setBusy(false);
        serviceUp = false;
        renderTransportNotice();
        setLog(failureHelp(error), "bad");
      });
  }

  /* ---------- 绑定 ---------- */

  function copyText(text, button) {
    const flash = function (ok) {
      const origin = button.textContent;
      button.textContent = ok ? "已复制" : "复制失败";
      window.setTimeout(function () { button.textContent = origin; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(true); }, function () { flash(false); });
      return;
    }
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); flash(true); } catch (error) { flash(false); }
    document.body.removeChild(area);
  }

  function bind() {
    const panel = $("data-panel");
    if (!panel) return;

    renderStatus();
    renderTransportNotice();
    renderBanner();

    const input = $("data-endpoint");
    if (input) {
      input.value = storedEndpoint();
      input.placeholder = "例如 " + DEFAULT_ENDPOINT;
      input.addEventListener("change", function () {
        saveEndpoint(input.value.trim());
        setLog("已把更新服务地址改为 " + endpoint() + "，正在重新检查……", "info");
        check();
      });
    }

    const refreshBtn = $("data-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", refresh);
    const checkBtn = $("data-check");
    if (checkBtn) checkBtn.addEventListener("click", check);
    const scheduleBtn = $("data-schedule");
    if (scheduleBtn) scheduleBtn.addEventListener("click", toggleSchedule);
    const tokenBtn = $("data-token-save");
    if (tokenBtn) tokenBtn.addEventListener("click", saveToken);

    document.querySelectorAll(".data-copy").forEach(function (button) {
      button.addEventListener("click", function () {
        const target = document.getElementById(button.dataset.copy);
        if (target) copyText(target.textContent, button);
      });
    });

    // 展开面板时自动探一次服务，省得使用者先猜地址是否对。
    panel.addEventListener("toggle", function () {
      if (!panel.open || checked) return;
      check();
    });

    // 打开页面就静默连一次服务：本地服务托管时做完整检查（顺带取计划任务状态），
    // 双击打开时先探测，连得上按钮就直接可用，连不上才显示帮助。
    if (servedByLocalApi()) check();
    else if (openedFromFile()) probe();

    // 端口可能被改过，双击打开时给出本机常见端口的提示。
    if (location.protocol === "file:" && !storedEndpoint()) {
      const note = $("data-endpoint");
      if (note && !note.value) note.placeholder = "留空则用 " + DEFAULT_ENDPOINT + "（本机端口 " + DEFAULT_PORT + "）";
    }
  }

  window.GBTI_UPDATE = {
    init: bind,
    check: check,
    refresh: refresh,
    endpoint: endpoint,
    info: marketInfo,
    renderStatus: renderStatus
  };
})();
