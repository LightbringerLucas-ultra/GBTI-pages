/**
 * 自动把数据拉到最近交易日。
 *
 * 内置快照（market-data.js / index-history.js）是打包时点抓的，隔一天就旧了。
 * 线上站点没有后台，所以这里在页面打开后静默跑一次浏览器直连抓取：
 *   - 个股：GBTI_LIVE.run()，408 只分 9 批，约 20 秒
 *   - 指数历史：GBTI_LIVE.runIndex()，只补内置序列之后的新交易日，约 1 秒
 * 抓到新数据写进 localStorage，然后刷新一次页面让所有模块读到新值。
 *
 * 三条自保规则：
 *   1) 只有 http(s) 且不是本机托管时才跑，本机 update-server.py 那条路径不动；
 *   2) 每次会话最多自动刷新一次，抓不到也不循环；
 *   3) 答题进行中（localStorage 里有进度）不刷新，只在数据面板留一句提示。
 */
(function (root) {
  "use strict";

  var SESSION_KEY = "gbti-auto-refresh-v1";
  var PROGRESS_KEYS = ["gbti-progress-v6-20261013", "gbti-result-v1"];
  var DELAY = 1500;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmt(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  // 最近一个已收盘的交易日；节假日不单独处理，只用来判断「是不是落后了」。
  function lastTradingDay() {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var minutes = now.getHours() * 60 + now.getMinutes();
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    else if (minutes < 15 * 60 + 5) d.setDate(d.getDate() - 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
    return fmt(d);
  }

  function localMode() {
    if (location.protocol.indexOf("http") !== 0) return true;   // file:// 走本机服务
    var host = location.hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  }

  function running() {
    try { return localStorage.getItem(PROGRESS_KEYS[0]) ? true : false; } catch (error) { return false; }
  }

  function onceThisSession() {
    try { return sessionStorage.getItem(SESSION_KEY) === "1"; } catch (error) { return true; }
  }

  function markSession() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (error) { /* 忽略 */ }
  }

  function banner() {
    var box = document.createElement("div");
    box.id = "auto-refresh-tip";
    box.setAttribute("role", "status");
    box.style.cssText = [
      "position:fixed", "left:50%", "transform:translateX(-50%)", "bottom:22px",
      "z-index:9999", "padding:9px 16px", "border-radius:999px",
      "background:rgba(24,24,26,.88)", "color:#fff", "font-size:13px",
      "line-height:1.5", "max-width:86vw", "text-align:center",
      "box-shadow:0 8px 24px rgba(0,0,0,.22)", "pointer-events:none",
      "opacity:0", "transition:opacity .28s ease"
    ].join(";");
    document.body.appendChild(box);
    requestAnimationFrame(function () { box.style.opacity = "1"; });
    return function (text) {
      if (text === null) {
        box.style.opacity = "0";
        setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 320);
        return;
      }
      box.textContent = text;
    };
  }

  function needs(kind) {
    var target = lastTradingDay();
    if (kind === "stock") {
      var market = root.GBTI_MARKET;
      return !!(market && market.asOf && market.asOf < target);
    }
    var history = root.GBTI_INDEX_HISTORY;
    return !!(history && history.asOf && history.asOf < target);
  }

  function go() {
    var live = root.GBTI_LIVE;
    if (!live) return;

    var wantStock = needs("stock") && typeof live.run === "function";
    var wantIndex = needs("index") && typeof live.runIndex === "function";
    if (!wantStock && !wantIndex) return;
    if (onceThisSession()) return;

    var tip = banner();
    var steps = [];
    if (wantStock) steps.push("行情");
    if (wantIndex) steps.push("回测");
    tip("正在后台更新" + steps.join("与") + "数据，约 20 秒…");

    var chain = Promise.resolve();
    if (wantStock) {
      chain = chain.then(function () {
        return live.run({
          onProgress: function (p) {
            tip("正在更新行情数据 " + p.done + " / " + p.total + " 只…");
          }
        });
      });
    }
    if (wantIndex) {
      chain = chain.then(function () { return live.runIndex(); });
    }

    chain.then(function (last) {
      markSession();
      var asOf = last && last.asOf ? last.asOf : "";
      if (running()) {
        tip("数据已更新到 " + asOf + "，下次打开页面生效。");
        setTimeout(function () { tip(null); }, 4200);
        return;
      }
      tip("已更新到 " + asOf + "，正在刷新…");
      setTimeout(function () { location.reload(); }, 700);
    }).catch(function (error) {
      markSession();
      tip("后台更新没成功：" + (error && error.message ? error.message : "网络原因"));
      setTimeout(function () { tip(null); }, 5200);
    });
  }

  function start() {
    if (localMode()) return;
    setTimeout(go, DELAY);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(typeof window !== "undefined" ? window : this);
