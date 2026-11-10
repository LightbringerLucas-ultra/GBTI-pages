/* ==========================================================================
   GBTI AI 助手
   双引擎设计：
   1) 本地引擎（默认）—— 意图识别 + 人格知识库 + 当前结果的个性化解读，离线可用，零配置。
   2) 大模型引擎（可选）—— 用户在设置里填入兼容 OpenAI 的接口信息后启用；
      请求失败或跨域被拦截时自动回退到本地引擎，并在回答末尾说明。
   ========================================================================== */

const GBTI_AI = (function () {
  "use strict";

  /* ---------- 常量与状态 ---------- */

  const CONFIG_KEY = "gbti-ai-config";
  // 本地档案名。不是账号，只是用来区分同一台设备上不同使用者的 AI 配置。
  const USER_KEY = "gbti-user-name";

  // 一键填入用的 OpenAI 兼容服务预设。只填服务地址与模型名，密钥仍需使用者自己粘贴，
  // 任何兼容该格式的服务都可以，这里只放已经核对过文档的几项。
  const PRESETS = {
    deepseek: { base: "https://api.deepseek.com", model: "deepseek-v4-flash" }
  };
  const LOG_KEY = "gbti-ai-log";
  const AXIS_NAME = { F: "基本面", M: "市场面", L: "长期", S: "短期", D: "稳健", A: "进取", O: "客观规则", J: "主观判断" };
  const POLE_DETAIL = {
    F: "以公司的业务、盈利、估值和经营变化为主要依据。",
    M: "以价格走势、成交变化和市场情绪为主要依据。",
    L: "愿意用几个月甚至更长时间跟踪一个判断，等待逻辑逐步兑现。",
    S: "更关注几天到几周内的变化，偏好较短的观察与调整节奏。",
    D: "更看重持有过程的平稳，愿意为降低波动放弃一部分潜在空间。",
    A: "愿意在自己可承受的范围内，接受更大的起伏去争取更大空间。",
    O: "更依赖事先设定的条件和统一标准作决定，这是执行偏好，与理性程度无关。",
    J: "更依赖具体背景和综合判断作决定，这是判断偏好，并不代表缺乏依据。"
  };

  const state = {
    outcome: null,
    messages: [],
    busy: false,
    open: false,
    config: loadConfig(),
    userName: loadUserName(),
    booted: false
  };

  // 在 bind() 中赋值，对外暴露成 GBTI_AI.openSettings()。
  let openSettings = null;

  /* ---------- 存储 ---------- */

  function loadConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
      if (raw && typeof raw === "object") return { base: raw.base || "", key: raw.key || "", model: raw.model || "", strict: Boolean(raw.strict) };
    } catch (error) { /* 忽略解析失败。 */ }
    return { base: "", key: "", model: "", strict: false };
  }

  function saveConfig(config) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch (error) { /* 忽略写入失败。 */ }
  }

  function loadLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOG_KEY) || "null");
      if (Array.isArray(raw)) return raw.filter(function (item) { return item && item.role && item.text; }).slice(-30);
    } catch (error) { /* 忽略。 */ }
    return [];
  }

  function saveLog() {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(state.messages.slice(-30).map(function (message) {
        return { role: message.role, text: message.text };
      })));
    } catch (error) { /* 忽略。 */ }
  }

  function remoteReady() {
    return Boolean(state.config.base && state.config.key && state.config.model);
  }

  function loadUserName() {
    try { return (localStorage.getItem(USER_KEY) || "").slice(0, 16); } catch (error) { return ""; }
  }

  function saveUserName(name) {
    try {
      if (name) localStorage.setItem(USER_KEY, name);
      else localStorage.removeItem(USER_KEY);
    } catch (error) { /* 忽略写入失败。 */ }
  }

  /* ---------- 顶部入口状态 ---------- */

  // 右上角入口显示昵称与配置状态：已填好可用的接口时点亮小圆点。
  function syncUserEntry() {
    const label = document.querySelector("#user-open-label");
    if (label) label.textContent = state.userName || "用户登录";
    const dot = document.querySelector("#user-open-dot");
    if (dot) dot.hidden = !remoteReady();
    const button = document.querySelector("#user-open");
    if (button) {
      button.title = state.userName
        ? "用户中心 · " + state.userName + (remoteReady() ? "（已配置大模型）" : "（本地引擎）")
        : "用户登录与 AI 配置";
    }
  }

  /* ---------- 小工具 ---------- */

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  // 极简标记渲染：段落、短列表、加粗，其余一律按纯文本转义，避免注入。
  function toHtml(text) {
    const blocks = String(text).split(/\n{2,}/);
    return blocks.map(function (block) {
      const lines = block.split("\n");
      const isList = lines.every(function (line) { return /^\s*[-·•]\s+/.test(line); });
      const inline = function (line) {
        return esc(line).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      };
      if (isList) {
        return "<ul>" + lines.map(function (line) {
          return "<li>" + inline(line.replace(/^\s*[-·•]\s+/, "")) + "</li>";
        }).join("") + "</ul>";
      }
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    }).join("");
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  function codeBreakdown(code) {
    return code.split("").map(function (letter) { return letter + " " + AXIS_NAME[letter]; }).join("　·　");
  }

  function findPersonalityByCode(code) {
    return personalities.find(function (item) { return item.code === code.toUpperCase(); }) || null;
  }

  function detectPersonalities(text) {
    const upper = text.toUpperCase();
    const hits = [];
    personalities.forEach(function (item) {
      if (hits.includes(item)) return;
      if (text.includes(item.name) || upper.includes(item.code)) hits.push(item);
    });
    return hits;
  }

  function detectPoles(text) {
    const hits = [];
    Object.keys(POLE_DETAIL).forEach(function (letter) {
      const name = AXIS_NAME[letter];
      const pattern = new RegExp("(^|[^A-Za-z])" + letter + "([^A-Za-z]|$)", "i");
      if (text.includes(name) || pattern.test(text)) hits.push(letter);
    });
    return hits;
  }

  function personalityCard(item) {
    return [
      "**" + item.name + "（" + item.code + "）**",
      codeBreakdown(item.code),
      "",
      item.motto,
      "",
      item.description,
      "",
      "- 标签：" + item.tags.join("、")
    ].join("\n");
  }

  function mySummary() {
    const outcome = state.outcome;
    if (!outcome) return null;
    const type = outcome.personality;
    const lines = dimensions.map(function (dimension) {
      const view = getDimensionView(dimension, outcome.scores);
      const strong = Math.max(view.left, view.right);
      return "- " + dimension.name + "：" + view.winner + " " + view.winnerName + "（" + strong + "/" + view.total + "，" + view.strength + "）";
    });
    return [
      "**" + type.name + "（" + type.code + "）**　" + type.motto,
      "",
      lines.join("\n")
    ].join("\n");
  }

  /* ---------- 本地引擎：意图与回答 ---------- */

  function intentOf(text) {
    const lower = text.toLowerCase().trim();
    const has = function () {
      const words = Array.prototype.slice.call(arguments);
      return words.some(function (word) { return lower.includes(word); });
    };
    const people = detectPersonalities(text);
    const poles = detectPoles(text);

    const rules = [
      { id: "investing", score: (has("荐股", "推荐个股", "涨停板", "梭哈", "内幕") ? 11
        : (has("推荐", "选股", "能赚", "赚钱", "大涨", "涨停", "会涨", "能涨", "涨的股", "抄底", "逃顶")
          && has("股", "基金", "标的", "板块")) ? 11 : 0) },
      { id: "compare", score: ((has("区别", "差别", "不同", "对比", "像不像", "一样吗", "vs", "比较") && (people.length >= 2 || poles.length >= 2)) ? 12 : 0) },
      { id: "plan", score: (has("资产配置", "配置比例", "我的配置", "推荐标的", "标的示例", "为什么推荐", "入选理由", "推荐了哪些", "配的什么", "怎么配置", "持仓", "分别配多少") ? 12 : 0) },
      { id: "news", score: (has("资讯", "新闻", "本周热点", "最近发生什么", "市场动态", "有什么消息") ? 10 : 0) },
      { id: "dataUpdate", score: (has("数据更新", "什么时候更新", "行情数据", "数据是哪天", "数据哪天", "截止哪天", "多久更新", "怎么更新", "数据过期", "快照") ? 10 : 0) },
      { id: "personality", score: (people.length ? (people.length >= 2 ? 6 : 9) : 0) },
      { id: "myResult", score: (has("我的结果", "我的类型", "我是谁", "我是什么", "解读我", "分析我", "为什么我", "我为什么", "为什么是", "为什么这个", "我的代码", "我的四维", "帮我解读", "看下我的", "我的分析", "怎么得出", "怎么来的", "哪一项最明显", "最明显") ? 9 : 0) },
      { id: "dimension", score: (poles.length ? 7 : 0) + (has("维度是什么", "四个维度", "什么意思", "代表什么") ? 3 : 0) },
      { id: "accuracy", score: (has("准不准", "准吗", "科学", "可信", "准确率", "概率", "靠谱", "依据什么理论", "理论依据", "信度", "效度") ? 8 : 0) },
      { id: "mechanics", score: (has("几道题", "多少题", "怎么算", "怎么得", "算分", "计分", "规则", "怎么做", "怎么玩", "要多久", "多长时间", "28") ? 8 : 0) },
      { id: "gallery", score: (has("16种", "十六种", "16 种", "多少种人格", "有哪些人格", "全部人格", "人格列表", "所有类型") ? 8 : 0) },
      { id: "advice", score: (has("建议", "怎么办", "改进", "提升", "注意什么", "提醒", "怎么避免", "如何避免", "风险点", "要小心") ? 7 : 0) },
      { id: "privacy", score: (has("隐私", "数据", "上传", "保存到哪", "会泄露", "清空", "删除记录", "清除") ? 7 : 0) },
      { id: "about", score: (has("你是谁", "你是什么", "你是ai吗", "你怎么工作", "谁做的", "作者", "什么模型") ? 7 : 0) },
      { id: "remoteSetup", score: (has("api key", "apikey", "密钥", "大模型", "本地引擎", "接入", "接口怎么", "怎么填") ? 6.5 : 0) },
      { id: "thanks", score: (has("谢谢", "感谢", "thanks", "thx") ? 6 : 0) },
      { id: "greeting", score: (has("你好", "您好", "hi", "hello", "嗨", "在吗", "早上好", "晚上好", "下午好") ? 5 : 0) }
    ];
    rules.sort(function (a, b) { return b.score - a.score; });
    return rules[0].score > 0 ? rules[0].id : "fallback";
  }

  function localAnswer(text) {
    const intent = intentOf(text);
    const people = detectPersonalities(text);
    const poles = detectPoles(text);
    const hasResult = Boolean(state.outcome);
    const me = state.outcome ? state.outcome.personality : null;

    switch (intent) {
      case "greeting":
        return {
          text: pick([
            "在的。你可以问我关于这次测试的任何问题，比如“我为什么是这个类型”“F 和 M 的区别是什么”。",
            "你好。想聊点什么？我可以解读你的结果、解释四个维度，也可以介绍其余人格。"
          ]),
          chips: chipsFor()
        };

      case "about":
        return {
          text: [
            "我是 GBTI 测试自带的解读助手，跑在本地的一个规则引擎里。",
            "",
            "我的工作方式分两步：先从你的提问里识别意图，再去题库、人格库和你的作答结果里找对应内容，组合成回答。所以我不会编造项目里没有的人格和数据。",
            "",
            state.config.base ? "你已经填写了外部接口，若接口可用，回答会改由大模型生成。" : "你也可以在设置里填入兼容 OpenAI 的接口，把回答切换成真正的大模型生成。"
          ].join("\n"),
          chips: chipsFor()
        };

      case "mechanics":
        return {
          text: [
            "测试一共 **28 道**二选一情境题，分四个维度，每个维度 7 题。",
            "",
            "- 信息依据：基本面 F / 市场面 M",
            "- 持有周期：长期 L / 短期 S",
            "- 风险偏好：稳健 D / 进取 A",
            "- 决策方式：客观规则 O / 主观判断 J",
            "",
            "每题只给一个方向加 1 分。每个维度得分较高的一端组成四位代码，唯一对应 16 种人格中的一种。因为每维 7 题是奇数，不会出现同分，也就不存在“并列人格”。",
            "",
            "节奏上大约 3 至 5 分钟。答完可以生成一张高清结果长图。"
          ].join("\n"),
          chips: ["我为什么是这个类型", "四个维度分别是什么意思", "结果准不准"]
        };

      case "accuracy":
        return {
          text: [
            "先说结论：**这不是科学测评**，请把它当作一面自我观察的镜子。",
            "",
            "- 16 种人格各占 6.25%，这是等概率二选一的理论分布，不代表真实人群分布。",
            "- 维度百分比说的是该维度 7 道题里的选项占比，不是人格概率，也不是准确率。",
            "- 题目本身区分度和答题负担，还需要更多真实用户试测来检验。",
            "",
            "它能帮你整理自己的观察习惯，但不能用来判断投资能力高低。所谓客观规则和主观判断，只是决策偏好，不分优劣。"
          ].join("\n"),
          chips: ["这个结果是怎么算出来的", "给我的提醒有哪些", "重新测一次结果会变吗"]
        };

      case "gallery": {
        const list = personalities.map(function (item) { return "- " + item.code + "　" + item.name; }).join("\n");
        return {
          text: [
            "一共 **16 种**股票人格，由四个维度的高分端组合而成。",
            "",
            list,
            "",
            me ? "你当前是 **" + me.name + "（" + me.code + "）**。想了解哪一个，直接打名字或代码就行，例如“FLAJ 是什么”。" : "想看某一个的详细说明，直接打它的名字或代码，例如“FLAJ 是什么”。"
          ].join("\n"),
          chips: ["FLAJ 是什么", "帮我对比 FLAO 和 FLAJ", "展开 16 种人格画册"]
        };
      }

      case "personality": {
        const first = people[0];
        if (people.length >= 2 && /区别|对比|不同|差别|vs|比较|像/.test(text)) return compareAnswer(people[0], people[1]);
        const isMine = me && first.code === me.code;
        return {
          text: [
            personalityCard(first),
            "",
            "值得留意：" + first.reflection.replace(/^值得留意：/, ""),
            "",
            isMine ? "这正好是你这次的测试结果。" : (me ? "和你的 " + me.name + " 相比，主要差别在四维代码上：" + me.code + " 与 " + first.code + "。" : "")
          ].filter(Boolean).join("\n"),
          chips: me && !isMine ? ["对比我的人格和 " + first.code, "我为什么是这个类型", "再介绍一个其他人格"] : ["我为什么是这个类型", "四个维度分别是什么意思", "结果准不准"]
        };
      }

      case "compare":
        return compareAnswer(people[0] || null, people[1] || null, poles);

      case "myResult": {
        if (!hasResult) {
          return {
            text: [
              "我还没有看到你的结果，因为测试还没完成。",
              "",
              "28 道题大约 3 至 5 分钟，答完我就能照着你的四维得分逐条解读。你可以点下面的按钮直接开始，答题记录会自动保存在本地。"
            ].join("\n"),
            chips: ["这次测试一共几道题", "四个维度分别是什么意思", "结果准不准"],
            action: "start"
          };
        }
        const type = state.outcome.personality;
        const ranked = dimensions.map(function (dimension) {
          return getDimensionView(dimension, state.outcome.scores);
        }).sort(function (a, b) {
          return (Math.max(b.left, b.right) - Math.min(b.left, b.right)) - (Math.max(a.left, a.right) - Math.min(a.left, a.right));
        });
        const top = ranked[0];
        const last = ranked[ranked.length - 1];
        const topScore = Math.max(top.left, top.right);
        const lastScore = Math.max(last.left, last.right);
        const balance = lastScore < topScore
          ? "四维里倾向最一致的是 **" + top.winnerName + "**（" + topScore + "/" + top.total + "，" + top.strength + "）；相对最接近的是 **" + last.winnerName + "**（" + lastScore + "/" + last.total + "），这一端你两种选择都有，弹性更大。"
          : "四个维度的选择一致度相当，都是 " + topScore + "/" + top.total + "，没有明显摇摆的一项，方向感很集中。";
        return {
          text: [
            "你的结果是 **" + type.name + "（" + type.code + "）**。",
            codeBreakdown(type.code),
            "",
            "拆开看，你的判断主要建立在「" + AXIS_NAME[type.code[0]] + "」上，持有周期偏「" + AXIS_NAME[type.code[1]] + "」，风险偏好偏「" + AXIS_NAME[type.code[2]] + "」，决策方式偏「" + AXIS_NAME[type.code[3]] + "」。",
            "",
            balance,
            "",
            type.description,
            "",
            "值得留意：" + type.reflection.replace(/^值得留意：/, "")
          ].join("\n"),
          chips: ["给我三条可执行的提醒", "四维里哪一项最明显", "我适合关注什么样的信息"]
        };
      }

      case "dimension": {
        if (poles.length >= 2 && /区别|不同|对比|vs|差别|比较/.test(text)) return compareAnswer(null, null, poles);
        const letter = poles[0];
        if (!letter) {
          return {
            text: [
              "四个维度分别是信息依据、持有周期、风险偏好和决策方式，每个维度 7 题。",
              "",
              "- **信息依据**：你靠基本面 F 还是市场面 M 作判断",
              "- **持有周期**：你习惯长期 L 还是短期 S 的节奏",
              "- **风险偏好**：你偏好稳健 D 还是进取 A",
              "- **决策方式**：你依赖客观规则 O 还是主观判断 J",
              "",
              "想看具体某一端，直接问，例如“稳健和进取有什么区别”。"
            ].join("\n"),
            chips: ["F 和 M 有什么区别", "稳健和进取有什么区别", "客观规则和主观判断有什么区别"]
          };
        }
        const dimension = dimensions.find(function (item) {
          return item.left === letter || item.right === letter;
        });
        const otherLetter = dimension ? (dimension.left === letter ? dimension.right : dimension.left) : "";
        const view = dimension && state.outcome ? getDimensionView(dimension, state.outcome.scores) : null;
        return {
          text: [
            "**" + letter + " " + AXIS_NAME[letter] + "**　" + POLE_DETAIL[letter],
            "",
            dimension ? "它属于「" + dimension.name + "」维度，另一端是 " + otherLetter + " " + AXIS_NAME[otherLetter] + "。这个维度共 7 题。" : "",
            view ? "\n你在这个维度上落在 **" + view.winnerName + "**：" + view.description : ""
          ].filter(Boolean).join("\n"),
          chips: dimension ? [letter + " 和 " + otherLetter + " 有什么区别", "我为什么是这个类型", "结果准不准"] : ["我为什么是这个类型", "结果准不准"]
        };
      }

      case "advice": {
        if (!hasResult) {
          return {
            text: "这是通用建议，等你答完题我可以给更贴着你自己四维的版本。\n\n- 记录下每次判断的理由，事后回看理由是否成立，比只看盈亏更有用。\n- 无论偏好哪一端，都给自己留一条复核规则。\n- 结果只是风格比喻，别用它替代实际功课。",
            chips: ["这次测试一共几道题", "结果准不准"],
            action: "start"
          };
        }
        const type = state.outcome.personality;
        const custom = {
          F: "- 经营数据更新有滞后，给判断设一个到期复核的时间点。",
          M: "- 价格信号变化快，提前写清楚什么情况下算信号失效。",
          L: "- 长期持有不等于不用管，按季度回看原来的逻辑是否还成立。",
          S: "- 短周期会放大交易成本和情绪影响，控制参与频率。",
          D: "- 低波动不等于低风险，注意流动性差和长期跑输的可能。",
          A: "- 波动放大时先看是否超出自己事先设定的承受范围。",
          O: "- 规则会过时，定期检查它是否还适用于当下的情况。",
          J: "- 情境判断容易受当下情绪影响，回看时问问当时的信息是否足够。"
        };
        const list = type.code.split("").map(function (letter) { return custom[letter]; }).join("\n");
        return {
          text: [
            "针对你的 **" + type.name + "（" + type.code + "）**，三条先做起来最容易的：",
            "",
            "1. 把每一次判断的理由写下来，包含你依据的信息和你打算什么时候复核。",
            "2. 给自己定一条无效条件，说明什么情况出现就承认这次判断不成立。",
            "3. 定期回看，检查依据是否还在，而不是只看结果好坏。",
            "",
            "再补充几条和你四维直接相关的：",
            list
          ].join("\n"),
          chips: ["我为什么是这个类型", "四维里哪一项最明显", "这次测试是怎么算分的"]
        };
      }

      case "plan": {
        let plan = null;
        try { plan = window.GBTI_PLAN && window.GBTI_PLAN.plan; } catch (error) { /* 忽略。 */ }
        if (!plan || !plan.allocation) {
          return {
            text: "还没有可看的资产配置。它是你答完 28 道题出结果时，按你的人格自动生成的，答完我就能逐项讲比例和标的。",
            chips: ["这次测试一共几道题", "四个维度分别是什么意思", "结果准不准"],
            action: "start"
          };
        }
        const sleeves = plan.allocation.map(function (s) { return s.name + " " + s.pct + "%"; }).join("、");
        const stocks = (plan.stocks || []).map(function (item, index) {
          return (index + 1) + ". " + item.name + "（" + (item.industry || "指数扩展池") + "，匹配度 " + item.score.toFixed(1) + "）";
        }).join("\n");
        let asOfLine = "";
        try {
          if (typeof GBTI_MARKET !== "undefined" && GBTI_MARKET) asOfLine = "数据截止 " + GBTI_MARKET.asOf + " 收盘。";
        } catch (error) { /* 忽略。 */ }
        return {
          text: [
            "按你的风格（**" + (plan.styleName || "") + "**" + (plan.tweak ? "，你手动微调过比例" : "") + "），配置比例是：" + sleeves + "。",
            "",
            "当前与你风格匹配的标的示例：",
            stocks || "（本次没有筛出标的）",
            "",
            "每只的入选理由，在结果页「资产配置建议」卡里点标的名称就能展开。" + asOfLine,
            "提醒：这些是按固定规则筛出的趣味示例，不构成投资建议。"
          ].join("\n"),
          chips: ["为什么推荐这几只标的", "帮我解读我的结果", "行情数据是哪天的，怎么更新"]
        };
      }

      case "news": {
        let data = null;
        try { data = window.GBTI_NEWS_DATA; } catch (error) { /* 忽略。 */ }
        if (!data || !Array.isArray(data.articles) || !data.articles.length) {
          return {
            text: "资讯快照现在是空的。展开结果页底部的「数据维护」面板更新一次，或双击文件夹里的「双击我更新数据.bat」。",
            chips: ["行情数据是哪天的，怎么更新", "结果准不准"]
          };
        }
        const list = data.articles.slice(0, 5).map(function (article) {
          return "- " + article.title + "（" + (article.source || "未知来源") + "）";
        }).join("\n");
        return {
          text: [
            "本周资讯（采集于 " + String(data.fetchedAt || "").slice(0, 10) + "）：",
            "",
            list,
            "",
            "完整列表在结果页的每周资讯板块，点标题可以看摘要和原文链接。这些资讯供了解背景，不构成投资建议。"
          ].join("\n"),
          chips: ["我的资产配置是什么", "行情数据是哪天的，怎么更新", "结果准不准"]
        };
      }

      case "dataUpdate": {
        let info = "";
        try {
          if (typeof GBTI_MARKET !== "undefined" && GBTI_MARKET) {
            info = "当前快照行情截止 **" + GBTI_MARKET.asOf + " 收盘**，抓取于 "
              + String(GBTI_MARKET.fetchedAt || "").slice(0, 16).replace("T", " ")
              + "，覆盖 " + (GBTI_MARKET.coverage || "未知") + "。";
          }
        } catch (error) { /* 忽略。 */ }
        return {
          text: [
            info || "暂时没读到行情快照，可能还没跑过更新。",
            "",
            "更新方式：",
            "- 页面上：展开底部「数据维护」面板，点「立即更新行情数据」；数据过期时顶部也会出现一键更新横幅。",
            "- 页面外：双击文件夹里的「双击我更新数据.bat」，服务启动时会自动补抓过期数据。",
            "",
            "每次更新前旧数据会自动备份到 backups 文件夹，抓坏了双击「恢复上次数据.bat」就能回滚。"
          ].join("\n"),
          chips: ["我的资产配置是什么", "本周有什么财经资讯", "结果准不准"]
        };
      }

      case "remoteSetup":
        return {
          text: [
            "切换到大模型只要三步：",
            "",
            "1. 点右上角「用户登录」，或我这个面板右上角的齿轮，打开用户中心。",
            "2. 在「AI 配置」里填三项：服务地址、API Key、模型名称；用 DeepSeek 可以点「一键填入」，再补上 key。",
            "3. 点「保存并启用」。",
            "",
            "填好后我就是正常的大模型，什么话题都能聊，并且会自动带上你的测试结果、资产配置和本周资讯作背景。设置里勾上「严格模式」则只聊测试、更省 token。",
            "",
            "注意：启用后对话内容会发送到你填的那个接口，请确认服务商可信。"
          ].join("\n"),
          chips: ["你是谁，怎么工作的", "我的数据保存在哪里，会不会上传"]
        };

      case "privacy":
        return {
          text: [
            "你的作答只保存在**你自己浏览器的本地存储**里，不会上传到任何服务器，网页本身也没有后端。",
            "",
            "- 想清空，点答题卡上方的「清空已保存的作答记录」即可。",
            "- 如果你在设置里填了外部大模型接口，那么对话内容和你的结果会被发送到那个接口，请自行确认对方是否可信。",
            "- 本地引擎模式下，所有回答都在你的浏览器里生成，不出本机。"
          ].join("\n"),
          chips: ["你是谁", "结果准不准"]
        };

      case "investing":
        return {
          text: [
            "这个问题我不能回答。",
            "",
            "GBTI 是一个趣味自我探索工具，不提供投资建议，也不推荐任何具体的股票或产品。四个维度描述的是你的观察与决策习惯，不是投资能力，更不是收益预测。",
            "",
            "真正涉及资金的决定，请以你自己的独立判断和正规持牌机构的信息为准。",
            "",
            "如果你愿意，我可以换个角度：说说你这个风格通常容易忽略哪类信息，或者怎么给自己设计一条复核规则。"
          ].join("\n"),
          chips: ["我这个风格容易忽略什么", "给我三条可执行的提醒", "结果准不准"]
        };

      case "thanks":
        return {
          text: pick(["不客气。还有想问的直接说。", "随时找我。想深入某个维度也可以继续问。"]),
          chips: chipsFor()
        };

      default: {
        const options = [
          "我暂时没把握准确理解你的问题。换个说法试试，或者点上方「可以问我这些」，里面列出了我本地能回答的全部问题。",
          "这个问题超出我现在的本地知识范围了。点上方「可以问我这些」能看到我会答的全部题目；想要自由问答，可以在设置里接入大模型。"
        ];
        return { text: pick(options), chips: chipsFor() };
      }
    }
  }

  function compareAnswer(a, b, poles) {
    const axisNames = ["信息依据", "持有周期", "风险偏好", "决策方式"];
    if (a && b) {
      const diff = [];
      const same = [];
      for (let index = 0; index < 4; index += 1) {
        if (a.code[index] === b.code[index]) same.push(axisNames[index] + "（同为 " + AXIS_NAME[a.code[index]] + "）");
        else diff.push("- **" + axisNames[index] + "**：" + a.code[index] + " " + AXIS_NAME[a.code[index]]
          + "（" + a.name + "）对比 " + b.code[index] + " " + AXIS_NAME[b.code[index]] + "（" + b.name + "）");
      }
      return {
        text: [
          "**" + a.name + "（" + a.code + "）** 与 **" + b.name + "（" + b.code + "）** 的差别：",
          "",
          diff.length ? diff.join("\n") : "两者四位代码完全相同，属于同一种人格。",
          "",
          same.length ? "相同的是 " + same.join("、") + "。" : "",
          "只差一个字母时，两种人格往往是同一类思路下的两种收尾方式，没有高下之分。"
        ].filter(Boolean).join("\n"),
        chips: state.outcome ? ["我为什么是这个类型", "帮我解读我的结果"] : ["这次测试一共几道题", "结果准不准"]
      };
    }
    const pair = (poles || []).slice(0, 2);
    if (pair.length === 2) {
      const letter = pair[0];
      const other = pair[1];
      const dimension = dimensions.find(function (item) {
        return (item.left === letter && item.right === other) || (item.left === other && item.right === letter);
      });
      return {
        text: [
          "**" + letter + " " + AXIS_NAME[letter] + "** 与 **" + other + " " + AXIS_NAME[other] + "** 属于"
            + (dimension ? "同一个「" + dimension.name + "」维度的两端" : "不同维度") + "，是偏好差异，不是水平高低。",
          "",
          "- " + letter + " " + AXIS_NAME[letter] + "：" + POLE_DETAIL[letter],
          "- " + other + " " + AXIS_NAME[other] + "：" + POLE_DETAIL[other],
          "",
          dimension && state.outcome ? "你这次在这个维度上落在 **" + getDimensionView(dimension, state.outcome.scores).winnerName + "**。" : ""
        ].filter(Boolean).join("\n"),
        chips: ["我为什么是这个类型", "结果准不准"]
      };
    }
    return {
      text: "想对比的话，把两个人格的名字或代码都发给我，例如“FLAO 和 FLAJ 有什么区别”。",
      chips: ["FLAO 和 FLAJ 有什么区别", "客观规则和主观判断有什么区别"]
    };
  }

  function chipsFor() {
    if (state.outcome) return ["让 AI 猜我的人格", "帮我解读我的结果", "给我三条可执行的提醒", "四维里哪一项最明显"];
    return ["让 AI 猜我的人格", "这次测试一共几道题", "四个维度分别是什么意思", "展开 16 种人格画册"];
  }

  /* ---------- 本地模式的问题目录：可折叠、可滑动、点击即问 ---------- */

  function qaGroups() {
    const groups = [
      { title: "猜一猜", items: ["让 AI 猜我的人格"] },
      { title: "测试怎么玩", items: ["这次测试一共几道题", "四个维度分别是什么意思", "结果准不准", "我的数据保存在哪里，会不会上传"] },
      { title: "人格与维度", items: ["展开 16 种人格画册", "FLAJ 是什么", "FLAO 和 FLAJ 有什么区别", "F 和 M 有什么区别", "稳健和进取有什么区别", "客观规则和主观判断有什么区别"] },
      { title: "资讯与数据", items: ["本周有什么财经资讯", "行情数据是哪天的，怎么更新"] },
      { title: "关于助手", items: ["你是谁，怎么工作的", "怎么接入大模型", "怎么清空我的作答记录"] }
    ];
    if (state.outcome) {
      groups.splice(1, 0, { title: "我的结果与配置", items: ["帮我解读我的结果", "我为什么是这个类型", "四维里哪一项最明显", "给我三条可执行的提醒", "我的资产配置是什么", "为什么推荐这几只标的"] });
    }
    return groups;
  }

  function renderQa() {
    const box = document.querySelector("#ai-qa");
    const list = document.querySelector("#ai-qa-list");
    if (!box || !list) return;
    // 接入大模型后话题不受限，目录不再占位。
    box.hidden = remoteReady();
    if (box.hidden) return;
    list.replaceChildren();
    qaGroups().forEach(function (group) {
      const head = document.createElement("p");
      head.className = "ai-qa-group";
      head.textContent = group.title;
      const row = document.createElement("div");
      row.className = "ai-qa-row";
      group.items.forEach(function (question) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-chip";
        button.textContent = question;
        button.addEventListener("click", function () { box.open = false; submit(question); });
        row.appendChild(button);
      });
      list.append(head, row);
    });
  }

  /* ---------- 大模型引擎 ---------- */

  /* 上下文注入：把页面里的测试结果、资产配置、行情快照、每周资讯
     拼进系统提示，模型因此「认识」旁边的测试内容与推荐标的。 */
  function outcomeContext() {
    if (!state.outcome) return "用户尚未完成测试，暂无结果。";
    return "用户本次测试结果：代码 " + state.outcome.personality.code + "，人格名称 " + state.outcome.personality.name
      + "。四维得分 " + JSON.stringify(state.outcome.scores) + "。四维偏好 " + state.outcome.axisCode + "。"
      + "人格说明：" + state.outcome.personality.description + " 提醒：" + state.outcome.personality.reflection;
  }

  function marketContext() {
    try {
      if (typeof GBTI_MARKET === "undefined" || !GBTI_MARKET) return "";
      return "页面行情数据：截止 " + GBTI_MARKET.asOf + " 收盘，覆盖 " + (GBTI_MARKET.coverage || "未知")
        + "，估值历史分位" + (GBTI_MARKET.hasPercentile ? "齐全" : "缺失（页面显示为 --）") + "。";
    } catch (error) { return ""; }
  }

  function planContext() {
    try {
      const plan = window.GBTI_PLAN && window.GBTI_PLAN.plan;
      if (!plan || !plan.allocation) return "";
      const sleeves = plan.allocation.map(function (s) { return s.name + " " + s.pct + "%"; }).join("、");
      const stocks = (plan.stocks || []).map(function (item, index) {
        return (index + 1) + ". " + item.name + "（" + item.code + "，" + item.industry + "，匹配度 "
          + item.score.toFixed(1) + "）：" + (item.reasons || []).join("；");
      }).join("\n");
      return "页面为该用户生成的资产配置（" + (plan.styleName || "") + " 风格" + (plan.tweak ? "，用户手动微调过比例" : "")
        + "）：" + sleeves + "。\n推荐标的示例与入选理由：\n" + stocks
        + "\n这些标的是按规则筛选的趣味示例，不是投资建议。";
    } catch (error) { return ""; }
  }

  function newsContext() {
    try {
      const data = window.GBTI_NEWS_DATA;
      if (!data || !Array.isArray(data.articles) || !data.articles.length) return "";
      const titles = data.articles.slice(0, 8).map(function (article) { return "- " + article.title; }).join("\n");
      return "页面本周财经资讯（采集于 " + String(data.fetchedAt || "").slice(0, 10) + "）：\n" + titles;
    } catch (error) { return ""; }
  }

  function systemPrompt() {
    if (state.config.strict) {
      // 严格模式：只聊测试本身，省 token，适合把页面发给朋友玩。
      return [
        "你是 GBTI 股票人格测试的解读助手。GBTI 是一个趣味自我探索工具，共 28 道二选一情境题，测信息依据（基本面 F／市场面 M）、持有周期（长期 L／短期 S）、风险偏好（稳健 D／进取 A）、决策方式（客观规则 O／主观判断 J）四个维度，各 7 题，四维高分端组成四位代码，唯一对应 16 种人格之一。",
        outcomeContext(),
        "规则：1) 绝不推荐具体股票、基金或任何投资产品，不做收益预测，遇到这类问题礼貌拒答并说明这是趣味测试。2) 不评判用户理性程度或投资能力。3) 客观规则与主观判断只是决策偏好，不分优劣。4) 用简体中文回答，控制在 250 字以内，能用短列表就用短列表。5) 不确定的信息不要编造。"
      ].join("\n");
    }
    // 通用模式（默认）：不加限制的普通大模型，只把页面数据作为背景告诉它。
    return [
      "你是一个通用 AI 助手，运行在一个名叫「GBTI 股票人格测试」的本地网页里。GBTI 是趣味自我探索工具：28 道二选一情境题测四个维度（信息依据 F 基本面／M 市场面、持有周期 L 长期／S 短期、风险偏好 D 稳健／A 进取、决策方式 O 客观规则／J 主观判断），四维高分端组成四位代码，对应 16 种人格，并按人格给出资产配置与标的示例。",
      "以下是这个页面当前的数据，用户问到相关内容时优先引用它们；问别的则正常回答，话题不限。",
      outcomeContext(),
      marketContext(),
      planContext(),
      newsContext(),
      "默认用简体中文回答。"
    ].filter(Boolean).join("\n");
  }

  async function remoteAnswer(text, onDelta) {
    const base = state.config.base.replace(/\/+$/, "");
    const messages = [{ role: "system", content: systemPrompt() }]
      .concat(state.messages.slice(-16).map(function (message) {
        return { role: message.role === "ai" ? "assistant" : "user", content: message.text };
      }))
      .concat([{ role: "user", content: text }]);
    const response = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + state.config.key },
      body: JSON.stringify({
        model: state.config.model,
        temperature: 0.7,
        stream: Boolean(onDelta),
        messages: messages
      })
    });
    if (!response.ok) throw new Error("接口返回 " + response.status);

    // 非流式：一次性读 JSON。
    if (!onDelta || !response.body || !response.body.getReader) {
      const data = await response.json();
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error("接口未返回内容");
      return content.trim();
    }

    // 流式 SSE：逐段累积，边收边渲染。
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let acc = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(function (line) {
        line = line.trim();
        if (line.indexOf("data:") !== 0) return;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        try {
          const delta = JSON.parse(payload);
          const piece = delta.choices && delta.choices[0] && delta.choices[0].delta && delta.choices[0].delta.content;
          if (piece) { acc += piece; onDelta(acc); }
        } catch (error) { /* 忽略半截 JSON 行。 */ }
      });
    }
    if (!acc) throw new Error("接口未返回内容");
    return acc.trim();
  }

  /* ---------- 视图 ---------- */

  const el = {};

  function cache() {
    el.panel = document.querySelector("#ai-panel");
    el.messages = document.querySelector("#ai-messages");
    el.chips = document.querySelector("#ai-chips");
    el.form = document.querySelector("#ai-form");
    el.input = document.querySelector("#ai-input");
    el.send = document.querySelector("#ai-send");
    el.fab = document.querySelector("#ai-fab");
    el.engine = document.querySelector("#ai-engine");
    el.subtitle = document.querySelector("#ai-subtitle");
    el.settings = document.querySelector("#ai-settings");
  }

  function setEngineChip() {
    if (!el.engine) return;
    if (remoteReady()) {
      el.engine.textContent = "大模型 · " + state.config.model;
      el.engine.classList.add("online");
    } else {
      el.engine.textContent = "本地引擎";
      el.engine.classList.remove("online");
    }
    renderQa();
    renderChips(chipsFor());
  }

  function setSubtitle() {
    if (!el.subtitle) return;
    el.subtitle.textContent = state.outcome
      ? "当前结果：" + state.outcome.personality.name + "（" + state.outcome.personality.code + "）"
      : "尚未测试，可先了解题型与维度";
  }

  function bubble(role, html, extraClass) {
    const node = document.createElement("div");
    node.className = "msg " + (role === "user" ? "msg-user" : "msg-bot") + (extraClass ? " " + extraClass : "");
    node.innerHTML = html;
    el.messages.appendChild(node);
    el.messages.scrollTop = el.messages.scrollHeight;
    return node;
  }

  function renderChips(list) {
    if (!el.chips) return;
    el.chips.replaceChildren();
    // 猜人格进行中需要在本地模式下也显示选项按钮，否则流程无法继续。
    const guessing = Boolean(window.GBTI_GUESS && window.GBTI_GUESS.active());
    if (!remoteReady() && !guessing) { el.chips.hidden = true; return; }
    el.chips.hidden = false;
    (list && list.length ? list : chipsFor()).slice(0, 4).forEach(function (label) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-chip";
      button.textContent = label;
      button.addEventListener("click", function () { submit(label); });
      el.chips.appendChild(button);
    });
  }

  // 打字机效果：整段控制在约 800ms 内完成，不拖慢长回答。
  function typewrite(node, text) {
    return new Promise(function (resolve) {
      const html = toHtml(text);
      const plain = text.length;
      const step = Math.max(2, Math.ceil(plain / 26));
      let shown = 0;
      const timer = window.setInterval(function () {
        shown += step;
        if (shown >= plain) {
          window.clearInterval(timer);
          node.innerHTML = html;
          el.messages.scrollTop = el.messages.scrollHeight;
          resolve();
          return;
        }
        const slice = text.slice(0, shown);
        node.innerHTML = toHtml(slice);
        el.messages.scrollTop = el.messages.scrollHeight;
      }, 30);
    });
  }

  async function respond(text) {
    if (state.busy) return;
    state.busy = true;
    if (el.send) el.send.disabled = true;

    const pending = bubble("ai", '<div class="msg-typing" aria-label="正在思考"><i></i><i></i><i></i></div>');
    let answer = "";
    let note = "";
    let result = null;
    let node = null;

    // 猜人格是结构化对话，固定走本地规则，不交给大模型，避免自由发挥改写结论。
    const guess = window.GBTI_GUESS;
    const inGuess = Boolean(guess && (guess.active() || guess.isStart(text)));
    if (inGuess) {
      const g = guess.handle(text, state.outcome);
      if (g) { result = g; answer = g.text; }
      else { result = localAnswer(text); answer = result.text; }
      await new Promise(function (resolve) { window.setTimeout(resolve, 320); });
    } else if (remoteReady()) {
      try {
        answer = await remoteAnswer(text, function (partial) {
          // 首个流式片段到达时撤掉「正在思考」，之后边收边渲染。
          if (!node) { pending.remove(); node = bubble("ai", ""); }
          node.innerHTML = toHtml(partial);
          el.messages.scrollTop = el.messages.scrollHeight;
        });
      } catch (error) {
        if (node) { node.remove(); node = null; }
        result = localAnswer(text);
        answer = result.text;
        note = "大模型接口调用失败（" + error.message + "），本条已改用本地引擎回答。排查方向：服务地址与模型名是否和服务商文档一致、密钥是否过期、浏览器是否拦截了跨域请求。";
      }
    } else {
      result = localAnswer(text);
      answer = result.text;
      await new Promise(function (resolve) { window.setTimeout(resolve, 260); });
    }

    pending.remove();
    state.messages.push({ role: "ai", text: answer });
    saveLog();
    if (node) {
      // 流式过程已经逐段渲染过，这里只定稿最终排版，不再重放打字机。
      node.innerHTML = toHtml(answer);
      el.messages.scrollTop = el.messages.scrollHeight;
    } else {
      node = bubble("ai", "");
      await typewrite(node, answer);
    }
    if (note) {
      const tip = document.createElement("p");
      tip.className = "msg-note warn";
      tip.textContent = note;
      node.appendChild(tip);
    }
    if (result && result.link) {
      const link = document.createElement("a");
      link.className = "msg-note msg-link";
      link.href = result.link.href;
      link.textContent = result.link.text + " →";
      node.appendChild(link);
    }
    if (result && result.action === "start") {
      const tip = document.createElement("p");
      tip.className = "msg-note";
      tip.textContent = "提示：点击页面上的「开始答题」或上方导航「开始测试」即可进入题目。";
      node.appendChild(tip);
    }
    renderChips(result ? result.chips : chipsFor());
    state.busy = false;
    if (el.send) el.send.disabled = false;
    if (el.input) el.input.focus({ preventScroll: true });
  }

  function submit(text) {
    const value = String(text || "").trim();
    if (!value || state.busy) return;
    state.messages.push({ role: "user", text: value });
    bubble("user", "<p>" + esc(value) + "</p>");
    if (el.input) { el.input.value = ""; el.input.style.height = "auto"; }
    renderChips([]);
    respond(value);
  }

  function open(prefill) {
    if (!el.panel) return;
    el.panel.hidden = false;
    state.open = true;
    if (el.fab) el.fab.setAttribute("aria-expanded", "true");
    document.body.classList.add("ai-open");
    if (!state.booted) { seed(); state.booted = true; }
    if (prefill) {
      window.setTimeout(function () { submit(prefill); }, 120);
    } else if (el.input) {
      window.setTimeout(function () { el.input.focus({ preventScroll: true }); }, 60);
    }
  }

  function close() {
    if (!el.panel) return;
    el.panel.hidden = true;
    state.open = false;
    if (el.fab) el.fab.setAttribute("aria-expanded", "false");
    document.body.classList.remove("ai-open");
  }

  function toggle() { if (state.open) close(); else open(); }

  function seed() {
    el.messages.replaceChildren();
    state.messages = loadLog();
    if (state.messages.length) {
      state.messages.forEach(function (message) {
        bubble(message.role, message.role === "user" ? "<p>" + esc(message.text) + "</p>" : toHtml(message.text));
      });
      renderChips(chipsFor());
      return;
    }
    const hello = state.outcome
      ? "我看到你的结果是 **" + state.outcome.personality.name + "（" + state.outcome.personality.code + "）**。我可以逐条解读四维、解释你不太认同的地方，也可以给几条可执行的提醒。\n\n直接问，或者点下面的问题试试。"
      : "你好，我是这个测试自带的 AI 助手。\n\n我由两部分组成：一个本地规则引擎，开了就能用、不需要联网；你也可以在设置里填入大模型接口，让回答改由真正的模型生成。\n\n关于题型、四个维度、16 种人格，或者你答完之后的结果，都可以问我。";
    state.messages.push({ role: "ai", text: hello });
    saveLog();
    bubble("ai", toHtml(hello));
    renderChips(chipsFor());
  }

  function setOutcome(outcome) {
    state.outcome = outcome || null;
    setSubtitle();
    renderQa();
    if (state.open) renderChips(chipsFor());
  }

  function reset() {
    state.messages = [];
    saveLog();
    el.messages.replaceChildren();
    state.booted = true;
    seed();
  }

  /* ---------- 初始化 ---------- */

  function bind() {
    cache();
    if (!el.panel) return;
    setEngineChip();
    setSubtitle();

    [["#ai-fab", toggle], ["#ai-fab-inline", toggle], ["#open-ai", function () { open(); }],
      ["#side-ai", function () { open(); }], ["#hero-ai", function () { open("帮我解读一下我的结果"); }],
      ["#intro-ai", function () { open("这个测试是怎么设计的"); }]
    ].forEach(function (pair) {
      const node = document.querySelector(pair[0]);
      if (node) node.addEventListener("click", pair[1]);
    });

    document.querySelector("#ai-close").addEventListener("click", close);
    document.querySelector("#ai-clear").addEventListener("click", reset);

    /* 面板尺寸：桌面端拖拽左上角缩放，头部按钮一键放大/还原，尺寸记住。 */
    const SIZE_KEY = "gbti-ai-size";
    const maxBtn = document.querySelector("#ai-max");
    const handle = document.querySelector("#ai-resize-handle");
    const desktop = function () { return window.matchMedia("(min-width: 600px)").matches; };
    const applySize = function () {
      if (!desktop() || el.panel.classList.contains("ai-max")) return;
      try {
        const saved = JSON.parse(localStorage.getItem(SIZE_KEY) || "null");
        if (saved && saved.w && saved.h) {
          el.panel.style.width = saved.w + "px";
          el.panel.style.height = saved.h + "px";
          el.panel.style.maxHeight = "none";
        }
      } catch (error) { /* 忽略。 */ }
    };
    applySize();
    if (maxBtn) maxBtn.addEventListener("click", function () {
      const on = el.panel.classList.toggle("ai-max");
      maxBtn.title = on ? "还原大小" : "放大面板";
      if (on) {
        el.panel.style.width = "";
        el.panel.style.height = "";
        el.panel.style.maxHeight = "";
      } else {
        applySize();
      }
    });
    if (handle) handle.addEventListener("pointerdown", function (event) {
      if (!desktop()) return;
      event.preventDefault();
      const rect = el.panel.getBoundingClientRect();
      const startX = event.clientX, startY = event.clientY;
      const startW = rect.width, startH = rect.height;
      const move = function (ev) {
        const w = Math.max(340, Math.min(window.innerWidth - 36, startW + (startX - ev.clientX)));
        const h = Math.max(360, Math.min(window.innerHeight - 36, startH + (startY - ev.clientY)));
        el.panel.style.width = w + "px";
        el.panel.style.height = h + "px";
        el.panel.style.maxHeight = "none";
      };
      const up = function () {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify({
            w: parseInt(el.panel.style.width, 10),
            h: parseInt(el.panel.style.height, 10)
          }));
        } catch (error) { /* 忽略。 */ }
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });

    el.form.addEventListener("submit", function (event) {
      event.preventDefault();
      submit(el.input.value);
    });
    el.input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit(el.input.value);
      }
    });
    el.input.addEventListener("input", function () {
      el.input.style.height = "auto";
      el.input.style.height = Math.min(el.input.scrollHeight, 120) + "px";
    });

    document.addEventListener("keydown", function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
      if (event.key === "Escape" && state.open && !document.querySelector("dialog[open]")) close();
    });

    // 用户中心（含 AI 配置）。顶部入口与助手面板的齿轮按钮打开的是同一个面板。
    const settings = document.querySelector("#ai-settings");
    const baseInput = document.querySelector("#ai-base");
    const keyInput = document.querySelector("#ai-key");
    const modelInput = document.querySelector("#ai-model");
    const strictInput = document.querySelector("#ai-strict");
    const nameInput = document.querySelector("#user-name");

    openSettings = function () {
      if (baseInput) baseInput.value = state.config.base;
      if (keyInput) keyInput.value = state.config.key;
      if (modelInput) modelInput.value = state.config.model;
      if (strictInput) strictInput.checked = Boolean(state.config.strict);
      if (nameInput) nameInput.value = state.userName;
      refreshEngineNote();
      if (settings.showModal) settings.showModal();
      else settings.setAttribute("open", "");
    };

    document.querySelector("#ai-settings-open").addEventListener("click", openSettings);
    const entry = document.querySelector("#user-open");
    if (entry) entry.addEventListener("click", openSettings);

    document.querySelectorAll("[data-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        const preset = PRESETS[button.dataset.preset];
        if (preset) {
          baseInput.value = preset.base;
          modelInput.value = preset.model;
          keyInput.focus();
          return;
        }
        if (button.dataset.preset === "clear") {
          baseInput.value = "";
          keyInput.value = "";
          modelInput.value = "";
          baseInput.focus();
        }
      });
    });

    document.querySelector("#ai-save").addEventListener("click", function () {
      const next = {
        base: baseInput.value.trim(),
        key: keyInput.value.trim(),
        model: modelInput.value.trim(),
        strict: Boolean(strictInput && strictInput.checked)
      };
      state.config = next;
      saveConfig(next);
      state.userName = nameInput ? nameInput.value.trim().slice(0, 16) : state.userName;
      saveUserName(state.userName);
      setEngineChip();
      syncUserEntry();
      settings.close();
      const who = state.userName ? state.userName + "，" : "";
      const tip = remoteReady()
        ? who + "已启用大模型接口，模型 " + next.model + "（" + (next.strict ? "严格模式，只聊测试" : "通用模式，可聊任何话题并联动页面数据") + "）。若接口不可用，助手会自动回退到本地引擎。"
        : who + "已保存。信息不完整，暂时继续使用本地引擎。";
      bubble("ai", toHtml(tip));
    });

    document.querySelector("#ai-reset").addEventListener("click", function () {
      state.config = { base: "", key: "", model: "", strict: false };
      saveConfig(state.config);
      baseInput.value = ""; keyInput.value = ""; modelInput.value = "";
      if (strictInput) strictInput.checked = false;
      setEngineChip();
      syncUserEntry();
      settings.close();
      bubble("ai", toHtml("已清除接口配置，回到本地引擎模式。昵称保留不变。"));
    });

    syncUserEntry();
  }

  // 面板里跟进显示当前生效的引擎，避免只看三个输入框判断不出有没有生效。
  function refreshEngineNote() {
    const note = document.querySelector("#user-engine-note");
    if (!note) return;
    note.textContent = remoteReady()
      ? "当前状态：已启用大模型（" + state.config.base + " · " + state.config.model + "）。"
      : "当前状态：使用内置本地引擎。填写完整三项并保存后会切换到大模型。";
  }

  return {
    init: bind,
    open: open,
    close: close,
    toggle: toggle,
    setOutcome: setOutcome,
    isRemote: remoteReady,
    // 打开用户中心（含 AI 配置）面板，供顶部「用户登录」入口复用。
    openSettings: function () { if (openSettings) openSettings(); },
    getUserName: function () { return state.userName; },
    // 暴露纯逻辑入口，供离线自动化测试与后续扩展使用，不参与页面渲染。
    engine: { intentOf: intentOf, answer: localAnswer, chips: chipsFor }
  };
})();

window.GBTI_AI = GBTI_AI;
