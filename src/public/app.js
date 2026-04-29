var API_BASE = '/api';

/* ── Theme colors ── */
var LIGHT = {
  accent: '#0067c0', accentDim: 'rgba(0,103,192,0.08)',
  red: '#c42b1c', green: '#107c10', amber: '#c47f00', blue: '#0067c0',
  text: '#1b1b1b', textSec: '#5c5c5c', textDim: '#8c8c8c',
  border: 'rgba(0,0,0,0.06)', grid: '#f0eeeb', bg: '#ffffff',
  tooltipBg: 'rgba(255,255,253,0.92)', tooltipBorder: 'rgba(0,0,0,0.06)',
  gaugePointer: '#3b3b3b', gaugeTick: '#2E8B57', gaugeSplit: '#999',
  gaugeLabel: '#a09d98', gaugeVal: '#2b2b2b', gaugeUnit: '#a09d98',
  zoomBg: '#f5f3f0', zoomFill: 'rgba(0,103,192,0.08)',
};
var DARK = {
  accent: '#d4a853', accentDim: 'rgba(212,168,83,0.15)',
  red: '#e85d5d', green: '#4aba88', amber: '#e8a84c', blue: '#5b9bf5',
  text: '#e8eaed', textSec: '#8b919e', textDim: '#545b6b',
  border: '#1e2433', grid: '#1a1f2b', bg: '#0e1117',
  tooltipBg: 'rgba(14,17,23,0.92)', tooltipBorder: '#2a3042',
  gaugePointer: '#e0e0e0', gaugeTick: '#2E8B57', gaugeSplit: '#555',
  gaugeLabel: '#545b6b', gaugeVal: '#e8eaed', gaugeUnit: '#545b6b',
  zoomBg: '#141820', zoomFill: 'rgba(212,168,83,0.12)',
};

var isDark = localStorage.getItem('theme') === 'dark';
if (isDark) document.documentElement.classList.add('dark');
var C = isDark ? Object.assign({}, DARK) : Object.assign({}, LIGHT);

function toggleTheme() {
  isDark = !isDark;
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  Object.assign(C, isDark ? DARK : LIGHT);
  document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
  // dispose all charts and re-render
  document.querySelectorAll('.chart, .compass-gauge-el').forEach(function(el) {
    var inst = echarts.getInstanceByDom(el);
    if (inst) inst.dispose();
  });
  loadAll();
}

var FONT = '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif';
var MONO = '"Cascadia Code", "Consolas", "Microsoft YaHei", monospace';

