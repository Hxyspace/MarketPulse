import * as https from 'https';
import { CONFIG } from '../config';
import { loadLocalData, saveLocalData, needsUpdate, getLatestTradingDate } from './storage';

export interface BondIndexData {
  date: string;   // YYYY-MM-DD
  value: number;  // 指数值
}

const STORAGE_KEY = 'chinabond_net_price.json';

/**
 * 从中债信息网获取中债新综合净价指数全量历史数据（2002年至今）
 */
async function fetchFromApi(): Promise<BondIndexData[]> {
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

  const json = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const url = new URL(CONFIG.chinabond.api);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Referer': 'https://yield.chinabond.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      rejectUnauthorized: false,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse chinabond response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Chinabond request timeout')); });
    req.write(bodyStr);
    req.end();
  });

  const rawData = json['JJZS_00'] as Record<string, number> | undefined;
  if (!rawData) {
    throw new Error('Chinabond API: JJZS_00 data not found');
  }

  const result: BondIndexData[] = [];
  for (const [tsStr, value] of Object.entries(rawData)) {
    const ts = parseInt(tsStr, 10);
    // 中债返回的是北京时间0点的时间戳，直接按UTC+8解析避免日期漂移
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    // 时间戳是UTC+8的0点 = UTC的前一天16:00，需要加8小时还原
    const bjDate = new Date(ts + 8 * 3600 * 1000);
    const dateStr = bjDate.toISOString().split('T')[0];
    result.push({ date: dateStr, value });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[Chinabond] Got ${result.length} data points, from ${result[0]?.date} to ${result[result.length - 1]?.date}`);
  return result;
}

/**
 * 获取中债净价指数数据（带本地缓存）
 * 中债API返回全量数据，每天只需要拉一次
 */
export async function fetchChinabondNetPriceIndex(): Promise<BondIndexData[]> {
  const stored = loadLocalData<BondIndexData>(STORAGE_KEY);

  if (stored && stored.items.length > 0) {
    const lastDate = stored.items[stored.items.length - 1].date;

    // 如果本地数据已覆盖到最近交易日，直接返回
    if (!needsUpdate(lastDate)) {
      console.log(`[Storage] ${STORAGE_KEY}: up-to-date (${stored.items.length} items, last: ${lastDate})`);
      return stored.items;
    }

    // 如果上次拉取时的最新交易日和现在一致，不再重复拉取
    const lastUpdateDate = stored.lastUpdate?.split('T')[0];
    const latestTD = getLatestTradingDate();
    if (lastUpdateDate && lastUpdateDate >= latestTD) {
      console.log(`[Storage] ${STORAGE_KEY}: already fetched for ${latestTD}, using cached (${stored.items.length} items, last: ${lastDate})`);
      return stored.items;
    }
  }

  // 需要更新：中债API返回全量数据，直接替换
  try {
    const freshData = await fetchFromApi();
    if (freshData.length > 0) {
      saveLocalData(STORAGE_KEY, freshData);
      // 检查是否包含期望的最新日期
      const lastFetched = freshData[freshData.length - 1].date;
      if (stored && stored.items.length > 0) {
        const lastStored = stored.items[stored.items.length - 1].date;
        if (lastFetched <= lastStored) {
          console.warn(`[Chinabond] API data not updated yet (latest: ${lastFetched}, expected newer than: ${lastStored})`);
        }
      }
    }
    return freshData;
  } catch (err) {
    // 如果API失败但有本地数据，用本地数据
    if (stored && stored.items.length > 0) {
      console.warn(`[Chinabond] API failed, using cached data (${stored.items.length} items, last: ${stored.items[stored.items.length - 1].date}):`, err instanceof Error ? err.message : err);
      return stored.items;
    }
    throw err;
  }
}

/**
 * 获取最近N天的中债净价指数数据
 */
export async function getRecentBondData(days: number = 365): Promise<BondIndexData[]> {
  const allData = await fetchChinabondNetPriceIndex();
  return allData.slice(-days);
}

/**
 * 获取全部中债净价指数数据（2002年至今）
 */
export async function getAllBondData(): Promise<BondIndexData[]> {
  return fetchChinabondNetPriceIndex();
}
