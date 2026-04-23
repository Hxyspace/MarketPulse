import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import * as echarts from 'echarts';

export interface ReportData {
  date: string;
  returnDiff: { diff: number; compass: string };
  bondWeather: { weather: string; value: number; change: number; temperature: number };
  thermometer: { temperature: number; status: string; pe: number; bondYield: number; erp: number };
}

const W = 800;
const H = 520;

// Win11 Mica light theme
const BG = '#f5f3f0';
const CARD_BG = '#ffffff';
const BORDER = 'rgba(0,0,0,0.08)';
const TEXT = '#1b1b1b';
const TEXT_SEC = '#5c5c5c';
const TEXT_DIM = '#8c8c8c';
const ACCENT = '#0067c0';
const RED = '#c42b1c';
const GREEN = '#107c10';
const AMBER = '#c47f00';
const BLUE = '#0067c0';

// Card accent colors (gradient pairs)
const CARD_ACCENTS = [
  ['#0067c0', '#62b5f6'],  // 红利罗盘 - blue accent
  ['#107c10', '#34a853'],  // 债市晴雨表 - green
  ['#0067c0', '#4ea8de'],  // 基金温度计 - blue
];

// Card tint backgrounds
const CARD_TINTS = [
  'rgba(0,103,192,0.02)',
  'rgba(16,124,16,0.02)',
  'rgba(0,103,192,0.02)',
];

function tempColor(v: number): string {
  return v >= 80 ? RED : v <= 30 ? GREEN : AMBER;
}

function diffColor(v: number): string {
  return v > 5 ? RED : v < -5 ? GREEN : ACCENT;
}

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

function renderGaugeToBuffer(value: number, min: number, max: number, color: string): Buffer {
  const size = 160;
  const canvas = createCanvas(size, size);
  const chart = echarts.init(canvas as any);

  chart.setOption({
    animation: false,
    series: [{
      type: 'gauge',
      center: ['50%', '58%'],
      radius: '88%',
      startAngle: 210,
      endAngle: -30,
      min, max,
      splitNumber: 5,
      axisLine: {
        lineStyle: {
          width: 14,
          color: [
            [0.3, GREEN],
            [0.8, AMBER],
            [1, RED],
          ],
        },
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '48%',
        width: 4,
        itemStyle: { color },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        formatter: (v: number) => v.toFixed(1),
        fontSize: 18,
        fontWeight: 'bold' as const,
        color: TEXT,
        offsetCenter: [0, '68%'],
      },
      title: { show: false },
      data: [{ value }],
    }],
  });

  const buf = (canvas as unknown as { toBuffer(mime: string): Buffer }).toBuffer('image/png');
  chart.dispose();
  return buf;
}

