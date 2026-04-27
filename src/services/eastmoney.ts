import * as https from 'https';
import { loadLocalData, saveLocalData, needsUpdate, getLatestTradingDate } from './storage';

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
  peg?: number;         // 市盈率
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
function fetchCsiChunk(
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
        const items = await _fetchCsiChunkRaw(indexCode, startDate, endDate);
        await sleep(500); // 请求间隔
        return items;
      } catch (err) {
        if (attempt === retries) throw err;
      }
    }
    return [];
  });
}

function _fetchCsiChunkRaw(
  indexCode: string,
  startDate: string,
  endDate: string,
): Promise<CsiPerfItem[]> {
  return new Promise((resolve, reject) => {
    const url = `${CSI_API}?indexCode=${indexCode}&startDate=${startDate}&endDate=${endDate}`;
    console.log(`[CSI] Fetching ${indexCode} ${startDate}-${endDate}...`);

    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.csindex.com.cn/',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode !== 200) {
        res.resume();
        reject(new Error(`CSI API returned ${res.statusCode} for ${indexCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as CsiResponse;
          if (json.code === '200' && json.data) {
            resolve(json.data);
          } else {
            resolve([]);
          }
        } catch {
          reject(new Error(`CSI API parse error for ${indexCode}: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('CSI request timeout')); });
  });
}

/**
 * 从腾讯财经API获取指数日K数据（单次最多500条）
 */
function fetchTencentKline(
  tencentCode: string,
  startDate: string,  // YYYY-MM-DD
  endDate: string,
): Promise<KlineData[]> {
  return new Promise((resolve, reject) => {
    const url = `${TENCENT_API}?param=${tencentCode},day,${startDate},${endDate},500,`;
    console.log(`[Tencent] Fetching ${tencentCode} ${startDate}-${endDate}...`);

    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const key = Object.keys(json.data || {})[0];
          if (!key) { resolve([]); return; }
          const days: string[][] = json.data[key].day || json.data[key].qfqday || [];
          const result = days.map((d: string[]) => ({
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
          resolve(result);
        } catch {
          reject(new Error(`Tencent API parse error for ${tencentCode}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('Tencent request timeout')); });
  });
}

/**
 * 从腾讯API分段拉取（每次500条，约2年）
 */
async function fetchTencentByYears(
  tencentCode: string,
  startDate: string,  // YYYYMMDD
  endDate: string,
): Promise<KlineData[]> {
  const startYear = parseInt(startDate.substring(0, 4));
  const endYear = parseInt(endDate.substring(0, 4));
  const allData: KlineData[] = [];

  // 每2年一批
  for (let y = startYear; y <= endYear; y += 2) {
    const ys = y === startYear ? `${startDate.substring(0, 4)}-${startDate.substring(4, 6)}-${startDate.substring(6, 8)}` : `${y}-01-01`;
    const ye2 = Math.min(y + 1, endYear);
    const ye = ye2 === endYear ? `${endDate.substring(0, 4)}-${endDate.substring(4, 6)}-${endDate.substring(6, 8)}` : `${ye2}-12-31`;

    try {
      const chunk = await fetchTencentKline(tencentCode, ys, ye);
      allData.push(...chunk);
      await sleep(300);
    } catch (err) {
      console.error(`[Tencent] Error:`, err instanceof Error ? err.message : err);
    }
  }

  return allData;
}

/**
 * 分年份拉取大量历史数据（腾讯优先 → CSI备用）
 */
async function fetchByYears(
  indexCode: string,
  startDate: string,  // YYYYMMDD
  endDate: string,
): Promise<KlineData[]> {
  // 如果有腾讯代码，优先用腾讯（更稳定，不容易被WAF拦截）
  const tencentCode = TENCENT_CODES[indexCode];
  if (tencentCode) {
    console.log(`[Fetch] Using Tencent API for ${indexCode}...`);
    const tencentData = await fetchTencentByYears(tencentCode, startDate, endDate);
    if (tencentData.length > 0) return tencentData;
    console.log(`[Fetch] Tencent failed, falling back to CSI for ${indexCode}...`);
  }

  // CSI作为主要/备用源
  return fetchByYearsCSI(indexCode, startDate, endDate);
}

async function fetchByYearsCSI(
  indexCode: string,
  startDate: string,
  endDate: string,
): Promise<KlineData[]> {
  const startYear = parseInt(startDate.substring(0, 4));
  const endYear = parseInt(endDate.substring(0, 4));
  const allData: KlineData[] = [];

  for (let year = startYear; year <= endYear; year++) {
    const ys = year === startYear ? startDate : `${year}0101`;
    const ye = year === endYear ? endDate : `${year}1231`;
    try {
      const items = await fetchCsiChunk(indexCode, ys, ye);
      for (const item of items) {
        allData.push(csiToKline(item));
      }
    } catch (err) {
      console.error(`[CSI] Error fetching ${indexCode} ${ys}-${ye}:`, err instanceof Error ? err.message : err);
    }
  }

  return allData;
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
  defaultStartDate: string,  // YYYYMMDD
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
    const newData = await fetchByYears(indexCode, fetchStart, endDate);

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
  console.log(`[Storage] ${storageKey}: initial fetch from ${defaultStartDate} to ${endDate}...`);
  const freshData = await fetchByYears(indexCode, defaultStartDate, endDate);
  if (freshData.length > 0) {
    saveLocalData(storageKey, freshData);
    console.log(`[Storage] ${storageKey}: saved ${freshData.length} items`);
  }
  return freshData;
}

/**
 * 获取红利低波指数数据
 */
export async function fetchDividendLowVol(startDate: string, _endDate: string) {
  return getIndexDataCached(INDEX_CODES.dividendLowVol, 'dividend_low_vol.json', startDate);
}

/**
 * 获取中证全指数据（替代万得全A）
 */
export async function fetchAllShare(startDate: string, _endDate: string) {
  return getIndexDataCached(INDEX_CODES.allShare, 'all_share.json', startDate);
}

/**
 * 获取沪深300数据
 */
export async function fetchCSI300(startDate: string, _endDate: string) {
  return getIndexDataCached(INDEX_CODES.csi300, 'csi300.json', startDate);
}
