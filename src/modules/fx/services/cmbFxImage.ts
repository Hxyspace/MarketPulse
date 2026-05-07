import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import * as echarts from 'echarts';
import { CmbFxHistorySeries, CmbFxRate, CmbFxReportData } from './cmbFx';

const W = 800;

const ACCENT = '#0067c0';
const RED = '#c42b1c';
const GREEN = '#107c10';
const TEXT = '#1b1b1b';
const TEXT_SEC = '#5c5c5c';
const TEXT_DIM = '#8c8c8c';

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint?: string) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.04)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  drawRoundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  if (tint) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, tint);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    drawRoundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  drawRoundRect(ctx, x, y, w, h, 16);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawAccentLine(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color1: string, color2: string) {
  ctx.save();
  drawRoundRect(ctx, x, y, w, 16, 16);
  ctx.clip();
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, 3);
  ctx.restore();
}

function formatRate(value: number): string {
  return value.toFixed(2);
}

function renderFxLineChartToBuffer(chartW: number, chartH: number, series: CmbFxHistorySeries): Buffer {
  const canvas = createCanvas(chartW, chartH);
  const chart = echarts.init(canvas as any);
  const startPct = Math.max(0, Math.round((1 - 183 / Math.max(series.items.length, 1)) * 100));

  chart.setOption({
    animation: false,
    grid: { left: 50, right: 20, top: 36, bottom: 28 },
    legend: {
      top: 4,
      right: 0,
      textStyle: { fontSize: 10, color: TEXT_SEC },
      itemWidth: 14,
      itemHeight: 2,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0ddd8' } },
      axisTick: { show: false },
      axisLabel: { fontSize: 9, color: TEXT_DIM },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: 'CNY/100',
      nameTextStyle: { color: TEXT_DIM, fontSize: 10, padding: [0, 32, 0, 0] },
      splitLine: { lineStyle: { color: '#f0eeeb', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: TEXT_DIM },
    },
    dataZoom: [{ type: 'inside', start: startPct, end: 100 }],
    series: [
      {
        name: '现汇买入',
        type: 'line',
        data: series.items.map((item) => [item.date, item.spotBuy]),
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { width: 1.5, color: GREEN },
        itemStyle: { color: GREEN },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#107c1020' },
            { offset: 1, color: '#107c1003' },
          ]),
        },
      },
      {
        name: '现汇卖出',
        type: 'line',
        data: series.items.map((item) => [item.date, item.spotSell]),
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { width: 1.5, color: RED },
        itemStyle: { color: RED },
      },
    ],
  });

  const buf = (canvas as unknown as { toBuffer(mime: string): Buffer }).toBuffer('image/png');
  chart.dispose();
  return buf;
}

function drawSectionHeader(ctx: CanvasRenderingContext2D, y: number, num: string, title: string, subtitle: string) {
  ctx.fillStyle = ACCENT;
  ctx.font = '600 12px "Segoe UI", "Microsoft YaHei", sans-serif';
  drawRoundRect(ctx, 36, y, 22, 20, 6);
  ctx.fillStyle = 'rgba(0,103,192,0.06)';
  ctx.fill();
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'center';
  ctx.fillText(num, 47, y + 14);
  ctx.textAlign = 'left';

  ctx.fillStyle = TEXT;
  ctx.font = '600 16px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText(title, 66, y + 15);

  ctx.fillStyle = TEXT_DIM;
  ctx.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(subtitle, W - 36, y + 15);
  ctx.textAlign = 'left';
}

function requireRate(data: CmbFxReportData, code: string): CmbFxRate {
  const rate = data.rates.find((item) => item.currency.code === code);
  if (!rate) throw new Error(`CMB FX report missing live rate: ${code}`);
  return rate;
}

