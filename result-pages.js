// 结果页及四个子页面共用当前测试结果；URL 可刷新，浏览器前进与后退可用。
(function () {
  'use strict';
  const sections = {
    news: { id: 'weekly-news', kicker: '每周精选', title: '与你的投资风格相符的资讯', description: '查看精选资讯和推荐依据，也可以转动 3D 地球仪浏览全球消息。' },
    plan: { id: 'plan', kicker: '资产配置建议', title: '按你的风格，钱可以这样分', description: '查看资产比例、示例标的与风险提示。' },
    xuanxue: { id: 'xuanxue', kicker: '玄学操盘适配度 · AI 模块', title: '今日卦象与适配度', description: '结合投资风格、卦象和节气，查看今日的投教提示。' },
    tarot: { id: 'tarot', kicker: '塔罗映照 · 西方象征系统', title: '本命牌 · 今日牌 · 东西合参', description: '用本命牌与今日牌对照东方卦象，作为自我反思的提问方式，不预测涨跌。' }
  };
  const root = document.documentElement;
  const result = document.getElementById('result');
  const header = document.getElementById('section-page-header');
  const back = document.getElementById('section-back');

  function requestedSection() {
    const value = new URL(location.href).searchParams.get('section');
    return Object.hasOwn(sections, value) ? value : null;
  }
  function renderView(section, focus) {
    const data = sections[section];
    if (data && !result.hidden) {
      root.classList.add('on-subpage');
      root.dataset.section = section;
      result.setAttribute('aria-labelledby', 'section-page-title');
      header.hidden = false;
      document.getElementById('section-page-kicker').textContent = data.kicker;
      document.getElementById('section-page-title').textContent = data.title;
      document.getElementById('section-page-description').textContent = data.description;
      document.title = data.kicker + ' · GBTI';
      const panel = document.getElementById(data.id);
      if (panel) panel.open = true;
      if (focus) document.getElementById('section-page-title').focus({ preventScroll: true });
    } else {
      root.classList.remove('on-subpage');
      delete root.dataset.section;
      result.setAttribute('aria-labelledby', 'result-name');
      header.hidden = true;
      document.title = 'GBTI · 股票人格与每周精选';
      Object.values(sections).forEach(item => { const panel = document.getElementById(item.id); if (panel) panel.open = false; });
      if (!result.hidden) {
        document.getElementById('dimension-fold').open = true;
        requestAnimationFrame(function () { if (typeof refreshRadar === 'function') refreshRadar(); });
      }
    }
    if (focus) window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function open(section) {
    if (!sections[section] || result.hidden) return;
    const url = new URL(location.href);
    url.searchParams.delete('view');
    url.searchParams.set('section', section);
    url.hash = '';
    history.pushState({ gbtiResultSection: section }, '', url);
    renderView(section, true);
  }
  function returnToResult(section) {
    renderView(null, false);
    const panel = sections[section] && document.getElementById(sections[section].id);
    const summary = panel && panel.querySelector(':scope > summary');
    if (summary) {
      summary.focus({ preventScroll: true });
      summary.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }
  function goBack(event) {
    event.preventDefault();
    if (history.state && history.state.gbtiResultSection) history.back();
    else {
      const url = new URL(location.href);
      url.searchParams.delete('section');
      url.searchParams.set('view', 'result');
      history.pushState({}, '', url);
      returnToResult(requestedSection() || root.dataset.section);
    }
  }
  function reset() {
    const url = new URL(location.href);
    url.searchParams.delete('section');
    url.searchParams.delete('view');
    history.replaceState({}, '', url);
    renderView(null, false);
  }
  window.GBTI_RESULT_PAGES = { open: open, reset: reset };
  document.addEventListener('DOMContentLoaded', function () {
    Object.entries(sections).forEach(function ([name, data]) {
      const panel = document.getElementById(data.id);
      const summary = panel && panel.querySelector(':scope > summary');
      if (!summary) return;
      summary.setAttribute('role', 'link');
      summary.setAttribute('aria-label', data.kicker + '，打开独立页面');
      summary.addEventListener('click', function (event) { event.preventDefault(); open(name); });
    });
    back.addEventListener('click', goBack);
    window.addEventListener('popstate', function () {
      const previous = root.dataset.section;
      const next = requestedSection();
      if (!next && previous) returnToResult(previous);
      else renderView(next, true);
    });
    const section = requestedSection();
    const wantsResult = new URL(location.href).searchParams.get('view') === 'result';
    if ((section || wantsResult) && answeredCount() === questions.length) {
      enterTest();
      renderView(section, false);
    } else if (section || wantsResult) {
      const url = new URL(location.href);
      url.searchParams.delete('section');
      url.searchParams.delete('view');
      history.replaceState({}, '', url);
      const start = document.getElementById('start-cta');
      start.textContent = '请先完成测试';
    }
  });
})();
