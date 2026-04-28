import { fetchCSI300, KlineData } from '../services/eastmoney';
import { getBondYieldData, BondYieldData } from '../services/bondYield';
import { bjDate } from '../utils/date';

export interface ErpHistoryItem {
  date: string;
  erp: number;       // 股债利差 %
  close: number;     // 沪深300收盘价
}

export interface FundThermometerResult {
  date: string;
  temperature: number;      // 温度 ℃
  status: string;           // 状态描述
  interpretation: string;   // 操作建议
  csi300Close: number;      // 沪深300收盘价
  csi300Change: number;     // 沪深300涨跌幅
  pe: number;               // 沪深300市盈率
  bondYield: number;        // 10年期国债收益率 %
  erp: number;              // 股债利差 = 1/PE*100 - 国债收益率
  percentile: number;       // 股债利差百分位（越高=股票越便宜）
  erpHistory: ErpHistoryItem[];  // 全部股债利差历史
}

/**
 * 将沪深300 K线与10年国债收益率按日期对齐，计算股债利差
 */
function calcErpSeries(
  klineData: KlineData[],
  yieldData: BondYieldData[],
): { date: string; close: number; pe: number; bondYield: number; erp: number; changePercent: number }[] {
  const yieldMap = new Map(yieldData.map(d => [d.date, d.yield]));
  const result: { date: string; close: number; pe: number; bondYield: number; erp: number; changePercent: number }[] = [];

  for (const k of klineData) {
    if (!k.pe || k.pe <= 0) continue;
    // 国债收益率可能不完全对齐交易日，找最近的
    let by = yieldMap.get(k.date);
    if (by === undefined) {
      // 向前找最近3天
      for (let i = 1; i <= 5 && by === undefined; i++) {
        const d = new Date(k.date);
        d.setDate(d.getDate() - i);
        by = yieldMap.get(d.toISOString().split('T')[0]);
      }
    }
    if (by === undefined) continue;

    const earningsYield = (1 / k.pe) * 100; // 市盈率倒数 → 股票收益率 %
    const erp = earningsYield - by;          // 股债利差

    result.push({
      date: k.date,
      close: k.close,
      pe: k.pe,
      bondYield: by,
      erp: Math.round(erp * 10000) / 10000,
      changePercent: k.changePercent || 0,
    });
  }

  return result;
}

/**
 * 基金温度计（股债利差模型）
 *
 * 股债利差 = 沪深300市盈率倒数 - 10年期国债收益率
 * 利差高 → 股票便宜 → 温度低（适合买入）
 * 利差低 → 股票贵 → 温度高（适合卖出）
 *
 * 温度 = 100 - 股债利差的历史百分位
 * （百分位高→利差大→股票便宜→温度低）
 */
export async function getFundThermometer(): Promise<FundThermometerResult> {
  const result = await getFundThermometerByDate(bjDate());
  if (!result) throw new Error('No fund thermometer data available');
  return result;
}

function getTemperatureStatus(temp: number): string {
  if (temp >= 80) return '🔥 高温区';
  if (temp >= 31) return '😊 正常区';
  return '❄️ 低温区';
}

function getTemperatureInterpretation(temp: number): string {
  if (temp >= 80) return '市场过热，暂停定投，及时止盈';
  if (temp >= 31) return '市场正常，按计划定投';
  return '市场低估，加倍定投';
}

/**
 * 查询指定日期的基金温度
 */
export async function getFundThermometerByDate(queryDate: string): Promise<FundThermometerResult | null> {
  // 从2011年7月开始（CSI API最早有PE数据的时间）
  const startDate = '20110701';
  const endDateCompact = queryDate.replace(/-/g, '');

  const [klineData, yieldData] = await Promise.all([
    fetchCSI300(startDate, endDateCompact),
    getBondYieldData(),
  ]);

  const erpSeries = calcErpSeries(klineData, yieldData);
  const allFiltered = erpSeries.filter(d => d.date <= queryDate);
  if (allFiltered.length < 100) return null;

  // 取最近10年计算百分位（约2500个交易日）
  const recent10y = allFiltered.slice(-2500);
  const latest = recent10y[recent10y.length - 1];
  const prev = recent10y.length > 1 ? recent10y[recent10y.length - 2] : latest;

  const erpValues = recent10y.map(d => d.erp);

  // 股债利差百分位（利差越高=越多天比现在低=百分位越高=股票越便宜）
  const erpPercentile = (erpValues.filter(v => v < latest.erp).length / erpValues.length) * 100;
  // 温度 = 100 - 股债利差百分位
  const temperature = Math.round((100 - erpPercentile) * 10) / 10;

  return {
    date: latest.date,
    temperature,
    status: getTemperatureStatus(temperature),
    interpretation: getTemperatureInterpretation(temperature),
    csi300Close: latest.close,
    csi300Change: latest.changePercent || Math.round((latest.close / prev.close - 1) * 10000) / 100,
    pe: Math.round(latest.pe * 100) / 100,
    bondYield: Math.round(latest.bondYield * 10000) / 10000,
    erp: Math.round(latest.erp * 100) / 100,
    percentile: Math.round((100 - erpPercentile) * 10) / 10,
    erpHistory: allFiltered.map(d => ({ date: d.date, erp: Math.round(d.erp * 100) / 100, close: d.close })),
  };
}

/**
 * 获取前一交易日的基金温度状态（用于极端信号检测）
 */
export function getPrevFundStatus(result: FundThermometerResult): string {
  const history = result.erpHistory;
  if (history.length < 2) return '';
  const recent10y = history.slice(-2500);
  const prev = recent10y[recent10y.length - 2];
  if (!prev) return '';
  const erpValues = recent10y.map(d => d.erp);
  const prevPercentile = (erpValues.filter(v => v < prev.erp).length / erpValues.length) * 100;
  const prevTemperature = Math.round((100 - prevPercentile) * 10) / 10;
  return getTemperatureStatus(prevTemperature);
}
