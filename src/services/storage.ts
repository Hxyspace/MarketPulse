import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export interface StoredData<T> {
  items: T[];
  lastUpdate: string; // ISO date string
}

/**
 * 读取本地存储的数据
 */
export function loadLocalData<T>(filename: string): StoredData<T> | null {
  ensureDir();
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 保存数据到本地
 */
export function saveLocalData<T>(filename: string, items: T[], lastUpdate?: string): void {
  ensureDir();
  const filepath = path.join(DATA_DIR, filename);
  const data: StoredData<T> = {
    items,
    lastUpdate: lastUpdate || new Date().toISOString(),
  };
  fs.writeFileSync(filepath, JSON.stringify(data), 'utf-8');
}

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
export function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * 获取今天的日期字符串 YYYYMMDD
 */
export function getTodayCompact(): string {
  return getTodayStr().replace(/-/g, '');
}

/**
 * 获取当前北京时间的小时数
 */
function getBeijingHour(): number {
  const now = new Date();
  return (now.getUTCHours() + 8) % 24;
}

/**
 * 判断当前时间是否已过8点（交易日数据更新时间）
 */
export function isPastUpdateTime(): boolean {
  return getBeijingHour() >= 8;
}

/**
 * 判断当前时间是否已过数据更新（20:00北京时间，数据源通常在晚间更新完毕）
 */
export function isPastDataUpdate(): boolean {
  return getBeijingHour() >= 20;
}

/**
 * 判断给定日期是否是交易日（排除周末，不排除节假日）
 */
export function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * 获取最近的交易日（如果今天是周末则回退到周五）
 */
export function getLatestTradingDate(): string {
  const now = new Date();
  const bjHour = getBeijingHour();
  // 晚上8点前，最新可用数据是前一天的（数据源通常晚间更新）
  let d = new Date(now.toISOString().split('T')[0] + 'T00:00:00Z');
  if (bjHour < 20) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  // 回退到最近的工作日
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

/**
 * 判断本地数据是否需要更新
 * 逻辑：如果本地数据最后一条 >= 最近交易日，就不需要更新
 */
export function needsUpdate(lastDataDate: string): boolean {
  const latestTradingDate = getLatestTradingDate();
  return lastDataDate < latestTradingDate;
}

/**
 * 找出缺失的日期范围
 * 返回需要补充的起始日期（YYYYMMDD格式）
 */
export function findMissingStartDate(
  existingDates: string[],  // YYYY-MM-DD
  expectedStartDate: string, // YYYY-MM-DD
): string | null {
  if (existingDates.length === 0) return expectedStartDate.replace(/-/g, '');

  const sorted = [...existingDates].sort();
  const lastDate = sorted[sorted.length - 1];

  // 使用智能判断：本地数据是否已覆盖到最近交易日
  if (!needsUpdate(lastDate)) {
    return null;
  }

  // 从最后一条数据的下一天开始补充
  const nextDay = new Date(lastDate);
  nextDay.setDate(nextDay.getDate() + 1);
  return nextDay.toISOString().split('T')[0].replace(/-/g, '');
}
