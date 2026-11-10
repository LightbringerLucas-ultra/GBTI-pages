// 高清长图使用“360px 手机布局 × 3 倍分辨率”，文字不会被挤成小字号。
// 页面和长图共用下面的维度解释，避免出现两份不同的结果文案。
const axisDescriptions = {
  F: "你更关注公司的业务、盈利、估值与经营变化。",
  M: "你更关注价格走势、成交变化与市场情绪。",
  L: "你愿意用较长时间跟踪方向，等待判断逐步得到验证。",
  S: "你更关注近期变化，偏好较短的观察与调整节奏。",
  D: "你更重视平稳的持有体验，希望为不确定性留出余地。",
  A: "你愿意在自己可承受的范围内，接受更多起伏与不确定性。",
  O: "你更依赖预先设定的条件和统一标准来作决定。这是执行偏好，不代表更理性。",
  J: "你更依赖具体背景与综合判断来作决定。这是判断偏好，不代表缺乏依据。"
};

function getDimensionView(dimension, scores) {
  const left = scores[dimension.left];
  const right = scores[dimension.right];
  const winner = left > right ? dimension.left : dimension.right;
  const winnerName = left > right ? dimension.leftName : dimension.rightName;
  const maxScore = Math.max(left, right);
  const total = left + right;
  const strength = maxScore === total ? "选择一致" : maxScore / total >= 0.75 ? "较明显偏向" : "轻微偏向";
  const note = "本维度 " + total + " 题中有 " + maxScore + " 题指向这一端。";
  return { left, right, total, winner, winnerName, strength,
    percent: Math.round(left / (left + right) * 100),
    description: axisDescriptions[winner] + note };
}

const posterFont = '"Microsoft YaHei", "PingFang SC", sans-serif';
const posterTheme = { red: "#c44236", ink: "#332e28", muted: "#746b60", paper: "#f7f3eb", line: "#e7dfd2" };

function posterText(context, text, x, y, size, color, weight) {
  context.font = (weight || "400") + " " + size + "px " + posterFont;
  context.fillStyle = color || posterTheme.ink;
  context.fillText(text, x, y);
}

function roundedBox(context, x, y, width, height, radius, fill, stroke) {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill; context.fill();
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = 1; context.stroke(); }
}

function splitLines(context, text, maxWidth, size, weight) {
  context.font = (weight || "400") + " " + size + "px " + posterFont;
  const lines = []; let line = "";
  for (const character of text) {
    if (character === "\n") { lines.push(line); line = ""; continue; }
    if (context.measureText(line + character).width > maxWidth && line) {
      // 中文标点跟随前一个字换行，避免“。”单独落在新行。
      if (/^[，。！？；：、）》】]$/.test(character) && line.length > 1) {
        const last = line.slice(-1); lines.push(line.slice(0, -1)); line = last + character;
      } else { lines.push(line); line = character; }
    }
    else line += character;
  }
  if (line) lines.push(line);
  return lines;
}

function wrappedText(context, text, x, y, width, lineHeight, size, color, weight) {
  const lines = splitLines(context, text, width, size, weight);
  lines.forEach(function (line, index) { posterText(context, line, x, y + index * lineHeight, size, color, weight); });
  return y + lines.length * lineHeight;
}

// 完整绘入原图，使用 contain 算法；不会裁掉头发、手脚或道具。
function drawCharacter(context, image, x, y, width, height) {
  const ratio = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}


// 卡片背景随人格配色变化，英文代码统一保留参考图的绿色。
function getHeroTheme(code) {
  code = code.slice(0, 3);
  if (["FSA", "MSA"].includes(code)) return {accent:"#955667",soft:"#fcf0f2"};
  if (["FSD", "MLA", "MSD"].includes(code)) return {accent:"#416e83",soft:"#edf5f8"};
  return {accent:"#52715b",soft:"#edf5ef"};
}

