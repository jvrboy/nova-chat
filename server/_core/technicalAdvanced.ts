export type AdvancedCandle = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };

function avg(values: number[]): number { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function highest(values: number[]): number { return values.length ? Math.max(...values) : 0; }
function lowest(values: number[]): number { return values.length ? Math.min(...values) : 0; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

export function pivotPoints(candle: AdvancedCandle) {
  const p = (candle.high + candle.low + candle.close) / 3;
  return { pivot: p, r1: 2 * p - candle.low, r2: p + candle.high - candle.low, r3: candle.high + 2 * (p - candle.low), s1: 2 * p - candle.high, s2: p - candle.high + candle.low, s3: candle.low - 2 * (candle.high - p) };
}

export function fibonacciLevels(candles: AdvancedCandle[], lookback = 50) {
  const sample = candles.slice(-lookback);
  if (!sample.length) throw new Error("At least one candle is required");
  const high = highest(sample.map(c => c.high));
  const low = lowest(sample.map(c => c.low));
  const range = high - low;
  const direction = sample.at(-1)!.close >= sample[0].close ? "up" : "down";
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
  return { high, low, direction, levels: ratios.map(ratio => ({ ratio, price: direction === "up" ? high - range * ratio : low + range * ratio })) };
}

export function ichimoku(candles: AdvancedCandle[], conversionPeriod = 9, basePeriod = 26, spanPeriod = 52, displacement = 26) {
  const highs = candles.map(c => c.high); const lows = candles.map(c => c.low);
  const midpoint = (period: number, end: number) => { const h = highest(highs.slice(Math.max(0, end - period + 1), end + 1)); const l = lowest(lows.slice(Math.max(0, end - period + 1), end + 1)); return (h + l) / 2; };
  const end = candles.length - 1;
  const conversion = midpoint(conversionPeriod, end); const base = midpoint(basePeriod, end); const spanB = midpoint(spanPeriod, end);
  return { conversion, base, spanA: (conversion + base) / 2, spanB, displacement, close: candles[end]?.close ?? 0, cloudBias: (candles[end]?.close ?? 0) > Math.max((conversion + base) / 2, spanB) ? "bullish" : (candles[end]?.close ?? 0) < Math.min((conversion + base) / 2, spanB) ? "bearish" : "inside-cloud" };
}

export function supertrend(candles: AdvancedCandle[], period = 10, multiplier = 3) {
  if (candles.length < period + 1) throw new Error(`At least ${period + 1} candles are required`);
  const trs = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  const atr = avg(trs.slice(-period)); const last = candles.at(-1)!; const mid = (last.high + last.low) / 2; const upper = mid + multiplier * atr; const lower = mid - multiplier * atr; const trend = last.close >= mid ? "up" : "down";
  return { atr, upperBand: upper, lowerBand: lower, trend, distanceToBand: trend === "up" ? last.close - lower : upper - last.close };
}

export function volumeProfile(candles: AdvancedCandle[], bins = 12) {
  const sample = candles.slice(-Math.max(1, Math.min(500, candles.length))); if (!sample.length) return { bins: [], pointOfControl: null, valueArea: null };
  const min = lowest(sample.map(c => c.low)); const max = highest(sample.map(c => c.high)); const width = (max - min) / bins || 1; const buckets = Array.from({ length: bins }, (_, i) => ({ index: i, low: min + i * width, high: i === bins - 1 ? max : min + (i + 1) * width, volume: 0 }));
  for (const candle of sample) { const index = clamp(Math.floor(((candle.close - min) / width)), 0, bins - 1); buckets[index].volume += candle.volume; }
  const total = buckets.reduce((s, b) => s + b.volume, 0); const poc = buckets.reduce((a, b) => b.volume > a.volume ? b : a, buckets[0]); const ranked = [...buckets].sort((a, b) => b.volume - a.volume); let covered = 0; const value = ranked.filter(b => { if (covered / Math.max(total, 1) >= 0.7) return false; covered += b.volume; return true; });
  return { bins: buckets, pointOfControl: poc, valueArea: { low: lowest(value.map(b => b.low)), high: highest(value.map(b => b.high)), coverage: covered / Math.max(total, 1) } };
}

export function rsiDivergence(candles: AdvancedCandle[], period = 14, window = 30) {
  const sample = candles.slice(-window); if (sample.length < period + 4) throw new Error("More candles are required for divergence analysis");
  const changes = sample.slice(1).map((c, i) => c.close - sample[i].close); const gains = changes.map(v => Math.max(0, v)); const losses = changes.map(v => Math.max(0, -v));
  const rsiAt = (end: number) => { const g = avg(gains.slice(Math.max(0, end - period), end)); const l = avg(losses.slice(Math.max(0, end - period), end)); return l === 0 ? 100 : 100 - 100 / (1 + g / l); };
  const half = Math.floor(sample.length / 2); const firstPrice = avg(sample.slice(0, 3).map(c => c.close)); const secondPrice = avg(sample.slice(-3).map(c => c.close)); const firstRsi = rsiAt(Math.max(period, half - 1)); const secondRsi = rsiAt(changes.length - 1);
  const type = secondPrice < firstPrice && secondRsi > firstRsi ? "bullish" : secondPrice > firstPrice && secondRsi < firstRsi ? "bearish" : "none";
  return { type, firstPrice, secondPrice, firstRsi, secondRsi, confidence: type === "none" ? 0 : clamp(Math.abs((secondRsi - firstRsi) / 50), 0, 1) };
}

export function confluenceSnapshot(candles: AdvancedCandle[]) {
  const last = candles.at(-1); if (!last) throw new Error("At least one candle is required");
  const fib = fibonacciLevels(candles); const ichi = ichimoku(candles); const st = supertrend(candles, Math.min(10, Math.max(2, Math.floor(candles.length / 4))), 3); const votes = [ichi.cloudBias === "bullish" ? 1 : ichi.cloudBias === "bearish" ? -1 : 0, st.trend === "up" ? 1 : -1, last.close >= fib.levels[4].price ? 1 : -1]; const score = avg(votes);
  return { score, bias: score > 0.33 ? "bullish" : score < -0.33 ? "bearish" : "neutral", components: { ichimoku: ichi, supertrend: st, fibonacci: fib } };
}
