// 流程控制：显示题目 → 保存选择 → 匹配画像 → 展示结果页 → 导出长图。
// 新增：进度本地保存与续答、答题卡跳转、进度环、键盘作答、结果复制、雷达图与 AI 联动。

const quiz = document.querySelector("#quiz");
const result = document.querySelector("#result");
const questionTitle = document.querySelector("#question-title");
const optionsBox = document.querySelector("#options");
const previousButton = document.querySelector("#previous");
const posterImage = document.querySelector("#poster-image");
const downloadLink = document.querySelector("#download");
const imageStatus = document.querySelector("#image-status");
const characterImage = document.querySelector("#character-image");
const generateButton = document.querySelector("#generate-image");
const retryButton = document.querySelector("#retry-image");
const navigatorCard = document.querySelector("#navigator-card");
const resetProgressButton = document.querySelector("#reset-progress");
let generating = false;
const landingHero = document.querySelector("#quiz-heading");
const quizSidebar = document.querySelector(".shell-side");
let testStarted = false;

function enterTest() {
  testStarted = true;
  document.documentElement.classList.remove("on-landing");
  landingHero.hidden = true;
  quizSidebar.hidden = false;
  if (answeredCount() === questions.length) showResult();
  else {
    quiz.hidden = false;
    showQuestion(true);
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelector("#start-cta").addEventListener("click", enterTest);
document.querySelector(".skip-link").addEventListener("click", function (event) {
  event.preventDefault();
  enterTest();
});
document.querySelector("#back-to-top").addEventListener("click", function () {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// V6 情境题使用独立进度；旧题答案仍保留在旧键中，不套用到新题。
const PROGRESS_KEY = "gbti-progress-v6-20261013";
const RING_CIRCUMFERENCE = 2 * Math.PI * 50;

let currentIndex = 0;
let answers = [];
let moving = false;
let resultVersion = 0;
let currentOutcome = null;
const portraitCache = {}; // 只解码当前需要的人物，不同时解码全部大图。

/* ---------- 本地进度 ---------- */

function hasAnyAnswer() { return answers.some(Number.isInteger); }

function saveProgress() {
  try {
    if (!hasAnyAnswer()) { localStorage.removeItem(PROGRESS_KEY); return; }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      answers: answers.slice(0, questions.length),
      questionIds: questions.map(function (question) { return question.id; }),
      index: currentIndex,
      at: Date.now()
    }));
  } catch (error) { /* 无痕模式下静默跳过。 */ }
}

function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch (error) { /* 忽略。 */ }
}

function restoreProgress() {
  const saved = window.__gbtiResume;
  if (!saved || !Array.isArray(saved.answers)) return false;
  const restored = [];
  for (let index = 0; index < questions.length; index += 1) {
    const value = saved.answers[index];
    restored.push(Number.isInteger(value) && questions[index].options[value] ? value : undefined);
  }
  answers = restored;
  if (!hasAnyAnswer()) return false;
  currentIndex = Math.min(Math.max(0, Number(saved.index) || 0), questions.length - 1);
  return true;
}

/* ---------- 进度显示 ---------- */

function answeredCount() { return answers.filter(Number.isInteger).length; }

function updateProgressViews() {
  const done = answeredCount();
  const ratio = done / questions.length;
  const bar = document.querySelector("#topbar-progress-bar");
  if (bar) bar.style.width = Math.round(ratio * 100) + "%";
  const ring = document.querySelector("#ring-progress");
  if (ring) ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - ratio));
  const ringPercent = document.querySelector("#ring-percent");
  if (ringPercent) ringPercent.textContent = Math.round(ratio * 100) + "%";
  const ringLabel = document.querySelector("#ring-label");
  if (ringLabel) ringLabel.textContent = done + " / " + questions.length;
  if (resetProgressButton) resetProgressButton.hidden = !hasAnyAnswer();
}

