import { Router, Request, Response } from 'express';
import { getDividendCompassData, getDividendCompassByDate } from '../calculators/dividendCompass';
import { getBondBarometer, getBondByDate, getBondWeather } from '../calculators/bondBarometer';
import { getFundThermometer, getFundThermometerByDate } from '../calculators/fundThermometer';

const router = Router();

// 缓存
let cache: Record<string, { data: unknown; ts: number }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (cache[key] && now - cache[key].ts < CACHE_TTL) {
    return cache[key].data as T;
  }
  const data = await fetcher();
  cache[key] = { data, ts: now };
  return data;
}

function isValidDate(d: string | undefined): d is string {
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

// 40日收益差数据
router.get('/return-diff', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    const data = await withCache('returnDiff', getDividendCompassData);
    if (isValidDate(date)) {
      let latest = data.latest;
      for (const r of data.history) {
        if (r.date <= date) latest = r;
        else break;
      }
      res.json({ ok: true, data: { ...data, latest } });
      return;
    }
    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API] return-diff error:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

// 债市晴雨表数据
router.get('/bond-barometer', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    const data = await withCache('bondBarometer', getBondBarometer);
    if (isValidDate(date)) {
      const bondByDate = await getBondByDate(date);
      if (bondByDate) {
        // 从缓存的完整历史中计算选中日期附近的天气
        const history = data.history;
        let targetIdx = history.length - 1;
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].date <= date) { targetIdx = i; break; }
        }
        const recentDays: typeof data.recentDays = [];
        const start = Math.max(1, targetIdx - 29);
        for (let i = start; i <= targetIdx; i++) {
          const dayChange = history[i].value - history[i - 1].value;
          recentDays.push({
            date: history[i].date,
            value: history[i].value,
            change: Math.round(dayChange * 10000) / 10000,
            weather: getBondWeather(dayChange),
          });
        }
        res.json({
          ok: true,
          data: {
            latest: {
              date: bondByDate.date,
              value: bondByDate.value,
              change: bondByDate.change,
              changePercent: 0,
              weather: bondByDate.weather,
            },
            temperature: bondByDate.temperature,
            history,
            recentDays,
          },
        });
        return;
      }
    }
    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API] bond-barometer error:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

// 基金温度计数据
router.get('/fund-thermometer', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    if (isValidDate(date)) {
      const result = await getFundThermometerByDate(date);
      if (result) {
        res.json({ ok: true, data: result });
        return;
      }
    }
    const data = await withCache('fundThermometer', getFundThermometer);
    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API] fund-thermometer error:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

// 清除缓存
router.post('/refresh', (_req: Request, res: Response) => {
  cache = {};
  res.json({ ok: true, message: 'Cache cleared' });
});

// 指定日期查询（独立API）
router.get('/query', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ ok: false, error: '请提供有效日期，格式：YYYY-MM-DD' });
      return;
    }

    const [returnDiff, bond, fund] = await Promise.all([
      getDividendCompassByDate(date).catch(() => null),
      getBondByDate(date).catch(() => null),
      getFundThermometerByDate(date).catch(() => null),
    ]);

    res.json({
      ok: true,
      data: {
        queryDate: date,
        returnDiff,
        bond,
        fund,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API] query error:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
