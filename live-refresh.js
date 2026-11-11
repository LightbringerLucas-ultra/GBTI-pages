/**
 * 在线直连刷新。
 *
 * 本页是纯静态的，线上没有后台，/api/status 这类接口不存在（返回 404）。
 * 但腾讯行情接口 qt.gtimg.cn 放行跨域（Access-Control-Allow-Origin: *），
 * 所以浏览器可以自己把 408 只逐批抓下来，按 tools/fetch-market-data.py
 * 的同一套字段映射重建快照，存进 localStorage，再让 market-store.js 接管。
 *
 * 只在「网页不是本机托管」时才用；本机跑 update-server.py 的那条路径不变。
 */
(function (root) {
  "use strict";

  var STORE_KEY = "gbti-market-live-v1";
  var API = "https://qt.gtimg.cn/q=";
  var BATCH = 50;          // 接口一次最多带 50 个代码

  /* 字段下标与 tools/fetch-market-data.py 里的 T 表保持一致。 */
  var FIELDS = {
    close: 3, time: 30, chgPct: 32, high: 33, low: 34,
    amountWan: 37, turnover: 38, peTtm: 39, amplitude: 43, mcapYi: 45, pb: 46
  };

  function num(value) {
    if (value === null || value === undefined) return null;
    var text = String(value).trim();
    if (!text || text === "-" || text === "--" || text === "null") return null;
    var n = parseFloat(text);
    return isFinite(n) ? n : null;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function localStamp() {
    var d = new Date();
    var off = -d.getTimezoneOffset();
    var abs = Math.abs(off);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
      + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
      + (off >= 0 ? "+" : "-") + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }

  /* ---------- 标的池与代码转换 ---------- */

  // pool.js 用顶层 const 声明，只存在于全局词法作用域、不挂 window，
  // 所以必须裸引用（用 typeof 兜未声明的情况），不能用 root.GBTI_POOL。
  function globalPool(name) {
    try {
      if (name === "GBTI_POOL" && typeof GBTI_POOL !== "undefined") return GBTI_POOL;
      if (name === "GBTI_POOL_FUND" && typeof GBTI_POOL_FUND !== "undefined") return GBTI_POOL_FUND;
      if (name === "GBTI_POOL_INDEX" && typeof GBTI_POOL_INDEX !== "undefined") return GBTI_POOL_INDEX;
    } catch (error) { /* 未声明就跳过 */ }
    return root[name] || null;
  }

  function poolCodes() {
    var seen = {};
    var list = [];
    ["GBTI_POOL", "GBTI_POOL_FUND", "GBTI_POOL_INDEX"].forEach(function (name) {
      var pool = globalPool(name);
      if (!pool || !pool.length) return;
      for (var i = 0; i < pool.length; i += 1) {
        var code = pool[i] && pool[i].code;
        if (!code || seen[code]) continue;
        seen[code] = true;
        list.push(code);
      }
    });
    return list;
  }

  // 601398.SH -> sh601398，与脚本里的 tencent_symbol 一致。
  function symbolOf(code) {
    var parts = String(code).split(".");
    return (parts[1] || "SH").toLowerCase() + parts[0];
  }

  function decode(buffer) {
    if (typeof root.TextDecoder === "function") {
      try { return new root.TextDecoder("gbk").decode(buffer); } catch (error) { /* 落到下面报错 */ }
    }
    throw new Error("当前浏览器不支持 GBK 解码，换 Chrome / Edge / Safari 再试。");
  }

  /* ---------- 抓取与解析 ---------- */

  function recordOf(fields) {
    function pick(key) {
      var index = FIELDS[key];
      return index < fields.length ? fields[index] : null;
    }
    var stamp = pick("time") || "";
    var date = stamp.length >= 8
      ? stamp.slice(0, 4) + "-" + stamp.slice(4, 6) + "-" + stamp.slice(6, 8)
      : "";
    var close = num(pick("close"));
    if (!date || date.indexOf("0000") === 0 || close === null) return null;

    var amountWan = num(pick("amountWan"));
    var pe = num(pick("peTtm"));
    var pb = num(pick("pb"));
    return {
      date: date,
      close: close,
      chgPct: num(pick("chgPct")),
      amplitude: num(pick("amplitude")),
      amountYi: amountWan ? Math.round(amountWan / 100) / 100 : null,   // 万元 -> 亿元
      turnover: num(pick("turnover")),
      pe: pe || null,
      pePct: null,        // 该接口不提供历史分位
      pb: pb || null,
      pbPct: null,
      mcapYi: num(pick("mcapYi"))
    };
  }

  function fetchBatch(symbols) {
    return fetch(API + symbols.join(","), { cache: "no-store", credentials: "omit" })
      .then(function (response) {
        if (!response.ok) throw new Error("行情接口返回 HTTP " + response.status);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        var text = decode(buffer);
        var out = {};
        text.split(/\r?\n/).forEach(function (line) {
          var row = line.trim();
          if (row.indexOf("v_") !== 0) return;
          var eq = row.indexOf("=");
          if (eq < 0) return;
          var symbol = row.slice(2, eq).trim();
          var payload = row.slice(eq + 1).replace(/;\s*$/, "").trim().replace(/^"|"$/g, "");
          if (payload) out[symbol] = payload.split("~");
        });
        return out;
      });
  }

  /* ---------- 主流程 ---------- */

  function run(options) {
    var onProgress = (options && options.onProgress) || function () {};
    var codes = poolCodes();
    if (!codes.length) {
      return Promise.reject(new Error("没读到标的池，页面脚本可能没加载完，刷新后再试。"));
    }

    var started = Date.now();
    var quotes = {};
    var failed = [];
    var cursor = 0;
    var chain = Promise.resolve();

    function consume(chunk, raw) {
      chunk.forEach(function (code) {
        var fields = raw[symbolOf(code)];
        var record = fields ? recordOf(fields) : null;
        if (record) quotes[code] = record;
        else failed.push(code);
      });
    }

    function step() {
      if (cursor >= codes.length) return chain;
      var chunk = codes.slice(cursor, cursor + BATCH);
      cursor += chunk.length;
      chain = chain.then(function () {
        return fetchBatch(chunk.map(symbolOf)).then(function (raw) {
          consume(chunk, raw);
          onProgress({ done: Math.min(cursor, codes.length), total: codes.length });
        });
      });
      return step();
    }

    return step()
      .then(function () {
        // 接口偶尔漏几只，补抓一轮再认输。
        if (!failed.length) return null;
        var retry = failed.slice();
        failed = [];
        return fetchBatch(retry.map(symbolOf)).then(function (raw) { consume(retry, raw); });
      })
      .then(function () {
        var keys = Object.keys(quotes);
        if (!keys.length) throw new Error("接口一只都没返回，可能被网络或代理拦住了。");

        var dates = keys.map(function (code) { return quotes[code].date; }).sort();
        var asOf = dates[dates.length - 1];
        var total = codes.length;
        if (keys.length < total * 0.9) {
          throw new Error("只抓到 " + keys.length + " / " + total + " 只，低于九成，已放弃本次更新。");
        }
        var builtin = typeof GBTI_MARKET !== "undefined" ? GBTI_MARKET : root.GBTI_MARKET;
        if (builtin && builtin.asOf && asOf < builtin.asOf) {
          throw new Error("接口返回的行情日期 " + asOf + " 比当前快照 " + builtin.asOf + " 还旧，已放弃。");
        }

        var payload = {
          asOf: asOf,
          fetchedAt: localStamp(),
          source: "腾讯行情接口 qt.gtimg.cn（浏览器直连）",
          channel: "tencent-online",
          hasPercentile: false,
          coverage: keys.length + " / " + total,
          quotes: quotes
        };

        try {
          localStorage.setItem(STORE_KEY, JSON.stringify({ savedAt: payload.fetchedAt, payload: payload }));
        } catch (error) {
          throw new Error("浏览器本地存储写入失败（可能空间不足或禁用了存储）。");
        }

        return {
          asOf: asOf,
          count: keys.length,
          total: total,
          coverage: payload.coverage,
          failed: total - keys.length,
          seconds: (Date.now() - started) / 1000
        };
      });
  }

  function stored() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function clear() {
    try { localStorage.removeItem(STORE_KEY); return true; } catch (error) { return false; }
  }

  root.GBTI_LIVE = {
    run: run,
    stored: stored,
    clear: clear,
    storeKey: STORE_KEY,
    poolCodes: poolCodes,
    symbolOf: symbolOf,
    recordOf: recordOf
  };
})(typeof window !== "undefined" ? window : this);
