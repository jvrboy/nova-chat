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
  { key: "adx_strength", label: "ADX Trend Strength", category: "trend" },
  { key: "di_plus", label: "Directional Index Plus", category: "trend" },
  { key: "di_minus", label: "Directional Index Minus", category: "trend" },
  { key: "mfi", label: "Money Flow Index", category: "volume" },
  { key: "force_index", label: "Force Index", category: "volume" },
  { key: "cmf", label: "Chaikin Money Flow", category: "volume" },
  { key: "vwap_distance", label: "VWAP Distance", category: "volume" },
  { key: "donchian_position", label: "Donchian Position", category: "price" },
  { key: "keltner_position", label: "Keltner Position", category: "volatility" },
  { key: "candle_body_pct", label: "Candle Body Percentage", category: "price" },
  { key: "upper_wick_pct", label: "Upper Wick Percentage", category: "price" },
  { key: "lower_wick_pct", label: "Lower Wick Percentage", category: "price" },
  { key: "gap_pct", label: "Gap Percentage", category: "price" },
  { key: "hl2", label: "HL2 Price", category: "price" },
  { key: "ohlc4", label: "OHLC4 Price", category: "price" },
  { key: "realized_vol", label: "Realized Volatility", category: "volatility" },
  { key: "upside_vol", label: "Upside Volatility", category: "volatility" },
  { key: "downside_vol", label: "Downside Volatility", category: "volatility" },
  { key: "efficiency_ratio", label: "Kaufman Efficiency Ratio", category: "trend" },
  { key: "choppiness", label: "Choppiness Index", category: "volatility" },
  { key: "volume_zscore", label: "Volume Z Score", category: "volume" },
  { key: "pvt", label: "Price Volume Trend", category: "volume" },
  { key: "ad_line", label: "Accumulation Distribution Line", category: "volume" },
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
  if (family === "adx_strength" || family === "di_plus" || family === "di_minus") { const plus: number[] = [], minus: number[] = [], ranges = trueRanges(data); for (let index = 1; index < data.length; index += 1) { const up = data[index].high - data[index - 1].high, down = data[index - 1].low - data[index].low; plus.push(up > down && up > 0 ? up : 0); minus.push(down > up && down > 0 ? down : 0); } const atrValues = rolling(ranges, period, window => mean(window)); const plusDI = plus.map((value, index) => atrValues[index + 1] ? 100 * value / atrValues[index + 1] : NaN); const minusDI = minus.map((value, index) => atrValues[index + 1] ? 100 * value / atrValues[index + 1] : NaN); return family === "di_plus" ? [NaN, ...plusDI] : family === "di_minus" ? [NaN, ...minusDI] : [NaN, ...plusDI.map((value, index) => { const total = value + minusDI[index]; return total ? 100 * Math.abs(value - minusDI[index]) / total : 0; })]; }
  if (family === "mfi") return data.map((_, index) => { if (index < period) return NaN; const flows = data.slice(index - period + 1, index + 1).map(bar => ((bar.high + bar.low + bar.close) / 3) * bar.volume); const positive = flows.filter((_, offset) => data[index - period + 1 + offset].close >= (data[index - period + offset]?.close ?? data[index - period + 1 + offset].close)).reduce((sum, value) => sum + value, 0); const negative = Math.max(0, flows.reduce((sum, value) => sum + value, 0) - positive); return negative ? 100 - 100 / (1 + positive / negative) : 100; });
  if (family === "force_index") return data.map((bar, index) => index === 0 ? 0 : (bar.close - data[index - 1].close) * bar.volume);
  if (family === "cmf") return data.map((_, index) => { if (index < period - 1) return NaN; const window = data.slice(index - period + 1, index + 1); const volume = window.reduce((sum, bar) => sum + bar.volume, 0); return volume ? window.reduce((sum, bar) => sum + (((bar.close - bar.low) - (bar.high - bar.close)) / Math.max(1e-9, bar.high - bar.low)) * bar.volume, 0) / volume : 0; });
  if (family === "vwap_distance") return data.map((_, index) => { const window = data.slice(Math.max(0, index - period + 1), index + 1); const volume = window.reduce((sum, bar) => sum + bar.volume, 0); const vwap = volume ? window.reduce((sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume, 0) / volume : data[index].close; return vwap ? ((data[index].close - vwap) / vwap) * 100 : 0; });
  if (family === "donchian_position") return data.map((bar, index) => { if (index < period - 1) return NaN; const window = data.slice(index - period + 1, index + 1), high = Math.max(...window.map(item => item.high)), low = Math.min(...window.map(item => item.low)); return high === low ? .5 : (bar.close - low) / (high - low); });
  if (family === "keltner_position") return data.map((bar, index) => { const center = ema(closes, period)[index], width = (rolling(tr, period, window => mean(window))[index] ?? 0) * 2; return width ? (bar.close - (center - width)) / (2 * width) : .5; });
  if (family === "candle_body_pct") return data.map(bar => bar.high === bar.low ? 0 : Math.abs(bar.close - bar.open) / (bar.high - bar.low));
  if (family === "upper_wick_pct") return data.map(bar => bar.high === bar.low ? 0 : (bar.high - Math.max(bar.open, bar.close)) / (bar.high - bar.low));
  if (family === "lower_wick_pct") return data.map(bar => bar.high === bar.low ? 0 : (Math.min(bar.open, bar.close) - bar.low) / (bar.high - bar.low));
  if (family === "gap_pct") return data.map((bar, index) => index === 0 || data[index - 1].close === 0 ? 0 : ((bar.open - data[index - 1].close) / data[index - 1].close) * 100);
  if (family === "hl2") return data.map(bar => (bar.high + bar.low) / 2);
  if (family === "ohlc4") return data.map(bar => (bar.open + bar.high + bar.low + bar.close) / 4);
  if (family === "realized_vol") return rolling(closes.map((value, index) => index === 0 ? 0 : Math.log(value / closes[index - 1])), period, window => Math.sqrt(mean(window.map(value => value ** 2))) * Math.sqrt(252));
  if (family === "upside_vol" || family === "downside_vol") return rolling(closes.map((value, index) => index === 0 ? 0 : Math.log(value / closes[index - 1])), period, window => Math.sqrt(mean(window.filter(value => family === "upside_vol" ? value > 0 : value < 0).map(value => value ** 2))) * Math.sqrt(252));
  if (family === "efficiency_ratio") return closes.map((value, index) => { if (index < period) return NaN; const direction = Math.abs(value - closes[index - period]), noise = closes.slice(index - period + 1, index + 1).reduce((sum, close, offset) => sum + Math.abs(close - closes[index - period + offset]), 0); return noise ? direction / noise : 0; });
  if (family === "choppiness") return data.map((_, index) => { if (index < period - 1) return NaN; const range = data.slice(index - period + 1, index + 1), high = Math.max(...range.map(bar => bar.high)), low = Math.min(...range.map(bar => bar.low)), atrSum = range.reduce((sum, bar) => sum + bar.high - bar.low, 0); return high === low ? 0 : 100 * Math.log10(atrSum / (high - low)) / Math.log10(period); });
  if (family === "volume_zscore") return rolling(data.map(bar => bar.volume), period, (window, index) => { const average = mean(window), sd = Math.sqrt(mean(window.map(value => (value - average) ** 2))); return sd ? (data[index].volume - average) / sd : 0; });
  if (family === "pvt") return data.map((_, index) => index === 0 ? 0 : (index === 1 ? 0 : data.slice(1, index + 1).reduce((sum, bar, offset) => sum + ((bar.close - data[offset].close) / Math.max(1e-9, data[offset].close)) * bar.volume, 0)));
  if (family === "ad_line") return data.map((_, index) => data.slice(0, index + 1).reduce((sum, bar) => sum + (((bar.close - bar.low) - (bar.high - bar.close)) / Math.max(1e-9, bar.high - bar.low)) * bar.volume, 0));
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
