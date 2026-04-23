import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import * as echarts from 'echarts';

export interface DashboardData {
  date: string;
  returnDiff: { diff: number; compass: string; divReturn: number; allReturn: number };
  bondWeather: { weather: string; value: number; change: number; temperature: number };
  thermometer: { temperature: number; status: string; pe: number; bondYield: number; erp: number };
  // Optional chart histories
  diffHistory?: { date: string; diff: number }[];
  bondHistory?: { date: string; value: number }[];
  erpHistory?: { date: string; erp: number; close: number }[];
}

const W = 800;
// H is calculated dynamically based on content

// Win11 Mica light theme
const ACCENT = '#0067c0';
const RED = '#c42b1c';
const GREEN = '#107c10';
const AMBER = '#c47f00';
const BLUE = '#0067c0';
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

function tempColor(v: number): string {
  return v >= 80 ? RED : v <= 30 ? GREEN : AMBER;
}

function diffColor(v: number): string {
  return v > 5 ? RED : v < -5 ? GREEN : ACCENT;
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

function renderGaugeToBuffer(value: number, min: number, max: number, accentColor: string, size = 200): Buffer {
  const canvas = createCanvas(size, size);
  const chart = echarts.init(canvas as any);

  chart.setOption({
    animation: false,
    series: [{
      type: 'gauge',
      center: ['50%', '58%'],
      radius: '90%',
      startAngle: 210,
      endAngle: -30,
      min, max,
      splitNumber: 5,
      axisLine: {
        lineStyle: {
          width: 16,
          color: [
            [0.3, GREEN],
            [0.8, AMBER],
            [1, RED],
          ],
        },
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '50%',
        width: 5,
        itemStyle: { color: accentColor },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      detail: {
        formatter: (v: number) => v.toFixed(1),
        fontSize: 22,
        fontWeight: 'bold' as const,
        color: TEXT,
        offsetCenter: [0, '58%'],
      },
      title: { show: false },
      data: [{ value }],
    }],
  });

  const buf = (canvas as unknown as { toBuffer(mime: string): Buffer }).toBuffer('image/png');
  chart.dispose();
  return buf;
}

function renderLineChartToBuffer(
  chartW: number, chartH: number,
  series: { name: string; data: [string, number][]; color: string; yAxisIndex?: number }[],
  options?: { dualAxis?: boolean; markLines?: { value: number; color: string; label: string }[]; startIdx?: number },
): Buffer {
  const canvas = createCanvas(chartW, chartH);
  const chart = echarts.init(canvas as any);

  const yAxis: any[] = [{
    type: 'value',
    scale: true,
    splitLine: { lineStyle: { color: '#f0eeeb', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { fontSize: 10, color: TEXT_DIM },
  }];

  if (options?.dualAxis) {
    yAxis.push({
      type: 'value',
      scale: true,
      splitLine: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10, color: TEXT_DIM },
    });
  }

  const startPct = options?.startIdx != null
    ? Math.max(0, Math.round((1 - options.startIdx / (series[0]?.data.length || 1)) * 100))
    : 0;

  const seriesConfig = series.map(s => ({
    name: s.name,
    type: 'line' as const,
    data: s.data,
    yAxisIndex: s.yAxisIndex || 0,
    smooth: 0.3,
    symbol: 'none',
    lineStyle: { width: 1.5, color: s.color, opacity: s.yAxisIndex ? 0.6 : 1 },
    itemStyle: { color: s.color },
    areaStyle: s.yAxisIndex ? undefined : { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: s.color + '2e' },
      { offset: 1, color: s.color + '03' },
    ]) },
  }));

  const markLineData = (options?.markLines || []).map(ml => ({
    yAxis: ml.value,
    lineStyle: { color: ml.color, type: 'dashed' as const, width: 1 },
    label: { formatter: ml.label, fontSize: 9, color: ml.color, position: 'insideEndTop' as const },
  }));

  if (markLineData.length > 0 && seriesConfig.length > 0) {
    (seriesConfig[0] as any).markLine = {
      silent: true,
      symbol: 'none',
      data: markLineData,
    };
  }

  chart.setOption({
    animation: false,
    grid: { left: 50, right: options?.dualAxis ? 50 : 20, top: series.length > 1 ? 36 : 20, bottom: 28 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#e0ddd8' } },
      axisTick: { show: false },
      axisLabel: { fontSize: 9, color: TEXT_DIM },
    },
    yAxis,
    legend: series.length > 1 ? {
      top: 4, right: 0,
      textStyle: { fontSize: 10, color: TEXT_SEC },
      itemWidth: 14, itemHeight: 2,
    } : undefined,
    dataZoom: [{ type: 'inside', start: startPct, end: 100 }],
    series: seriesConfig,
  });

  const buf = (canvas as unknown as { toBuffer(mime: string): Buffer }).toBuffer('image/png');
  chart.dispose();
  return buf;
}

