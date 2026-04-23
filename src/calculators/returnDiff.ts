import { fetchDividendLowVol, fetchAllShare, KlineData } from '../services/eastmoney';
import { CONFIG } from '../config';

export interface ReturnDiffResult {
  date: string;
  dividendReturn40d: number;  // 红利低波40日收益率 %
  allShareReturn40d: number;  // 中证全指40日收益率 %
  diff: number;               // 40日收益差 %
  compass: string;            // 罗盘状态
}

export interface ReturnDiffHistory {
  latest: ReturnDiffResult;
  history: ReturnDiffResult[];  // 2020年以来的历史数据
}

function getDateStr(d: Date): string {
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * 计算40日收益差
 * 公式：(红利低波今日收盘/红利低波40个交易日前收盘 - 1) - (中证全指今日收盘/中证全指40个交易日前收盘 - 1)
 */
export function calculate40DayReturnDiff(
  dividendData: KlineData[],
  allShareData: KlineData[],
  tradingDays: number = 40,
): ReturnDiffResult[] {
  // 对齐日期
  const dateSet = new Set(dividendData.map(d => d.date));
  const alignedAllShare = allShareData.filter(d => dateSet.has(d.date));
  const alignedDividend = dividendData.filter(d =>
    new Set(alignedAllShare.map(a => a.date)).has(d.date)
  );

  if (alignedDividend.length < tradingDays + 1) {
    return [];
  }

  const results: ReturnDiffResult[] = [];
  for (let i = tradingDays; i < alignedDividend.length; i++) {
    const divToday = alignedDividend[i].close;
    const divPrev = alignedDividend[i - tradingDays].close;
    const allToday = alignedAllShare[i].close;
    const allPrev = alignedAllShare[i - tradingDays].close;

    const dividendReturn = (divToday / divPrev - 1) * 100;
    const allShareReturn = (allToday / allPrev - 1) * 100;
    const diff = dividendReturn - allShareReturn;

    results.push({
      date: alignedDividend[i].date,
      dividendReturn40d: Math.round(dividendReturn * 100) / 100,
      allShareReturn40d: Math.round(allShareReturn * 100) / 100,
      diff: Math.round(diff * 100) / 100,
      compass: getCompassStatus(diff),
    });
  }

  return results;
}

function getCompassStatus(diff: number): string {
  const t = CONFIG.returnDiff.thresholds;
  if (diff >= t.overheated) return '过热';
  if (diff >= t.normal) return '正常';
  return '过冷';
}

/**
 * 获取完整的40日收益差数据（2020年至今）
 */
export async function getReturnDiffData(): Promise<ReturnDiffHistory> {
  const endDate = getDateStr(new Date());
  const startDate = '20191101'; // 从2019年11月开始取数据，确保2020年1月有40日数据

  const [dividendData, allShareData] = await Promise.all([
    fetchDividendLowVol(startDate, endDate),
    fetchAllShare(startDate, endDate),
  ]);

  const allResults = calculate40DayReturnDiff(dividendData, allShareData);

  // 只保留2020年以来的数据
  const history = allResults.filter(r => r.date >= '2020-01-01');
  const latest = history[history.length - 1];

  return { latest, history };
}

/**
 * 查询指定日期的40日收益差
 */
export async function getReturnDiffByDate(queryDate: string): Promise<ReturnDiffResult | null> {
  const { history } = await getReturnDiffData();
  // 找到该日期或之前最近的交易日
  let best: ReturnDiffResult | null = null;
  for (const r of history) {
    if (r.date <= queryDate) best = r;
    else break;
  }
  return best;
}
