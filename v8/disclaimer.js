/* GBTI 入口强制知情确认
 * 进入主界面即弹出。只有点击「我已认真阅读」才能关闭：
 * ESC 的 cancel 事件被拦截，点击遮罩不关闭，也没有右上角关闭按钮；
 * 即便被其他途径关闭，close 事件也会把它重新打开，直到确认为止。
 * 每次进入都会弹出，不写入已读标记。
 */
(function () {
  "use strict";

  var dlg = document.getElementById("disclaimer-dialog");
  var btn = document.getElementById("disclaimer-accept");
  if (!dlg || !btn) return;

  var scroll = dlg.querySelector ? dlg.querySelector(".disclaimer-scroll") : null;
  var nativeModal = typeof dlg.showModal === "function";
  var accepted = false;
  var mask = null;

  function lock() {
    if (document.body && document.body.classList) document.body.classList.add("disclaimer-open");
    if (!nativeModal && !mask && document.createElement && document.body && document.body.appendChild) {
      mask = document.createElement("div");
      mask.className = "disclaimer-fallback-mask";
      document.body.appendChild(mask);
    }
  }
  function unlock() {
    if (document.body && document.body.classList) document.body.classList.remove("disclaimer-open");
    if (mask && mask.parentNode && mask.parentNode.removeChild) mask.parentNode.removeChild(mask);
    mask = null;
  }
  function focusText() {
    if (!scroll || !scroll.focus) return;
    try { scroll.focus({ preventScroll: true }); } catch (e) {
      try { scroll.focus(); } catch (e2) { /* 忽略 */ }
    }
  }
  function open() {
    lock();
    if (nativeModal) {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute("open", "");
      if (dlg.style) {
        dlg.style.position = "fixed";
        dlg.style.inset = "0";
        dlg.style.margin = "auto";
        dlg.style.zIndex = "2147483646";
      }
    }
    focusText();
  }

  /* 三条绕过路径全部堵住 */
  dlg.addEventListener("cancel", function (e) {
    if (e.preventDefault) e.preventDefault();
  });
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg) {
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
    }
  });
  dlg.addEventListener("close", function () {
    if (!accepted) open();
  });

  btn.addEventListener("click", function () {
    accepted = true;
    unlock();
    if (nativeModal && dlg.open && typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open");
    if (document.documentElement && document.documentElement.setAttribute) {
      document.documentElement.setAttribute("data-disclaimer", "accepted");
    }
  });

  open();
})();
