import { getAllBondData, BondIndexData } from '../services/chinabond';
import { bjDate } from '../utils/date';
import { StatusKind } from '../utils/status';

export interface BondBarometerResult {
  latest: {
    date: string;
    value: number;
    change: number;        // 较前日变动
    changePercent: number; // 较前日变动百分比
    weather: string;       // 晴天/阴天/雨天
  };
  temperature: {
    value: number;          // 债市温度 ℃
    percentile: number;     // 净价指数在历史中的百分位
    status: string;         // 状态描述
    statusKind: StatusKind; // 结构化状态
    interpretation: string; // 解读
  };
  history: BondIndexData[]; // 全量历史趋势（2002至今）
  recentDays: {
    date: string;
    value: number;
    change: number;
    weather: string;
  }[];
}

/**
 * 根据中债新综合净价指数单日涨跌判断债市天气
 * 涨 > 0.02 → 大晴天
 * 涨 0 ~ 0.02 → 晴天
 * 跌 0 ~ -0.02 → 阴天
 * 跌 < -0.02 → 雨天
 * 跌 < -0.1 → 暴雨
 */
export function getBondWeather(change: number): string {
  if (change > 0.02) return '大晴天☀️';
  if (change > 0) return '晴天🌤️';
  if (change > -0.02) return '阴天☁️';
  if (change > -0.1) return '雨天🌧️';
  return '暴雨⛈️';
}

/**
 * 债市温度：基于中债新综合净价指数在近N年历史中的百分位
 * 净价指数越高 → 债券价格越贵 → 收益率越低 → 温度越高
 * 温度高意味着债市偏贵（收益率偏低），追涨风险大
 * 温度低意味着债市便宜（收益率偏高），适合配置
 */
function calculateBondTemperature(allData: BondIndexData[], currentValue: number) {
  // 使用近5年数据计算百分位
  const recent5y = allData.slice(-1250); // 约5年交易日
  const values = recent5y.map(d => d.value);

  const belowCount = values.filter(v => v < currentValue).length;
  const percentile = (belowCount / values.length) * 100;

  // 温度 = 百分位（0~100℃），与文章一致
  // 0-30℃ 低估，30-80℃ 正常，80℃+ 高估
  const temperature = Math.round(percentile * 10) / 10;

  let status: string;
  let statusKind: StatusKind;
  let interpretation: string;

  if (temperature >= 80) {
    status = '🔥 高估';
    statusKind = StatusKind.HOT;
    interpretation = '债市高估，有回撤风险，建议适时止盈，不宜大笔加仓';
  } else if (temperature >= 30) {
    status = '😊 适中';
    statusKind = StatusKind.NORMAL;
    interpretation = '债市估值适中，可安心定投持有';
  } else {
    status = '❄️ 低估';
    statusKind = StatusKind.COLD;
    interpretation = '债市低估，性价比高，适合单笔买入或定投';
  }

  return {
    value: temperature,
    percentile: Math.round(percentile * 10) / 10,
    status,
    statusKind,
    interpretation,
  };
}

/**
 * 查询指定日期的债市晴雨表
 */
export async function getBondByDate(queryDate: string): Promise<BondBarometerResult> {
  const allHistory = await getAllBondData();

  if (allHistory.length < 2) {
    throw new Error('Bond data insufficient');
  }

  // 找到queryDate或之前最近的交易日
  let targetIdx = allHistory.length - 1;
  for (let i = allHistory.length - 1; i >= 0; i--) {
    if (allHistory[i].date <= queryDate) { targetIdx = i; break; }
  }
  if (targetIdx < 1) {
    throw new Error('No bond data available for this date');
  }

  const latestData = allHistory[targetIdx];
  const prevData = allHistory[targetIdx - 1];
  const change = latestData.value - prevData.value;
  const changePercent = (change / prevData.value) * 100;

  // 计算债市温度（使用目标日期及之前的数据）
  const temperature = calculateBondTemperature(allHistory.slice(0, targetIdx + 1), latestData.value);

  // 目标日期前30天数据
  const recentDays = [];
  const start = Math.max(1, targetIdx - 29);
  for (let i = start; i <= targetIdx; i++) {
    const dayChange = allHistory[i].value - allHistory[i - 1].value;
    recentDays.push({
      date: allHistory[i].date,
      value: allHistory[i].value,
      change: Math.round(dayChange * 10000) / 10000,
      weather: getBondWeather(dayChange),
    });
  }

  return {
    latest: {
      date: latestData.date,
      value: latestData.value,
      change: Math.round(change * 10000) / 10000,
      changePercent: Math.round(changePercent * 10000) / 10000,
      weather: getBondWeather(change),
    },
    temperature,
    history: allHistory,
    recentDays,
  };
}

/**
 * 获取最新债市晴雨表数据
 */
export async function getBondBarometer(): Promise<BondBarometerResult> {
  return getBondByDate(bjDate());
}

/**
 * 获取前一交易日的债市温度状态（用于极端信号检测）
 */
export function getPrevBondStatus(result: BondBarometerResult): StatusKind | '' {
  const allHistory = result.history;
  if (allHistory.length < 2) return '';
  const prevData = allHistory[allHistory.length - 2];
  const prevTemp = calculateBondTemperature(allHistory.slice(0, -1), prevData.value);
  return prevTemp.statusKind;
}
