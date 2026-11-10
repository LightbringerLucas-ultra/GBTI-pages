/* ==========================================================================
   GBTI 视觉组件
   把人格插画、数字滚动、进入动效收成一套，供结果页、工作台、历史起伏共用。
   图片全部取自 characters.js 的现成映射，按当前皮肤取对应变体，缺图时静默降级。
   ========================================================================== */

const GBTI_LOOK = (function () {
  "use strict";

  // 先给 html 打标记，样式里只有带这个标记才隐藏待入场的元素，
  // 万一脚本没跑起来，页面内容仍然是可见的。
  try { document.documentElement.classList.add("gb-anim"); } catch (e) { /* 忽略 */ }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function imageFor(imageCode, theme) {
    if (typeof characterImages === "undefined" || !characterImages || !characterImages[imageCode]) return "";
    var entry = characterImages[imageCode];
    var key = theme && entry[theme] ? theme : "display";
    return entry[key] || entry.display || "";
  }

  function personaOf(code) {
    if (typeof personalities === "undefined" || !personalities) return null;
    for (var i = 0; i < personalities.length; i += 1) {
      if (personalities[i].code === code) return personalities[i];
    }
    return null;
  }

  function imageCodeOf(code) {
    var p = personaOf(code);
    return p && p.imageCode ? p.imageCode : "";
  }

  function faceSrc(code) {
    var ic = imageCodeOf(code);
    return ic ? imageFor(ic, currentTheme()) : "";
  }

  /* 小圆头像：只取插画上部的人物头部区域。 */
  function avatar(code, size, extra) {
    var ic = imageCodeOf(code);
    var src = ic ? imageFor(ic, currentTheme()) : "";
    if (!src) return "";
    return '<span class="gb-face' + (extra ? " " + extra : "") + '" style="--gb-face-size:' + size + 'px">' +
      '<img src="' + src + '" data-gb-code="' + ic + '" data-gb-theme="' + currentTheme() +
      '" alt="" loading="lazy" decoding="async"></span>';
  }

  /* 竖版人物卡：3:4 全图，保留场景。 */
  function figure(code, extra) {
    var ic = imageCodeOf(code);
    var src = ic ? imageFor(ic, currentTheme()) : "";
    if (!src) return "";
    return '<span class="gb-figure' + (extra ? " " + extra : "") + '">' +
      '<img src="' + src + '" data-gb-code="' + ic + '" data-gb-theme="' + currentTheme() +
      '" alt="" loading="lazy" decoding="async"></span>';
  }

  /* 换皮肤后统一重取页面里的人物图：先预载新图，加载完再换 src，避免中间出现空白。
     子页面（工作台、历史起伏、配置区）都走这里，不用各自再写一份刷新逻辑。 */
  function reskin(theme) {
    var t = theme || currentTheme();
    if (!document.querySelectorAll) return 0;
    var imgs = document.querySelectorAll("img[data-gb-code]");
    var n = 0;
    Array.prototype.forEach.call(imgs, function (img) {
      var ic = img.getAttribute("data-gb-code");
      var next = imageFor(ic, t);
      img.setAttribute("data-gb-pending", next);
      if (!next || next === img.getAttribute("src")) { img.setAttribute("data-gb-theme", t); return; }
      img.setAttribute("data-gb-theme", t);
      n += 1;
      var probe = typeof window.Image === "function" ? new window.Image() : null;
      if (!probe) { img.src = next; return; }
      probe.onload = function () {
        if (img.getAttribute("data-gb-pending") === next) img.src = next;
      };
      probe.src = next;
    });
    return n;
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("gbti-theme-change", function (e) {
      reskin(e && e.theme ? e.theme : currentTheme());
    });
  }

  /* 数字滚动：从 0 滚到目标值，尊重系统的减少动态偏好。 */
  function countUp(el, to, opts) {
    if (!el) return;
    var o = opts || {};
    var digits = o.digits === undefined ? 0 : o.digits;
    var suffix = o.suffix || "";
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !window.requestAnimationFrame) {
      el.textContent = Number(to).toFixed(digits) + suffix;
      return;
    }
    var start = 0;
    var dur = o.duration || 640;
    var t0 = null;
    // 兜底：某些环境（无头渲染、后台标签页）requestAnimationFrame 回调不触发，
    // 到点后直接写终值，避免数字停在 0。
    window.setTimeout(function () {
      el.textContent = Number(to).toFixed(digits) + suffix;
    }, dur + 120);
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (start + (to - start) * eased).toFixed(digits) + suffix;
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  /* 进入视口时逐块浮入，避免首屏一股脑全出来。 */
  function reveal(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-rise]");
    if (!nodes.length) return;
    if (!window.IntersectionObserver) {
      Array.prototype.forEach.call(nodes, function (n) { n.classList.add("is-in"); });
      return;
    }
    if (!reveal.observer) {
      reveal.observer = new window.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var delay = Number(el.getAttribute("data-rise")) || 0;
          window.setTimeout(function () { el.classList.add("is-in"); }, delay);
          reveal.observer.unobserve(el);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    }
    Array.prototype.forEach.call(nodes, function (n) {
      if (!n.classList.contains("is-in")) reveal.observer.observe(n);
    });
    // 兜底：观察器没触发时也要让内容出现，不能因为动效把人挡住。
    window.setTimeout(function () {
      Array.prototype.forEach.call(nodes, function (n) { n.classList.add("is-in"); });
    }, 1200);
  }

  function autoReveal() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { reveal(); });
    } else {
      reveal();
    }
  }
  autoReveal();

  return {
    currentTheme: currentTheme,
    imageFor: imageFor,
    personaOf: personaOf,
    faceSrc: faceSrc,
    avatar: avatar,
    figure: figure,
    reskin: reskin,
    countUp: countUp,
    reveal: reveal
  };
})();

if (typeof window !== "undefined") window.GBTI_LOOK = GBTI_LOOK;