function heroHeightFor(context, type) {
  return 715 + splitLines(context, "“" + type.motto + "”", 284, 17).length * 27
    + splitLines(context, type.description, 284, 15).length * 27;
}

function drawHeroCard(context, outcome, portrait, y) {
  const type=outcome.personality, theme=getHeroTheme(type.code);
  const height=heroHeightFor(context,type);
  roundedBox(context,16,y,328,height,18,"#fff",posterTheme.line);
  context.textAlign="center";
  posterText(context,"你的人格类型是：",180,y+24,14,posterTheme.muted);
  posterText(context,type.name,180,y+53,38,"#181d1a","900");
  posterText(context,type.code,180,y+102,34,"#2b8052","800");
  drawCharacter(context,portrait,20,y+146,320,400);
  const lines=splitLines(context,"“"+type.motto+"”",284,17);
  lines.forEach(function(line,index){posterText(context,line,180,y+557+index*27,17,"#737974","italic");});
  let cursor=y+557+lines.length*27+15;
  const widths=type.tags.map(function(tag){context.font="400 12px "+posterFont;return context.measureText(tag).width+22;});
  let x=(360-widths.reduce(function(a,b){return a+b;},0)-(widths.length-1)*7)/2;
  context.textAlign="left";
  type.tags.forEach(function(tag,i){roundedBox(context,x,cursor,widths[i],28,14,theme.soft);posterText(context,tag,x+11,cursor+7,12,theme.accent);x+=widths[i]+7;});
  cursor+=44;
  roundedBox(context,28,cursor,304,y+height-cursor-14,12,theme.soft);
  posterText(context,"性格速写",38,cursor+15,14,theme.accent,"700");
  const end=wrappedText(context,type.description,38,cursor+43,284,27,15,"#58675d");
  posterText(context,"四维倾向 · "+outcome.axisCode,38,end+8,12,theme.accent);
  return height;
}

function drawPersonalityCard(canvas,outcome,portrait) {
  const height=heroHeightFor(canvas.getContext("2d"),outcome.personality)+32;
  canvas.width=1080;canvas.height=height*3;
  const context=canvas.getContext("2d");context.scale(3,3);context.textBaseline="top";
  context.fillStyle=posterTheme.paper;context.fillRect(0,0,360,height);
  drawHeroCard(context,outcome,portrait,16);return canvas;
}

// 资产配置模块的长图绘制。与 allocation.js 的规则输出一一对应，不在这里新造数字。
const planColors = { equity: "#c44236", bond: "#416e83", money: "#6b8f71", gold: "#cf9b3f" };

function planRiskText(plan) {
  return plan.disclaimer[0] + plan.disclaimer[3];
}

function planRiskCardHeight(context, plan) {
  return 60 + splitLines(context, planRiskText(plan), 284, 12).length * 22;
}

function planSectionHeight(context, plan) {
  return 102                                     // 标题区
    + 128 + 16                                   // 四类比例卡
    + 46 + plan.stocks.length * 36 + 16          // 标的示例卡
    + planRiskCardHeight(context, plan);         // 风险提示卡
}