function renderNavigator() {
  const box = document.querySelector("#navigator");
  if (!box) return;
  box.replaceChildren();
  const onResult = !result.hidden;
  questions.forEach(function (question, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-dot";
    button.textContent = String(index + 1);
    const answered = Number.isInteger(answers[index]);
    if (answered) button.classList.add("answered");
    if (!onResult && index === currentIndex) button.classList.add("current");
    button.setAttribute("aria-label", "第 " + (index + 1) + " 题，" + (answered ? "已作答" : "未作答"));
    button.addEventListener("click", function () {
      if (moving) return;
      openQuestion(index);
    });
    box.appendChild(button);
  });
  const hint = document.querySelector("#navigator-hint");
  if (hint) {
    hint.textContent = onResult
      ? "点数字可回到对应题目修改答案。"
      : "灰色为未作答，点数字即可跳题修改。";
  }
}

/* ---------- 题目 ---------- */

function loadPortrait(code) {
  if (portraitCache[code]) return portraitCache[code];
  portraitCache[code] = new Promise(function (resolve, reject) {
    const image = new Image();
    image.onload = function () { resolve(image); };
    image.onerror = function () {
      delete portraitCache[code];
      reject(new Error("人物素材无法读取：" + code));
    };
    image.src = characterImages[personalities.find(p => p.code === code).imageCode].original;
  });
  return portraitCache[code];
}

function selectOption(index) {
  const question = questions[currentIndex];
  if (!question || !question.options[index]) return;
  const buttons = optionsBox.querySelectorAll("button");
  const button = buttons[index];
  if (!button || button.disabled || moving) return;

  moving = true;
  answers[currentIndex] = index; // 返回修改时覆盖原答案，不重复加分。
  buttons.forEach(function (item) {
    item.disabled = true;
    item.classList.remove("selected");
    item.setAttribute("aria-pressed", "false");
  });
  button.classList.add("selected", "pop");
  button.setAttribute("aria-pressed", "true");
  previousButton.disabled = true;
  saveProgress();
  updateProgressViews();
  window.setTimeout(function () {
    currentIndex += 1;
    moving = false;
    if (currentIndex < questions.length) showQuestion(true);
    else showResult();
  }, 320);
}

function showQuestion(moveFocus) {
  const question = questions[currentIndex];
  const dimension = dimensions.find(function (item) { return item.key === question.dimension; });
  document.querySelector("#progress-text").textContent = "第 " + (currentIndex + 1) + " / " + questions.length + " 题";
  document.querySelector("#progress-percent").textContent = "已答 " + answeredCount() + " 题";
  const progress = document.querySelector("#progress");
  progress.max = questions.length;
  progress.value = answeredCount();
  document.querySelector("#question-dimension").textContent = (dimension ? dimension.name : "投资行为情境") + (question.hot ? " · 假设场景" : "");
  document.querySelector("#question-number").textContent = String(currentIndex + 1).padStart(2, "0");
  questionTitle.textContent = question.title;
  previousButton.disabled = currentIndex === 0;
  optionsBox.replaceChildren();

  question.options.forEach(function (option, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    const selected = answers[currentIndex] === index;
    if (selected) button.classList.add("selected");
    button.setAttribute("aria-pressed", String(selected));
    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.textContent = String.fromCharCode(65 + index);
    const label = document.createElement("span");
    label.textContent = option.text;
    button.append(letter, label);
    button.addEventListener("click", function () { selectOption(index); });
    optionsBox.appendChild(button);
  });

  if (moveFocus) questionTitle.focus({ preventScroll: true });
  updateProgressViews();
  renderNavigator();
  saveProgress();
}

