import cron from 'node-cron';
import { CONFIG } from '../config';
import { sendCmbFxReport, sendDailyReport } from '../services/feishu';
import { getDailyReportData } from '../services/marketReport';

export function startScheduler() {
  console.log(`[Cron] Scheduling daily report: ${CONFIG.cron.dailyReport}`);
  console.log(`[Cron] Scheduling CMB FX report: ${CONFIG.cron.cmbFxReport}`);

  cron.schedule(CONFIG.cron.dailyReport, async () => {
    console.log(`[Cron] Running daily report at ${new Date().toISOString()}`);

    try {
      await sendDailyReport(await getDailyReportData());

      console.log('[Cron] Daily report sent successfully');
    } catch (err) {
      console.error('[Cron] Daily report failed:', err);
    }
  }, {
    timezone: 'Asia/Shanghai',
  });

  cron.schedule(CONFIG.cron.cmbFxReport, async () => {
    console.log(`[Cron] Running CMB FX report at ${new Date().toISOString()}`);

    try {
      await sendCmbFxReport();
      console.log('[Cron] CMB FX report sent successfully');
    } catch (err) {
      console.error('[Cron] CMB FX report failed:', err);
    }
  }, {
    timezone: 'Asia/Shanghai',
  });
}
