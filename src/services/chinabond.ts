import { CONFIG } from '../config';
import { loadLocalData, saveLocalData, needsUpdate } from './storage';
import { tsToBjDate, getLatestTradingDate } from '../utils/date';
import { httpsJson } from './httpClient';

export interface BondIndexData {
  date: string;   // YYYY-MM-DD
  value: number;  // 指数值
}

const STORAGE_KEY = 'chinabond_net_price.json';

interface ChinabondResponse {
  JJZS_00?: Record<string, number>;
}

/**
 * 从中债信息网获取中债新综合净价指数全量历史数据（2002年至今）
 */
async function fetchChinabondFromApi(): Promise<BondIndexData[]> {
  console.log('[Chinabond] Fetching full history from API...');
  const bodyStr = new URLSearchParams({
    indexid: CONFIG.chinabond.indexId,
    qxlxt: '00',
    ltcslx: '',
    zslxt: 'JJZS',
    zslxt1: '',
    lx: '1',
    locale: 'zh_CN',
  }).toString();

  const json = await httpsJson<ChinabondResponse>(CONFIG.chinabond.api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://yield.chinabond.com.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    body: bodyStr,
    rejectUnauthorized: false,
  });

  const rawData = json.JJZS_00;
  if (!rawData) {
    throw new Error('Chinabond API: JJZS_00 data not found');
  }

  const result: BondIndexData[] = [];
  for (const [tsStr, value] of Object.entries(rawData)) {
    result.push({ date: tsToBjDate(parseInt(tsStr, 10)), value });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[Chinabond] Got ${result.length} data points, from ${result[0]?.date} to ${result[result.length - 1]?.date}`);
  return result;
}

/**
 * 获取指定日期范围的中债净价指数（内部全量拉取，返回截取范围）
 */
async function fetchBondIndexByRange(startDate: string, endDate: string): Promise<BondIndexData[]> {
  console.log(`[Chinabond] Fetching ${startDate} to ${endDate}...`);
  const allData = await fetchChinabondFromApi();
  return allData.filter(d => d.date >= startDate && d.date <= endDate);
}

/**
 * 获取中债净价指数数据（带本地缓存，增量合并保存）
 */
async function getChinabondData(): Promise<BondIndexData[]> {
  const stored = loadLocalData<BondIndexData>(STORAGE_KEY);

  if (stored && stored.items.length > 0) {
    const lastDate = stored.items[stored.items.length - 1].date;

    if (!needsUpdate(lastDate)) {
      console.log(`[Storage] ${STORAGE_KEY}: up-to-date (${stored.items.length} items, last: ${lastDate})`);
      return stored.items;
    }

    // 增量更新：从最后日期开始拉取新数据
    const endDate = getLatestTradingDate();
    try {
      const newData = await fetchBondIndexByRange(lastDate, endDate);
      if (newData.length > 0) {
        const dateSet = new Set(stored.items.map(d => d.date));
        const deduped = newData.filter(d => !dateSet.has(d.date));
        const merged = [...stored.items, ...deduped].sort((a, b) => a.date.localeCompare(b.date));
        saveLocalData(STORAGE_KEY, merged);
        console.log(`[Storage] ${STORAGE_KEY}: updated to ${merged.length} items (+${deduped.length} new)`);
        return merged;
      } else {
        console.warn(`[Chinabond] No new data returned for ${lastDate} to ${endDate}`);
      }
    } catch (err) {
      console.warn('[Chinabond] Incremental update failed, using cached:', err instanceof Error ? err.message : err);
    }
    return stored.items;
  }

  // 首次拉取全量
  try {
    const freshData = await fetchChinabondFromApi();
    if (freshData.length > 0) {
      saveLocalData(STORAGE_KEY, freshData);
    }
    return freshData;
  } catch (err) {
    if (stored && stored.items.length > 0) {
      console.warn('[Chinabond] API failed, using cached data:', err);
      return stored.items;
    }
    throw err;
  }
}

/**
 * 获取指定日期范围的中债净价指数数据
 */
export async function getBondDataByRange(startDate: string, endDate: string): Promise<BondIndexData[]> {
  const allData = await getChinabondData();
  return allData.filter(d => d.date >= startDate && d.date <= endDate);
}

/**
 * 获取最近N天的中债净价指数数据
 */
export async function getRecentBondData(days: number = 365): Promise<BondIndexData[]> {
  const allData = await getChinabondData();
  return allData.slice(-days);
}

/**
 * 获取全部中债净价指数数据（2002年至今）
 */
export async function getAllBondData(): Promise<BondIndexData[]> {
  return getChinabondData();
}
