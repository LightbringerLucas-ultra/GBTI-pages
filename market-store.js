/**
 * 用浏览器抓到的快照覆盖内置快照。
 *
 * 必须紧跟在 market-data.js（或 index-history.js）之后、其它业务脚本之前执行：
 * market-data.js 与 index-history.js 用 var 声明（挂在 window 上），
 * 这里把 localStorage 里更新的那份赋回去，后面的 allocation / workbench /
 * market-mood / history 读到的就都是新数据。
 *
 * 两条通道：
 *   1) gbti-market-live-v1  整份个股快照，直接替换；
 *   2) gbti-index-live-v1   指数历史的增量补丁，只把内置序列之后的新交易日追加进去，
 *      不动既有历史，避免整份 1.4 万点的序列反复传输和存储。
 *
 * 都只在「存的日期不早于内置」时才接管，避免把新数据盖成旧的。
 */
(function (root) {
  "use strict";

  var MARKET_KEY = "gbti-market-live-v1";
  var INDEX_KEY = "gbti-index-live-v1";

  function readBox(key) {
    try {
      var raw = root.localStorage ? root.localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  /* ---------- 个股快照 ---------- */

  try {
    var box = readBox(MARKET_KEY);
    var payload = box && box.payload;
    if (payload && payload.quotes && payload.asOf) {
      var builtin = root.GBTI_MARKET;
      if (!builtin || !builtin.asOf || payload.asOf >= builtin.asOf) {
        root.GBTI_MARKET = payload;
        root.GBTI_MARKET_LIVE = {
          active: true,
          savedAt: box.savedAt || payload.fetchedAt || "",
          asOf: payload.asOf,
          coverage: payload.coverage || ""
        };
      }
    }
  } catch (error) {
    /* 存储坏了就当没有，别影响页面启动。 */
  }

  /* ---------- 指数历史增量 ---------- */

  function mergeIndex(indexBox) {
    var history = root.GBTI_INDEX_HISTORY;
    if (!history || !history.series || !indexBox || !indexBox.patches) return null;
    if (indexBox.asOf && history.asOf && indexBox.asOf < history.asOf) return null;

    var added = 0;
    var touched = 0;
    Object.keys(indexBox.patches).forEach(function (code) {
      var series = history.series[code];
      if (!series || !series.points || !series.points.length) return;
      var rows = indexBox.patches[code] || [];
      var last = series.points[series.points.length - 1][0];
      var grew = false;
      rows.forEach(function (point) {
        if (!point || !point[0] || point[0] <= last) return;
        series.points.push([point[0], point[1]]);
        last = point[0];
        added += 1;
        grew = true;
      });
      if (grew) {
        series.last = last;
        series.count = series.points.length;
        touched += 1;
      }
    });

    if (!added) return null;

    history.asOf = indexBox.asOf || history.asOf;
    history.fetchedAt = indexBox.fetchedAt || history.fetchedAt;
    // 公示里要说清末段怎么来的，不能把浏览器补齐的点冒充成脚本快照。
    if (history.source && history.source.indexOf("浏览器直连") < 0) {
      history.source = history.source + "（末段由浏览器直连同一接口补齐至 "
        + history.asOf + "）";
    }
    return { asOf: history.asOf, added: added, codes: touched };
  }

  try {
    var indexBox = readBox(INDEX_KEY);
    var merged = mergeIndex(indexBox);
    if (merged) {
      root.GBTI_INDEX_HISTORY_LIVE = {
        active: true,
        savedAt: (indexBox && indexBox.fetchedAt) || "",
        asOf: merged.asOf,
        added: merged.added,
        codes: merged.codes
      };
    }
  } catch (error) {
    /* 同上，补丁不合法就不合并。 */
  }
})(typeof window !== "undefined" ? window : this);
