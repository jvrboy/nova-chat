import type { OHLCV } from "./forex";
import { atr, ema, rsi, sma, stochastic } from "./forex";

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function adx(data: OHLCV[], period = 14) {
  if (data.length <= period + 1) return { adx: [], plusDI: [], minusDI: [] };
  const tr: number[] = [], plusDM: number[] = [], minusDM: number[] = [];
  for (let i = 1; i < data.length; i += 1) {
    const up = data[i].high - data[i - 1].high;
    const down = data[i - 1].low - data[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i - 1].close), Math.abs(data[i].low - data[i - 1].close)));
  }
  const smoothed = (values: number[]) => {
    if (values.length < period) return [];
    const result = [mean(values.slice(0, period))];
    for (let i = period; i < values.length; i += 1) result.push((result[result.length - 1] * (period - 1) + values[i]) / period);
    return result;
  };
  const trS = smoothed(tr), plusS = smoothed(plusDM), minusS = smoothed(minusDM);
  const plusDI: number[] = [], minusDI: number[] = [], dx: number[] = [];
  for (let i = 0; i < trS.length; i += 1) {
    const p = trS[i] ? 100 * plusS[i] / trS[i] : 0;
    const m = trS[i] ? 100 * minusS[i] / trS[i] : 0;
    plusDI.push(p); minusDI.push(m); dx.push(p + m ? 100 * Math.abs(p - m) / (p + m) : 0);
  }
  return { adx: smoothed(dx), plusDI, minusDI };
}

export function cci(data: OHLCV[], period = 20) {
  const typical = data.map(bar => (bar.high + bar.low + bar.close) / 3);
  const result: number[] = [];
  for (let i = period - 1; i < typical.length; i += 1) {
    const window = typical.slice(i - period + 1, i + 1);
    const average = mean(window);
    const deviation = mean(window.map(value => Math.abs(value - average)));
    result.push(deviation ? (typical[i] - average) / (.015 * deviation) : 0);
  }
  return result;
}

export function williamsR(data: OHLCV[], period = 14) {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i += 1) {
    const window = data.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(bar => bar.high));
    const low = Math.min(...window.map(bar => bar.low));
    result.push(high === low ? -50 : ((high - data[i].close) / (high - low)) * -100);
  }
  return result;
}

export function obv(data: OHLCV[]) {
  if (!data.length) return [];
  const result = [0];
  for (let i = 1; i < data.length; i += 1) result.push(result[i - 1] + (data[i].close > data[i - 1].close ? data[i].volume : data[i].close < data[i - 1].close ? -data[i].volume : 0));
  return result;
}

export function marketStructure(data: OHLCV[], lookback = 3) {
  const swings: Array<{ index: number; type: "swing-high" | "swing-low"; price: number }> = [];
  for (let i = lookback; i < data.length - lookback; i += 1) {
    const bar = data[i];
    const left = data.slice(i - lookback, i), right = data.slice(i + 1, i + lookback + 1);
    if (left.every(item => bar.high >= item.high) && right.every(item => bar.high >= item.high)) swings.push({ index: i, type: "swing-high", price: bar.high });
    if (left.every(item => bar.low <= item.low) && right.every(item => bar.low <= item.low)) swings.push({ index: i, type: "swing-low", price: bar.low });
  }
  const highs = swings.filter(swing => swing.type === "swing-high").slice(-4);
  const lows = swings.filter(swing => swing.type === "swing-low").slice(-4);
  const trend = highs.length >= 2 && lows.length >= 2 ? (highs.at(-1)!.price > highs.at(-2)!.price && lows.at(-1)!.price > lows.at(-2)!.price ? "uptrend" : highs.at(-1)!.price < highs.at(-2)!.price && lows.at(-1)!.price < lows.at(-2)!.price ? "downtrend" : "range") : "insufficient-data";
  return { trend, swings, support: lows.length ? Math.min(...lows.map(item => item.price)) : null, resistance: highs.length ? Math.max(...highs.map(item => item.price)) : null };
}