// 从结果页或答题卡回到某一题，答题流程与首次作答保持一致。
function openQuestion(index) {
  const target = Math.min(Math.max(0, index), questions.length - 1);
  if (!result.hidden) {
    result.hidden = true;
    quiz.hidden = false;
    document.documentElement.classList.remove("on-result");
  }
  quizSidebar.hidden = false;
  currentIndex = target;
  showQuestion(true);
  document.querySelector("#quiz").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- 结果 ---------- */

function makeTextElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function showScores(outcome) {
  const scoresBox = document.querySelector("#scores");
  scoresBox.replaceChildren();
  dimensions.forEach(function (dimension, index) {
    const view = getDimensionView(dimension, outcome.scores);
    const card = document.createElement("article");
    card.className = "card dimension-card";
    const top = document.createElement("div");
    top.className = "dimension-top";
    const title = document.createElement("h3");
    title.append(makeTextElement("span", "dimension-number", String(index + 1).padStart(2, "0")), document.createTextNode(dimension.name));
    top.append(title, makeTextElement("span", "dimension-badge", view.strength));

    const label = document.createElement("div");
    label.className = "score-label";
    const left = document.createElement("span"); left.className = "left-score";
    const right = document.createElement("span"); right.className = "right-score";
    left.append(makeTextElement("span", "", dimension.left + " " + dimension.leftName),
      makeTextElement("strong", "", view.left + "/" + view.total + " · " + view.percent + "%"));
    right.append(makeTextElement("span", "", dimension.right + " " + dimension.rightName),
      makeTextElement("strong", "", view.right + "/" + view.total + " · " + (100 - view.percent) + "%"));
    label.append(left, right);
    const track = document.createElement("div"); track.className = "score-track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div"); fill.className = "score-fill";
    fill.style.width = view.percent + "%";
    track.appendChild(fill);
    card.append(top, label, track, makeTextElement("p", "dimension-description", view.description));
    scoresBox.appendChild(card);
  });
}

async function generateResultImage(outcome) {
  if (generating) return;
  generating = true;
  generateButton.disabled = true;
  // 版本号避免“重新测试”后旧的异步任务更新新页面。
  const version = ++resultVersion;
  posterImage.hidden = true;
  downloadLink.hidden = true;
  retryButton.hidden = true;
  imageStatus.hidden = false;
  imageStatus.textContent = "正在生成高清长图……";
  try {
    const portrait = await loadPortrait(outcome.personality.code);
    if (document.fonts) await document.fonts.ready;
    if (version !== resultVersion) return;
    const canvas = document.createElement("canvas");
    drawPoster(canvas, outcome, portrait, false);
    const png = canvas.toDataURL("image/png");
    posterImage.src = png;
    posterImage.alt = outcome.personality.name + "的完整结果长图，包含人格说明、四维得分和提醒。";
    posterImage.hidden = false;
    downloadLink.href = png;
    downloadLink.download = "GBTI-" + outcome.personality.code + "-高清结果长图.png";
    downloadLink.hidden = false;
    imageStatus.hidden = true;
    generateButton.hidden = true;
    document.querySelector("#image-preview").open = true;
  } catch (error) {
    if (version !== resultVersion) return;
    if (location.protocol === "file:") {
      // 直接双击 HTML 打开时，浏览器禁止把本地图片画进画布再导出，
      // 重试也会失败，所以直接指引用户走本地服务。
      imageStatus.textContent = "直接双击打开网页时，浏览器禁止导出长图。";
      const jump = document.createElement("button");
      jump.className = "button-ghost";
      jump.type = "button";
      jump.textContent = "带我去能生成图片的页面";
      jump.style.marginLeft = "8px";
      jump.addEventListener("click", function () {
        jump.disabled = true;
        jump.textContent = "正在寻找本地更新服务……";
        fetch("http://127.0.0.1:8765/api/status")
          .then(function (response) {
            if (!response.ok) throw new Error("bad status");
            location.href = "http://127.0.0.1:8765/index.html";
          })
          .catch(function () {
            jump.disabled = false;
            jump.textContent = "没找到服务，请先双击「双击我更新数据.bat」";
          });
      });
      imageStatus.appendChild(jump);
      retryButton.hidden = true;
    } else {
      imageStatus.textContent = "图片暂时生成失败，请重试。你的文字说明与得分已经保留。";
      retryButton.hidden = false;
    }
  } finally {
    if (version === resultVersion) { generating = false; generateButton.disabled = false; }
  }
}

