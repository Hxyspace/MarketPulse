import * as https from 'https';
import { loadLocalData, saveLocalData, needsUpdate } from './storage';
import { tsToBjDate, getLatestTradingDate } from '../utils/date';

export interface BondYieldData {
  date: string;   // YYYY-MM-DD
  yield: number;  // 10年期国债收益率 %
}

const STORAGE_KEY = 'bond_yield_10y.json';

/**
 * 从中债信息网获取10年期国债收益率历史数据
 */
function fetchYieldFromApi(startDate: string, endDate: string): Promise<BondYieldData[]> {
  console.log(`[BondYield] Fetching ${startDate} to ${endDate}...`);
  const body = new URLSearchParams({
    bjlx: 'no',
    dcq: '10,10y;',
    startTime: startDate,
    endTime: endDate,
    qxlx: '0,',
    yqqxN: 'N',
    yqqxK: 'K',
    par: 'day',
    ycDefIds: '2c9081e50a2f9606010a3068cae70001,',
    locale: 'zh_CN',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'yield.chinabond.com.cn',
      path: '/cbweb-mn/yc/queryYz',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://yield.chinabond.com.cn/',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!Array.isArray(json) || json.length === 0 || !json[0].seriesData) {
            resolve([]);
            return;
          }
          const result: BondYieldData[] = json[0].seriesData.map((item: [number, number]) => ({
            date: tsToBjDate(item[0]),
            yield: item[1],
          }));
          result.sort((a, b) => a.date.localeCompare(b.date));
          console.log(`[BondYield] Got ${result.length} data points`);
          resolve(result);
        } catch {
          reject(new Error('Failed to parse bond yield response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Bond yield request timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * 获取10年期国债收益率数据（带本地缓存）
 */
export async function getBondYieldData(): Promise<BondYieldData[]> {
  const stored = loadLocalData<BondYieldData>(STORAGE_KEY);

  if (stored && stored.items.length > 0) {
    const lastDate = stored.items[stored.items.length - 1].date;

    if (!needsUpdate(lastDate)) {
      console.log(`[Storage] ${STORAGE_KEY}: up-to-date (${stored.items.length} items, last: ${lastDate})`);
      return stored.items;
    }

    // 增量更新：从最后一条数据日期开始（API需要至少2天范围）
    const startDate = lastDate;
    const endDate = getLatestTradingDate();

    try {
      const newData = await fetchYieldFromApi(startDate, endDate);
      if (newData.length > 0) {
        const dateSet = new Set(stored.items.map(d => d.date));
        const deduped = newData.filter(d => !dateSet.has(d.date));
        const merged = [...stored.items, ...deduped].sort((a, b) => a.date.localeCompare(b.date));
        saveLocalData(STORAGE_KEY, merged);
        console.log(`[Storage] ${STORAGE_KEY}: updated to ${merged.length} items`);
        return merged;
      } else {
        console.warn(`[BondYield] No new data returned for ${startDate} to ${endDate}`);
      }
    } catch (err) {
      console.warn('[BondYield] Incremental update failed, using cached:', err);
    }
    return stored.items;
  }

  // 首次拉取：从2010年开始（确保有足够历史计算百分位）
  try {
    const freshData = await fetchYieldFromApi('2010-01-01', getLatestTradingDate());
    if (freshData.length > 0) {
      saveLocalData(STORAGE_KEY, freshData);
    }
    return freshData;
  } catch (err) {
    if (stored && stored.items.length > 0) {
      console.warn('[BondYield] API failed, using cached data:', err);
      return stored.items;
    }
    throw err;
  }
}