function drawRateCard(
  ctx: CanvasRenderingContext2D,
  rate: CmbFxRate,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: [string, string],
) {
  drawCard(ctx, x, y, w, h, 'rgba(0,103,192,0.02)');
  drawAccentLine(ctx, x, y, w, accent[0], accent[1]);

  ctx.fillStyle = TEXT;
  ctx.font = '700 20px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText(rate.currency.label, x + 24, y + 38);

  ctx.fillStyle = TEXT_DIM;
  ctx.font = '11px "Cascadia Code", "Consolas", monospace';
  ctx.fillText(`${rate.unit} · ${rate.date} ${rate.time}`, x + 24, y + 58);

  const colW = (w - 60) / 2;
  const sellX = x + 24;
  const buyX = sellX + colW + 12;
  const labelY = y + 92;
  const valueY = y + 128;

  ctx.fillStyle = TEXT_DIM;
  ctx.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText('现汇卖出', sellX, labelY);
  ctx.fillText('现汇买入', buyX, labelY);

  ctx.font = '700 30px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = RED;
  ctx.fillText(formatRate(rate.spotSell), sellX, valueY);
  ctx.fillStyle = GREEN;
  ctx.fillText(formatRate(rate.spotBuy), buyX, valueY);

  ctx.fillStyle = TEXT_DIM;
  ctx.font = '11px "Cascadia Code", "Consolas", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`点差 ${formatRate(rate.spotSell - rate.spotBuy)}`, x + w - 24, y + 58);
  ctx.textAlign = 'left';
}

export async function generateCmbFxImage(data: CmbFxReportData): Promise<Buffer> {
  const chartH = 280;
  const chartCount = data.currencies.length;
  const H = 250 + chartCount * (chartH + 70) + 50;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bgGrad.addColorStop(0, '#faf8f6');
  bgGrad.addColorStop(0.4, '#f0eee9');
  bgGrad.addColorStop(1, '#edeae5');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(252,251,249,0.92)';
  ctx.fillRect(0, 0, W, 52);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 52); ctx.lineTo(W, 52); ctx.stroke();

  ctx.fillStyle = ACCENT;
  ctx.font = '600 14px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText('Market', 36, 32);
  ctx.fillStyle = TEXT;
  ctx.fillText(' Pulse', 36 + ctx.measureText('Market').width, 32);

  const titleEnd = 36 + ctx.measureText('Market Pulse').width + 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath(); ctx.moveTo(titleEnd, 18); ctx.lineTo(titleEnd, 34); ctx.stroke();
  ctx.fillStyle = TEXT_DIM;
  ctx.font = '12px "Cascadia Code", "Consolas", monospace';
  ctx.fillText(`${data.date} · CMB FX`, titleEnd + 14, 32);

  let sectionY = 72;
  drawSectionHeader(ctx, sectionY, 'FX', '招商银行实时汇率', '现汇买入 / 卖出 · 单位 100');
  sectionY += 30;

  const cardX = 36;
  const gap = 16;
  const cardW = (W - cardX * 2 - gap) / 2;
  const rateCardH = 150;
  drawRateCard(ctx, requireRate(data, 'USD'), cardX, sectionY, cardW, rateCardH, [GREEN, '#62b5f6']);
  drawRateCard(ctx, requireRate(data, 'HKD'), cardX + cardW + gap, sectionY, cardW, rateCardH, [ACCENT, '#62b5f6']);
  sectionY += rateCardH + 28;

  const fullCardW = W - cardX * 2;
  for (const series of data.currencies) {
    drawSectionHeader(ctx, sectionY, '—', `${series.currency.label} 历史汇率`, '现汇买入 vs 现汇卖出');
    sectionY += 30;

    const chartBuf = renderFxLineChartToBuffer(fullCardW, chartH, series);
    const chartImg = await loadImage(chartBuf);
    drawCard(ctx, cardX, sectionY, fullCardW, chartH + 16);
    ctx.drawImage(chartImg, cardX, sectionY + 8, fullCardW, chartH);
    sectionY += chartH + 16 + 24;
  }

  ctx.fillStyle = TEXT_DIM;
  ctx.font = '11px "Cascadia Code", "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Market Pulse · CMB FX auto-generated report', W / 2, H - 16);
  ctx.textAlign = 'left';

  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  return canvas.toBuffer('image/png');
}
