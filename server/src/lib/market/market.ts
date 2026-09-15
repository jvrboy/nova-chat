import { gaussian, hashSeed, mulberry32 } from "./rng";
import { getSymbol } from "./symbols";
import { TF_MS, type Bar, type Timeframe } from "./types";

const cache = new Map<string, Bar[]>();

function sessionMult(hour: number): number {
  if (hour >= 12 && hour < 16) return 1.35;
  if (hour >= 7 && hour < 16) return 1.15;
  if (hour >= 0 && hour < 9) return 0.95;
  if (hour >= 21 || hour < 6) return 0.75;
  return 0.85;
}

const MASTER = 480;

export function generateBars(symbol: string, timeframe: Timeframe, count = 360): Bar[] {
  const key = `${symbol}|${timeframe}|master`;
  let master = cache.get(key);
  if (!master) {
    master = buildBars(symbol, timeframe, MASTER);
    cache.set(key, master);
  }
  return master.slice(-Math.min(count, master.length));
}

function buildBars(symbol: string, timeframe: Timeframe, count: number): Bar[] {

  const info = getSymbol(symbol);
  const rand = mulberry32(hashSeed(`${symbol}:${timeframe}:nexus-v1`));
  const stepMs = TF_MS[timeframe];
  const barsPerYear = (365.25 * 24 * 3600 * 1000) / stepMs;
  const sigma = info.vol / Math.sqrt(barsPerYear);
  const mu = info.drift / barsPerYear;
  const now = Date.now();
  const aligned = now - (now % stepMs);

  const bars: Bar[] = [];
  let price = info.base * (0.92 + rand() * 0.16);
  let volState = sigma;

  for (let i = 0; i < count; i++) {
    const ts = aligned - (count - 1 - i) * stepMs;
    const hour = new Date(ts).getUTCHours();
    const regime = Math.sin((i + hashSeed(symbol) % 40) / 28);
    const shock = rand() < 0.012 ? gaussian(rand) * volState * 4 : 0;
    volState = volState * 0.94 + sigma * (0.7 + rand() * 0.6) * 0.06;
    const ret = mu * (1 + regime) + volState * sessionMult(hour) * gaussian(rand) + shock;
    const open = price;
    const close = Math.max(info.pip * 0.1, open * (1 + ret));
    const wick = Math.abs(close - open) * (0.25 + rand() * 1.4) + close * volState * (0.15 + rand() * 0.5);
    const high = Math.max(open, close) + wick * (0.3 + rand() * 0.7);
    const low = Math.min(open, close) - wick * (0.3 + rand() * 0.7);
    const volume = 800 + rand() * 4200 * sessionMult(hour) * (1 + Math.abs(ret) * 40);
    bars.push({
      timestamp: ts,
      open,
      high: Math.max(high, open, close),
      low: Math.max(info.pip * 0.05, Math.min(low, open, close)),
      close,
      volume,
    });
    price = close;
  }

  return bars;
}

export function lastBar(symbol: string, timeframe: Timeframe): Bar {
  const bars = generateBars(symbol, timeframe, 240);
  return bars[bars.length - 1];
}

export function changePct(bars: Bar[], lookback = 24): number {
  if (bars.length < 2) return 0;
  const from = bars[Math.max(0, bars.length - 1 - lookback)].close;
  const to = bars[bars.length - 1].close;
  return (to - from) / from;
}
