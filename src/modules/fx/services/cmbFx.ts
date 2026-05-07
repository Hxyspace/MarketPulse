import { CONFIG } from '../../../config';
import { bjDate, bjHour } from '../../../utils/date';
import { httpsJson } from '../../../services/httpClient';
import { loadLocalData, saveLocalData } from '../../../services/storage';

export const CMB_FX_UNIT = 'CNY/100';

export type CmbFxCurrencyMeta = (typeof CONFIG.cmbFx.currencies)[number];
export type CmbFxCurrencyNbr = CmbFxCurrencyMeta['nbr'];
export type CmbFxCurrencyCode = CmbFxCurrencyMeta['code'];

interface CmbFxApiResponse<T> {
  returnCode: string;
  errorMsg: string | null;
  body: T;
}

interface CmbFxRateRaw {
  ccyNbr: string;
  ccyNbrEng: string;
  rthOfr: string;
  rthBid: string;
  ratTim: string;
  ratDat: string;
}

interface CmbFxHistoryRaw {
  rthOfr: string;
  rthBid: string;
  ratDat: string;
  upTime: string;
}

export interface CmbFxRate {
  currency: CmbFxCurrencyMeta;
  spotBuy: number;
  spotSell: number;
  date: string;
  time: string;
  unit: typeof CMB_FX_UNIT;
}

export interface CmbFxHistoryPoint {
  date: string;
  spotBuy: number;
  spotSell: number;
  updatedAt: string;
}

export interface CmbFxHistorySeries {
  currency: CmbFxCurrencyMeta;
  items: CmbFxHistoryPoint[];
}

export interface CmbFxHistoryBundle {
  unit: typeof CMB_FX_UNIT;
  expectedEndDate: string;
  currencies: CmbFxHistorySeries[];
}

export interface CmbFxReportData extends CmbFxHistoryBundle {
  date: string;
  rates: CmbFxRate[];
}

