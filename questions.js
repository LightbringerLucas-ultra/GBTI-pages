// 四维各 10 题，每次测验从每维随机抽 7 题，合计 28 题。
// 抽中的题号会跟作答进度一起保存，续答和历史记录都能还原出同一套题。
// O/J 表示客观规则/主观判断偏好，不代表理性程度。

const dimensions = [
  {
    "key": "FM",
    "name": "信息依据",
    "left": "F",
    "right": "M",
    "leftName": "基本面",
    "rightName": "市场面"
  },
  {
    "key": "LS",
    "name": "持有周期",
    "left": "L",
    "right": "S",
    "leftName": "长期",
    "rightName": "短期"
  },
  {
    "key": "DA",
    "name": "风险偏好",
    "left": "D",
    "right": "A",
    "leftName": "稳健",
    "rightName": "进取"
  },
  {
    "key": "OJ",
    "name": "决策方式",
    "left": "O",
    "right": "J",
    "leftName": "客观规则",
    "rightName": "主观判断"
  }
];

const questionPool = [
  {
    "id": 1,
    "dimension": "FM",
    "title": "今年年初，群里有人发了一句“时间会证明光模块”，还配了张五年四十倍的图。那只票在六月见顶，之后四个月跌了六成上下，说这话的人还在群里说同一句话。看到这一幕，你更想先弄清楚——",
    "options": [
      {
        "text": "这波是谁先撤的，现在还有没有人接",
        "score": "M"
      },
      {
        "text": "这家公司的订单和利润，到底有没有跟着变",
        "score": "F"
      }
    ]
  },
  {
    "id": 2,
    "dimension": "FM",
    "title": "A 股有个传统：兔年炒兔宝宝，龙年炒圣龙股份，蛇年炒川发龙蟒，名字里带个动物就能连拉十几个板。这两天有人开始说“明年是羊年，带羊字的先埋伏着”。你听到这句话，第一反应更接近——",
    "options": [
      {
        "text": "先看看这些公司本来靠什么赚钱，名字跟生意到底有没有关系",
        "score": "F"
      },
      {
        "text": "先看看这波已经走到第几棒，还有多少人在往里进",
        "score": "M"
      }
    ]
  },
  {
    "id": 3,
    "dimension": "FM",
    "title": "2024 年美国大选，特朗普宣布胜选那天下午，川大智胜直接涨停，因为股民说“川普胜利”；第二天它又跌停，而这家公司本身连年亏损。看到这件事，你更好奇的是——",
    "options": [
      {
        "text": "它原本做的是什么生意，这个价跟它的生意对得上吗",
        "score": "F"
      },
      {
        "text": "是谁在里面推，这种推法一般能撑几天",
        "score": "M"
      }
    ]
  },
  {
    "id": 4,
    "dimension": "FM",
    "title": "同样是聊股票，身边大概有两种人：一种开口就是“这波还没走完”，一种开口就是“这家公司值多少钱”。周末一起看盘，你更愿意跟哪种人待在一起——",
    "options": [
      {
        "text": "“这波还没走完”的那种",
        "score": "M"
      },
      {
        "text": "“这公司值多少钱”的那种",
        "score": "F"
      }
    ]
  },
  {
    "id": 5,
    "dimension": "FM",
    "title": "手机上你能刷到两类内容：一类讲某只票最近走得怎么样、谁在买、热度还剩多少；一类讲某家公司生意是怎么做的、钱从哪儿来。你手指更常停在——",
    "options": [
      {
        "text": "前一类",
        "score": "M"
      },
      {
        "text": "后一类",
        "score": "F"
      }
    ]
  },
  {
    "id": 6,
    "dimension": "FM",
    "title": "三个月前买的一只票，最后赚了。周末你坐下来复盘这笔单子，最想弄明白的是——",
    "options": [
      {
        "text": "当初对这门生意的判断，哪一条最值钱",
        "score": "F"
      },
      {
        "text": "当初看到的那点苗头，是怎么一步步变成钱的",
        "score": "M"
      }
    ]
  },
  {
    "id": 7,
    "dimension": "FM",
    "title": "假设只能买一样“信息”，二选一——",
    "options": [
      {
        "text": "一份把这家公司怎么赚钱讲清楚的资料",
        "score": "F"
      },
      {
        "text": "一个能看到谁在买、谁在卖的工具",
        "score": "M"
      }
    ]
  },
  {
    "id": 8,
    "dimension": "FM",
    "title": "你本来对一只票有明确看法，后来改主意了。回想一下，更可能是哪件事让你改的——",
    "options": [
      {
        "text": "它跌到了你受不了的价位，或者涨得让你眼红",
        "score": "M"
      },
      {
        "text": "你发现了一件关于这家公司的新事，跟原来想的不一样",
        "score": "F"
      }
    ]
  },
  {
    "id": 9,
    "dimension": "FM",
    "title": "年初身边人都在说“AI 是十年一遇的机会”，到了年中，同一批人开始说“AI 是十年一遇的坑”。同样一句话翻来覆去，你心里更信哪边——",
    "options": [
      {
        "text": "产业不会半年就变一次，变的是讲故事的嘴",
        "score": "F"
      },
      {
        "text": "说这话的人脸变得太快，我更关心钱现在站哪边",
        "score": "M"
      }
    ]
  },
  {
    "id": 10,
    "dimension": "FM",
    "title": "假如有人夸你“懂股票”，你更希望他夸的是哪一种——",
    "options": [
      {
        "text": "你看盘很准，什么时候该进该出心里有数",
        "score": "M"
      },
      {
        "text": "你看得懂一家公司，知道它大概值多少钱",
        "score": "F"
      }
    ]
  },
  {
    "id": 11,
    "dimension": "LS",
    "title": "A 股历年来有炒作生肖股的传统：兔年炒兔宝宝，龙年炒圣龙股份，蛇年炒川发龙蟒，都是连拉十几个板、涨几倍，然后跌回去。今年是马年，“马”字头已经涨过一轮，现在市场开始炒明年的羊年概念，有人说这波能炒三个月。你会——",
    "options": [
      {
        "text": "跟着玩一段，热闹散了就走，赚没赚都不恋战",
        "score": "S"
      },
      {
        "text": "这种热闹跟我没关系，我手上的东西是打算放很久的",
        "score": "L"
      }
    ]
  },
  {
    "id": 12,
    "dimension": "LS",
    "title": "你上半年买光模块赚了不少，六月见顶之后一路往下，四个月跌了六成。群里有人把当初那句“时间会证明光模块”改成了“不要光着站在光里”——意思是账已经亏到只剩光着身子待在里面了。你手上还有仓位，看到这句话，你会——",
    "options": [
      {
        "text": "被戳一下就算了，公司没变差，跌就跌着，我等下一轮",
        "score": "L"
      },
      {
        "text": "先出来，等它重新走起来我再回去",
        "score": "S"
      }
    ]
  },
  {
    "id": 13,
    "dimension": "LS",
    "title": "买完一只票之后，你多久会重新想一次“我当初为什么要买它”——",
    "options": [
      {
        "text": "除非出了大事，平时不怎么专门去想",
        "score": "L"
      },
      {
        "text": "它一动我就想，有时候一周想好几回",
        "score": "S"
      }
    ]
  },
  {
    "id": 14,
    "dimension": "LS",
    "title": "你跟朋友说“这笔做完了”，通常指的是什么——",
    "options": [
      {
        "text": "账结清了，赚也好亏也好，可以看下一个了",
        "score": "S"
      },
      {
        "text": "当初看好的那件事有了结果，赚没赚倒是其次",
        "score": "L"
      }
    ]
  },
  {
    "id": 15,
    "dimension": "LS",
    "title": "朋友推荐一只票，理由讲得很清楚，你自己也觉得有道理。接下来你会——",
    "options": [
      {
        "text": "找个差不多的位置跟一段，不行就撤",
        "score": "S"
      },
      {
        "text": "先放着，等自己也彻底想明白了再说",
        "score": "L"
      }
    ]
  },
  {
    "id": 16,
    "dimension": "LS",
    "title": "一个行业政策刚落地，市场上有两种声音：一种说“这是三年的机会”，一种说“这是三天的机会”。你心里更靠哪一边——",
    "options": [
      {
        "text": "三年。先想清楚这个行业三年后会是什么样",
        "score": "L"
      },
      {
        "text": "三天。先看这两天走势够不够劲",
        "score": "S"
      }
    ]
  },
  {
    "id": 17,
    "dimension": "LS",
    "title": "只有一个周末做功课，时间只够干一件——",
    "options": [
      {
        "text": "把最近的热点过一遍，看看下周可能轮到谁",
        "score": "S"
      },
      {
        "text": "把一家公司过去五年的东西翻一遍",
        "score": "L"
      }
    ]
  },
  {
    "id": 18,
    "dimension": "LS",
    "title": "你账户最舒服的状态是哪一种——",
    "options": [
      {
        "text": "大部分时间不动，一年也就动几次",
        "score": "L"
      },
      {
        "text": "经常有进有出，手上东西换得比较勤",
        "score": "S"
      }
    ]
  },
  {
    "id": 19,
    "dimension": "LS",
    "title": "买完一只票，你最想立刻知道的是哪件事——",
    "options": [
      {
        "text": "三年后它大概会是什么样",
        "score": "L"
      },
      {
        "text": "明天它会不会涨",
        "score": "S"
      }
    ]
  },
  {
    "id": 20,
    "dimension": "LS",
    "title": "有只票你研究了很久，逻辑很好，但半年没怎么动，别的方向天天在涨。你会——",
    "options": [
      {
        "text": "觉得时间成本太高，换一只在动的",
        "score": "S"
      },
      {
        "text": "没动说明还没到时候，继续放着",
        "score": "L"
      }
    ]
  },
  {
    "id": 21,
    "dimension": "DA",
    "title": "去年中日关系紧张那一阵，孚日股份因为谐音“俘日”，连着八个涨停、两天翻倍。公司后来澄清：涨是因为产品涨价，跟名字没关系。当时你手上有点闲钱，你会——",
    "options": [
      {
        "text": "跟着买一点，这种热闹一年也没几次",
        "score": "A"
      },
      {
        "text": "看看就好，八个板了，进去就是接最后一棒",
        "score": "D"
      }
    ]
  },
  {
    "id": 22,
    "dimension": "DA",
    "title": "你买的票跌了 20%，公司没出事。你的第一反应更接近——",
    "options": [
      {
        "text": "先减一点，让自己心里舒服，剩下的再想",
        "score": "D"
      },
      {
        "text": "不动，甚至想再补一点",
        "score": "A"
      }
    ]
  },
  {
    "id": 23,
    "dimension": "DA",
    "title": "两个朋友的账户：一个有过一年翻倍，也有过一年腰斩；一个每年稳稳十个点，没大起大落。你更羡慕谁——",
    "options": [
      {
        "text": "翻倍那个，哪怕他后来腰斩了",
        "score": "A"
      },
      {
        "text": "稳的那个，至少睡得着觉",
        "score": "D"
      }
    ]
  },
  {
    "id": 24,
    "dimension": "DA",
    "title": "市场对小米造车的期待很高：成了就是下一个特斯拉，不成就是下一个乐视。你手里正好有这个仓位，会怎么处理——",
    "options": [
      {
        "text": "先换掉，等结果出来再回来",
        "score": "D"
      },
      {
        "text": "留着，赌的就是这个结果",
        "score": "A"
      }
    ]
  },
  {
    "id": 25,
    "dimension": "DA",
    "title": "如果一定要选，你能接受自己账户的最大回撤到多少——",
    "options": [
      {
        "text": "三四十个点吧，只要最后能回来",
        "score": "A"
      },
      {
        "text": "十个点以内，超过这个数我就拿不住了",
        "score": "D"
      }
    ]
  },
  {
    "id": 26,
    "dimension": "DA",
    "title": "有人跟你推一只票，说法是“赔率十倍，但八成会归零”。你手上有十万块闲钱，会怎么办——",
    "options": [
      {
        "text": "一分不投，“八成归零”这事我不干",
        "score": "D"
      },
      {
        "text": "拿一万出来试，归零就归零",
        "score": "A"
      }
    ]
  },
  {
    "id": 27,
    "dimension": "DA",
    "title": "泡泡玛特这类潮玩股，市场分歧特别大：看好的说还能翻倍，看空的说迟早腰斩，而它现在并不便宜。你会——",
    "options": [
      {
        "text": "买一点，这种票就是要敢上手",
        "score": "A"
      },
      {
        "text": "看看就算了，我受不了它跌起来的样子",
        "score": "D"
      }
    ]
  },
  {
    "id": 28,
    "dimension": "DA",
    "title": "如果你的账户只能选一种持仓结构，你更希望是——",
    "options": [
      {
        "text": "十来只，东边不亮西边亮",
        "score": "D"
      },
      {
        "text": "三五只，每只都可能出大事",
        "score": "A"
      }
    ]
  },
  {
    "id": 29,
    "dimension": "DA",
    "title": "同样是亏，你更怕哪一种后悔——",
    "options": [
      {
        "text": "明明看对了，因为没敢下手，少赚了一大截",
        "score": "A"
      },
      {
        "text": "明明知道有风险，还是下手了，亏了一大截",
        "score": "D"
      }
    ]
  },
  {
    "id": 30,
    "dimension": "DA",
    "title": "行情特别好的时候，你通常会——",
    "options": [
      {
        "text": "按原计划来，涨得再热闹也不改仓位",
        "score": "D"
      },
      {
        "text": "加点钱进去，这种时候不加大对不起自己",
        "score": "A"
      }
    ]
  },
  {
    "id": 31,
    "dimension": "OJ",
    "title": "你给自己定了个规矩：“跌到某个价就买。”结果它一直没跌到，反而一路涨上去了。你会——",
    "options": [
      {
        "text": "算了，按原计划等，没到就是没到",
        "score": "O"
      },
      {
        "text": "重新看一遍，觉得值就现在买",
        "score": "J"
      }
    ]
  },
  {
    "id": 32,
    "dimension": "OJ",
    "title": "群里有人喊“明天必涨”，说得有鼻子有眼，你正好空仓。你会——",
    "options": [
      {
        "text": "先拿自己那套标准过一遍，过得了再说",
        "score": "O"
      },
      {
        "text": "听听他为什么这么想，觉得有道理就跟",
        "score": "J"
      }
    ]
  },
  {
    "id": 33,
    "dimension": "OJ",
    "title": "买一只票之前，你更常做的是——",
    "options": [
      {
        "text": "心里大概有个数，觉得对了就动手",
        "score": "J"
      },
      {
        "text": "把条件一条条写下来，够了才动手",
        "score": "O"
      }
    ]
  },
  {
    "id": 34,
    "dimension": "OJ",
    "title": "有个很火的票，不符合你自己定的筛选条件，但你隐约觉得它要涨。你会——",
    "options": [
      {
        "text": "不符合就是不符合，不进我的池子",
        "score": "O"
      },
      {
        "text": "条件本来是我自己定的，为它破一次例也不是不行",
        "score": "J"
      }
    ]
  },
  {
    "id": 35,
    "dimension": "OJ",
    "title": "一笔单子亏了，但当时该做的功课都做了。复盘时你更想知道——",
    "options": [
      {
        "text": "我当时对局面的判断，哪里出了问题",
        "score": "J"
      },
      {
        "text": "我有没有按自己定好的做法去做",
        "score": "O"
      }
    ]
  },
  {
    "id": 36,
    "dimension": "OJ",
    "title": "关于“计划”这件事，你的看法更接近——",
    "options": [
      {
        "text": "定下来就该照着走，改来改去等于没定",
        "score": "O"
      },
      {
        "text": "计划是拿来参考的，情况变了就得跟着变",
        "score": "J"
      }
    ]
  },
  {
    "id": 37,
    "dimension": "OJ",
    "title": "同一件事，两个人给你建议：一个说“按你自己的规矩来”，一个说“这次情况特殊，别死守”。你更听得进——",
    "options": [
      {
        "text": "“这次情况特殊”的那种",
        "score": "J"
      },
      {
        "text": "“按你规矩来”的那种",
        "score": "O"
      }
    ]
  },
  {
    "id": 38,
    "dimension": "OJ",
    "title": "中日关系紧张那阵，“抗日概念”满天飞。你朋友复盘出一套规律：这类消息出来，相关票一般能涨三天，第四天开始回落。他说这次也一样，让你一起做。你会——",
    "options": [
      {
        "text": "看看这次跟以前像不像，像就跟着做",
        "score": "J"
      },
      {
        "text": "让他把条件说清楚——什么时候成立、什么时候失效，我再决定用不用",
        "score": "O"
      }
    ]
  },
  {
    "id": 39,
    "dimension": "OJ",
    "title": "你的自选股列表，一般是怎么攒起来的——",
    "options": [
      {
        "text": "按我定的几条标准筛出来的，不符合的不放",
        "score": "O"
      },
      {
        "text": "看到有意思就加，哪天觉得不对了再删",
        "score": "J"
      }
    ]
  },
  {
    "id": 40,
    "dimension": "OJ",
    "title": "一只票你想加仓，更可能是因为——",
    "options": [
      {
        "text": "现在看下来，比当初更值得了",
        "score": "J"
      },
      {
        "text": "当初写下的加仓条件到了",
        "score": "O"
      }
    ]
  }
];

