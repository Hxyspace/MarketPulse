import { Router, Request, Response } from 'express';
import { fetchCmbFxRates, getCmbFxHistoryBundle } from './services/cmbFx';

const router = Router();

// 招商银行实时汇率（同源后端中转，避免浏览器跨域）
router.get('/rate', async (_req: Request, res: Response) => {
  try {
    const data = await fetchCmbFxRates();
    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API] fx/rate error:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

// 招商银行历史汇率：本地 JSON 增量缓存后读取
router.get('/history', async (_req: Request, res: Response) => {
  try {
    const data = await getCmbFxHistoryBundle();
    res.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[API] fx/history error:', message);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
