// 资产配置候选池。静态定义，人工维护；行情与估值由 tools/fetch-market-data.py 每日刷新写入 market-data.js。
// styles 取值说明：
//   value   价值稳健   F 依据 + D 稳健，低估值、低波动、高股息
//   quality 质量成长   F 依据 + A 进取，盈利能力与成长性优先
//   steady  大盘稳健   M 依据 + D 稳健，大盘蓝筹，技术面平稳、流动性充裕
//   trend   趋势动量   M 依据 + A 进取，量价驱动，弹性较大
// 一只标的可同时属于多个风格。持有周期 L / S 不在此硬编码，由换手率与成交额数据在筛选时判定。
const GBTI_POOL = [
  // ===== 价值稳健 =====
  { "code": "601398.SH", "name": "工商银行", "industry": "银行", "styles": ["value", "steady"] },
  { "code": "601939.SH", "name": "建设银行", "industry": "银行", "styles": ["value", "steady"] },
  { "code": "600036.SH", "name": "招商银行", "industry": "银行", "styles": ["value", "steady"] },
  { "code": "601318.SH", "name": "中国平安", "industry": "保险", "styles": ["value", "steady"] },
  { "code": "601857.SH", "name": "中国石油", "industry": "石油石化", "styles": ["value"] },
  { "code": "600028.SH", "name": "中国石化", "industry": "石油石化", "styles": ["value", "steady"] },
  { "code": "601088.SH", "name": "中国神华", "industry": "煤炭", "styles": ["value", "steady"] },
  { "code": "601006.SH", "name": "大秦铁路", "industry": "交通运输", "styles": ["value", "steady"] },
  { "code": "600377.SH", "name": "宁沪高速", "industry": "交通运输", "styles": ["value", "steady"] },
  { "code": "600941.SH", "name": "中国移动", "industry": "通信", "styles": ["value", "steady"] },
  { "code": "600900.SH", "name": "长江电力", "industry": "公用事业", "styles": ["value", "steady"] },
  { "code": "600887.SH", "name": "伊利股份", "industry": "食品饮料", "styles": ["value", "steady"] },
  { "code": "000895.SZ", "name": "双汇发展", "industry": "食品饮料", "styles": ["value", "steady"] },

  // ===== 质量成长 =====
  { "code": "600519.SH", "name": "贵州茅台", "industry": "食品饮料", "styles": ["quality"] },
  { "code": "000858.SZ", "name": "五粮液", "industry": "食品饮料", "styles": ["quality"] },
  { "code": "000568.SZ", "name": "泸州老窖", "industry": "食品饮料", "styles": ["quality"] },
  { "code": "300760.SZ", "name": "迈瑞医疗", "industry": "医药生物", "styles": ["quality"] },
  { "code": "002415.SZ", "name": "海康威视", "industry": "电子", "styles": ["quality"] },
  { "code": "000333.SZ", "name": "美的集团", "industry": "家用电器", "styles": ["quality", "steady"] },
  { "code": "002475.SZ", "name": "立讯精密", "industry": "电子", "styles": ["quality"] },
  { "code": "600309.SH", "name": "万华化学", "industry": "基础化工", "styles": ["quality"] },
  { "code": "600031.SH", "name": "三一重工", "industry": "机械设备", "styles": ["quality"] },
  { "code": "300750.SZ", "name": "宁德时代", "industry": "电力设备", "styles": ["quality"] },
  { "code": "002371.SZ", "name": "北方华创", "industry": "电子", "styles": ["quality"] },
  { "code": "300124.SZ", "name": "汇川技术", "industry": "机械设备", "styles": ["quality"] },
  { "code": "300274.SZ", "name": "阳光电源", "industry": "电力设备", "styles": ["quality"] },

  // ===== 趋势动量 =====
  { "code": "601899.SH", "name": "紫金矿业", "industry": "有色金属", "styles": ["trend"] },
  { "code": "603993.SH", "name": "洛阳钼业", "industry": "有色金属", "styles": ["trend"] },
  { "code": "601600.SH", "name": "中国铝业", "industry": "有色金属", "styles": ["trend"] },
  { "code": "601919.SH", "name": "中远海控", "industry": "交通运输", "styles": ["trend"] },
  { "code": "600150.SH", "name": "中国船舶", "industry": "国防军工", "styles": ["trend"] },
  { "code": "300308.SZ", "name": "中际旭创", "industry": "通信", "styles": ["trend"] },
  { "code": "002594.SZ", "name": "比亚迪", "industry": "汽车", "styles": ["trend"] },
  { "code": "601012.SH", "name": "隆基绿能", "industry": "电力设备", "styles": ["trend"] },
  { "code": "300059.SZ", "name": "东方财富", "industry": "非银金融", "styles": ["trend"] },
  { "code": "600030.SH", "name": "中信证券", "industry": "非银金融", "styles": ["trend"] }
];

// 债券、货币、黄金三个仓位的载体示例，不参与风格筛选。
const GBTI_POOL_FUND = [
  { "code": "511010.SH", "name": "国债ETF", "sleeve": "bond", "note": "跟踪上证5年期国债指数" },
  { "code": "511360.SH", "name": "短融ETF", "sleeve": "bond", "note": "投资短期融资券，久期短" },
  { "code": "511990.SH", "name": "华宝添益", "sleeve": "money", "note": "场内货币基金，T+0 可用" },
  { "code": "518880.SH", "name": "黄金ETF", "sleeve": "gold", "note": "跟踪国内黄金现货价格" }
];