export async function generateReportImage(data: ReportData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Mica-style gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bgGrad.addColorStop(0, '#faf8f6');
  bgGrad.addColorStop(0.4, '#f0eee9');
  bgGrad.addColorStop(1, '#edeae5');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Header bar - acrylic style
  ctx.fillStyle = 'rgba(252,251,249,0.92)';
  ctx.fillRect(0, 0, W, 52);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 52);
  ctx.lineTo(W, 52);
  ctx.stroke();

  // Title
  ctx.fillStyle = ACCENT;
  ctx.font = '600 14px "Segoe UI", "Microsoft YaHei", sans-serif';
  const titlePrefix = 'Market';
  ctx.fillText(titlePrefix, 36, 32);
  ctx.fillStyle = TEXT;
  ctx.fillText(' Pulse', 36 + ctx.measureText(titlePrefix).width, 32);

  // Divider
  const titleEnd = 36 + ctx.measureText('Market Pulse').width + 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath();
  ctx.moveTo(titleEnd, 18);
  ctx.lineTo(titleEnd, 34);
  ctx.stroke();

  // Date
  ctx.fillStyle = TEXT_DIM;
  ctx.font = '12px "Cascadia Code", "Consolas", monospace';
  ctx.fillText(data.date, titleEnd + 14, 32);

  // 三个卡片
  const cards = [
    {
      label: '红利罗盘',
      value: `${data.returnDiff.diff > 0 ? '+' : ''}${data.returnDiff.diff}%`,
      valueColor: diffColor(data.returnDiff.diff),
      status: data.returnDiff.compass,
      detail: `40日收益差`,
      gaugeValue: data.returnDiff.diff,
      gaugeMin: -15,
      gaugeMax: 15,
    },
    {
      label: '债市晴雨表',
      value: `${data.bondWeather.temperature}℃`,
      valueColor: tempColor(data.bondWeather.temperature),
      status: data.bondWeather.weather,
      detail: `净价 ${data.bondWeather.value.toFixed(2)} (${data.bondWeather.change > 0 ? '+' : ''}${data.bondWeather.change})`,
      gaugeValue: data.bondWeather.temperature,
      gaugeMin: 0,
      gaugeMax: 100,
    },
    {
      label: '基金温度计',
      value: `${data.thermometer.temperature}℃`,
      valueColor: tempColor(data.thermometer.temperature),
      status: data.thermometer.status.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim(),
      detail: `PE ${data.thermometer.pe} · 国债 ${data.thermometer.bondYield}% · ERP ${data.thermometer.erp}%`,
      gaugeValue: data.thermometer.temperature,
      gaugeMin: 0,
      gaugeMax: 100,
    },
  ];

  const cardW = 232;
  const cardH = 340;
  const gap = 20;
  const startX = (W - (cardW * 3 + gap * 2)) / 2;
  const startY = 76;

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const x = startX + i * (cardW + gap);
    const y = startY;

    // Card shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.04)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    drawRoundRect(ctx, x, y, cardW, cardH, 16);
    ctx.fillStyle = CARD_BG;
    ctx.fill();
    ctx.restore();

    // Card tint gradient overlay
    ctx.save();
    const tintGrad = ctx.createLinearGradient(x, y, x, y + cardH);
    tintGrad.addColorStop(0, CARD_TINTS[i]);
    tintGrad.addColorStop(1, 'rgba(255,255,255,0)');
    drawRoundRect(ctx, x, y, cardW, cardH, 16);
    ctx.fillStyle = tintGrad;
    ctx.fill();
    ctx.restore();

    // Card border
    drawRoundRect(ctx, x, y, cardW, cardH, 16);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Top accent gradient line
    ctx.save();
    ctx.beginPath();
    drawRoundRect(ctx, x, y, cardW, 16, 16);
    ctx.clip();
    const accentGrad = ctx.createLinearGradient(x, y, x + cardW, y);
    accentGrad.addColorStop(0, CARD_ACCENTS[i][0]);
    accentGrad.addColorStop(1, CARD_ACCENTS[i][1]);
    ctx.fillStyle = accentGrad;
    ctx.fillRect(x, y, cardW, 3);
    ctx.restore();

    // Label
    ctx.fillStyle = TEXT_DIM;
    ctx.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(c.label, x + 24, y + 30);

    // Gauge
    const gaugeBuf = renderGaugeToBuffer(c.gaugeValue, c.gaugeMin, c.gaugeMax, c.valueColor);
    const gaugeImg = await loadImage(gaugeBuf);
    ctx.drawImage(gaugeImg, x + (cardW - 160) / 2, y + 44, 160, 160);

    // Value
    ctx.fillStyle = c.valueColor;
    ctx.font = 'bold 26px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.value, x + cardW / 2, y + 240);

    // Status
    ctx.fillStyle = TEXT_SEC;
    ctx.font = '14px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(c.status, x + cardW / 2, y + 268);

    // Detail
    ctx.fillStyle = TEXT_DIM;
    ctx.font = '11px "Cascadia Code", "Consolas", monospace';
    ctx.fillText(c.detail, x + cardW / 2, y + 300);

    ctx.textAlign = 'left';
  }

  // Footer
  ctx.fillStyle = TEXT_DIM;
  ctx.font = '11px "Cascadia Code", "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Market Pulse · Auto-generated daily report', W / 2, H - 16);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
