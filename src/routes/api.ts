import { Router, Request, Response } from 'express';
import { getDividendCompassLatest, getDividendCompassByDate } from '../calculators/dividendCompass';
import { getBondBarometerLatest, getBondBarometerByDate } from '../calculators/bondBarometer';
import { getFundThermometerLatest, getFundThermometerByDate } from '../calculators/fundThermometer';

const router = Router();

function isValidDate(d: string | undefined): d is string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  // 反查实际日期，挡掉 2025-02-30 等格式合规但不存在的日期
  const dt = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
}

// 40日收益差数据
router.get('/return-diff', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    const data = isValidDate(date)
      ? await getDividendCompassByDate(date)
      : await getDividendCompassLatest();
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
    const data = isValidDate(date)
      ? await getBondBarometerByDate(date)
      : await getBondBarometerLatest();
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
    const data = isValidDate(date)
      ? await getFundThermometerByDate(date)
      : await getFundThermometerLatest();
    if (!data) {
      res.status(404).json({ ok: false, error: '该日期无数据' });
      return;
    }
    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API] fund-thermometer error:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

// 占位端点：兼容前端 Refresh 按钮。服务端无内存缓存，文件级缓存由 needsUpdate 自动管理；
// 前端调完此端点后会重新 fetch 三大模块，效果等同于"重新渲染"。
// 如需强制重新拉外部数据源，需手动删除 src/data/*.json。
router.post('/refresh', (_req: Request, res: Response) => {
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

    const [returnDiffResult, bondResult, fund] = await Promise.all([
      getDividendCompassByDate(date).catch(() => null),
      getBondBarometerByDate(date).catch(() => null),
      getFundThermometerByDate(date).catch(() => null),
    ]);

    res.json({
      ok: true,
      data: {
        queryDate: date,
        returnDiff: returnDiffResult?.latest || null,
        bond: bondResult ? {
          date: bondResult.latest.date,
          value: bondResult.latest.value,
          change: bondResult.latest.change,
          weather: bondResult.latest.weather,
          temperature: bondResult.temperature,
        } : null,
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