function showResult() {
  currentOutcome = calculateResult(answers);
  const type = currentOutcome.personality;
  document.querySelector("#quiz-heading").hidden = true;
  quiz.hidden = true;
  result.hidden = false;
  quizSidebar.hidden = true;
  // 四维偏好默认展开，其他板块由各自页面展示。
  result.querySelectorAll(":scope > details").forEach(function (panel) { panel.open = false; });
  document.querySelector("#dimension-fold").open = true;
  document.documentElement.classList.add("on-result");
  resultVersion += 1;
  generating = false;
  generateButton.disabled = false;
  generateButton.hidden = false;
  downloadLink.hidden = true;
  retryButton.hidden = true;
  imageStatus.hidden = true;
  posterImage.hidden = true;
  characterImage.src = themedImageSrc(characterImages[type.imageCode]);
  characterImage.hidden = false;
  characterImage.alt = type.name + "的人格场景插画";
  document.querySelector("#result-name").textContent = type.name;
  document.querySelector("#result-code").textContent = type.code;
  document.querySelector("#result-motto").textContent = type.motto;
  document.querySelector("#profile-title").textContent = "性格速写";
  const heroTheme = getHeroTheme(type.code);
  result.style.setProperty("--hero-accent", heroTheme.accent);
  result.style.setProperty("--hero-soft", heroTheme.soft);
  document.querySelector("#result-description").textContent = type.description;
  document.querySelector("#result-reflection").textContent = type.reflection.replace(/^留意：/, "").replace(/^值得留意：/, "");
  document.querySelector("#axis-summary").textContent = "四维倾向代码：" + currentOutcome.axisCode;
  const tags = document.querySelector("#result-tags");
  tags.replaceChildren();
  type.tags.forEach(function (tag) { tags.appendChild(makeTextElement("span", "", tag)); });
  showScores(currentOutcome);
  renderRadar(currentOutcome);
  if (window.GBTI_PLAN) window.GBTI_PLAN.render(currentOutcome);
  if (window.GBTI_MARKET_MOOD) window.GBTI_MARKET_MOOD.refresh();
  if (window.GBTI_NEWS) window.GBTI_NEWS.render(currentOutcome);
  updateProgressViews();
  renderNavigator();
  markSelfTile(type.code);
  if (window.GBTI_AI) window.GBTI_AI.setOutcome(currentOutcome);
  // 塔罗解读需要四维得分做个体化提示，这里把完整结果同步过去（只读，不参与打分）。
  if (window.GBTI_TAROT && window.GBTI_TAROT.setOutcome) window.GBTI_TAROT.setOutcome(currentOutcome);
  document.querySelector("#result-name").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
  // 此时只展示小图；用户点击按钮后再下载对应高清原图。
}

/* ---------- 结果文字复制 ---------- */

function resultPlainText() {
  if (!currentOutcome) return "";
  const type = currentOutcome.personality;
  const lines = ["GBTI 股票人格测试结果", "", type.name + "（" + type.code + "）", type.motto, "", type.description, ""];
  dimensions.forEach(function (dimension) {
    const view = getDimensionView(dimension, currentOutcome.scores);
    lines.push(dimension.name + "：" + view.winner + " " + view.winnerName + "　" + Math.max(view.left, view.right) + "/" + view.total + "（" + view.strength + "）");
  });
  lines.push("", "四维倾向代码：" + currentOutcome.axisCode);

  const plan = window.GBTI_PLAN && window.GBTI_PLAN.plan;
  if (plan) {
    lines.push("", "资产配置建议（" + plan.styleName + "）");
    plan.allocation.forEach(function (sleeve) {
      lines.push("  " + sleeve.name + " " + sleeve.pct + "%");
    });
    lines.push("", "与你风格相符的标的示例");
    plan.stocks.forEach(function (item, index) {
      lines.push("  " + (index + 1) + ". " + item.name + "（" + item.code + "）" + item.industry);
    });
    lines.push("", "债券与现金载体：");
    plan.funds.forEach(function (item) {
      lines.push("  " + item.name + "：" + item.vehicle + (item.code ? "（" + item.code + "）" : ""));
    });
    lines.push("", plan.discipline.title);
    plan.discipline.items.forEach(function (text) { lines.push("  " + text); });
    lines.push("", "风险提示");
    plan.disclaimer.forEach(function (text) { lines.push("  " + text); });
    lines.push(plan.dataNote);
  }

  lines.push("提醒：" + type.reflection.replace(/^值得留意：/, ""));
  lines.push("", "趣味自我探索，非科学测评，不构成投资建议。");
  return lines.join("\n");
}