/* ---------- 抽题 ---------- */

const QUESTIONS_PER_DIMENSION = 7;
const QUESTION_PROGRESS_KEY = "gbti-progress-v6-20261013";

function shuffleQuestions(list) {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

// 每维随机抽 7 题，再四维轮转交错，避免同一维度连续出现。
function buildQuestionSet() {
  const groups = dimensions.map(function (dimension) {
    return shuffleQuestions(questionPool.filter(function (question) {
      return question.dimension === dimension.key;
    })).slice(0, QUESTIONS_PER_DIMENSION);
  });
  const ordered = [];
  for (let round = 0; round < QUESTIONS_PER_DIMENSION; round += 1) {
    const offset = round % groups.length;
    for (let step = 0; step < groups.length; step += 1) {
      const group = groups[(step + offset) % groups.length];
      if (group[round]) ordered.push(group[round]);
    }
  }
  return ordered;
}

// 续答时按保存的题号还原同一套题；任何一项对不上就重抽一套。
function restoreQuestionSet(ids) {
  if (!Array.isArray(ids)) return null;
  const byId = new Map(questionPool.map(function (question) { return [question.id, question]; }));
  const restored = ids.map(function (id) { return byId.get(id); });
  if (restored.some(function (question) { return !question; })) return null;
  if (restored.length !== QUESTIONS_PER_DIMENSION * dimensions.length) return null;
  const eachDimensionFilled = dimensions.every(function (dimension) {
    return restored.filter(function (question) {
      return question.dimension === dimension.key;
    }).length === QUESTIONS_PER_DIMENSION;
  });
  return eachDimensionFilled ? restored : null;
}

function readSavedQuestionIds() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = JSON.parse(localStorage.getItem(QUESTION_PROGRESS_KEY) || "null");
    return raw && Array.isArray(raw.questionIds) ? raw.questionIds : null;
  } catch (error) {
    return null;
  }
}

let questions = restoreQuestionSet(readSavedQuestionIds()) || buildQuestionSet();

// 重新测试时换一批题，避免每次做到的都一模一样。
function reshuffleQuestions() {
  questions = buildQuestionSet();
  return questions;
}