function drawPlanSection(context, plan, y) {
  const left = 16, cardWidth = 328, inside = 38, textWidth = 284;

  posterText(context, "资产配置建议", 22, y, 13, posterTheme.red, "600");
  posterText(context, "按你的风格，钱可以这样分", 22, y + 27, 22, posterTheme.ink, "700");
  posterText(context, plan.tweak
    ? plan.tweak.note + " · 合计 100%"
    : "由风险偏好与持有周期算出 · 合计 100%", 22, y + 61, 13, posterTheme.muted);
  y += 102;

  // 四类资产比例
  roundedBox(context, left, y, cardWidth, 128, 18, "#fffdf9", posterTheme.line);
  posterText(context, plan.styleName + " 风格" + (plan.tweak ? "（已手动调整）" : ""), inside, y + 18, 14, posterTheme.ink, "600");
  let barX = inside;
  const barY = y + 48;
  plan.allocation.forEach(function (sleeve) {
    const segmentWidth = textWidth * sleeve.pct / 100;
    roundedBox(context, barX, barY, segmentWidth, 16, 8, planColors[sleeve.key]);
    barX += segmentWidth;
  });
  plan.allocation.forEach(function (sleeve, index) {
    const x = inside + (index % 2) * 148;
    const ly = y + 84 + Math.floor(index / 2) * 26;
    context.beginPath();
    context.arc(x + 4, ly + 7, 4, 0, Math.PI * 2);
    context.fillStyle = planColors[sleeve.key];
    context.fill();
    posterText(context, sleeve.name, x + 14, ly, 12, posterTheme.muted);
    posterText(context, sleeve.pct + "%", x + 92, ly - 1, 15, posterTheme.ink, "700");
  });
  y += 128 + 16;

  // 标的示例
  const stockCardHeight = 46 + plan.stocks.length * 36;
  roundedBox(context, left, y, cardWidth, stockCardHeight, 18, "#fffdf9", posterTheme.line);
  posterText(context, "与你风格相符的标的示例", inside, y + 18, 14, posterTheme.ink, "600");
  plan.stocks.forEach(function (item, index) {
    const ry = y + 48 + index * 36;
    const pct = item.metrics.pePct;
    const pctText = typeof pct === "number" ? (pct < 1 ? pct.toFixed(1) : String(Math.round(pct))) + "%" : "--";
    posterText(context, String(index + 1).padStart(2, "0"), inside, ry, 12, posterTheme.red);
    posterText(context, item.name, inside + 24, ry - 2, 15, posterTheme.ink, "600");
    posterText(context, item.industry + " · PE 分位 " + pctText, inside + 24, ry + 18, 11, posterTheme.muted);
    context.textAlign = "right";
    posterText(context, "匹配度 " + item.score.toFixed(1), 322, ry + 1, 12, posterTheme.red);
    context.textAlign = "left";
  });
  y += stockCardHeight + 16;

  // 风险提示
  const riskHeight = planRiskCardHeight(context, plan);
  roundedBox(context, left, y, cardWidth, riskHeight, 18, "#fffdf9", posterTheme.line);
  posterText(context, "风险提示", inside, y + 18, 13, posterTheme.red, "600");
  wrappedText(context, planRiskText(plan), inside, y + 44, textWidth, 22, 12, "#6b6259");
  y += riskHeight;
  return y;
}