/* ── Shared chart helpers ── */
function baseGrid() {
  return { left: 56, right: 24, top: 32, bottom: 48 };
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

/* ── Hover dot ── */
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

/** Inline colored dot for tooltip (independent of series itemStyle) */
function tipDot(color) {
  return '<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:' + color + ';margin-right:4px;vertical-align:middle"></span>';
}

/* ── Gauge builder ── */
function renderGauge(el, value, label, opts) {
  opts = opts || {};
  var min = opts.min != null ? opts.min : 0;
  var max = opts.max != null ? opts.max : 100;
  var unit = opts.unit || '℃';
  var splitNumber = opts.splitNumber != null ? opts.splitNumber : 10;
  var zones = opts.zones || [
    [0.3, C.green],
    [0.8, C.amber],
    [1, C.red],
  ];
  var chart = echarts.init(el);

  chart.setOption({
    series: [{
      type: 'gauge',
      center: ['50%', '54%'],
      radius: '90%',
      startAngle: 210,
      endAngle: -30,
      min: min,
      max: max,
      splitNumber: splitNumber,
      axisLine: {
        lineStyle: { width: 20, color: zones }
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '52%',
        width: 4,
        offsetCenter: [0, '-8%'],
        itemStyle: { color: C.gaugePointer, shadowColor: 'rgba(0,0,0,0.15)', shadowBlur: 4 }
      },
      axisTick: { distance: -20, length: 6, lineStyle: { color: C.gaugeTick, width: 1 } },
      splitLine: { distance: -25, length: 20, lineStyle: { color: C.gaugeSplit, width: 1 } },
      axisLabel: {
        color: C.gaugeLabel,
        distance: 30,
        fontSize: 9,
        fontFamily: MONO,
        formatter: function(v) { return v + unit; },
      },
      detail: {
        valueAnimation: true,
        formatter: function(v) {
          var f = unit === '%' ? v.toFixed(2) : v.toFixed(1);
          return '{val|' + f + '}{unit|' + unit + '}';
        },
        rich: {
          val: { fontSize: 22, fontFamily: FONT, fontWeight: 700, color: C.gaugeVal, padding: [0, 1, 0, 0] },
          unit: { fontSize: 11, fontFamily: MONO, color: C.gaugeUnit, padding: [4, 0, 0, 0] },
        },
        offsetCenter: [0, '72%'],
      },
      title: {
        offsetCenter: [0, '92%'],
        fontSize: 11,
        fontFamily: FONT,
        color: C.textDim,
      },
      data: [{ value: value, name: label || '' }],
    }],
  });
  return chart;
}

/* ── Helpers ── */
function getSelectedDate() {
  return document.getElementById('queryDate').value;
}

async function fetchData(endpoint) {
  var date = getSelectedDate();
  var url = date ? API_BASE + '/' + endpoint + '?date=' + date : API_BASE + '/' + endpoint;
  var resp = await fetch(url);
  var json = await resp.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

function tempClass(v, lo, hi) {
  lo = lo != null ? lo : 30;
  hi = hi != null ? hi : 80;
  return v >= hi ? 'val-hot' : v <= lo ? 'val-cool' : 'val-warm';
}

function diffClass(v) {
  return v > 5 ? 'val-hot' : v < -5 ? 'val-cool' : 'val-gold';
}

/* ═══════════════════ 01 红利罗盘 ═══════════════════ */
async function loadReturnDiff() {
  try {
    var data = await fetchData('return-diff');
    var latest = data.latest, history = data.history;

    var el = document.getElementById('diff-value');
    el.textContent = (latest.diff > 0 ? '+' : '') + latest.diff + '%';
    el.className = 'indicator-value ' + diffClass(latest.diff);
    document.getElementById('diff-status').textContent = latest.status.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() + ' · ' + latest.date;

    renderGauge(document.getElementById('compassChart'), latest.diff, latest.status.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim(), {
      min: -15, max: 15, unit: '%', splitNumber: 6,
      zones: [[0.467, C.green], [0.7, C.amber], [1, C.red]],
    });

    document.getElementById('compass-status').textContent = (latest.diff > 0 ? '+' : '') + latest.diff + '% · ' + latest.status;
    document.getElementById('compass-status').className = 'compass-status ' + diffClass(latest.diff);
    document.getElementById('compass-detail').innerHTML =
      '红利低波相对中证全指 40日收益差：<strong>' + (latest.diff > 0 ? '+' : '') + latest.diff + '%</strong><br>' +
      '红利低波 40d：' + (latest.dividendReturn40d > 0 ? '+' : '') + latest.dividendReturn40d + '%<br>' +
      '中证全指 40d：' + (latest.allShareReturn40d > 0 ? '+' : '') + latest.allShareReturn40d + '%<br><br>' +
      '<strong>' + latest.interpretation + '</strong>';

    renderDiffHistory(history);
  } catch (err) {
    console.error('ReturnDiff:', err);
    document.getElementById('diff-status').textContent = '加载失败: ' + err.message;
  }
}

function renderDiffHistory(history) {
  var chart = echarts.init(document.getElementById('diffHistoryChart'));
  var dates = history.map(function(h) { return h.date; });
  var diffs = history.map(function(h) { return h.diff; });
  var start = Math.max(0, Math.round((1 - 730 / dates.length) * 100));

  chart.setOption({
    tooltip: Object.assign(tooltip(), {
      formatter: function(p) {
        return '<span style="color:' + C.textDim + '">' + p[0].axisValue + '</span><br/><b style="font-size:15px">' + (p[0].value > 0 ? '+' : '') + p[0].value + '%</b>';
      }
    }),
    grid: baseGrid(),
    xAxis: baseAxis(dates),
    yAxis: baseYAxis({ label: { formatter: function(v) { return v + '%'; } } }),
    series: [Object.assign({
      type: 'line',
      data: diffs,
      smooth: 0.3,
      lineStyle: { width: 1.5, color: C.accent },
      areaStyle: { color: grad(0, 95, 184) },
      markLine: {
        silent: true, symbol: 'none',
        lineStyle: { type: [4, 4] },
        label: { fontFamily: MONO, fontSize: 10 },
        data: [
          { yAxis: 10, lineStyle: { color: C.red }, label: { formatter: '+10%', color: C.red, position: 'insideEndTop' } },
          { yAxis: -1, lineStyle: { color: C.green }, label: { formatter: '-1%', color: C.green, position: 'insideEndTop' } },
          { yAxis: 0, lineStyle: { color: C.textDim, opacity: 0.4 }, label: { formatter: '0', color: C.textDim, position: 'insideEndTop' } },
        ]
      }
    }, hoverDot(C.accent))],
    dataZoom: baseZoom(start),
  });
}

/* ═══════════════════ 02 债市晴雨表 ═══════════════════ */
async function loadBondBarometer() {
  try {
    var data = await fetchData('bond-barometer');
    var latest = data.latest, temperature = data.temperature;

    document.getElementById('bond-value').textContent = latest.value.toFixed(4);
    document.getElementById('bond-status').textContent = latest.weather + ' · Δ' + (latest.change > 0 ? '+' : '') + latest.change;

    var btEl = document.getElementById('bond-temp-value');
    btEl.textContent = temperature.value + '℃';
    btEl.className = 'indicator-value ' + tempClass(temperature.value);
    document.getElementById('bond-temp-status').textContent = temperature.status.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() + ' · ' + latest.date;

    renderGauge(document.getElementById('bondTempChart'), temperature.value, '');

    document.getElementById('bond-thermo-status').textContent = temperature.value + '℃ · ' + temperature.status;
    document.getElementById('bond-thermo-status').className = 'compass-status ' + tempClass(temperature.value);
    document.getElementById('bond-thermo-detail').innerHTML =
      '中债新综合净价指数：<strong>' + latest.value.toFixed(4) + '</strong><br>' +
      '较前日变动：' + (latest.change > 0 ? '+' : '') + latest.change + '<br>' +
      '5年百分位：' + temperature.percentile + '%<br><br>' +
      '<strong>' + temperature.interpretation + '</strong>';

    renderBondHistory(data.history);
    renderWeatherGrid(data.recentDays);
  } catch (err) {
    console.error('BondBarometer:', err);
    document.getElementById('bond-status').textContent = '加载失败: ' + err.message;
  }
}

function renderBondHistory(history) {
  var chart = echarts.init(document.getElementById('bondChart'));
  var dates = history.map(function(h) { return h.date; });
  var values = history.map(function(h) { return h.value; });

  chart.setOption({
    tooltip: Object.assign(tooltip(), {
      formatter: function(p) {
        return '<span style="color:' + C.textDim + '">' + p[0].axisValue + '</span><br/><b style="font-size:15px">' + p[0].value + '</b>';
      }
    }),
    grid: baseGrid(),
    xAxis: baseAxis(dates),
    yAxis: baseYAxis({ scale: true }),
    series: [Object.assign({
      type: 'line',
      data: values,
      smooth: 0.3,
      lineStyle: { width: 1.5, color: C.green },
      areaStyle: { color: grad(15, 123, 15) },
    }, hoverDot(C.green))],
    dataZoom: baseZoom(0),
  });
}

function renderWeatherGrid(recentDays) {
  var grid = document.getElementById('weatherGrid');
  grid.innerHTML = recentDays.slice(-20).map(function(d) {
    var color = d.change > 0 ? C.green : d.change < -0.02 ? C.red : C.amber;
    return '<div class="weather-day">' +
      '<div class="wd">' + d.date.slice(5) + '</div>' +
      '<div class="wicon">' + (d.weather.replace(/[^\u{1F300}-\u{1F9FF}]/gu, '').slice(0, 2) || '🌤️') + '</div>' +
      '<div class="wval" style="color:' + color + '">' + (d.change > 0 ? '+' : '') + d.change + '</div>' +
    '</div>';
  }).join('');
}

/* ═══════════════════ 03 基金温度计 ═══════════════════ */
async function loadFundThermometer() {
  try {
    var data = await fetchData('fund-thermometer');

    var el = document.getElementById('temp-value');
    el.textContent = data.temperature + '℃';
    el.className = 'indicator-value ' + tempClass(data.temperature);
    document.getElementById('temp-status').textContent = data.status.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() + ' · ' + data.date;

    renderGauge(document.getElementById('thermometerChart'), data.temperature, '');

    document.getElementById('thermo-status').textContent = data.temperature + '℃ · ' + data.status;
    document.getElementById('thermo-status').className = 'compass-status ' + tempClass(data.temperature);
    document.getElementById('thermo-detail').innerHTML =
      '沪深300 收盘：<strong>' + data.csi300Close + '</strong><br>' +
      '沪深300 PE：' + (data.pe || '—') + '<br>' +
      '10年国债收益率：' + (data.bondYield ? data.bondYield + '%' : '—') + '<br>' +
      '股债利差 ERP：' + (data.erp != null ? data.erp + '%' : '—') + '<br><br>' +
      '<strong>' + data.interpretation + '</strong>';

    if (data.erpHistory && data.erpHistory.length) {
      renderErpHistory(data.erpHistory);
    }
  } catch (err) {
    console.error('FundThermometer:', err);
    document.getElementById('temp-status').textContent = '加载失败: ' + err.message;
  }
}

function renderErpHistory(erpHistory) {
  var chart = echarts.init(document.getElementById('erpHistoryChart'));
  var dates = erpHistory.map(function(d) { return d.date; });
  var erpValues = erpHistory.map(function(d) { return d.erp; });
  var closeValues = erpHistory.map(function(d) { return d.close; });
  var start = Math.max(0, Math.round((1 - 750 / dates.length) * 100));

  chart.setOption({
    tooltip: Object.assign(tooltip(), {
      formatter: function(params) {
        var s = '<span style="color:' + C.textDim + '">' + params[0].axisValue + '</span>';
        for (var i = 0; i < params.length; i++) {
          var p = params[i];
          var lineColor = p.seriesName === '股债利差' ? C.amber : C.blue;
          var suf = p.seriesName === '股债利差' ? '%' : '';
          s += '<br/>' + tipDot(lineColor) + ' ' + p.seriesName + '：<b>' + p.value + suf + '</b>';
        }
        return s;
      }
    }),
    legend: {
      data: ['股债利差', '沪深300'],
      textStyle: { color: C.textSec, fontSize: 11, fontFamily: FONT },
      top: 4, itemWidth: 14, itemHeight: 2,
    },
    grid: { left: 56, right: 56, top: 36, bottom: 48 },
    xAxis: baseAxis(dates),
    yAxis: [{
      type: 'value', scale: true,
      name: 'ERP',
      nameTextStyle: { color: C.textDim, fontSize: 10, fontFamily: MONO, padding: [0, 36, 0, 0] },
      axisLabel: { color: C.textDim, fontSize: 10, fontFamily: MONO, formatter: function(v) { return v.toFixed(1) + '%'; } },
      splitLine: { lineStyle: { color: C.grid } },
      axisLine: { show: false }, axisTick: { show: false },
    }, {
      type: 'value', scale: true,
      name: 'CSI 300',
      nameTextStyle: { color: C.textDim, fontSize: 10, fontFamily: MONO, padding: [0, 0, 0, 36] },
      axisLabel: { color: C.textDim, fontSize: 10, fontFamily: MONO },
      splitLine: { show: false },
      axisLine: { show: false }, axisTick: { show: false },
    }],
    series: [Object.assign({
      name: '股债利差',
      type: 'line', data: erpValues, yAxisIndex: 0,
      smooth: 0.3,
      lineStyle: { width: 1.5, color: C.amber },
      areaStyle: { color: grad(157, 93, 0) },
    }, hoverDot(C.amber)), Object.assign({
      name: '沪深300',
      type: 'line', data: closeValues, yAxisIndex: 1,
      smooth: 0.3,
      lineStyle: { width: 1.2, color: C.blue, opacity: 0.6 },
    }, hoverDot(C.blue))],
    dataZoom: baseZoom(start),
  });
}

/* ═══════════════════ Init ═══════════════════ */
function goToday() {
  document.getElementById('queryDate').value = new Date().toISOString().split('T')[0];
  loadAll();
}

async function refreshAll() {
  var btn = document.querySelector('.btn-primary');
  btn.textContent = '...';
  await fetch(API_BASE + '/refresh', { method: 'POST' });
  btn.textContent = 'Refresh';
  loadAll();
}

function loadAll() {
  var date = getSelectedDate();
  var today = new Date().toISOString().split('T')[0];
  var isToday = !date || date === today;
  document.getElementById('updateTime').textContent = isToday ? today : '← ' + date;
  loadReturnDiff();
  loadBondBarometer();
  loadFundThermometer();
}

document.getElementById('queryDate').value = new Date().toISOString().split('T')[0];
document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
loadAll();

window.addEventListener('resize', function() {
  document.querySelectorAll('.chart, .compass-gauge-el').forEach(function(el) {
    var inst = echarts.getInstanceByDom(el);
    if (inst) inst.resize();
  });
});