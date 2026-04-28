export const CONFIG = {
  port: 3000,
  lanUrl: '' as string,

  // 中证指数官方API（替代东方财富，解决TLS连接问题）
  csi: {
    api: 'https://www.csindex.com.cn/csindex-home/perf/index-perf',
    indices: {
      dividendLowVol: { code: 'H30269', name: '红利低波' },
      allShare: { code: '000985', name: '中证全指' },
      csi300: { code: '000300', name: '沪深300' },
    },
  },

  // 中债信息网 API
  chinabond: {
    api: 'https://yield.chinabond.com.cn/cbweb-mn/indices/singleIndexQueryResult',
    // 中债-新综合指数 净价
    indexId: '8a8b2ca0332abed20134ea76d8885831',
  },

  // 飞书应用机器人推送（Open API）
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    chatId: process.env.FEISHU_CHAT_ID || '',
    urgentOpenId: process.env.FEISHU_URGENT_OPEN_ID || '',
  },

  // 定时任务 (cron 表达式)
  cron: {
    // 每个交易日 09:00 发送报告
    dailyReport: '0 9 * * 1-5',
  },

  // 40日收益差参数
  returnDiff: {
    days: 40,
    // 需要的历史数据天数 (交易日约为日历日的 70%)
    historyDays: 120,
    thresholds: {
      overheated: 10,   // +10% 以上：过热，逐步减仓
      normal: -1,       // -1% ~ +10%：正常，持有收息
      cold: -Infinity,  // -1% 以下：过冷，通低加仓
    },
  },
};

// 启动时检查飞书配置（缺失只警告，不阻断本地 dev 启动）
{
  const missing = (['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_CHAT_ID'] as const)
    .filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.warn(
      `[Config] 飞书凭据缺失: ${missing.join(', ')}。每日报告推送将被跳过。`,
    );
  }
}