async function copyResult() {
  const status = document.querySelector("#copy-status");
  const text = resultPlainText();
  if (!text) return;
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch (error) { ok = false; }
  if (!ok) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "readonly");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      ok = document.execCommand("copy");
      area.remove();
    } catch (error) { ok = false; }
  }
  if (status) {
    status.textContent = ok ? "已复制到剪贴板，可以粘贴到聊天窗口或备忘录。" : "复制失败，请手动选择文字后复制。";
    window.setTimeout(function () { status.textContent = ""; }, 4000);
  }
}

/* ---------- 人格画册与详情 ---------- */

function personalityDetail(item) {
  const body = document.querySelector("#pm-body");
  document.querySelector("#pm-title").textContent = item.name;
  body.replaceChildren();
  const hero = document.createElement("div");
  hero.className = "pm-hero";
  const image = document.createElement("img");
  image.src = themedImageSrc(characterImages[item.imageCode]);
  image.alt = item.name + "的场景插画";
  const info = document.createElement("div");
  const code = makeTextElement("p", "hero-code", item.code);
  code.style.fontSize = "26px";
  code.style.margin = "0 0 6px";
  const motto = makeTextElement("p", "hero-motto", item.motto);
  motto.style.margin = "0 0 12px";
  motto.style.fontSize = "15px";
  const tags = document.createElement("div");
  tags.className = "tags";
  item.tags.forEach(function (tag) { tags.appendChild(makeTextElement("span", "", tag)); });
  info.append(code, motto, tags);
  hero.append(image, info);

  const breakdown = document.createElement("dl");
  const names = ["信息依据", "持有周期", "风险偏好", "决策方式"];
  const labels = { F: "基本面", M: "市场面", L: "长期", S: "短期", D: "稳健", A: "进取", O: "客观规则", J: "主观判断" };
  item.code.split("").forEach(function (letter, index) {
    breakdown.append(makeTextElement("dt", "", names[index]), makeTextElement("dd", "", letter + " " + labels[letter]));
  });

  const description = makeTextElement("p", "body-copy", item.description);
  description.style.marginTop = "18px";
  const reflection = makeTextElement("p", "hint", item.reflection);
  reflection.style.marginTop = "10px";

  const ask = document.createElement("button");
  ask.type = "button";
  ask.className = "button-secondary";
  ask.textContent = "让 AI 讲讲这个类型";
  ask.addEventListener("click", function () {
    document.querySelector("#personality-modal").close();
    if (window.GBTI_AI) window.GBTI_AI.open(item.name + " 是什么类型");
  });

  body.append(hero, breakdown, description, reflection, ask);
}

function markSelfTile(code) {
  document.querySelectorAll(".personality-tile").forEach(function (tile) {
    tile.classList.toggle("is-self", tile.dataset.code === code);
  });
}

let galleryReady = false;

function buildGallery() {
  if (galleryReady) return;
  galleryReady = true;
  const gallery = document.querySelector("#gallery");
  personalities.forEach(function (type) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "personality-tile";
    tile.dataset.code = type.code;
    tile.setAttribute("aria-label", "查看 " + type.name + "（" + type.code + "）的详细说明");
    const image = document.createElement("img");
    image.src = themedImageSrc(characterImages[type.imageCode]);
    image.alt = type.name + "场景插画";
    image.width = 1024; image.height = 1280;
    image.loading = "lazy";
    tile.append(makeTextElement("h3", "", type.name), makeTextElement("p", "", type.code), image);
    tile.addEventListener("click", function () { personalityDetail(type); openDialog("#personality-modal"); });
    gallery.appendChild(tile);
  });
  if (currentOutcome) markSelfTile(currentOutcome.personality.code);
}