export async function generateDashboardImage(data: DashboardData): Promise<Buffer> {
  // Calculate height dynamically
  const chartH = 280;
  const hasCharts = !!(data.diffHistory || data.bondHistory || data.erpHistory);
  const chartCount = [data.diffHistory, data.bondHistory, data.erpHistory].filter(Boolean).length;
  const H = 1000 + (hasCharts ? chartCount * (chartH + 50) : 0);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Mica background
  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bgGrad.addColorStop(0, '#faf8f6');
  bgGrad.addColorStop(0.4, '#f0eee9');
  bgGrad.addColorStop(1, '#edeae5');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Header ──
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
  ctx.fillText(data.date, titleEnd + 14, 32);

  // ── Top indicator strip: 4 cards ──
  const stripY = 72;
  const stripW = 172;
  const stripH = 90;
  const stripGap = 14;
  const stripStartX = (W - (stripW * 4 + stripGap * 3)) / 2;

  const indicators = [
    {
      label: '红利罗盘 · 40日收益差',
      value: `${data.returnDiff.diff > 0 ? '+' : ''}${data.returnDiff.diff}%`,
      valueColor: diffColor(data.returnDiff.diff),
      sub: data.returnDiff.compass,
      accent: [ACCENT, '#62b5f6'],
      tint: 'rgba(0,103,192,0.02)',
    },
    {
      label: '债市净价 · 中债新综合',
      value: `${data.bondWeather.value.toFixed(2)}`,
      valueColor: TEXT_SEC,
      sub: `${data.bondWeather.change > 0 ? '+' : ''}${data.bondWeather.change}`,
      accent: [GREEN, '#34a853'],
      tint: 'rgba(16,124,16,0.02)',
    },
    {
      label: '债市温度',
      value: `${data.bondWeather.temperature}℃`,
      valueColor: tempColor(data.bondWeather.temperature),
      sub: data.bondWeather.weather,
      accent: [BLUE, '#4ea8de'],
      tint: 'rgba(0,103,192,0.02)',
    },
    {
      label: '基金温度计 · 沪深300',
      value: `${data.thermometer.temperature}℃`,
      valueColor: tempColor(data.thermometer.temperature),
      sub: data.thermometer.status.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim(),
      accent: [AMBER, '#e6a817'],
      tint: 'rgba(196,127,0,0.02)',
    },
  ];

  for (let i = 0; i < 4; i++) {
    const ind = indicators[i];
    const x = stripStartX + i * (stripW + stripGap);
    drawCard(ctx, x, stripY, stripW, stripH, ind.tint);
    drawAccentLine(ctx, x, stripY, stripW, ind.accent[0], ind.accent[1]);

    ctx.fillStyle = TEXT_DIM;
    ctx.font = '11px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(ind.label, x + 20, stripY + 28);

    ctx.fillStyle = ind.valueColor;
    ctx.font = '700 28px "Segoe UI", "Microsoft YaHei", sans-serif';
    ctx.fillText(ind.value, x + 20, stripY + 62);

    ctx.fillStyle = TEXT_DIM;
    ctx.font = '11px "Cascadia Code", "Consolas", monospace';
    ctx.fillText(ind.sub, x + 20, stripY + 80);
  }

  // ── Section 01: 红利罗盘 ──
  let sectionY = stripY + stripH + 28;

  // Section header
  function drawSectionHeader(y: number, num: string, title: string, subtitle: string) {
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

  drawSectionHeader(sectionY, '01', '红利罗盘', '40日收益差 · H30269 vs 000985');
  sectionY += 30;

  // Card with gauge + detail side by side
  const cardX = 36;
  const cardW = W - 72;
  const cardH1 = 200;
  drawCard(ctx, cardX, sectionY, cardW, cardH1);

  // Gauge area (left)
  const gaugeW = 240;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  drawRoundRect(ctx, cardX, sectionY, gaugeW, cardH1, 16);
  ctx.fill();
  // clip right corners to be square
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  ctx.fillRect(cardX + gaugeW - 16, sectionY, 16, cardH1);
  ctx.restore();

  // divider line
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.beginPath(); ctx.moveTo(cardX + gaugeW, sectionY + 20); ctx.lineTo(cardX + gaugeW, sectionY + cardH1 - 20); ctx.stroke();

  const gaugeBuf1 = renderGaugeToBuffer(data.returnDiff.diff, -15, 15, diffColor(data.returnDiff.diff));
  const gaugeImg1 = await loadImage(gaugeBuf1);
  ctx.drawImage(gaugeImg1, cardX + (gaugeW - 200) / 2, sectionY + 10, 200, 200);

  // Detail area (right)
  const detailX = cardX + gaugeW + 28;
  const detailY = sectionY + 32;

  ctx.fillStyle = diffColor(data.returnDiff.diff);
  ctx.font = '700 20px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText(data.returnDiff.compass, detailX, detailY);

  ctx.fillStyle = TEXT_SEC;
  ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
  const meta1 = [
    `40日收益差：${data.returnDiff.diff > 0 ? '+' : ''}${data.returnDiff.diff}%`,
    `红利低波40日：${data.returnDiff.divReturn > 0 ? '+' : ''}${data.returnDiff.divReturn}%`,
    `万得全A40日：${data.returnDiff.allReturn > 0 ? '+' : ''}${data.returnDiff.allReturn}%`,
  ];
  meta1.forEach((line, idx) => {
    ctx.fillText(line, detailX, detailY + 28 + idx * 26);
  });

  // Rule box (single line)
  const ruleY = detailY + 28 + meta1.length * 26 + 12;
  const ruleW = cardW - gaugeW - 56;
  const ruleH = 36;
  drawRoundRect(ctx, detailX, ruleY, ruleW, ruleH, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.stroke();

  ctx.font = '10px "Cascadia Code", "Consolas", monospace';
  let rx = detailX + 12;
  const ry = ruleY + 22;
  ctx.fillStyle = RED; ctx.fillText('>+10%', rx, ry); rx += ctx.measureText('>+10%').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 过热·减仓 │ ', rx, ry); rx += ctx.measureText(' 过热·减仓 │ ').width;
  ctx.fillStyle = AMBER; ctx.fillText('-1%~+10%', rx, ry); rx += ctx.measureText('-1%~+10%').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 正常·持有 │ ', rx, ry); rx += ctx.measureText(' 正常·持有 │ ').width;
  ctx.fillStyle = GREEN; ctx.fillText('<-1%', rx, ry); rx += ctx.measureText('<-1%').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 过冷·加仓', rx, ry);

  sectionY += cardH1 + 24;

  // Chart: 40日收益差走势
  if (data.diffHistory && data.diffHistory.length > 0) {
    drawSectionHeader(sectionY, '—', '40日收益差走势', '2020 至今');
    sectionY += 30;
    const chartBuf = renderLineChartToBuffer(cardW, chartH, [{
      name: '收益差',
      data: data.diffHistory.map(d => [d.date, d.diff]),
      color: ACCENT,
    }], {
      startIdx: 730,
      markLines: [
        { value: 10, color: RED, label: '+10%' },
        { value: -1, color: GREEN, label: '-1%' },
        { value: 0, color: TEXT_DIM, label: '0' },
      ],
    });
    const chartImg = await loadImage(chartBuf);
    drawCard(ctx, cardX, sectionY, cardW, chartH + 16);
    ctx.drawImage(chartImg, cardX, sectionY + 8, cardW, chartH);
    sectionY += chartH + 16 + 24;
  }

  // ── Section 02: 债市晴雨表 ──
  drawSectionHeader(sectionY, '02', '债市晴雨表', '中债新综合净价 · 5年百分位温度');
  sectionY += 30;

  const cardH2 = 200;
  drawCard(ctx, cardX, sectionY, cardW, cardH2);

  // Gauge area
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  drawRoundRect(ctx, cardX, sectionY, gaugeW, cardH2, 16);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  ctx.fillRect(cardX + gaugeW - 16, sectionY, 16, cardH2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.beginPath(); ctx.moveTo(cardX + gaugeW, sectionY + 20); ctx.lineTo(cardX + gaugeW, sectionY + cardH2 - 20); ctx.stroke();

  const gaugeBuf2 = renderGaugeToBuffer(data.bondWeather.temperature, 0, 100, tempColor(data.bondWeather.temperature));
  const gaugeImg2 = await loadImage(gaugeBuf2);
  ctx.drawImage(gaugeImg2, cardX + (gaugeW - 200) / 2, sectionY + 10, 200, 200);

  // Detail
  const detailY2 = sectionY + 32;
  ctx.fillStyle = tempColor(data.bondWeather.temperature);
  ctx.font = '700 20px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${data.bondWeather.weather} · ${data.bondWeather.temperature}℃`, detailX, detailY2);

  ctx.fillStyle = TEXT_SEC;
  ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
  const meta2 = [
    `中债新综合净价指数：${data.bondWeather.value.toFixed(2)}`,
    `日涨跌：${data.bondWeather.change > 0 ? '+' : ''}${data.bondWeather.change}`,
    `5年百分位温度：${data.bondWeather.temperature}℃`,
  ];
  meta2.forEach((line, idx) => {
    ctx.fillText(line, detailX, detailY2 + 28 + idx * 26);
  });

  // Bond rule (single line)
  const ruleY2 = detailY2 + 28 + meta2.length * 26 + 12;
  drawRoundRect(ctx, detailX, ruleY2, ruleW, ruleH, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.stroke();

  ctx.font = '10px "Cascadia Code", "Consolas", monospace';
  let rx2 = detailX + 12;
  const ry2 = ruleY2 + 22;
  ctx.fillStyle = RED; ctx.fillText('>80℃', rx2, ry2); rx2 += ctx.measureText('>80℃').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 过热 │ ', rx2, ry2); rx2 += ctx.measureText(' 过热 │ ').width;
  ctx.fillStyle = AMBER; ctx.fillText('30~80℃', rx2, ry2); rx2 += ctx.measureText('30~80℃').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 适中 │ ', rx2, ry2); rx2 += ctx.measureText(' 适中 │ ').width;
  ctx.fillStyle = GREEN; ctx.fillText('<30℃', rx2, ry2); rx2 += ctx.measureText('<30℃').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 偏冷', rx2, ry2);

  sectionY += cardH2 + 24;

  // Chart: 中债新综合净价指数走势
  if (data.bondHistory && data.bondHistory.length > 0) {
    drawSectionHeader(sectionY, '—', '中债新综合净价指数', '2002 至今');
    sectionY += 30;
    const chartBuf = renderLineChartToBuffer(cardW, chartH, [{
      name: '净价指数',
      data: data.bondHistory.map(d => [d.date, d.value]),
      color: GREEN,
    }]);
    const chartImg = await loadImage(chartBuf);
    drawCard(ctx, cardX, sectionY, cardW, chartH + 16);
    ctx.drawImage(chartImg, cardX, sectionY + 8, cardW, chartH);
    sectionY += chartH + 16 + 24;
  }

  // ── Section 03: 基金温度计 ──
  drawSectionHeader(sectionY, '03', '基金温度计', '沪深300 ERP · 股债利差');
  sectionY += 30;

  const cardH3 = 220;
  drawCard(ctx, cardX, sectionY, cardW, cardH3);

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  drawRoundRect(ctx, cardX, sectionY, gaugeW, cardH3, 16);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  ctx.fillRect(cardX + gaugeW - 16, sectionY, 16, cardH3);
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.beginPath(); ctx.moveTo(cardX + gaugeW, sectionY + 20); ctx.lineTo(cardX + gaugeW, sectionY + cardH3 - 20); ctx.stroke();

  const gaugeBuf3 = renderGaugeToBuffer(data.thermometer.temperature, 0, 100, tempColor(data.thermometer.temperature));
  const gaugeImg3 = await loadImage(gaugeBuf3);
  ctx.drawImage(gaugeImg3, cardX + (gaugeW - 200) / 2, sectionY + 10, 200, 200);

  const detailY3 = sectionY + 32;
  ctx.fillStyle = tempColor(data.thermometer.temperature);
  ctx.font = '700 20px "Segoe UI", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${data.thermometer.status.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim()} · ${data.thermometer.temperature}℃`, detailX, detailY3);

  ctx.fillStyle = TEXT_SEC;
  ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
  const meta3 = [
    `沪深300 PE：${data.thermometer.pe}`,
    `10年期国债收益率：${data.thermometer.bondYield}%`,
    `股债利差(ERP)：${data.thermometer.erp}%`,
    `温度：${data.thermometer.temperature}℃`,
  ];
  meta3.forEach((line, idx) => {
    ctx.fillText(line, detailX, detailY3 + 28 + idx * 26);
  });

  // Thermo rule (single line)
  const ruleY3 = detailY3 + 28 + meta3.length * 26 + 12;
  drawRoundRect(ctx, detailX, ruleY3, ruleW, ruleH, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.024)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.stroke();

  ctx.font = '10px "Cascadia Code", "Consolas", monospace';
  let rx3 = detailX + 12;
  const ry3 = ruleY3 + 22;
  ctx.fillStyle = RED; ctx.fillText('>80℃', rx3, ry3); rx3 += ctx.measureText('>80℃').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 减仓 │ ', rx3, ry3); rx3 += ctx.measureText(' 减仓 │ ').width;
  ctx.fillStyle = AMBER; ctx.fillText('30~80℃', rx3, ry3); rx3 += ctx.measureText('30~80℃').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 定投 │ ', rx3, ry3); rx3 += ctx.measureText(' 定投 │ ').width;
  ctx.fillStyle = GREEN; ctx.fillText('<30℃', rx3, ry3); rx3 += ctx.measureText('<30℃').width;
  ctx.fillStyle = TEXT_DIM; ctx.fillText(' 加仓', rx3, ry3);

  sectionY += cardH3 + 24;

  // Chart: 沪深300 股债利差
  if (data.erpHistory && data.erpHistory.length > 0) {
    drawSectionHeader(sectionY, '—', '沪深300 股债利差', 'ERP vs CSI 300');
    sectionY += 30;
    const chartBuf = renderLineChartToBuffer(cardW, chartH, [
      {
        name: 'ERP',
        data: data.erpHistory.map(d => [d.date, d.erp]),
        color: AMBER,
      },
      {
        name: 'CSI 300',
        data: data.erpHistory.map(d => [d.date, d.close]),
        color: BLUE,
        yAxisIndex: 1,
      },
    ], { dualAxis: true, startIdx: 750 });
    const chartImg = await loadImage(chartBuf);
    drawCard(ctx, cardX, sectionY, cardW, chartH + 16);
    ctx.drawImage(chartImg, cardX, sectionY + 8, cardW, chartH);
    sectionY += chartH + 16 + 24;
  }

  // Footer
  ctx.fillStyle = TEXT_DIM;
  ctx.font = '11px "Cascadia Code", "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Market Pulse · Auto-generated daily report', W / 2, sectionY + 10);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
