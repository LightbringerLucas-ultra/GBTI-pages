/**
 * 用浏览器抓到的快照覆盖内置快照。
 *
 * 必须紧跟在 market-data.js 之后、其它业务脚本之前执行：
 * market-data.js 用 var 声明 GBTI_MARKET（挂在 window 上），
 * 这里把 localStorage 里更新的那份赋回去，后面的 allocation / workbench /
 * market-mood 读到的就都是新数据。
 *
 * 只在「存的日期不早于内置」时才接管，避免把新数据盖成旧的。
 */
(function (root) {
  "use strict";

  var KEY = "gbti-market-live-v1";

  try {
    var raw = root.localStorage ? root.localStorage.getItem(KEY) : null;
    if (!raw) return;

    var box = JSON.parse(raw);
    var payload = box && box.payload;
    if (!payload || !payload.quotes || !payload.asOf) return;

    var builtin = root.GBTI_MARKET;
    if (builtin && builtin.asOf && payload.asOf < builtin.asOf) return;

    root.GBTI_MARKET = payload;
    root.GBTI_MARKET_LIVE = {
      active: true,
      savedAt: box.savedAt || payload.fetchedAt || "",
      asOf: payload.asOf,
      coverage: payload.coverage || ""
    };
  } catch (error) {
    /* 存储坏了就当没有，别影响页面启动。 */
  }
})(typeof window !== "undefined" ? window : this);
