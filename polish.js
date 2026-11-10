/* ==========================================================================
   GBTI 视觉组件
   人格插画和数字动画供工作台与历史起伏使用。
   图片全部取自 characters.js 的现成映射，按当前皮肤取对应变体，缺图时静默降级。
   ========================================================================== */

const GBTI_LOOK = (function () {
  "use strict";

  function currentTheme() {
    return window.GBTI_THEME.current();
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

  function faceSrc(code) {
    var p = personaOf(code);
    return p ? imageFor(p.imageCode, currentTheme()) : "";
  }

  /* 小圆头像：只取插画上部的人物头部区域。 */
  function avatar(code, size, extra) {
    var p = personaOf(code);
    var src = p ? imageFor(p.imageCode, currentTheme()) : "";
    if (!src) return "";
    return '<span class="gb-face' + (extra ? " " + extra : "") + '" style="--gb-face-size:' + size + 'px">' +
      '<img src="' + src + '" data-gb-code="' + p.imageCode + '" alt="" loading="lazy" decoding="async"></span>';
  }

  /* 竖版人物卡：3:4 全图，保留场景。 */
  function figure(code, extra) {
    var p = personaOf(code);
    var src = p ? imageFor(p.imageCode, currentTheme()) : "";
    if (!src) return "";
    return '<span class="gb-figure' + (extra ? " " + extra : "") + '">' +
      '<img src="' + src + '" data-gb-code="' + p.imageCode + '" alt="" loading="lazy" decoding="async"></span>';
  }

  function reskin(theme) {
    document.querySelectorAll("img[data-gb-code]").forEach(function (img) {
      var next = imageFor(img.getAttribute("data-gb-code"), theme || currentTheme());
      img.setAttribute("data-gb-pending", next);
      if (!next || next === img.getAttribute("src")) return;
      var probe = new Image();
      probe.onload = function () {
        if (img.getAttribute("data-gb-pending") === next) img.src = next;
      };
      probe.src = next;
    });
  }

  window.addEventListener("gbti-theme-change", function (event) {
    reskin(event.theme || currentTheme());
  });

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

  return {
    avatar: avatar,
    figure: figure,
    countUp: countUp
  };
})();

if (typeof window !== "undefined") window.GBTI_LOOK = GBTI_LOOK;
