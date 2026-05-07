const echarts = window.echarts
var API_BASE = '/api/fx';
var CMB_FX_TARGETS = [
  { nbr: '美元', code: 'USD', prefix: 'usd', chartId: 'fxUsdHistoryChart' },
  { nbr: '港币', code: 'HKD', prefix: 'hkd', chartId: 'fxHkdHistoryChart' },
];

var LIGHT = {
  accent: '#0067c0', accentDim: 'rgba(0,103,192,0.08)',
  red: '#c42b1c', green: '#107c10', amber: '#c47f00', blue: '#0067c0',
  text: '#1b1b1b', textSec: '#5c5c5c', textDim: '#8c8c8c',
  border: 'rgba(0,0,0,0.06)', grid: '#f0eeeb', bg: '#ffffff',
  tooltipBg: 'rgba(255,255,253,0.92)', tooltipBorder: 'rgba(0,0,0,0.06)',
  zoomBg: '#f5f3f0', zoomFill: 'rgba(0,103,192,0.08)',
};
var DARK = {
  accent: '#d4a853', accentDim: 'rgba(212,168,83,0.15)',
  red: '#e85d5d', green: '#4aba88', amber: '#e8a84c', blue: '#5b9bf5',
  text: '#e8eaed', textSec: '#8b919e', textDim: '#545b6b',
  border: '#1e2433', grid: '#1a1f2b', bg: '#0e1117',
  tooltipBg: 'rgba(14,17,23,0.92)', tooltipBorder: '#2a3042',
  zoomBg: '#141820', zoomFill: 'rgba(212,168,83,0.12)',
};

var isDark = localStorage.getItem('theme') === 'dark';
if (isDark) document.documentElement.classList.add('dark');
var C = isDark ? Object.assign({}, DARK) : Object.assign({}, LIGHT);
var FONT = '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif';
var MONO = '"Cascadia Code", "Consolas", "Microsoft YaHei", monospace';

function toggleTheme() {
  isDark = !isDark;
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  Object.assign(C, isDark ? DARK : LIGHT);
  document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
  document.querySelectorAll('.chart').forEach(function(el) {
    var inst = echarts.getInstanceByDom(el);
    if (inst) inst.dispose();
  });
  loadAll();
}

function baseAxis(dates) {
  return {
    type: 'category',
    data: dates,
    axisLabel: { color: C.textDim, fontSize: 10, fontFamily: MONO },
    axisLine: { lineStyle: { color: C.grid } },
    axisTick: { show: false },
  };
}

function baseYAxis(opts) {
  opts = opts || {};
  var label = opts.label || {};
  delete opts.label;
  var result = {
    type: 'value',
    scale: true,
    axisLabel: { color: C.textDim, fontSize: 10, fontFamily: MONO },
    splitLine: { lineStyle: { color: C.grid } },
    axisLine: { show: false },
    axisTick: { show: false },
  };
  for (var k in label) result.axisLabel[k] = label[k];
  for (var k2 in opts) result[k2] = opts[k2];
  return result;
}

function baseZoom(start) {
  return [{
    type: 'inside', start: start, end: 100
  }, {
    type: 'slider', start: start, end: 100, height: 18, bottom: 4,
    borderColor: 'transparent',
    backgroundColor: C.zoomBg,
    fillerColor: C.zoomFill,
    handleStyle: { color: C.accent, borderColor: C.accent, borderWidth: 0, shadowBlur: 4, shadowColor: 'rgba(0,0,0,0.15)' },
    moveHandleStyle: { color: C.accent },
    textStyle: { color: C.textDim, fontSize: 10, fontFamily: MONO },
    dataBackground: { lineStyle: { color: C.grid }, areaStyle: { color: 'transparent' } },
    selectedDataBackground: { lineStyle: { color: C.accent, opacity: 0.3 }, areaStyle: { color: C.accentDim } },
  }];
}

function grad(r, g, b, topA, botA) {
  return {
    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: 'rgba(' + r + ',' + g + ',' + b + ',' + (topA || 0.18) + ')' },
      { offset: 1, color: 'rgba(' + r + ',' + g + ',' + b + ',' + (botA || 0.01) + ')' },
    ],
  };
}

function tooltip() {
  return {
    trigger: 'axis',
    backgroundColor: C.tooltipBg,
    borderColor: C.tooltipBorder,
    textStyle: { color: C.text, fontSize: 13, fontFamily: FONT },
    extraCssText: 'box-shadow: 0 8px 32px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04); backdrop-filter: blur(40px) saturate(1.5); border-radius: 12px; padding: 4px;',
  };
}

function hoverDot(color) {
  return {
    symbol: 'circle',
    symbolSize: 9,
    showSymbol: false,
    itemStyle: {
      color: C.bg,
      borderColor: color,
      borderWidth: 2,
    },
  };
}

function tipDot(color) {
  return '<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:' + color + ';margin-right:4px;vertical-align:middle"></span>';
}

