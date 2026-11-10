/* ==========================================================================
   GBTI 配对玩法
   把「四维」当成一张可对照的尺子，做三件事：
   1) 相亲卡：单只标的的四维画像、外号、与你的重合度
   2) 组合体检：把若干只当成一个整体，算组合人格与最不合群的一只
   3) 反向榜：四维与使用者完全相反的标的

   全部规则透明可复算：重合度 = 四维中相同的位数 / 4。不涉及收益、买卖或适配建议。
   ========================================================================== */

const GBTI_MATCH = (function () {
  "use strict";

  /* ---------- 外号：16 种组合各一个 ---------- */
  var NICKNAME = {
    FLDO: "低估值老农",
    FLAO: "财报狙击手",
    FLDJ: "慢牛执念者",
    FLAJ: "长线赌徒",
    FSDO: "稳健套利客",
    FSAO: "短打会计",
    FSDJ: "盯盘老法师",
    FSAJ: "财报冲浪手",
    MLDO: "大盘温度计",
    MLAO: "趋势追随者",
    MLDJ: "盘感守夜人",
    MLAJ: "慢热追风者",
    MSDO: "换手率警察",
    MSAO: "热点拆弹手",
    MSDJ: "情绪波段客",
    MSAJ: "换手率刺客"
  };

  /* ---------- 四维各两端的三句特征，按代码与标的代码取一句，避免千篇一律 ---------- */
  var TRAIT = {
    F: [
      "它的价格大体能拿财报解释，赚多少、值多少，翻得到出处。",
      "市盈率落在可测算的区间，愿意算账的人看得懂它。",
      "业绩是它的主要故事，估值给不给面子另说。"
    ],
    M: [
      "它的价格更多由成交和情绪决定，财报解释不了一半的波动。",
      "估值要么为负、要么高得没法算，只能跟着市场读它。",
      "它靠预期和热度定价，账面数字反而是配角。"
    ],
    L: [
      "换手安静，进去的人大多不急着走。",
      "一天的涨跌对它的持有人几乎不算事。",
      "它更适合被忘记一段时间，而不是每天打开看。"
    ],
    S: [
      "换手活跃，人来人往，节奏比故事重要。",
      "持有它需要盯盘，隔几天不看可能就错过一段。",
      "它的行情以周为单位翻篇，不适合放着不管。"
    ],
    D: [
      "体量够大，单日起伏相对温和。",
      "它不太容易出现那种让人睡不着的波动。",
      "盘子沉，涨跌都要有更大的力气才推得动。"
    ],
    A: [
      "体量偏小，情绪一来一回都很直接。",
      "它的日常起伏比大盘更剧烈，心脏要有准备。",
      "弹性和风险是一件事的两面，它两头都占。"
    ],
    O: [
      "当日振幅不大，走势可以用事先设好的条件去跟。",
      "它的节奏规整，按规则观察比凭感觉猜更省力。",
      "波动收敛，适合用清单式的办法看它。"
    ],
    J: [
      "当日振幅不小，条件式跟踪经常被打断。",
      "它的走势需要结合当天背景去读，硬套规则容易误判。",
      "临场判断在这儿比事先设条件更管用。"
    ]
  };

  var DIM_NAME = { F: "基本面", M: "市场面", L: "长期", S: "短期", D: "稳健", A: "进取", O: "客观规则", J: "主观判断" };
  var DIM_LABEL = { 0: "信息依据", 1: "持有周期", 2: "风险偏好", 3: "决策方式" };

  /* ---------- 基础工具 ---------- */

  function hashOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) % 100003;
    return h;
  }
  function pickOne(list, seed) {
    return list[seed % list.length];
  }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* 两个四维码的重合情况。返回相同位数、百分比与逐维对照。 */
  function overlap(a, b) {
    var hits = 0;
    var same = [];
    var diff = [];
    for (var i = 0; i < 4; i += 1) {
      var ca = a.charAt(i), cb = b.charAt(i);
      if (ca === cb) { hits += 1; same.push(i); }
      else diff.push({ index: i, label: DIM_LABEL[i], mine: ca, its: cb });
    }
    return { hits: hits, pct: Math.round(hits / 4 * 100), same: same, diff: diff };
  }

  /* 组合人格：逐维取多数票；票数相同记 ?，表示这一维内部就是分裂的。 */
  function comboOf(codes) {
    var dims = ["FM", "LS", "DA", "OJ"];
    var votes = [];
    var out = "";
    var split = [];
    for (var i = 0; i < 4; i += 1) {
      var tally = {};
      tally[dims[i].charAt(0)] = 0;
      tally[dims[i].charAt(1)] = 0;
      codes.forEach(function (c) {
        var ch = c.charAt(i);
        if (tally[ch] !== undefined) tally[ch] += 1;
      });
      votes.push(tally);
      var k0 = dims[i].charAt(0), k1 = dims[i].charAt(1);
      if (tally[k0] === tally[k1]) {
        out += "?";
        split.push(DIM_LABEL[i]);
      } else {
        out += tally[k0] > tally[k1] ? k0 : k1;
      }
    }
    return { code: out, votes: votes, split: split };
  }

  /* ---------- 文案 ---------- */

  function traitsOf(code, seedKey) {
    var seed = hashOf(seedKey);
    return [0, 1, 2, 3].map(function (i) {
      var list = TRAIT[code.charAt(i)] || [];
      return list.length ? pickOne(list, seed + i * 7) : "";
    }).filter(Boolean);
  }

  function sayTo(code, myCode) {
    var o = overlap(myCode, code);
    if (o.hits === 4) return "我们是一路人。你看得懂我，我也没打算让你意外。";
    if (o.hits === 3) {
      var d1 = o.diff[0];
      return "四维里我们只有" + d1.label + "对不上：你偏" + DIM_NAME[d1.mine] + "，我是" + DIM_NAME[d1.its] + "。就这一点，我们大概会吵。";
    }
    if (o.hits === 2) {
      return "我们一半像一半不像。你身上有我欣赏的部分，也有我看着别扭的部分。";
    }
    if (o.hits === 1) {
      return "只对上一维。你大概会觉得我莫名其妙，我也不会怪你。";
    }
    return "我们四个维度完全相反。你要是看得上我，那才叫奇怪。";
  }

  function comboDiagnosis(combo, myCode, worst) {
    var lines = [];
    var o = overlap(myCode, combo.code);
    if (combo.code.indexOf("?") >= 0) {
      lines.push("你的组合在" + combo.split.join("、") + "上是分裂的，持仓内部还没统一口径。");
    }
    if (o.hits === 4) {
      lines.push("组合和你四维全同：你的持仓基本就是你的镜子，谈不上分散性格。");
    } else if (o.hits >= 2) {
      lines.push("组合和你重合 " + o.pct + "%，大体是一路人，分歧在" +
        o.diff.map(function (d) { return d.label; }).join("、") + "。");
    } else {
      lines.push("组合和你只重合 " + o.pct + "%，你选的东西跟你本人不太一样。");
    }
    if (worst) {
      lines.push("最不合群的是 " + worst.name + "（" + worst.personaCode + "），与你重合 " + worst.pct + "%。");
    }
    return lines;
  }

  /* ---------- 弹窗骨架 ---------- */

  function ensureDialog() {
    var d = document.getElementById("match-dialog");
    if (d) return d;
    d = document.createElement("dialog");
    d.id = "match-dialog";
    d.className = "modal match-modal";
    d.innerHTML = '<div class="match-shell"><button class="match-close" type="button" aria-label="关闭">✕</button><div id="match-body"></div></div>';
    document.body.appendChild(d);
    d.querySelector(".match-close").addEventListener("click", function () { d.close(); });
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    return d;
  }

  function openDialog(html, exportPayload) {
    var d = ensureDialog();
    var body = document.getElementById("match-body");
    body.innerHTML = html;
    var save = body.querySelector("[data-match-save]");
    if (save && exportPayload) {
      save.addEventListener("click", function () { exportImage(exportPayload); });
    }
    var closeBtn = body.querySelector("[data-match-close]");
    if (closeBtn) closeBtn.addEventListener("click", function () { d.close(); });
    d.showModal();
  }

  /* ---------- 我的人格 ---------- */

  function meCode(me) {
    return me && me.code ? me.code : null;
  }
  function meName(me) {
    return me && me.name ? me.name : "你";
  }

  /* ---------- 玩法一：相亲卡 ---------- */

  function openCard(stock, me) {
    var code = stock.personaCode;
    var myCode = meCode(me);
    if (!code) return;
    var nick = NICKNAME[code] || "未命名选手";
    var o = myCode ? overlap(myCode, code) : null;
    var traits = traitsOf(code, stock.code + code);
    var say = myCode ? sayTo(code, myCode) : "先做完 28 题，我才知道和你像不像。";

    var rows = [
      { label: "四维代码", value: code + "　" + (stock.personaName || "") },
      { label: "外号", value: nick }
    ];
    var fig = window.GBTI_LOOK ? window.GBTI_LOOK.figure(code) : "";
    var html = '<div class="match-card">' +
      '<p class="match-eyebrow">GBTI 标的人格卡</p>' +
      '<div class="match-top' + (fig ? " has-figure" : "") + '">' +
      '<div class="match-figure">' + fig + "</div>" +
      '<div class="match-top-main">' +
      '<h2 class="match-name">' + escapeHtml(stock.name) + "</h2>" +
      '<p class="match-code">' + escapeHtml(stock.code) + "　" + escapeHtml(stock.industry || stock.belong || "") + "</p>" +
      '<div class="match-nick">' + escapeHtml(nick) + "</div>" +
      '<p class="match-dimline">' + code.split("").map(function (c, i) {
        return '<span class="match-dim"><b>' + c + "</b>" + DIM_NAME[c] + "</span>";
      }).join("") + "</p>" +
      "</div></div>" +
      '<ul class="match-traits">' + traits.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ul>";

    if (o) {
      html += '<div class="match-score">' +
        '<div class="match-score-num">' + o.pct + '<i>%</i></div>' +
        '<div class="match-score-text">与你的四维重合度' +
        (o.hits === 4 ? "，完全一致" : "，相同 " + o.hits + " 维") +
        "</div></div>";
      if (o.diff.length) {
        html += '<div class="match-diff">' + o.diff.map(function (d) {
          return '<span class="match-diff-item">' + d.label + "：你 " + d.mine + " " + DIM_NAME[d.mine] +
            " ／ 它 " + d.its + " " + DIM_NAME[d.its] + "</span>";
        }).join("") + "</div>";
      }
    }

    html += '<p class="match-say">「' + escapeHtml(say) + "」</p>" +
      '<p class="match-foot">四维由当日公开行情按统一阈值判定，重合度是四维相同位数除以四。' +
      "这只是趣味对照，不代表标的质量，不构成任何建议。</p>" +
      '<div class="match-actions"><button class="sp-btn wb-btn" type="button" data-match-save>保存为图片</button>' +
      '<button class="sp-btn sp-btn-ghost wb-btn" type="button" data-match-close>关闭</button></div></div>';

    openDialog(html, {
      kind: "card", title: stock.name, subtitle: stock.code + "　" + (stock.industry || stock.belong || ""),
      nick: nick, code: code, personaName: stock.personaName || "", traits: traits,
      score: o ? o.pct : null, scoreText: o ? (o.hits === 4 ? "与你四维完全一致" : "与你的四维重合度") : "",
      say: say, footnote: "行情 " + (stock.asOf || "") + " · 四维规则公开 · 趣味对照，不构成建议"
    });
  }

  /* ---------- 玩法二：组合体检 ---------- */

  function openCombo(stocks, me) {
    if (!stocks.length) return;
    var myCode = meCode(me);
    var codes = stocks.map(function (s) { return s.personaCode; }).filter(Boolean);
    var combo = comboOf(codes);
    var o = myCode ? overlap(myCode, combo.code) : null;

    var withPct = stocks.map(function (s) {
      var p = myCode ? overlap(myCode, s.personaCode) : null;
      return { name: s.name, code: s.code, personaCode: s.personaCode, pct: p ? p.pct : null, hits: p ? p.hits : null };
    });
    var sorted = withPct.slice().sort(function (a, b) {
      if (a.hits === null || b.hits === null) return 0;
      return a.hits - b.hits;
    });
    var worst = sorted[0] || null;
    var lines = myCode ? comboDiagnosis(combo, myCode, worst) : ["先做完 28 题，才能算出你与组合的重合度。"];

    var votesHtml = combo.votes.map(function (v, i) {
      var keys = Object.keys(v);
      var total = v[keys[0]] + v[keys[1]] || 1;
      return '<div class="match-vote"><span>' + DIM_LABEL[i] + "</span>" +
        '<div class="match-vote-bar"><i style="width:' + (v[keys[0]] / total * 100).toFixed(1) + '%"></i></div>' +
        "<em>" + keys[0] + " " + v[keys[0]] + " ／ " + keys[1] + " " + v[keys[1]] + "</em></div>";
    }).join("");

    var html = '<div class="match-card">' +
      '<p class="match-eyebrow">GBTI 组合体检</p>' +
      '<h2 class="match-name">' + stocks.length + " 只标的的组合人格</h2>" +
      '<div class="match-nick">' + escapeHtml(combo.code) + "　" + escapeHtml(NICKNAME[combo.code] || "口径未统一") + "</div>" +
      '<div class="match-faces">' + stocks.map(function (s) {
        var head = window.GBTI_LOOK ? window.GBTI_LOOK.avatar(s.personaCode, 34) : "";
        var worstCls = (worst && s.code === worst.code) ? " is-worst" : "";
        return '<span class="match-face' + worstCls + '" title="' + escapeHtml(s.name + " " + s.personaCode) + '">' +
          head + '<em>' + escapeHtml(s.name) + "</em></span>";
      }).join("") + "</div>" +
      '<p class="match-code">逐维取多数票；票数相同记 ?，表示这一维持仓内部就是分裂的</p>' +
      '<div class="match-votes">' + votesHtml + "</div>" +
      '<ul class="match-lines">' + lines.map(function (t) { return "<li>" + escapeHtml(t) + "</li>"; }).join("") + "</ul>";

    if (o) {
      html += '<div class="match-score"><div class="match-score-num">' + o.pct +
        '<i>%</i></div><div class="match-score-text">组合与你本人的重合度</div></div>';
    }
    html += '<p class="match-code">本次纳入：' + stocks.map(function (s) {
      return escapeHtml(s.name) + "（" + escapeHtml(s.personaCode) + "）";
    }).join("、") + "</p>" +
      '<p class="match-foot">四维由当日公开行情按统一阈值判定。体检只对照四维是否一致，' +
      "不代表组合优劣，不构成任何建议。</p>" +
      '<div class="match-actions"><button class="sp-btn wb-btn" type="button" data-match-save>保存为图片</button>' +
      '<button class="sp-btn sp-btn-ghost wb-btn" type="button" data-match-close>关闭</button></div></div>';

    openDialog(html, {
      kind: "combo", title: stocks.length + " 只标的的组合人格", subtitle: "GBTI 组合体检",
      nick: combo.code + "　" + (NICKNAME[combo.code] || "口径未统一"),
      code: combo.code, personaName: "", traits: lines,
      score: o ? o.pct : null, scoreText: "组合与你本人的重合度",
      say: "", footnote: "行情当日快照 · 四维规则公开 · 趣味对照，不构成建议"
    });
  }

  /* ---------- 玩法三：最不像你的 5 只 ---------- */

  /* 与某人四维差别最大的若干只。同分时优先换人格，避免整榜同一种脸。 */
  function pickMostUnlike(stocks, myCode, n) {
    var scored = (stocks || []).map(function (s) {
      var o = overlap(myCode, s.personaCode);
      return { s: s, hits: o.hits, pct: o.pct };
    }).filter(function (x) { return x.s && x.s.personaCode; });
    scored.sort(function (a, b) {
      if (a.hits !== b.hits) return a.hits - b.hits;
      return String(a.s.code).localeCompare(String(b.s.code));
    });
    var top = [];
    var seen = {};
    scored.forEach(function (x) {
      if (top.length >= n) return;
      if (seen[x.s.personaCode]) return;
      seen[x.s.personaCode] = true;
      top.push(x);
    });
    if (top.length < n) {
      scored.forEach(function (x) {
        if (top.length >= n) return;
        if (top.indexOf(x) >= 0) return;
        top.push(x);
      });
    }
    return top;
  }

  function openReverse(stocks, me) {
    var myCode = meCode(me);
    if (!myCode) return;
    var scored = stocks.map(function (s) { return { s: s, hits: overlap(myCode, s.personaCode).hits }; });
    var top = pickMostUnlike(stocks, myCode, 5);
    var zero = scored.filter(function (x) { return x.hits === 0; }).length;

    var html = '<div class="match-card">' +
      '<p class="match-eyebrow">GBTI 反向榜</p>' +
      '<h2 class="match-name">最不像你的 5 只</h2>' +
      '<p class="match-code">你 ' + myCode + "　" + escapeHtml(meName(me)) +
      "　·　全池里四维与你完全相反的共 " + zero + " 只</p>" +
      '<table class="match-table"><thead><tr><th>标的</th><th>四维</th><th>外号</th><th>重合</th></tr></thead><tbody>' +
      top.map(function (x) {
        var head = window.GBTI_LOOK ? window.GBTI_LOOK.avatar(x.s.personaCode, 28) : "";
        return '<tr><td><span class="match-cell">' + head + "<span>" + escapeHtml(x.s.name) +
          '<span class="match-sub">' + escapeHtml(x.s.code) + "</span></span></span></td><td>" +
          escapeHtml(x.s.personaCode) + "</td><td>" + escapeHtml(NICKNAME[x.s.personaCode] || "--") +
          "</td><td>" + x.pct + "%</td></tr>";
      }).join("") + "</tbody></table>" +
      '<p class="match-say">「这些是四维和你拧得最厉害的东西。看不看得上是一回事，认不认识自己是另一回事。」</p>' +
      '<p class="match-foot">按四维重合度升序取前五只，同分时优先选取不同的人格，便于看清分歧落在哪几个维度，可复算。不构成任何建议。</p>' +
      '<div class="match-actions"><button class="sp-btn wb-btn" type="button" data-match-save>保存为图片</button>' +
      '<button class="sp-btn sp-btn-ghost wb-btn" type="button" data-match-close>关闭</button></div></div>';

    openDialog(html, {
      kind: "reverse", title: "最不像你的 5 只", subtitle: "你 " + myCode + " " + meName(me),
      nick: "", code: myCode, personaName: "", score: null, scoreText: "",
      traits: top.map(function (x) { return x.s.name + "（" + x.s.personaCode + "）重合 " + x.pct + "%"; }),
      say: "这些是四维和你拧得最厉害的东西。", footnote: "四维规则公开 · 趣味对照，不构成建议"
    });
  }

  /* ---------- 导出图片 ---------- */

  function wrapText(ctx, text, maxWidth) {
    var lines = [];
    var cur = "";
    for (var i = 0; i < text.length; i += 1) {
      var next = cur + text.charAt(i);
      if (ctx.measureText(next).width > maxWidth && cur) {
        lines.push(cur);
        cur = text.charAt(i);
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function exportImage(p) {
    var W = 720, H = 1040, dpr = 2;
    var canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    var INK = "#332e28", MUTED = "#746b60", RED = "#c44236", PAPER = "#f7f3ea", LINE = "#e2d9cb";
    var SANS = '"Microsoft YaHei", "PingFang SC", sans-serif';

    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, W - 32, H - 32);

    var y = 74;
    ctx.fillStyle = RED;
    ctx.font = "600 15px " + SANS;
    ctx.fillText("GBTI", 56, y);
    ctx.fillStyle = MUTED;
    ctx.font = "400 14px " + SANS;
    ctx.fillText(p.subtitle || "", 110, y);

    y += 56;
    ctx.fillStyle = INK;
    ctx.font = "700 40px " + SANS;
    wrapText(ctx, p.title, W - 112).slice(0, 2).forEach(function (line) {
      ctx.fillText(line, 56, y);
      y += 50;
    });

    if (p.nick) {
      y += 8;
      ctx.fillStyle = RED;
      ctx.font = "700 26px " + SANS;
      ctx.fillText(p.nick, 56, y);
      y += 42;
    }

    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(W - 56, y);
    ctx.stroke();
    y += 42;

    ctx.font = "400 16px " + SANS;
    (p.traits || []).forEach(function (t) {
      wrapText(ctx, "· " + t, W - 120).forEach(function (line) {
        ctx.fillStyle = INK;
        ctx.fillText(line, 56, y);
        y += 26;
      });
      y += 8;
    });

    if (p.score !== null && p.score !== undefined) {
      y += 16;
      var numText = p.score + "%";
      ctx.fillStyle = RED;
      ctx.font = "700 64px " + SANS;
      ctx.fillText(numText, 56, y + 46);
      // 先按大号字量出宽度，再切小字号写说明，否则两段文字会叠在一起。
      var numW = ctx.measureText(numText).width;
      ctx.fillStyle = MUTED;
      ctx.font = "400 15px " + SANS;
      ctx.fillText(p.scoreText || "", 56 + numW + 16, y + 40);
      y += 76;
    }

    if (p.say) {
      ctx.fillStyle = INK;
      ctx.font = "400 17px " + SANS;
      wrapText(ctx, "「" + p.say + "」", W - 112).forEach(function (line) {
        ctx.fillText(line, 56, y);
        y += 28;
      });
    }

    ctx.fillStyle = MUTED;
    ctx.font = "400 12px " + SANS;
    wrapText(ctx, p.footnote || "", W - 112).forEach(function (line, i) {
      ctx.fillText(line, 56, H - 60 + i * 18);
    });

    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "GBTI-" + (p.title || "match").replace(/[\\/:*?"<>|]/g, "") + ".png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }, "image/png");
    }
  }

  return {
    openCard: openCard,
    openCombo: openCombo,
    openReverse: openReverse,
    _internal: { overlap: overlap, comboOf: comboOf, NICKNAME: NICKNAME, TRAIT: TRAIT, traitsOf: traitsOf, sayTo: sayTo, hashOf: hashOf, pickMostUnlike: pickMostUnlike, exportImage: exportImage }
  };
})();

if (typeof window !== "undefined") window.GBTI_MATCH = GBTI_MATCH;
if (typeof module !== "undefined" && module.exports) module.exports = GBTI_MATCH;
