/* ==========================================================================
   GBTI AI 猜人格
   用一段对话代替 28 道题：助手连问八问，每问两选，答完给出四维代码。
   纯本地规则，不联网、不参与原有计分，也不写回答题记录。
   八问按四维各两问排列，每问只给对应维度加一票，不产生任何分数以外的数字。
   ========================================================================== */

const GBTI_GUESS = (function () {
  "use strict";

  const DIM_NAME = { F: "基本面", M: "市场面", L: "长期", S: "短期", D: "稳健", A: "进取", O: "客观规则", J: "主观判断" };
  const DIM_LABEL = { basis: "信息依据", term: "持有周期", risk: "风险偏好", decision: "决策方式" };

  // 八问：四维各两问，a 取左端，b 取右端。顺序刻意打散，避免连续两问同维度。
  const QUESTIONS = [
    { dim: "basis", pole: ["F", "M"],
      ask: "第一问，别想太久。同事在群里说某只票下周要动，你第一件事做什么？",
      a: "先翻它的三季报和毛利率",
      b: "先看这几天的成交量和资金流向" },
    { dim: "term", pole: ["L", "S"],
      ask: "第二问。买进去第二天跌了 5%，但你的逻辑没变，你会？",
      a: "先放着，等下一份季报再说",
      b: "先看短线节奏是不是坏了，考虑撤" },
    { dim: "risk", pole: ["D", "A"],
      ask: "第三问。两个选择预期回报一样，一个每天波动 1%，一个每天波动 4%，你选？",
      a: "波动 1% 那个，少折腾",
      b: "波动 4% 那个，起伏大才有机会" },
    { dim: "decision", pole: ["O", "J"],
      ask: "第四问。决定买多少的时候，你怎么定？",
      a: "事先算好比例，按规则执行",
      b: "看当天的情况和感觉" },
    { dim: "basis", pole: ["F", "M"],
      ask: "第五问。复盘的时候你更信哪个？",
      a: "公司公告和业绩说明会",
      b: "K 线形态和板块轮动" },
    { dim: "term", pole: ["L", "S"],
      ask: "第六问。一只票你打算拿多久？",
      a: "三个月以上，等逻辑兑现",
      b: "几天到几周，跟着节奏走" },
    { dim: "risk", pole: ["D", "A"],
      ask: "第七问。账户回撤 15%，你会？",
      a: "先减仓，睡得着更重要",
      b: "扛着，逻辑没坏就不动" },
    { dim: "decision", pole: ["O", "J"],
      ask: "最后一问。你设的条件没满足，但朋友说好、你自己也觉得好，你会？",
      a: "条件没满足就不动",
      b: "具体情况具体看，可以破例" }
  ];

  // 自由作答时用的词表。每命中一词给对应端加一票，同维两端都命中时按净差。
  const LEXICON = {
    F: ["财报", "业绩", "毛利", "净利", "现金流", "估值", "市盈率", "市净率", "公告", "年报", "季报", "基本面", "分红", "净资产", "营收", "利润", "招股书", "说明会"],
    M: ["成交量", "成交额", "资金", "情绪", "板块", "题材", "走势", "k线", "均线", "涨停", "龙虎榜", "换手", "热度", "消息面", "盘面", "主力", "图形"],
    L: ["长期", "长线", "拿住", "半年", "一年", "三年", "放着", "不动", "逻辑", "定投", "穿越", "耐心", "久一点"],
    S: ["短线", "几天", "一周", "波段", "快进快出", "止损", "做t", "日内", "盘感", "及时", "马上", "节奏"],
    D: ["稳", "保守", "少赚", "低风险", "回撤", "安心", "睡眠", "不亏", "踏实", "稳妥", "控制", "轻仓"],
    A: ["搏", "冲", "高风险", "满仓", "梭哈", "大波动", "多赚", "刺激", "激进", "敢", "重仓", "赌"],
    O: ["规则", "纪律", "计划", "条件", "设好", "执行", "清单", "事先", "按表", "标准", "系统"],
    J: ["感觉", "直觉", "看情况", "灵活", "随机", "气氛", "临场", "拍脑袋", "因人而异", "经验"]
  };

  const START_HINTS = ["猜我的人格", "让你猜", "猜猜我", "你猜我", "猜一下我", "猜人格", "考考你"];
  const QUIT_HINTS = ["直接看结果", "不玩了", "看结果", "跳过", "懒得答"];
  const AGAIN_HINTS = ["再猜一次", "再来一次", "重新猜"];

  let session = null;

  function isStart(text) {
    const t = String(text || "");
    if (t.length > 24) return false;
    return START_HINTS.some(function (w) { return t.indexOf(w) >= 0; });
  }
  function isAgain(text) {
    const t = String(text || "");
    return AGAIN_HINTS.some(function (w) { return t.indexOf(w) >= 0; });
  }
  function isQuit(text) {
    const t = String(text || "");
    return QUIT_HINTS.some(function (w) { return t.indexOf(w) >= 0; });
  }
  function active() {
    return Boolean(session && !session.done);
  }

  function newSession() {
    session = {
      index: 0,
      retry: 0,
      skipNext: false,
      done: false,
      votes: {
        basis: { F: 0, M: 0 },
        term: { L: 0, S: 0 },
        risk: { D: 0, A: 0 },
        decision: { O: 0, J: 0 }
      }
    };
    return session;
  }

  function question(s) {
    const q = QUESTIONS[s.index];
    return {
      text: q.ask,
      chips: [q.a, q.b],
      progress: (s.index + 1) + "/" + QUESTIONS.length
    };
  }

  function progressLine(s) {
    return "（第 " + (s.index + 1) + " 问，共 " + QUESTIONS.length + " 问。可以直接点选项，也可以自己说。）";
  }

  /* 把一条回答落成某一维的一票；返回 true 表示识别成功。 */
  function voteFromText(text, q) {
    const t = String(text || "").trim();
    if (!t) return false;
    const low = t.toLowerCase().replace(/\s+/g, "");

    // 点选项、或回答字母与前缀数字时，直接按选项判定。
    if (low === "a" || low === "1" || low === "第一" || low === "第一个" || low.indexOf(q.a.replace(/\s+/g, "")) >= 0) {
      session.votes[q.dim][q.pole[0]] += 1;
      return true;
    }
    if (low === "b" || low === "2" || low === "第二" || low === "第二个" || low.indexOf(q.b.replace(/\s+/g, "")) >= 0) {
      session.votes[q.dim][q.pole[1]] += 1;
      return true;
    }

    // 自由作答：按词表在该维两端计数，只认净差不为零的情况。
    const left = countHits(low, LEXICON[q.pole[0]]);
    const right = countHits(low, LEXICON[q.pole[1]]);
    if (left === right) return false;
    session.votes[q.dim][left > right ? q.pole[0] : q.pole[1]] += 1;
    return true;
  }

  function countHits(text, words) {
    let n = 0;
    for (let i = 0; i < words.length; i += 1) {
      if (text.indexOf(words[i]) >= 0) n += 1;
    }
    return n;
  }

  /* 出结论：每维取得票多的一端；没有有效票的维度留 ?，不猜。 */
  function tally() {
    const out = {};
    Object.keys(session.votes).forEach(function (dim) {
      const v = session.votes[dim];
      const keys = Object.keys(v);
      if (v[keys[0]] === v[keys[1]]) out[dim] = "?";
      else out[dim] = v[keys[0]] > v[keys[1]] ? keys[0] : keys[1];
    });
    return out;
  }

  function codeOf(map) {
    return (map.basis || "?") + (map.term || "?") + (map.risk || "?") + (map.decision || "?");
  }

  function finalize(outcome, early) {
    session.done = true;
    const map = tally();
    const code = codeOf(map);
    const lines = [];

    if (early) {
      lines.push("行，那就按你答过的问下结论，没答到的维度留问号。");
      lines.push("");
    } else {
      lines.push("问完了。我按你的回答记账，结果是这样。");
      lines.push("");
    }

    lines.push("**" + code.split("").join(" ") + "**");
    lines.push("");
    ["basis", "term", "risk", "decision"].forEach(function (dim) {
      const p = map[dim];
      const tag = p === "?" ? "没答出来" : DIM_NAME[p];
      lines.push("- " + DIM_LABEL[dim] + "：" + tag + (p === "?" ? "" : "（" + p + "）"));
    });
    lines.push("");

    const known = code.indexOf("?") < 0;
    if (known && outcome && outcome.personality) {
      const real = outcome.personality.code;
      let hits = 0;
      for (let i = 0; i < 4; i += 1) if (code.charAt(i) === real.charAt(i)) hits += 1;
      if (hits === 4) {
        lines.push("四维全中。你刚才测出来也是 **" + real + " " + outcome.personality.name + "**。");
      } else {
        const wrong = [];
        const dims = ["basis", "term", "risk", "decision"];
        for (let i = 0; i < 4; i += 1) {
          if (code.charAt(i) !== real.charAt(i)) {
            wrong.push(DIM_LABEL[dims[i]] + "我猜成" + DIM_NAME[code.charAt(i)] + "，你选的是" + DIM_NAME[real.charAt(i)]);
          }
        }
        lines.push("对照你刚才的测试结果 **" + real + " " + outcome.personality.name + "**，四维猜中 " + hits +
          " 个。对不上的是：" + wrong.join("；") + "。");
      }
    } else if (known && !outcome) {
      lines.push("你还没做那 28 道题，所以现在没有对照组。记住这个码，做完测试回来就能看它准不准。");
    } else {
      lines.push("有维度没答出来，就不给你编一个了。想补齐可以再猜一次。");
    }
    lines.push("");
    lines.push("说明：这只是把四维规则套在你几句话上的推演，不是心理测量，也不代表我比测试更懂你。");

    const chips = ["再猜一次", "帮我解读我的结果"];
    if (known) chips.push("让 AI 猜我的人格");

    return {
      text: lines.join("\n"),
      chips: chips,
      done: true,
      link: known ? { href: "workbench.html?code=" + code, text: "看看和我同人格的股票" } : null
    };
  }

  function askCurrent() {
    const q = QUESTIONS[session.index];
    return {
      text: q.ask + "\n\n" + progressLine(session),
      chips: [q.a, q.b],
      progress: (session.index + 1) + "/" + QUESTIONS.length
    };
  }

  /* 对话入口：ai.js 在每轮回答前调用，返回 { text, chips, link } 供其渲染。 */
  function handle(text, outcome) {
    const t = String(text || "").trim();

    if (session && session.done) {
      if (isAgain(t)) {
        newSession();
        return askCurrent();
      }
      return null;
    }

    if (!session) {
      if (!isStart(t)) return null;
      newSession();
      const open = [
        "行，那就别做题了，我来猜。八问，每题两个选项，你也可以自己说。",
        "",
        "答完我给四维代码。" + (outcome && outcome.personality ? "你之前测过，正好拿来对一对。" : "")
      ].filter(Boolean).join("\n");
      const q = askCurrent();
      return { text: open + "\n\n" + q.text, chips: q.chips, progress: q.progress };
    }

    if (isQuit(t)) return finalize(outcome, true);

    const q = QUESTIONS[session.index];
    const ok = voteFromText(t, q);
    if (!ok) {
      session.retry += 1;
      if (session.retry >= 2) {
        // 两次都读不出来就跳过这一维的这一问，不硬猜。
        session.retry = 0;
        session.index += 1;
        if (session.index >= QUESTIONS.length) return finalize(outcome, false);
        const next = askCurrent();
        return {
          text: "这句我没读出倾向，先跳过。\n\n" + next.text,
          chips: next.chips,
          progress: next.progress
        };
      }
      return {
        text: "没太读懂你的意思。选一个更接近的就行，或者直接说想法。\n\n" + q.ask,
        chips: [q.a, q.b],
        progress: (session.index + 1) + "/" + QUESTIONS.length
      };
    }

    session.retry = 0;
    session.index += 1;
    if (session.index >= QUESTIONS.length) return finalize(outcome, false);
    return askCurrent();
  }

  return {
    isStart: isStart,
    active: active,
    handle: handle,
    reset: function () { session = null; },
    // 供离线测试使用
    _internal: { QUESTIONS: QUESTIONS, LEXICON: LEXICON, tally: tally, codeOf: codeOf }
  };
})();

if (typeof window !== "undefined") window.GBTI_GUESS = GBTI_GUESS;
if (typeof module !== "undefined" && module.exports) module.exports = GBTI_GUESS;
