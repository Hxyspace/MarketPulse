import { loadLocalData, saveLocalData, needsUpdate } from './storage';
import { getLatestTradingDate } from '../utils/date';
import { httpsJson } from './httpClient';

export interface KlineData {
  date: string;    // YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  amplitude: number;  // 振幅 %
  changePercent: number; // 涨跌幅 %
  changeAmount: number;  // 涨跌额
  turnover: number;  // 换手率 %
  pe?: number;       // 市盈率 (CSI peg字段)
}

// CSI官方API（中证指数有限公司）
const CSI_API = 'https://www.csindex.com.cn/csindex-home/perf/index-perf';

// 腾讯财经API（备用，仅支持主要指数）
const TENCENT_API = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';

// 指数代码映射（CSI官方代码）
const INDEX_CODES = {
  dividendLowVol: 'H30269',   // 红利低波
  allShare: '000985',          // 中证全指
  csi300: '000300',            // 沪深300
};

// 腾讯代码映射（CSI300不走腾讯，需要PE数据只有CSI API有）
const TENCENT_CODES: Record<string, string> = {
  '000985': 'sh000985',
};

// 全项目统一的历史起始日期，与 10 年期国债收益率（2010-01-01）对齐
const DEFAULT_START_DATE = '20100101';

interface CsiPerfItem {
  tradeDate: string;    // YYYYMMDD
  indexCode: string;
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
  changePct: number;
  tradingVol: number;   // 亿股
  tradingValue: number; // 亿元
  peg?: number;         // CSI 官方字段名，语义为滚动市盈率 TTM（不是 PEG）
}

interface CsiResponse {
  code: string;
  data: CsiPerfItem[];
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 全局请求队列，防止并发触发CSI WAF
let requestQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue = requestQueue.then(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * 从CSI官方API获取指数日K数据（串行化，带重试）
 */
function fetchCsiAll(
  indexCode: string,
  startDate: string,
  endDate: string,
  retries: number = 1,
): Promise<CsiPerfItem[]> {
  return enqueue(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        console.log(`[CSI] Retry ${attempt} for ${indexCode} ${startDate}-${endDate}...`);
        await sleep(2000 * attempt);
      }
      try {
        const items = await _fetchCsiRaw(indexCode, startDate, endDate);
        await sleep(500); // 与下一次请求保持间隔
        return items;
      } catch (err) {
        if (attempt === retries) throw err;
      }
    }
    return [];
  });
}

function _fetchCsiRaw(
  indexCode: string,
  startDate: string,
  endDate: string,
): Promise<CsiPerfItem[]> {
  const url = `${CSI_API}?indexCode=${indexCode}&startDate=${startDate}&endDate=${endDate}`;
  console.log(`[CSI] Fetching ${indexCode} ${startDate}-${endDate}...`);
  return httpsJson<CsiResponse>(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.csindex.com.cn/',
    },
  }).then((json) => (json.code === '200' && json.data ? json.data : []));
}

/**
 * 备用：从腾讯财经 API 获取指数日 K（单次最多 2000 条 ≈ 8 年）。
 * 当前主路径仅使用 CSI；保留 export 以便将来切换或调试，编译期不会被树摇删除。
 */
export function fetchTencentKline(
  tencentCode: string,
  startDate: string,  // YYYY-MM-DD
  endDate: string,
): Promise<KlineData[]> {
  const url = `${TENCENT_API}?param=${tencentCode},day,${startDate},${endDate},2000,`;
  console.log(`[Tencent] Fetching ${tencentCode} ${startDate}-${endDate}...`);
  return httpsJson<{ data?: Record<string, { day?: string[][]; qfqday?: string[][] }> }>(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeoutMs: 15000,
  }).then((json) => {
    const key = Object.keys(json.data || {})[0];
    if (!key) return [];
    const days: string[][] = json.data![key].day || json.data![key].qfqday || [];
    return days.map((d) => ({
      date: d[0],
      open: parseFloat(d[1]),
      close: parseFloat(d[2]),
      high: parseFloat(d[3]),
      low: parseFloat(d[4]),
      volume: parseFloat(d[5]) || 0,
      amount: 0,
      amplitude: 0,
      changePercent: 0,
      changeAmount: 0,
      turnover: 0,
    }));
  });
}

function csiToKline(item: CsiPerfItem): KlineData {
  const d = item.tradeDate;
  const date = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
  return {
    date,
    open: item.open,
    close: item.close,
    high: item.high,
    low: item.low,
    volume: item.tradingVol * 1e8,    // 亿股→股
    amount: item.tradingValue * 1e8,   // 亿元→元
    amplitude: item.high && item.low && item.close
      ? +((item.high - item.low) / item.close * 100).toFixed(2)
      : 0,
    changePercent: item.changePct,
    changeAmount: item.change,
    turnover: 0,
    pe: item.peg,
  };
}

/**
 * 获取指数数据（带本地缓存）
 */
async function getIndexDataCached(
  indexCode: string,
  storageKey: string,
): Promise<KlineData[]> {
  const stored = loadLocalData<KlineData>(storageKey);

  if (stored && stored.items.length > 0) {
    const lastDate = stored.items[stored.items.length - 1].date;

    if (!needsUpdate(lastDate)) {
      console.log(`[Storage] ${storageKey}: up-to-date (${stored.items.length} items, last: ${lastDate})`);
      return stored.items;
    }

    // 增量更新：从最后日期开始拉取，依靠 dedup 去重
    const fetchStart = lastDate.replace(/-/g, '');
    const endDate = getLatestTradingDate().replace(/-/g, '');
    console.log(`[Storage] ${storageKey}: fetching from ${fetchStart} to ${endDate}...`);
    const newItems = await fetchCsiAll(indexCode, fetchStart, endDate);
    const newData = newItems.map(csiToKline);

    if (newData.length > 0) {
      const dateSet = new Set(stored.items.map(d => d.date));
      const deduped = newData.filter(d => !dateSet.has(d.date));
      const merged = [...stored.items, ...deduped].sort((a, b) => a.date.localeCompare(b.date));
      saveLocalData(storageKey, merged);
      console.log(`[Storage] ${storageKey}: updated to ${merged.length} items (+${deduped.length} new)`);
      return merged;
    } else {
      console.warn(`[Index] No new data returned for ${storageKey}: ${fetchStart} to ${endDate}`);
    }

    return stored.items;
  }

  // 首次拉取：从默认起始日期开始
  const endDate = getLatestTradingDate().replace(/-/g, '');
  console.log(`[Storage] ${storageKey}: initial fetch from ${DEFAULT_START_DATE} to ${endDate}...`);
  const items = await fetchCsiAll(indexCode, DEFAULT_START_DATE, endDate);
  const freshData = items.map(csiToKline);
  if (freshData.length > 0) {
    saveLocalData(storageKey, freshData);
    console.log(`[Storage] ${storageKey}: saved ${freshData.length} items`);
  }
  return freshData;
}

/**
 * 获取红利低波指数数据
 */
export async function fetchDividendLowVol(): Promise<KlineData[]> {
  return getIndexDataCached(INDEX_CODES.dividendLowVol, 'dividend_low_vol.json');
}

/**
 * 获取中证全指数据（替代万得全A）
 */
export async function fetchAllShare(): Promise<KlineData[]> {
  return getIndexDataCached(INDEX_CODES.allShare, 'all_share.json');
}

/**
 * 获取沪深300数据（000300，早期可能缺 peg/PE）
 */
export async function fetchCSI300(): Promise<KlineData[]> {
  return getIndexDataCached(INDEX_CODES.csi300, 'csi300.json');
}
