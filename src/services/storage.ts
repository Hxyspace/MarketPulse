import fs from 'fs';
import path from 'path';
import { getLatestTradingDate } from '../utils/date';

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
 * 判断本地数据是否需要更新
 * 逻辑：如果本地数据最后一条 >= 最近交易日，就不需要更新
 */
export function needsUpdate(lastDataDate: string): boolean {
  return lastDataDate < getLatestTradingDate();
}

