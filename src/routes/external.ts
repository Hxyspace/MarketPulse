import { NextFunction, Request, Response, Router } from 'express';
import { CONFIG } from '../config';
import { getCmbFxReportData } from '../modules/fx/services/cmbFx';
import { generateCmbFxImage } from '../modules/fx/services/cmbFxImage';
import { sendCmbFxReport, sendDailyReport } from '../services/feishu';
import {
  generateMarketReportImage,
  getDailyReportData,
  getMarketReportImageFilename,
  MarketReportImageVariant,
} from '../services/marketReport';

const router = Router();

function getRequestToken(req: Request): string | null {
  const apiToken = req.header('x-api-token');
  if (apiToken) return apiToken.trim();

  const authorization = req.header('authorization');
  if (!authorization) return null;

  const match = /^Bearer\s+(.+)$/.exec(authorization);
  return match ? match[1].trim() : null;
}

function requireExternalApiToken(req: Request, res: Response, next: NextFunction): void {
  const expectedToken = CONFIG.externalApi.token;
  if (!expectedToken) {
    next();
    return;
  }

  if (getRequestToken(req) !== expectedToken) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  next();
}

function respondApiError(label: string, res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[API] ${label} error:`, message);
  res.status(500).json({ ok: false, error: message });
}

function parseMarketReportVariant(raw: Request['query']['variant']): MarketReportImageVariant | null {
  if (raw === undefined) return 'dashboard';
  if (typeof raw !== 'string') return null;
  return raw === 'report' || raw === 'dashboard' ? raw : null;
}

function sendPng(res: Response, filename: string, image: Buffer): void {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(image);
}

router.use(requireExternalApiToken);

router.post(['/push/barometer', '/push/market-report'], async (_req: Request, res: Response) => {
  try {
    const data = await getDailyReportData();
    await sendDailyReport(data);
    res.json({
      ok: true,
      data: {
        kind: 'market-report',
        date: data.returnDiff.date,
        pushed: true,
      },
    });
  } catch (err: unknown) {
    respondApiError('external/push/barometer', res, err);
  }
});

router.post('/push/fx', async (_req: Request, res: Response) => {
  try {
    const data = await getCmbFxReportData();
    await sendCmbFxReport(data);
    res.json({
      ok: true,
      data: {
        kind: 'cmb-fx',
        date: data.date,
        pushed: true,
      },
    });
  } catch (err: unknown) {
    respondApiError('external/push/fx', res, err);
  }
});

router.get(['/image/barometer', '/image/market-report'], async (req: Request, res: Response) => {
  try {
    const variant = parseMarketReportVariant(req.query.variant);
    if (!variant) {
      res.status(400).json({ ok: false, error: 'variant must be report or dashboard' });
      return;
    }

    const data = await getDailyReportData();
    const image = await generateMarketReportImage(data, variant);
    sendPng(res, getMarketReportImageFilename(data, variant), image);
  } catch (err: unknown) {
    respondApiError('external/image/barometer', res, err);
  }
});

router.get('/image/fx', async (_req: Request, res: Response) => {
  try {
    const data = await getCmbFxReportData();
    const image = await generateCmbFxImage(data);
    sendPng(res, `cmb-fx-${data.date}.png`, image);
  } catch (err: unknown) {
    respondApiError('external/image/fx', res, err);
  }
});

export default router;