function formatFx(v) {
  return Number(v).toFixed(2);
}

async function fetchCmbFxRealtime() {
  var resp = await fetch(API_BASE + '/rate', { cache: 'no-store' });
  var json = await resp.json();
  if (!resp.ok || !json.ok) throw new Error(json.error || ('实时汇率接口 HTTP ' + resp.status));
  return { source: '招商银行', rates: json.data };
}

function updateFxRateCard(rate, source) {
  var prefix = String(rate.currency.code || '').toLowerCase();
  var spread = rate.spotSell - rate.spotBuy;
  document.getElementById('fx-' + prefix + '-buy').textContent = formatFx(rate.spotBuy);
  document.getElementById('fx-' + prefix + '-sell').textContent = formatFx(rate.spotSell);
  document.getElementById('fx-' + prefix + '-source').textContent = source;
  document.getElementById('fx-' + prefix + '-sub').textContent =
    rate.date + ' ' + rate.time + ' · 点差 ' + formatFx(spread) + ' · ' + rate.unit;
}

function markFxRateError(message) {
  CMB_FX_TARGETS.forEach(function(target) {
    document.getElementById('fx-' + target.prefix + '-sub').textContent = '加载失败: ' + message;
  });
}

async function loadCmbFxRates() {
  try {
    var result = await fetchCmbFxRealtime();
    result.rates.forEach(function(rate) { updateFxRateCard(rate, result.source); });
  } catch (err) {
    console.error('CMB FX rate:', err);
    markFxRateError(err.message);
  }
}

async function loadCmbFxHistory() {
  try {
    var resp = await fetch(API_BASE + '/history', { cache: 'no-store' });
    var json = await resp.json();
    if (!resp.ok || !json.ok) throw new Error(json.error || ('历史汇率 HTTP ' + resp.status));

    json.data.currencies.forEach(function(series) {
      renderCmbFxHistory(series);
    });
  } catch (err) {
    console.error('CMB FX history:', err);
  }
}

function renderCmbFxHistory(series) {
  var target = CMB_FX_TARGETS.find(function(t) { return t.code === series.currency.code; });
  if (!target) return;

  var chart = echarts.init(document.getElementById(target.chartId));
  var history = series.items || [];
  var dates = history.map(function(h) { return h.date; });
  var bids = history.map(function(h) { return h.spotBuy; });
  var offers = history.map(function(h) { return h.spotSell; });
  var start = Math.max(0, Math.round((1 - 183 / Math.max(dates.length, 1)) * 100));

  chart.setOption({
    tooltip: Object.assign(tooltip(), {
      formatter: function(params) {
        var s = '<span style="color:' + C.textDim + '">' + params[0].axisValue + '</span>';
        for (var i = 0; i < params.length; i++) {
          var p = params[i];
          var color = p.seriesName === '现汇买入' ? C.green : C.red;
          s += '<br/>' + tipDot(color) + ' ' + p.seriesName + '：<b>' + formatFx(p.value) + '</b>';
        }
        return s;
      }
    }),
    legend: {
      data: ['现汇买入', '现汇卖出'],
      textStyle: { color: C.textSec, fontSize: 11, fontFamily: FONT },
      top: 4, itemWidth: 14, itemHeight: 2,
    },
    grid: { left: 56, right: 24, top: 36, bottom: 48 },
    xAxis: baseAxis(dates),
    yAxis: baseYAxis({
      name: 'CNY/100',
      nameTextStyle: { color: C.textDim, fontSize: 10, fontFamily: MONO, padding: [0, 34, 0, 0] },
      label: { formatter: function(v) { return Number(v).toFixed(series.currency.code === 'HKD' ? 1 : 0); } },
    }),
    series: [Object.assign({
      name: '现汇买入',
      type: 'line',
      data: bids,
      smooth: 0.3,
      lineStyle: { width: 1.5, color: C.green },
      areaStyle: { color: grad(16, 124, 16, 0.12, 0.01) },
    }, hoverDot(C.green)), Object.assign({
      name: '现汇卖出',
      type: 'line',
      data: offers,
      smooth: 0.3,
      lineStyle: { width: 1.5, color: C.red },
    }, hoverDot(C.red))],
    dataZoom: baseZoom(start),
  });
}

async function loadAll() {
  document.getElementById('fxUpdateTime').textContent = new Date().toISOString().split('T')[0];
  await Promise.all([loadCmbFxRates(), loadCmbFxHistory()]);
}

async function refreshAll() {
  var btn = document.querySelector('.btn-primary');
  btn.textContent = '...';
  await loadAll();
  btn.textContent = 'Refresh';
}

function goMarket() {
  window.location.href = '/';
}

document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
loadAll();

window.addEventListener('resize', function() {
  document.querySelectorAll('.chart').forEach(function(el) {
    var inst = echarts.getInstanceByDom(el);
    if (inst) inst.resize();
  });
});

window.toggleTheme = toggleTheme;
window.refreshAll = refreshAll;
window.goMarket = goMarket;
