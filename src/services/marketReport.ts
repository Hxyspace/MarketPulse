import { getDividendCompassLatest } from '../calculators/dividendCompass';
import { getBondBarometerLatest, getPrevBondStatus } from '../calculators/bondBarometer';
import { getFundThermometerLatest, getPrevFundStatus } from '../calculators/fundThermometer';
import { StatusKind } from '../utils/status';
import { generateReportImage, ReportData } from './reportImage';
import { generateDashboardImage, DashboardData } from './dashboardImage';

export interface DailyReportData {
  returnDiff: {
    date: string;
    diff: number;
    status: string;
    statusKind: StatusKind;
    prevStatusKind: StatusKind | '';
    divReturn: number;
    allReturn: number;
  };
  bondWeather: {
    date: string;
    weather: string;
    value: number;
    change: number;
    temperature: number;
    status: string;
    statusKind: StatusKind;
    prevStatusKind: StatusKind | '';
  };
  thermometer: {
    date: string;
    temperature: number;
    status: string;
    statusKind: StatusKind;
    prevStatusKind: StatusKind | '';
    pe: number;
    bondYield: number;
    erp: number;
  };
  diffHistory?: { date: string; diff: number }[];
  bondHistory?: { date: string; value: number }[];
  erpHistory?: { date: string; erp: number; close: number }[];
}

export type MarketReportImageVariant = 'report' | 'dashboard';

export async function getDailyReportData(): Promise<DailyReportData> {
  const [returnDiff, bondBarometer, thermometer] = await Promise.all([
    getDividendCompassLatest(),
    getBondBarometerLatest(),
    getFundThermometerLatest(),
  ]);

  const prevDiff = returnDiff.history.length >= 2 ? returnDiff.history[returnDiff.history.length - 2] : null;

  return {
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
    diffHistory: returnDiff.history.map((item) => ({ date: item.date, diff: item.diff })),
    bondHistory: bondBarometer.history.map((item) => ({ date: item.date, value: item.value })),
    erpHistory: thermometer.erpHistory.map((item) => ({ date: item.date, erp: item.erp, close: item.close })),
  };
}

function toReportImageData(data: DailyReportData): ReportData {
  return {
    date: data.returnDiff.date,
    returnDiff: { diff: data.returnDiff.diff, status: data.returnDiff.status },
    bondWeather: {
      weather: data.bondWeather.weather,
      value: data.bondWeather.value,
      change: data.bondWeather.change,
      temperature: data.bondWeather.temperature,
      status: data.bondWeather.status,
    },
    thermometer: {
      temperature: data.thermometer.temperature,
      status: data.thermometer.status,
      pe: data.thermometer.pe,
      bondYield: data.thermometer.bondYield,
      erp: data.thermometer.erp,
    },
  };
}

function toDashboardImageData(data: DailyReportData): DashboardData {
  return {
    date: data.returnDiff.date,
    returnDiff: {
      diff: data.returnDiff.diff,
      status: data.returnDiff.status,
      divReturn: data.returnDiff.divReturn,
      allReturn: data.returnDiff.allReturn,
    },
    bondWeather: {
      weather: data.bondWeather.weather,
      value: data.bondWeather.value,
      change: data.bondWeather.change,
      temperature: data.bondWeather.temperature,
      status: data.bondWeather.status,
    },
    thermometer: {
      temperature: data.thermometer.temperature,
      status: data.thermometer.status,
      pe: data.thermometer.pe,
      bondYield: data.thermometer.bondYield,
      erp: data.thermometer.erp,
    },
    diffHistory: data.diffHistory,
    bondHistory: data.bondHistory,
    erpHistory: data.erpHistory,
  };
}

export async function generateMarketReportImage(
  data: DailyReportData,
  variant: MarketReportImageVariant = 'dashboard',
): Promise<Buffer> {
  if (variant === 'report') {
    return generateReportImage(toReportImageData(data));
  }
  return generateDashboardImage(toDashboardImageData(data));
}

export function getMarketReportImageFilename(
  data: DailyReportData,
  variant: MarketReportImageVariant = 'dashboard',
): string {
  return `market-report-${variant}-${data.returnDiff.date}.png`;
}