function openDialog(selector) {
  const dialog = document.querySelector(selector);
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

/* ---------- 主题（皮肤商城） ---------- */

// 顶栏按钮打开皮肤商城，皮肤通过共用存储跨页面同步。
const THEMES = ["light", "dark", "halloween", "christmas", "spring", "qingming", "midautumn", "nailong", "chiikawa", "usagi", "hachiware"];
const THEME_META = {
  light: { label: "亮色", color: "#f7f3eb", icon: "☀️", desc: "默认的纸感米白，清爽耐看。", swatches: ["#f7f3eb", "#c44236", "#6b8f71"] },
  dark: { label: "暗色", color: "#16140f", icon: "🌙", desc: "纯暗夜色，深夜刷题不刺眼。", swatches: ["#16140f", "#e07362", "#61b98a"] },
  halloween: { label: "万圣节", color: "#16121d", icon: "🎃", desc: "紫夜南瓜配色，人格画像换成万圣节变装版。", swatches: ["#16121d", "#f08c3e", "#7c5cbe"] },
  christmas: { label: "圣诞", color: "#0f1a17", icon: "🎄", desc: "圣诞雪夜，人格画像换成圣诞变装版。", swatches: ["#0f1a17", "#e05a4e", "#e8b94f"] },
  spring: { label: "春节", color: "#1c1013", icon: "🧨", desc: "红火庙会夜，人格画像换成新春贺岁版。", swatches: ["#1c1013", "#e8544a", "#e6b34d"] },
  qingming: { label: "清明", color: "#f2f5ee", icon: "🌿", desc: "烟雨踏青，清新的浅色春日。", swatches: ["#f2f5ee", "#47836b", "#8fb8a0"] },
  midautumn: { label: "中秋", color: "#101623", icon: "🌕", desc: "靛蓝月夜桂花香，人格画像换成中秋赏月版。", swatches: ["#101623", "#e3b84f", "#7aa88f"] },
  nailong: { label: "奶龙", color: "#fff8df", icon: "💛", desc: "奶油黄的暖暖世界，16 种人格与开屏群像一起变身奶龙。", swatches: ["#fff8df", "#ffd447", "#9a640e"] },
  chiikawa: { label: "吉伊卡哇", color: "#fbf6ef", icon: "🤍", desc: "软乎乎的奶油白世界，16 种人格与开屏群像一起变身吉伊卡哇。", swatches: ["#fbf6ef", "#f2b8c0", "#7fbf9e"] },
  usagi: { label: "乌萨奇", color: "#fdf3d7", icon: "🐰", desc: "明快鹅黄的元气世界，16 种人格与开屏群像一起变身乌萨奇。", swatches: ["#fdf3d7", "#f6c445", "#e88f3a"] },
  hachiware: { label: "小八", color: "#eef4fb", icon: "💙", desc: "清爽的蓝白世界，16 种人格与开屏群像一起变身小八。", swatches: ["#eef4fb", "#6b9fd4", "#3f6491"] }
};

function currentTheme() {
  const value = document.documentElement.getAttribute("data-theme");
  return THEMES.indexOf(value) >= 0 ? value : "light";
}

// 人格画像按皮肤换图：有专属变装版的皮肤用专属图，其余用常规展示图。
function themedImageSrc(entry) {
  return entry[currentTheme()] || entry.display;
}

// 换皮肤后同步刷新页面里已渲染的人格画像（结果页主图 + 画册 + 详情弹窗）。
function refreshCharacterImages() {
  if (currentOutcome && !characterImage.hidden) {
    characterImage.src = themedImageSrc(characterImages[currentOutcome.personality.imageCode]);
  }
  document.querySelectorAll(".personality-tile").forEach(function (tile) {
    const type = personalities.find(function (p) { return p.code === tile.dataset.code; });
    const img = tile.querySelector("img");
    if (type && img) img.src = themedImageSrc(characterImages[type.imageCode]);
  });
  const modalImg = document.querySelector("#pm-body .pm-hero img");
  const modalCode = document.querySelector("#pm-body .hero-code");
  if (modalImg && modalCode) {
    const type = personalities.find(function (p) { return p.code === modalCode.textContent.trim(); });
    if (type) modalImg.src = themedImageSrc(characterImages[type.imageCode]);
  }
}

function setTheme(theme) {
  if (THEMES.indexOf(theme) < 0) theme = "light";
  document.documentElement.setAttribute("data-theme", theme);
  if (window.GBTI_THEME && typeof window.GBTI_THEME.set === "function") window.GBTI_THEME.set(theme);
  const info = THEME_META[theme];
  const toggle = document.querySelector("#theme-toggle");
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(theme !== "light"));
    toggle.setAttribute("title", "皮肤商城（当前：" + info.label + "）");
  }
  document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
    meta.setAttribute("content", info.color);
  });
  refreshRadar();
  if (window.GBTI_PLAN) window.GBTI_PLAN.refresh();
  refreshCharacterImages();
  document.querySelectorAll(".skin-card").forEach(function (card) {
    card.classList.toggle("is-current", card.dataset.theme === theme);
  });
}

