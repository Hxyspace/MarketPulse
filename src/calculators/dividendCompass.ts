import { fetchDividendLowVol, fetchAllShare, KlineData } from '../services/eastmoney';
import { CONFIG } from '../config';
import { bjDate } from '../utils/date';
import { StatusKind } from '../utils/status';

export interface CompassResult {
  date: string;
  dividendReturn40d: number;  // 红利低波40日收益率 %
  allShareReturn40d: number;  // 中证全指40日收益率 %
  diff: number;               // 40日收益差 %
  status: string;             // 罗盘状态
  statusKind: StatusKind;     // 结构化状态
  interpretation: string;     // 操作建议
}

export interface CompassHistory {
  latest: CompassResult;
  history: CompassResult[];  // 2020年以来的历史数据
}

/**
 * 计算40日收益差
 * 公式：(红利低波今日收盘/红利低波40个交易日前收盘 - 1) - (中证全指今日收盘/中证全指40个交易日前收盘 - 1)
 */
export function calculate40DayDiff(
  dividendData: KlineData[],
  allShareData: KlineData[],
  tradingDays: number = 40,
): CompassResult[] {
  // 对齐日期
  const dateSet = new Set(dividendData.map(d => d.date));
  const alignedAllShare = allShareData.filter(d => dateSet.has(d.date));
  const alignedDividend = dividendData.filter(d =>
    new Set(alignedAllShare.map(a => a.date)).has(d.date)
  );

  if (alignedDividend.length < tradingDays + 1) {
    return [];
  }

  const results: CompassResult[] = [];
  for (let i = tradingDays; i < alignedDividend.length; i++) {
    const divToday = alignedDividend[i].close;
    const divPrev = alignedDividend[i - tradingDays].close;
    const allToday = alignedAllShare[i].close;
    const allPrev = alignedAllShare[i - tradingDays].close;

    const dividendReturn = (divToday / divPrev - 1) * 100;
    const allShareReturn = (allToday / allPrev - 1) * 100;
    const diff = dividendReturn - allShareReturn;

    const compass = evaluateCompass(diff);
    results.push({
      date: alignedDividend[i].date,
      dividendReturn40d: Math.round(dividendReturn * 100) / 100,
      allShareReturn40d: Math.round(allShareReturn * 100) / 100,
      diff: Math.round(diff * 100) / 100,
      ...compass,
    });
  }

  return results;
}

/**
 * 计算罗盘状态
 */
function evaluateCompass(diff: number): { status: string; statusKind: StatusKind; interpretation: string } {
  const t = CONFIG.returnDiff.thresholds;

  let status: string;
  let statusKind: StatusKind;
  let interpretation: string;

  if (diff >= t.overheated) {
    status = '🔥 过热';
    statusKind = StatusKind.HOT;
    interpretation = '红利类资产热度过热，宜逐步减仓';
  } else if (diff >= t.normal) {
    status = '😊 适中';
    statusKind = StatusKind.NORMAL;
    interpretation = '红利类资产热度适中，宜持有收益';
  } else {
    status = '❄️ 过冷';
    statusKind = StatusKind.COLD;
    interpretation = '红利类资产过冷，宜逢低加仓';
  }

  return { status, statusKind, interpretation };
}

/**
 * 查询指定日期的40日收益差（含完整历史）
 */
export async function getDividendCompassByDate(queryDate: string): Promise<CompassHistory> {
  const [dividendData, allShareData] = await Promise.all([
    fetchDividendLowVol(),
    fetchAllShare(),
  ]);

  const allResults = calculate40DayDiff(dividendData, allShareData);
  const history = allResults.filter(r => r.date >= '2020-01-01');

  let latest = history[history.length - 1];
  for (const r of history) {
    if (r.date <= queryDate) latest = r;
    else break;
  }

  return { latest, history };
}

/**
 * 获取最新40日收益差数据
 */
export async function getDividendCompassLatest(): Promise<CompassHistory> {
  return getDividendCompassByDate(bjDate());
}
