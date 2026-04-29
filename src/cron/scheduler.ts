import cron from 'node-cron';
import { CONFIG } from '../config';
import { getDividendCompassLatest } from '../calculators/dividendCompass';
import { getBondBarometerLatest, getPrevBondStatus } from '../calculators/bondBarometer';
import { getFundThermometerLatest, getPrevFundStatus } from '../calculators/fundThermometer';
import { sendDailyReport } from '../services/feishu';

export function startScheduler() {
  console.log(`[Cron] Scheduling daily report: ${CONFIG.cron.dailyReport}`);

  cron.schedule(CONFIG.cron.dailyReport, async () => {
    console.log(`[Cron] Running daily report at ${new Date().toISOString()}`);

    try {
      // 并行获取最新数据（storage层会自动增量更新）
      const [returnDiff, bondBarometer, thermometer] = await Promise.all([
        getDividendCompassLatest(),
        getBondBarometerLatest(),
        getFundThermometerLatest(),
      ]);

      const prevDiff = returnDiff.history.length >= 2 ? returnDiff.history[returnDiff.history.length - 2] : null;

      await sendDailyReport({
        returnDiff: {
          date: returnDiff.latest.date,
          diff: returnDiff.latest.diff,
          status: returnDiff.latest.status,
          statusKind: returnDiff.latest.statusKind,
          prevStatusKind: prevDiff?.statusKind || '',
          divReturn: returnDiff.latest.dividendReturn40d,
          allReturn: returnDiff.latest.allShareReturn40d,
        },
        bondWeather: {
          date: bondBarometer.latest.date,
          weather: bondBarometer.latest.weather,
          value: bondBarometer.latest.value,
          change: bondBarometer.latest.change,
          temperature: bondBarometer.temperature.value,
          status: bondBarometer.temperature.status,
          statusKind: bondBarometer.temperature.statusKind,
          prevStatusKind: getPrevBondStatus(bondBarometer),
        },
        thermometer: {
          date: thermometer.date,
          temperature: thermometer.temperature,
          status: thermometer.status,
          statusKind: thermometer.statusKind,
          prevStatusKind: getPrevFundStatus(thermometer),
          pe: thermometer.pe,
          bondYield: thermometer.bondYield,
          erp: thermometer.erp,
        },
        diffHistory: returnDiff.history.map(h => ({ date: h.date, diff: h.diff })),
        bondHistory: bondBarometer.history.map(h => ({ date: h.date, value: h.value })),
        erpHistory: thermometer.erpHistory.map(h => ({ date: h.date, erp: h.erp, close: h.close })),
      });

      console.log('[Cron] Daily report sent successfully');
    } catch (err) {
      console.error('[Cron] Daily report failed:', err);
    }
  }, {
    timezone: 'Asia/Shanghai',
  });
}