// 皮肤商城：按主题配置生成卡片，点开即换。
function buildSkinStore() {
  const grid = document.querySelector("#skin-grid");
  if (!grid || grid.children.length) return;
  THEMES.forEach(function (theme) {
    const info = THEME_META[theme];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "skin-card" + (theme === currentTheme() ? " is-current" : "");
    card.dataset.theme = theme;
    const swatches = info.swatches.map(function (c) {
      return '<span class="skin-swatch" style="background:' + c + '"></span>';
    }).join("");
    card.innerHTML = '<span class="skin-icon" aria-hidden="true">' + info.icon + "</span>"
      + '<span class="skin-name">' + info.label + "</span>"
      + '<span class="skin-desc">' + info.desc + "</span>"
      + '<span class="skin-swatches" aria-hidden="true">' + swatches + "</span>";
    card.addEventListener("click", function () {
      setTheme(theme);
      const dialog = document.querySelector("#skin-dialog");
      if (dialog && typeof dialog.close === "function") dialog.close();
    });
    grid.appendChild(card);
  });
}

/* ---------- 事件绑定 ---------- */

previousButton.addEventListener("click", function () {
  if (moving || currentIndex === 0) return;
  currentIndex -= 1;
  showQuestion(true);
});

generateButton.addEventListener("click", function () {
  if (currentOutcome) generateResultImage(currentOutcome);
});

retryButton.addEventListener("click", function () {
  if (currentOutcome) generateResultImage(currentOutcome);
});

document.querySelector("#copy-result").addEventListener("click", copyResult);

// 重新测试。顶栏入口与结果页入口共用同一套复位逻辑，避免两处行为不一致。
function restartQuiz(skipConfirm) {
  if (!skipConfirm && hasAnyAnswer()
    && !window.confirm("重新测试会清空当前的作答记录，确定继续吗？")) {
    return false;
  }
  resultVersion += 1;
  generating = false;
  generateButton.disabled = false;
  currentIndex = 0; answers = []; moving = false; currentOutcome = null;
  clearProgress();
  if (window.GBTI_MARKET_MOOD) window.GBTI_MARKET_MOOD.refresh();
  if (typeof reshuffleQuestions === "function") reshuffleQuestions();
  posterImage.removeAttribute("src");
  characterImage.removeAttribute("src");
  downloadLink.removeAttribute("href");
  document.querySelector("#image-preview").open = false;
  document.querySelector("#copy-status").textContent = "";
  result.hidden = true; quiz.hidden = false;
  if (window.GBTI_RESULT_PAGES) window.GBTI_RESULT_PAGES.reset();
  landingHero.hidden = true;
  testStarted = true;
  quizSidebar.hidden = false;
  document.documentElement.classList.remove("on-landing");
  document.documentElement.classList.remove("on-result");
  radarState.outcome = null;
  if (window.GBTI_PLAN) window.GBTI_PLAN.hide();
  if (window.GBTI_NEWS) window.GBTI_NEWS.hide();
  const caption = document.querySelector("#radar-caption");
  if (caption) caption.replaceChildren();
  markSelfTile(null);
  if (window.GBTI_AI) window.GBTI_AI.setOutcome(null);
  const dimensionFold = document.querySelector("#dimension-fold");
  if (dimensionFold) dimensionFold.open = false;
  showQuestion(true);
  window.scrollTo({ top: 0, behavior: "instant" });
  return true;
}