function drawPoster(canvas, outcome, portrait, isExample) {
  // 第一遍量文案高度，第二遍按测量出的高度绘图；文案变长也不会互相压住。
  let context = canvas.getContext("2d");
  const type = outcome.personality;
  const width = 360, left = 16, cardWidth = 328, inside = 38, textWidth = 284;
  const descriptionHeight = splitLines(context, type.description, textWidth, 16).length * 29;
  const mottoHeight = splitLines(context, type.motto, textWidth, 16).length * 27;
  const reflection = type.reflection.replace(/^值得留意：/, "");
  const reflectionHeight = splitLines(context, reflection, textWidth, 16).length * 29;
  const views = dimensions.map(function (dimension) { return getDimensionView(dimension, outcome.scores); });
  const dimensionHeights = views.map(function (view) {
    return 162 + splitLines(context, view.description, textWidth, 15).length * 27;
  });
  const heroHeight = heroHeightFor(context, type);
  const profileHeight = 0;
  const note = "28 道题形成四维偏好，四维组合唯一对应一个主人格。";
  const noteHeight = splitLines(context, note, textWidth, 13).length * 23;
  const reflectionCardHeight = 70 + reflectionHeight;
  // 资产配置模块与网页同源，取的是 allocation.js 已经算好的结果；没有结果时整节跳过。
  const plan = window.GBTI_PLAN && window.GBTI_PLAN.plan ? window.GBTI_PLAN.plan : null;
  const planHeight = plan ? planSectionHeight(context, plan) + 28 : 0;
  const totalHeight = 70 + heroHeight + 20 + profileHeight + 128 +
    dimensionHeights.reduce(function (sum, h) { return sum + h + 16; }, 0) +
    72 + planHeight + reflectionCardHeight + 28 + noteHeight + 125 + 60;
  canvas.width = width * 3;
  canvas.height = Math.ceil(totalHeight * 3);
  context = canvas.getContext("2d");
  context.scale(3, 3);
  context.textBaseline = "top";
  context.fillStyle = posterTheme.paper;
  context.fillRect(0, 0, width, totalHeight);
  posterText(context, "GBTI / 股票人格", 20, 22, 15, posterTheme.red, "700");
  context.textAlign = "right";
  posterText(context, isExample ? "示例结果" : "28 / 28 已完成", 340, 24, 12, posterTheme.muted);
  context.textAlign = "left";

  let y = 70;
  drawHeroCard(context, outcome, portrait, y);
  y += heroHeight + 26;

  posterText(context, "四维偏好", 22, y, 13, posterTheme.red, "600");
  posterText(context, "你的选择，逐项展开", 22, y + 27, 22, posterTheme.ink, "700");
  posterText(context, "每个维度 7 题 · 倾向代码 " + outcome.axisCode, 22, y + 61, 13, posterTheme.muted);
  y += 102;
  dimensions.forEach(function (dimension, index) {
    const view = views[index];
    const height = dimensionHeights[index];
    roundedBox(context, left, y, cardWidth, height, 18, "#fffdf9", posterTheme.line);
    posterText(context, String(index + 1).padStart(2, "0") + "  " + dimension.name, inside, y + 23, 17, posterTheme.ink, "600");
    context.textAlign = "right";
    posterText(context, view.strength, 322, y + 26, 12, posterTheme.red);
    context.textAlign = "left";
    posterText(context, dimension.left + " " + dimension.leftName, inside, y + 61, 13, posterTheme.red);
    posterText(context, view.left + "/" + view.total + " · " + view.percent + "%", inside, y + 84, 17, posterTheme.red, "600");
    context.textAlign = "right";
    posterText(context, dimension.right + " " + dimension.rightName, 322, y + 61, 13, posterTheme.muted);
    posterText(context, view.right + "/" + view.total + " · " + (100 - view.percent) + "%", 322, y + 84, 17, posterTheme.muted, "600");
    context.textAlign = "left";
    roundedBox(context, inside, y + 113, textWidth, 8, 4, "#ded6c8");
    if (view.percent) roundedBox(context, inside, y + 113, textWidth * view.percent / 100, 8, 4, posterTheme.red);
    wrappedText(context, view.description, inside, y + 139, textWidth, 27, 15, "#655c52");
    y += height + 16;
  });
  wrappedText(context, "百分比为本维度的选项占比，不是人格概率或准确率。", 24, y + 1, 312, 23, 13, posterTheme.muted);
  y += 72;

  if (plan) {
    y = drawPlanSection(context, plan, y) + 28;
  }

  roundedBox(context, left, y, cardWidth, reflectionCardHeight, 18, "#fffdf9", posterTheme.line);
  posterText(context, "给自己的提醒", inside, y + 24, 13, posterTheme.red, "600");
  wrappedText(context, reflection, inside, y + 54, textWidth, 29, 16, "#5a534a");
  y += reflectionCardHeight + 28;
  y = wrappedText(context, note, inside, y, textWidth, 23, 13, posterTheme.muted);
  y = wrappedText(context, "趣味自我探索 · 非科学测评\n不构成投资建议", inside, y + 16, textWidth, 23, 13, posterTheme.muted);
  if (isExample) posterText(context, "示例分数来自预设画像，非用户作答。", inside, y + 12, 12, posterTheme.muted);
  // 底部署名水印：分享出去的长图能带回新访客。
  context.textAlign = "center";
  posterText(context, "—— GBTI 股票人格测试 ——", 180, y + 46, 12, posterTheme.muted);
  context.textAlign = "left";
  return canvas;
}
