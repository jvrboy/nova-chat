import type { OHLCV } from "./forex";

export type IndicatorCategory = "trend" | "momentum" | "volatility" | "volume" | "price";
export type IndicatorDefinition = { id: string; label: string; category: IndicatorCategory; period: number };
export type IndicatorOutput = IndicatorDefinition & { values: number[] };

const PERIODS = [5, 7, 9, 10, 14, 20, 30, 50, 100, 200] as const;
const familyCatalog: Array<{ key: string; label: string; category: IndicatorCategory }> = [
  { key: "sma", label: "Simple Moving Average", category: "trend" },
  { key: "ema", label: "Exponential Moving Average", category: "trend" },
  { key: "wma", label: "Weighted Moving Average", category: "trend" },
  { key: "hma", label: "Hull Moving Average", category: "trend" },
  { key: "dema", label: "Double Exponential Moving Average", category: "trend" },
  { key: "tema", label: "Triple Exponential Moving Average", category: "trend" },
  { key: "roc", label: "Rate of Change", category: "momentum" },
  { key: "momentum", label: "Momentum", category: "momentum" },
  { key: "rsi", label: "Relative Strength Index", category: "momentum" },
  { key: "stoch", label: "Stochastic Position", category: "momentum" },
  { key: "williams", label: "Williams Percent R", category: "momentum" },
  { key: "cmo", label: "Chande Momentum Oscillator", category: "momentum" },
  { key: "cci", label: "Commodity Channel Index", category: "momentum" },
  { key: "trix", label: "TRIX", category: "momentum" },
  { key: "atr", label: "Average True Range", category: "volatility" },
  { key: "true_range", label: "True Range", category: "volatility" },
  { key: "stdev", label: "Rolling Standard Deviation", category: "volatility" },
  { key: "variance", label: "Rolling Variance", category: "volatility" },
  { key: "zscore", label: "Rolling Z Score", category: "volatility" },
  { key: "bb_position", label: "Bollinger Position", category: "volatility" },
  { key: "range_percent", label: "Range Percent", category: "volatility" },
  { key: "volume_sma", label: "Volume Moving Average", category: "volume" },
  { key: "volume_roc", label: "Volume Rate of Change", category: "volume" },
  { key: "obv_delta", label: "On Balance Volume Delta", category: "volume" },
];

export const INDICATOR_CATALOG: IndicatorDefinition[] = familyCatalog.flatMap(family => PERIODS.map(period => ({ id: `${family.key}_${period}`, label: `${family.label} (${period})`, category: family.category, period })));

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const rolling = (values: number[], period: number, fn: (window: number[], index: number) => number) => values.map((_, index) => index < period - 1 ? NaN : fn(values.slice(index - period + 1, index + 1), index));
const sma = (values: number[], period: number) => rolling(values, period, window => mean(window));
const ema = (values: number[], period: number) => { const result: number[] = []; const alpha = 2 / (period + 1); let previous = 0; values.forEach((value, index) => { previous = index === 0 ? value : value * alpha + previous * (1 - alpha); result.push(previous); }); return result; };
const wma = (values: number[], period: number) => rolling(values, period, window => { const denominator = period * (period + 1) / 2; return window.reduce((sum, value, index) => sum + value * (index + 1), 0) / denominator; });
const diff = (values: number[], lag: number) => values.map((value, index) => index < lag ? NaN : value - values[index - lag]);
const trueRanges = (data: OHLCV[]) => data.map((bar, index) => index === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - data[index - 1].close), Math.abs(bar.low - data[index - 1].close)));
const typical = (data: OHLCV[]) => data.map(bar => (bar.high + bar.low + bar.close) / 3);
const rollingStd = (values: number[], period: number) => rolling(values, period, window => { const average = mean(window); return Math.sqrt(mean(window.map(value => (value - average) ** 2))); });
const rsi = (values: number[], period: number) => values.map((_, index) => { if (index < period) return NaN; let gains = 0, losses = 0; for (let i = index - period + 1; i <= index; i += 1) { const change = values[i] - values[i - 1]; if (change >= 0) gains += change; else losses -= change; } return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses); });
const stochastic = (data: OHLCV[], period: number) => data.map((bar, index) => { if (index < period - 1) return NaN; const window = data.slice(index - period + 1, index + 1); const high = Math.max(...window.map(item => item.high)); const low = Math.min(...window.map(item => item.low)); return high === low ? 50 : ((bar.close - low) / (high - low)) * 100; });
const cci = (data: OHLCV[], period: number) => rolling(typical(data), period, (window, index) => { const average = mean(window); const deviation = mean(window.map(value => Math.abs(value - average))); return deviation === 0 ? 0 : (typical(data)[index] - average) / (.015 * deviation); });
const obv = (data: OHLCV[]) => data.map((_, index) => index === 0 ? 0 : data.slice(1, index + 1).reduce((sum, bar, offset) => sum + (bar.close > data[offset].close ? bar.volume : bar.close < data[offset].close ? -bar.volume : 0), 0));