export function volatilityRegime(data: OHLCV[], period = 14) {
  const closes = data.map(bar => bar.close);
  const atrValues = atr(data, period);
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const realized = returns.length >= period ? Math.sqrt(mean(returns.slice(-period).map(value => value ** 2))) : 0;
  const currentAtr = atrValues.at(-1) ?? 0;
  const baselineAtr = mean(atrValues.slice(-Math.min(50, atrValues.length)));
  const ratio = baselineAtr ? currentAtr / baselineAtr : 1;
  return { atr: currentAtr, realizedVolatility: realized, atrRatio: ratio, regime: ratio > 1.35 ? "expanding" : ratio < .75 ? "contracting" : "normal" as "expanding" | "contracting" | "normal" };
}

export function multiTimeframeConfluence(frames: Array<{ timeframe: string; data: OHLCV[] }>) {
  const analyses = frames.map(frame => {
    const closes = frame.data.map(bar => bar.close);
    const fast = ema(closes, Math.min(20, Math.max(2, Math.floor(closes.length / 4))));
    const slow = ema(closes, Math.min(50, Math.max(3, Math.floor(closes.length / 2))));
    const rsiValues = rsi(closes, Math.min(14, Math.max(2, Math.floor(closes.length / 5))));
    const lastClose = closes.at(-1) ?? 0;
    const fastLast = fast.at(-1) ?? lastClose, slowLast = slow.at(-1) ?? lastClose;
    const score = clamp((fastLast > slowLast ? 1 : -1) + ((rsiValues.at(-1) ?? 50) - 50) / 50, -2, 2);
    return { timeframe: frame.timeframe, score, bias: score > .35 ? "bullish" : score < -.35 ? "bearish" : "neutral", rsi: rsiValues.at(-1) ?? null, fastMA: fastLast, slowMA: slowLast };
  });
  const aggregate = analyses.length ? mean(analyses.map(analysis => analysis.score)) : 0;
  return { analyses, aggregateScore: aggregate, consensus: aggregate > .35 ? "bullish" : aggregate < -.35 ? "bearish" : "mixed" };
}

export function forexSignalSnapshot(data: OHLCV[], period = 14) {
  const closes = data.map(bar => bar.close), highs = data.map(bar => bar.high), lows = data.map(bar => bar.low);
  const adxResult = adx(data, period), cciValues = cci(data, 20), wrValues = williamsR(data, period), obvValues = obv(data), stoch = stochastic(highs, lows, closes, period, 3);
  const structure = marketStructure(data), volatility = volatilityRegime(data, period);
  const adxLast = adxResult.adx.at(-1) ?? 0, plus = adxResult.plusDI.at(-1) ?? 0, minus = adxResult.minusDI.at(-1) ?? 0;
  const score = clamp((plus > minus ? .35 : -.35) + (adxLast > 25 ? (plus > minus ? .25 : -.25) : 0) + ((cciValues.at(-1) ?? 0) > 100 ? .2 : (cciValues.at(-1) ?? 0) < -100 ? -.2 : 0) + ((wrValues.at(-1) ?? -50) > -20 ? -.15 : (wrValues.at(-1) ?? -50) < -80 ? .15 : 0), -1, 1);
  return { score, bias: score > .2 ? "bullish" : score < -.2 ? "bearish" : "neutral", trendStrength: adxLast, directionalMovement: { plusDI: plus, minusDI: minus }, cci: cciValues.at(-1) ?? null, williamsR: wrValues.at(-1) ?? null, obv: obvValues.at(-1) ?? 0, stochastic: { k: stoch.k.at(-1) ?? null, d: stoch.d.at(-1) ?? null }, structure, volatility, disclaimer: "This is an analytical snapshot, not a trade recommendation or guarantee of future results." };
}