function addDays(date: string, offset: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function getExpectedCmbFxHistoryEndDate(now: Date = new Date()): string {
  const today = bjDate(now);
  return bjHour(now) >= 22 ? today : addDays(today, -1);
}

function storageFile(currency: CmbFxCurrencyMeta): string {
  return `fx/cmb_fx_${currency.code.toLowerCase()}.json`;
}

function assertSuccess<T>(json: CmbFxApiResponse<T>, apiName: string): T {
  if (json.returnCode !== 'SUC0000') {
    throw new Error(`${apiName} failed: code=${json.returnCode} msg=${json.errorMsg || ''}`);
  }
  return json.body;
}

function parseFxNumber(value: string, field: string, currency: string, date: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid CMB FX ${field} for ${currency} ${date}: ${value}`);
  }
  return Math.round(n * 100) / 100;
}

function normalizeLiveDate(value: string): string {
  const m = /^(\d{4})年(\d{2})月(\d{2})日$/.exec(value);
  if (!m) throw new Error(`Invalid CMB FX live date: ${value}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function assertIsoDate(value: string, currency: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid CMB FX history date for ${currency}: ${value}`);
  }
  return value;
}

function getRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    ...extra,
  };
}

function parseRate(raw: CmbFxRateRaw, currency: CmbFxCurrencyMeta): CmbFxRate {
  const date = normalizeLiveDate(raw.ratDat);
  return {
    currency,
    spotBuy: parseFxNumber(raw.rthBid, 'rthBid', currency.nbr, date),
    spotSell: parseFxNumber(raw.rthOfr, 'rthOfr', currency.nbr, date),
    date,
    time: raw.ratTim,
    unit: CMB_FX_UNIT,
  };
}

function parseHistoryPoint(raw: CmbFxHistoryRaw, currency: CmbFxCurrencyMeta): CmbFxHistoryPoint {
  const date = assertIsoDate(raw.ratDat, currency.nbr);
  return {
    date,
    spotBuy: parseFxNumber(raw.rthBid, 'rthBid', currency.nbr, date),
    spotSell: parseFxNumber(raw.rthOfr, 'rthOfr', currency.nbr, date),
    updatedAt: raw.upTime,
  };
}

function mergeHistory(existing: CmbFxHistoryPoint[], fresh: CmbFxHistoryPoint[]): CmbFxHistoryPoint[] {
  const byDate = new Map<string, CmbFxHistoryPoint>();
  for (const item of existing) byDate.set(item.date, item);
  for (const item of fresh) byDate.set(item.date, item);
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchCmbFxRates(): Promise<CmbFxRate[]> {
  const json = await httpsJson<CmbFxApiResponse<CmbFxRateRaw[]>>(CONFIG.cmbFx.rateApi, {
    headers: getRequestHeaders({ Referer: 'https://fx.cmbchina.com/hq/' }),
  });
  const rows = assertSuccess(json, 'CMB FX rate');
  if (!Array.isArray(rows)) throw new Error('CMB FX rate response body is not an array');

  return CONFIG.cmbFx.currencies.map((currency) => {
    const raw = rows.find((row) => row.ccyNbr === currency.nbr);
    if (!raw) throw new Error(`CMB FX rate missing currency: ${currency.nbr}`);
    return parseRate(raw, currency);
  });
}

async function fetchCmbFxHistoryFromApi(
  currency: CmbFxCurrencyMeta,
  startDate: string,
  endDate: string,
): Promise<CmbFxHistoryPoint[]> {
  const body = JSON.stringify({
    nbr: currency.nbr,
    startDate,
    endDate,
    pageSize: '5000',
    pageNum: 1,
  });

  console.log(`[CMB FX] Fetching ${currency.nbr} ${startDate}-${endDate}...`);
  const json = await httpsJson<CmbFxApiResponse<CmbFxHistoryRaw[]>>(CONFIG.cmbFx.historyApi, {
    method: 'POST',
    body,
    headers: getRequestHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      Referer: `${CONFIG.cmbFx.historyPage}?nbr=${encodeURIComponent(currency.nbr)}`,
    }),
  });

  const rows = assertSuccess(json, 'CMB FX history');
  if (!Array.isArray(rows)) throw new Error('CMB FX history response body is not an array');

  return mergeHistory([], rows.map((row) => parseHistoryPoint(row, currency)))
    .filter((item) => item.date >= startDate && item.date <= endDate);
}

export async function getCmbFxHistory(
  currency: CmbFxCurrencyMeta,
  endDate: string = getExpectedCmbFxHistoryEndDate(),
): Promise<CmbFxHistoryPoint[]> {
  const filename = storageFile(currency);
  const stored = loadLocalData<CmbFxHistoryPoint>(filename);

  if (stored && stored.items.length > 0) {
    const localItems = mergeHistory([], stored.items);
    const lastDate = localItems[localItems.length - 1].date;
    if (lastDate >= endDate) {
      console.log(`[CMB FX] ${filename}: up-to-date (${localItems.length} items, last: ${lastDate})`);
      return localItems.filter((item) => item.date <= endDate);
    }

    const fresh = await fetchCmbFxHistoryFromApi(currency, lastDate, endDate);
    if (fresh.length === 0) {
      console.warn(`[CMB FX] ${filename}: no new history returned for ${lastDate}-${endDate}`);
      return localItems;
    }

    const merged = mergeHistory(localItems, fresh);
    saveLocalData(filename, merged, merged[merged.length - 1].date);
    console.log(`[CMB FX] ${filename}: updated to ${merged.length} items`);
    return merged.filter((item) => item.date <= endDate);
  }

  const fresh = await fetchCmbFxHistoryFromApi(currency, CONFIG.cmbFx.historyStartDate, endDate);
  if (fresh.length === 0) {
    throw new Error(`CMB FX history returned no data for ${currency.nbr}`);
  }
  saveLocalData(filename, fresh, fresh[fresh.length - 1].date);
  console.log(`[CMB FX] ${filename}: saved ${fresh.length} items`);
  return fresh;
}

export async function getCmbFxHistoryBundle(): Promise<CmbFxHistoryBundle> {
  const expectedEndDate = getExpectedCmbFxHistoryEndDate();
  const currencies = await Promise.all(
    CONFIG.cmbFx.currencies.map(async (currency) => ({
      currency,
      items: await getCmbFxHistory(currency, expectedEndDate),
    })),
  );

  return {
    unit: CMB_FX_UNIT,
    expectedEndDate,
    currencies,
  };
}

export async function getCmbFxReportData(): Promise<CmbFxReportData> {
  const [rates, history] = await Promise.all([
    fetchCmbFxRates(),
    getCmbFxHistoryBundle(),
  ]);

  return {
    ...history,
    date: bjDate(),
    rates,
  };
}
