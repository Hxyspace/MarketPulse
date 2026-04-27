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
 * 获取当前北京时间的小时数
 */
function getBeijingHour(): number {
  const now = new Date();
  return (now.getUTCHours() + 8) % 24;
}

/**
 * 获取最近的交易日（如果今天是周末则回退到周五）
 */
export function getLatestTradingDate(): string {
  const now = new Date();
  const bjHour = getBeijingHour();
  // 晚上6点前，最新可用数据是前一天的（数据源通常晚间更新）
  let d = new Date(now.toISOString().split('T')[0] + 'T00:00:00Z');
  if (bjHour < 18) {
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