document.querySelector("#restart").addEventListener("click", function () { restartQuiz(false); });

// 顶栏的「重新测试」。没有任何作答时只是把视线带回答题区，不做无意义的复位询问。
const topbarRestart = document.querySelector("#topbar-restart");
if (topbarRestart) {
  topbarRestart.addEventListener("click", function () {
    if (!testStarted) return;
    if (!hasAnyAnswer()) {
      showQuestion(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    restartQuiz(false);
  });
}

resetProgressButton.addEventListener("click", function () {
  if (!window.confirm("确定清空已保存的作答记录并从头开始吗？")) return;
  clearProgress();
  currentIndex = 0; answers = []; moving = false;
  if (typeof reshuffleQuestions === "function") reshuffleQuestions();
  showQuestion(true);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#theme-toggle").addEventListener("click", function () {
  buildSkinStore();
  openDialog("#skin-dialog");
});

document.querySelector("#skin-close").addEventListener("click", function () {
  document.querySelector("#skin-dialog").close();
});

const personalityGallery = document.querySelector("#personality-gallery");
personalityGallery.addEventListener("toggle", function (event) {
  if (!event.target.open) return;
  buildGallery();
});

document.querySelector("#pm-close").addEventListener("click", function () {
  document.querySelector("#personality-modal").close();
});

// 键盘作答：A / B 选择，方向键翻页。输入框与弹窗打开时不拦截。
document.addEventListener("keydown", function (event) {
  if (quiz.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  const tag = (event.target && event.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || (event.target && event.target.isContentEditable)) return;
  if (document.body.classList.contains("ai-open")) return;
  const key = event.key.toLowerCase();
  if (key === "a" || key === "1") { event.preventDefault(); selectOption(0); return; }
  if (key === "b" || key === "2") { event.preventDefault(); selectOption(1); return; }
  if (event.key === "ArrowLeft" && !previousButton.disabled && !moving) {
    event.preventDefault(); currentIndex -= 1; showQuestion(true); return;
  }
  if (event.key === "ArrowRight" && !moving) {
    if (Number.isInteger(answers[currentIndex]) && currentIndex < questions.length - 1) {
      event.preventDefault(); currentIndex += 1; showQuestion(true);
    }
  }
});

let radarTimer = null;
window.addEventListener("resize", function () {
  window.clearTimeout(radarTimer);
  radarTimer = window.setTimeout(refreshRadar, 220);
});

/* ---------- 启动 ---------- */

if (window.GBTI_AI) window.GBTI_AI.init();
if (window.GBTI_UPDATE) window.GBTI_UPDATE.init();
setTheme(currentTheme());
buildGallery();

// 折叠面板在收起状态下宽高为 0，展开后重画一次画布，避免出现空白图。
[["dimension-fold", function () { refreshRadar(); }],
  ["plan", function () { if (window.GBTI_PLAN) window.GBTI_PLAN.refresh(); }]
].forEach(function (pair) {
  const panel = document.querySelector("#" + pair[0]);
  if (!panel) return;
  panel.addEventListener("toggle", function () { if (panel.open) pair[1](); });
});

const resumed = restoreProgress();
if (resumed) {
  const firstUnanswered = answers.findIndex(function (value) { return !Number.isInteger(value); });
  if (firstUnanswered !== -1) currentIndex = firstUnanswered;
  else document.querySelector("#start-cta").textContent = "查看结果";
}
updateProgressViews();

// Prepare the restored question without revealing the quiz until Start is clicked.
showQuestion(false);
const resumeHint = document.querySelector("#navigator-hint");
if (resumed && resumeHint) resumeHint.textContent = "已恢复上次的作答记录，点数字可跳题继续。";
