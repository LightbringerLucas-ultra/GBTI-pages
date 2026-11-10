/* GBTI 皮肤同步 · 首页与两个子页面共用
 * 皮肤存在 localStorage，首页皮肤商城与子页面顶部选择器双向同步。
 * 网址 ?theme=xxx 可覆盖本机存储，便于分享指定皮肤。
 * 本脚本需在样式表之前同步引入，避免首屏闪白。
 */
(function () {
  "use strict";

  var KEY = "gbti-theme-v1";
  var THEMES = ["light", "dark", "halloween", "christmas", "spring", "qingming", "midautumn"];
  var META = {
    light:     { label: "亮色",   icon: "☀️", color: "#f7f3eb", dark: false },
    dark:      { label: "暗色",   icon: "🌙", color: "#16140f", dark: true  },
    halloween: { label: "万圣节", icon: "🎃", color: "#16121d", dark: true  },
    christmas: { label: "圣诞",   icon: "🎄", color: "#0f1a17", dark: true  },
    spring:    { label: "春节",   icon: "🧨", color: "#1c1013", dark: true  },
    qingming:  { label: "清明",   icon: "🌿", color: "#f2f5ee", dark: false },
    midautumn: { label: "中秋",   icon: "🌕", color: "#101623", dark: true  }
  };

  function valid(t) { return THEMES.indexOf(t) >= 0 ? t : null; }
  function readStore() {
    try { return window.localStorage ? window.localStorage.getItem(KEY) : null; } catch (e) { return null; }
  }
  function writeStore(t) {
    try { if (window.localStorage) window.localStorage.setItem(KEY, t); } catch (e) { /* 无痕模式 */ }
  }
  function urlTheme() {
    try { return new URLSearchParams(window.location.search).get("theme"); } catch (e) { return null; }
  }
  function current() {
    return valid(document.documentElement.getAttribute("data-theme")) || "light";
  }
  function isDark() { return !!(META[current()] && META[current()].dark); }

  function notify(theme) {
    try {
      var ev = document.createEvent("Event");
      ev.initEvent("gbti-theme-change", false, false);
      ev.theme = theme;
      window.dispatchEvent(ev);
    } catch (e) { /* 极简 DOM 环境无事件系统时跳过 */ }
  }

  function refreshPickers() {
    if (!document.querySelectorAll) return;
    var boxes = document.querySelectorAll("[data-theme-picker]");
    var now = current();
    Array.prototype.forEach.call(boxes, function (box) {
      if (box.getAttribute("data-built") !== "1") {
        box.innerHTML = '<span class="sp-skin-label">皮肤 <b data-theme-label></b></span>' +
          THEMES.map(function (t) {
            return '<button type="button" class="sp-skin-dot" data-theme="' + t + '"' +
              ' title="' + META[t].label + '" aria-label="切换到' + META[t].label + '皮肤"' +
              ' style="--sp-dot:' + META[t].color + '"><span aria-hidden="true">' + META[t].icon + "</span></button>";
          }).join("");
        box.setAttribute("data-built", "1");
        box.addEventListener("click", function (e) {
          var btn = e.target.closest ? e.target.closest("[data-theme]") : null;
          if (btn) set(btn.getAttribute("data-theme"));
        });
      }
      Array.prototype.forEach.call(box.querySelectorAll(".sp-skin-dot"), function (b) {
        var on = b.getAttribute("data-theme") === now;
        if (b.classList && b.classList.toggle) b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      var label = box.querySelector("[data-theme-label]");
      if (label) label.textContent = META[now].label;
    });
  }

  function apply(theme, persist) {
    var t = valid(theme) || "light";
    document.documentElement.setAttribute("data-theme", t);
    if (document.querySelectorAll) {
      Array.prototype.forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) {
        m.setAttribute("content", META[t].color);
      });
    }
    if (persist) writeStore(t);
    refreshPickers();
    notify(t);
    return t;
  }
  function set(theme) { return apply(theme, true); }

  window.GBTI_THEME = {
    key: KEY, list: THEMES.slice(), meta: META,
    current: current, isDark: isDark, set: set, apply: apply, refresh: refreshPickers
  };

  /* 网址参数优先，其次本机已保存的皮肤，最后回到亮色 */
  apply(valid(urlTheme()) || valid(readStore()) || "light", false);

  if (document.addEventListener) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", refreshPickers);
    } else {
      refreshPickers();
    }
  }
  /* 同一浏览器里另一个标签换了皮肤，本页跟着变 */
  if (window.addEventListener) {
    window.addEventListener("storage", function (e) {
      if (e && e.key === KEY) apply(e.newValue, false);
    });
  }
})();
