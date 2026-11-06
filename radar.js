// 四维偏好雷达图。纯 Canvas 绘制，跟随页面主题色，支持高分屏。
// 读法：每条轴代表一个维度，越靠外表示该维度的偏向越一致（50% 为随机水平，100% 为 7 题全选一端）。

const radarState = { outcome: null };

function radarPalette() {
  const style = getComputedStyle(document.documentElement);
  const read = function (name, fallback) {
    const value = style.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    red: read("--red", "#c44236"),
    green: read("--green", "#2b8052"),
    line: read("--line", "#e7dfd2"),
    miter: read("--line-strong", "#dfd6ca"),
    ink: read("--ink", "#332e28"),
    inkStrong: read("--ink-strong", "#1f1b16"),
    muted: read("--muted", "#746b60"),
    surface: read("--surface", "#ffffff")
  };
}

function radarVertex(index, radius, centerX, centerY) {
  const angle = (-90 + index * 90) * Math.PI / 180;
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius, angle: angle };
}

function drawRadar(canvas, outcome) {
  if (!canvas || !outcome) return;
  const color = radarPalette();
  const size = 640;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, size, size);

  const centerX = size / 2;
  const centerY = size / 2 + 6;
  const maxRadius = size * 0.27;
  const positions = [0, 1, 2, 3].map(function (index) { return radarVertex(index, maxRadius, centerX, centerY); });
  const views = dimensions.map(function (dimension) { return getDimensionView(dimension, outcome.scores); });
  const heroAccent = getComputedStyle(document.querySelector("#result") || document.documentElement)
    .getPropertyValue("--hero-accent").trim() || color.red;

  // 网格：由内到外 4 圈，对应 55% / 70% / 85% / 100%。
  const rings = [0.55, 0.7, 0.85, 1];
  rings.forEach(function (ratio, ringIndex) {
    context.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const point = radarVertex(i, maxRadius * ratio, centerX, centerY);
      if (i === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
    }
    context.closePath();
    context.strokeStyle = ringIndex === rings.length - 1 ? color.miter : color.line;
    context.lineWidth = ringIndex === rings.length - 1 ? 1.6 : 1;
    context.stroke();
  });

  // 四条轴线。
  context.strokeStyle = color.line;
  context.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const point = radarVertex(i, maxRadius, centerX, centerY);
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  // 数据多边形：半径按百分比映射，50% 落在最内圈附近。
  const mapped = views.map(function (view) {
    const value = Math.max(view.left, view.right) / view.total;
    return Math.max(0.18, (value - 0.5) / 0.5 * 0.82 + 0.18);
  });
  context.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const point = radarVertex(i, maxRadius * mapped[i], centerX, centerY);
    if (i === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
  }
  context.closePath();
  const gradient = context.createLinearGradient(centerX - maxRadius, centerY - maxRadius, centerX + maxRadius, centerY + maxRadius);
  gradient.addColorStop(0, hexToRgba(heroAccent, 0.42));
  gradient.addColorStop(1, hexToRgba(color.red, 0.3));
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = color.red;
  context.lineWidth = 2.4;
  context.lineJoin = "round";
  context.stroke();

  // 数据点。
  for (let i = 0; i < 4; i += 1) {
    const point = radarVertex(i, maxRadius * mapped[i], centerX, centerY);
    context.beginPath();
    context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    context.fillStyle = color.surface;
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = color.red;
    context.stroke();
  }

  // 顶点标签：左右两端放在图形外侧并贴边对齐，上下两端放在图形外上方与下方，避免压到图形。
  context.textBaseline = "middle";
  const gap = 28;
  const NAME_FONT = "700 23px " + posterFont;
  const META_FONT = "400 19px " + posterFont;
  views.forEach(function (view, index) {
    const vertex = positions[index];
    const name = view.winner + " " + view.winnerName;
    const score = Math.max(view.left, view.right) + "/" + view.total;
    if (index === 0) {
      context.textAlign = "center";
      context.font = META_FONT; context.fillStyle = color.muted;
      context.fillText(dimensions[index].name, vertex.x, vertex.y - gap - 46);
      context.font = NAME_FONT; context.fillStyle = color.inkStrong;
      context.fillText(name, vertex.x, vertex.y - gap - 22);
      context.font = META_FONT; context.fillStyle = color.muted;
      context.fillText(score, vertex.x, vertex.y - gap);
    } else if (index === 2) {
      context.textAlign = "center";
      context.font = META_FONT; context.fillStyle = color.muted;
      context.fillText(score, vertex.x, vertex.y + gap);
      context.font = NAME_FONT; context.fillStyle = color.inkStrong;
      context.fillText(name, vertex.x, vertex.y + gap + 24);
      context.font = META_FONT; context.fillStyle = color.muted;
      context.fillText(dimensions[index].name, vertex.x, vertex.y + gap + 48);
    } else {
      const isLeft = index === 3;
      context.textAlign = isLeft ? "right" : "left";
      const x = vertex.x + (isLeft ? -gap : gap);
      context.font = NAME_FONT; context.fillStyle = color.inkStrong;
      context.fillText(name, x, vertex.y - 13);
      context.font = META_FONT; context.fillStyle = color.muted;
      context.fillText(score, x, vertex.y + 13);
    }
  });

  // 中心十字，弱化空白区。
  context.beginPath();
  context.arc(centerX, centerY, 3, 0, Math.PI * 2);
  context.fillStyle = color.miter;
  context.fill();
}

function hexToRgba(hex, alpha) {
  const value = String(hex).trim().replace("#", "");
  const full = value.length === 3 ? value.split("").map(function (c) { return c + c; }).join("") : value;
  const num = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(num)) return "rgba(196, 66, 54, " + alpha + ")";
  return "rgba(" + ((num >> 16) & 255) + ", " + ((num >> 8) & 255) + ", " + (num & 255) + ", " + alpha + ")";
}

function renderRadarCaption(outcome) {
  const box = document.querySelector("#radar-caption");
  if (!box) return;
  box.replaceChildren();
  const color = radarPalette();
  dimensions.forEach(function (dimension, index) {
    const view = getDimensionView(dimension, outcome.scores);
    const row = document.createElement("div");
    row.className = "rc-row";
    const key = document.createElement("span");
    key.className = "rc-key";
    key.textContent = String(index + 1).padStart(2, "0") + " " + dimension.name;
    const bar = document.createElement("span");
    bar.className = "rc-bar";
    const fill = document.createElement("i");
    fill.style.width = view.percent + "%";
    fill.style.background = "linear-gradient(90deg, " + color.red + ", " + color.green + ")";
    bar.appendChild(fill);
    const val = document.createElement("span");
    val.className = "rc-val";
    val.textContent = view.winner + " " + view.winnerName + " · " + Math.max(view.left, view.right) + "/" + view.total;
    row.append(key, bar, val);
    box.appendChild(row);
  });
}

// 对外入口：结果页生成后调用一次；主题切换时调用 refreshRadar 重绘。
function renderRadar(outcome) {
  if (outcome) radarState.outcome = outcome;
  if (!radarState.outcome) return;
  const canvas = document.querySelector("#radar");
  if (!canvas) return;
  drawRadar(canvas, radarState.outcome);
  renderRadarCaption(radarState.outcome);
  canvas.setAttribute("aria-label", "四维偏好雷达图，当前人格 " + radarState.outcome.personality.name);
}

function refreshRadar() { renderRadar(null); }