function calculate(family: string, period: number, data: OHLCV[]) {
  const closes = data.map(bar => bar.close);
  const tr = trueRanges(data);
  if (family === "sma") return sma(closes, period);
  if (family === "ema") return ema(closes, period);
  if (family === "wma") return wma(closes, period);
  if (family === "hma") { const half = wma(closes, Math.max(2, Math.floor(period / 2))); const full = wma(closes, period); return wma(half.map((value, index) => 2 * value - full[index]), Math.max(2, Math.floor(Math.sqrt(period)))); }
  if (family === "dema") { const first = ema(closes, period); return first.map((value, index) => 2 * value - ema(first, period)[index]); }
  if (family === "tema") { const first = ema(closes, period); const second = ema(first, period); const third = ema(second, period); return first.map((value, index) => 3 * value - 3 * second[index] + third[index]); }
  if (family === "roc") return closes.map((value, index) => index < period ? NaN : ((value - closes[index - period]) / closes[index - period]) * 100);
  if (family === "momentum") return diff(closes, period);
  if (family === "rsi") return rsi(closes, period);
  if (family === "stoch") return stochastic(data, period);
  if (family === "williams") return stochastic(data, period).map(value => Number.isNaN(value) ? NaN : value - 100);
  if (family === "cmo") return closes.map((_, index) => { if (index < period) return NaN; const changes = diff(closes, 1).slice(index - period + 1, index + 1).filter(value => !Number.isNaN(value)); const up = changes.filter(value => value > 0).reduce((sum, value) => sum + value, 0); const down = changes.filter(value => value < 0).reduce((sum, value) => sum - value, 0); return up + down === 0 ? 0 : ((up - down) / (up + down)) * 100; });
  if (family === "cci") return cci(data, period);
  if (family === "trix") return ema(ema(ema(closes, period), period), period).map((value, index, values) => index === 0 ? NaN : ((value - values[index - 1]) / values[index - 1]) * 100);
  if (family === "atr") return rolling(tr, period, window => mean(window));
  if (family === "true_range") return tr;
  if (family === "stdev") return rollingStd(closes, period);
  if (family === "variance") return rollingStd(closes, period).map(value => value ** 2);
  if (family === "zscore") return rolling(closes, period, (window, index) => { const average = mean(window); const sd = Math.sqrt(mean(window.map(value => (value - average) ** 2))); return sd === 0 ? 0 : (closes[index] - average) / sd; });
  if (family === "bb_position") return rolling(closes, period, (window, index) => { const average = mean(window), sd = Math.sqrt(mean(window.map(value => (value - average) ** 2))); return sd === 0 ? .5 : (closes[index] - (average - 2 * sd)) / (4 * sd); });
  if (family === "range_percent") return data.map(bar => bar.close === 0 ? 0 : ((bar.high - bar.low) / bar.close) * 100);
  if (family === "volume_sma") return sma(data.map(bar => bar.volume), period);
  if (family === "volume_roc") { const volumes = data.map(bar => bar.volume); return volumes.map((value, index) => index < period ? NaN : volumes[index - period] === 0 ? 0 : ((value - volumes[index - period]) / volumes[index - period]) * 100); }
  if (family === "obv_delta") return diff(obv(data), period);
  throw new Error(`Unknown indicator family: ${family}`);
}

export function computeIndicator(id: string, data: OHLCV[]): IndicatorOutput {
  const definition = INDICATOR_CATALOG.find(indicator => indicator.id === id);
  if (!definition) throw new Error(`Unknown indicator '${id}'. Use listIndicators to inspect the catalog.`);
  if (data.length < Math.min(definition.period, 5)) throw new Error(`Indicator '${id}' requires more candle data.`);
  return { ...definition, values: calculate(id.slice(0, id.lastIndexOf("_")), definition.period, data) };
}

export function computeIndicators(ids: string[], data: OHLCV[]) { return ids.map(id => computeIndicator(id, data)); }
export function listIndicators(category?: IndicatorCategory) { return category ? INDICATOR_CATALOG.filter(indicator => indicator.category === category) : INDICATOR_CATALOG; }
export function indicatorSnapshot(data: OHLCV[], ids = ["sma_20", "ema_20", "rsi_14", "atr_14", "bb_position_20", "zscore_20"]) { return computeIndicators(ids, data).map(indicator => ({ id: indicator.id, category: indicator.category, latest: indicator.values.at(-1) ?? null, values: indicator.values })); }
