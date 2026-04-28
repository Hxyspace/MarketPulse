/**
 * 北京时间相关工具函数。
 * 所有"取当下日期/小时"以及"时间戳→北京交易日"的逻辑统一在此处。
 */

const BJ_TZ = 'Asia/Shanghai';

const BJ_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BJ_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const BJ_HOUR_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: BJ_TZ,
  hour: '2-digit',
  hour12: false,
});

/** 给定时刻（默认 now）的北京日期，YYYY-MM-DD */
export function bjDate(d: Date = new Date()): string {
  return BJ_DATE_FMT.format(d);
}

/** 给定时刻（默认 now）的北京小时 0-23 */
export function bjHour(d: Date = new Date()): number {
  return parseInt(BJ_HOUR_FMT.format(d), 10) % 24;
}

/**
 * 把"北京零点时间戳"（中债等 API 使用，等价于 UTC 前一日 16:00）
 * 转成 YYYY-MM-DD 形式的北京交易日。
 */
export function tsToBjDate(ts: number): string {
  return new Date(ts + 8 * 3600 * 1000).toISOString().split('T')[0];
}

/**
 * 最近交易日：北京 18:00 之前取昨日（数据源通常晚间更新），
 * 再回退到最近的工作日。
 */
export function getLatestTradingDate(now: Date = new Date()): string {
  const d = new Date(bjDate(now) + 'T00:00:00Z');
  if (bjHour(now) < 18) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().split('T')[0];
}
