import { computeSeries, lastValues } from "./indicators";
import type { Action, Bar, Bias, Block, Gap, Swing, TradePlan, Zone } from "./types";

function extrema(arr: number[]) {
  const minima: number[] = [];
  const maxima: number[] = [];
  for (let i = 1; i < arr.length - 1; i++) {
    if (arr[i] <= arr[i - 1] && arr[i] <= arr[i + 1]) minima.push(i);
    if (arr[i] >= arr[i - 1] && arr[i] >= arr[i + 1]) maxima.push(i);
  }
  return { minima, maxima };
}

function linregSlope(ys: number[]): number {
  const n = ys.length;
  if (n < 2) return 0;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i];
    sumXY += i * ys[i];
    sumXX += i * i;
  }
  const den = n * sumXX - sumX * sumX;
  return den === 0 ? 0 : (n * sumXY - sumX * sumY) / den;
}

export function marketRegime(bars: Bar[], lookback = 20) {
  const close = bars.map((b) => b.close);
  const window = close.slice(-lookback);
  const slope = linregSlope(window);
  const rets: number[] = [];
  for (let i = Math.max(1, bars.length - lookback); i < bars.length; i++) {
    rets.push((close[i] - close[i - 1]) / close[i - 1]);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length, 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252);
  const last = close[close.length - 1] || 1;
  const strength = Math.abs(slope) / Math.max(last * 0.0001, 1e-9);
  const regime =
    slope > 0 && strength > 0.5
      ? "TRENDING_UP"
      : slope < 0 && strength > 0.5
        ? "TRENDING_DOWN"
        : volatility > 0.25
          ? "HIGH_VOLATILITY"
          : "RANGING";
  return {
    regime,
    trendSlope: slope,
    trendStrength: strength,
    annualizedVolatility: volatility,
    return: rets.reduce((a, b) => a + b, 0),
  };
}

function psychologicalLevels(price: number, count = 3) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(Math.abs(price), 1e-9)));
  let step = magnitude >= 1 ? magnitude / 10 : magnitude;
  step = Math.max(step, 1e-6);
  const nearest = Math.round(price / step) * step;
  return {
    nearestRoundLevel: nearest,
    levelsAbove: Array.from({ length: count }, (_, i) => nearest + step * (i + 1)),
    levelsBelow: Array.from({ length: count }, (_, i) => nearest - step * (i + 1)),
    step,
  };
}

function cluster(points: number[], tolerancePct = 0.0015): Zone[] {
  const zones: Zone[] = [];
  for (const price of points) {
    let placed = false;
    for (const zone of zones) {
      if (Math.abs(price - zone.level) / Math.max(Math.abs(zone.level), 1e-9) <= tolerancePct) {
        zone.touches += 1;
        zone.level = (zone.level * (zone.touches - 1) + price) / zone.touches;
        placed = true;
        break;
      }
    }
    if (!placed) zones.push({ level: price, touches: 1 });
  }
  return zones.sort((a, b) => b.touches - a.touches).slice(0, 6);
}

function dynamicZones(bars: Bar[], lookback: number) {
  const slice = bars.slice(-lookback);
  const high = slice.map((b) => b.high);
  const low = slice.map((b) => b.low);
  const { maxima } = extrema(high);
  const { minima } = extrema(low);
  return {
    resistanceZones: cluster(maxima.map((i) => high[i]).sort((a, b) => b - a)),
    supportZones: cluster(minima.map((i) => low[i]).sort((a, b) => a - b)),
  };
}

export function supportResistance(bars: Bar[], lookback = 20) {
  const slice = bars.slice(-lookback);
  const last = slice[slice.length - 1];
  const pivot = (last.high + last.low + last.close) / 3;
  const highs = slice.map((b) => b.high);
  const lows = slice.map((b) => b.low);
  return {
    pivot,
    resistance1: 2 * pivot - last.low,
    support1: 2 * pivot - last.high,
    resistance2: pivot + last.high - last.low,
    support2: pivot - last.high + last.low,
    rangeHigh: Math.max(...highs),
    rangeLow: Math.min(...lows),
    psychologicalLevels: psychologicalLevels(last.close),
    dynamicZones: dynamicZones(bars, Math.max(lookback, 50)),
  };
}

export function volatilityProfile(bars: Bar[], lookback = 20) {
  const close = bars.map((b) => b.close);
  const rets: number[] = [];
  for (let i = Math.max(1, bars.length - lookback); i < bars.length; i++) {
    rets.push((close[i] - close[i - 1]) / close[i - 1]);
  }
  const sorted = [...rets].sort((a, b) => a - b);
  const var95 = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const tail = rets.filter((r) => r <= var95);
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length, 1);
  const last = close[close.length - 1];
  const atrPct =
    bars.slice(-lookback).reduce((a, b) => a + (b.high - b.low), 0) / lookback / last;
  return {
    realizedVolatility: Math.sqrt(variance) * Math.sqrt(252),
    var95,
    expectedShortfall95: tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : var95,
    atrPercent: atrPct,
  };
}

export function candlestickPatterns(bars: Bar[]) {
  const slice = bars.slice(-3);
  const cur = slice[slice.length - 1];
  const prev = slice[slice.length - 2] ?? cur;
  const body = Math.abs(cur.close - cur.open);
  const upper = cur.high - Math.max(cur.open, cur.close);
  const lower = Math.min(cur.open, cur.close) - cur.low;
  const range = cur.high - cur.low;
  const patterns: string[] = [];
  if (range > 0 && body <= range * 0.1) patterns.push("DOJI");
  if (lower >= body * 2 && upper <= body) patterns.push("HAMMER");
  if (upper >= body * 2 && lower <= body) patterns.push("SHOOTING_STAR");
  if (cur.close > cur.open && prev.close < prev.open && cur.close >= prev.open && cur.open <= prev.close) {
    patterns.push("BULLISH_ENGULFING");
  }
  if (cur.close < cur.open && prev.close > prev.open && cur.close <= prev.open && cur.open >= prev.close) {
    patterns.push("BEARISH_ENGULFING");
  }
  return {
    patterns,
    candle: {
      open: cur.open,
      high: cur.high,
      low: cur.low,
      close: cur.close,
      body,
      upperShadow: upper,
      lowerShadow: lower,
    },
  };
}

export function confluenceScore(bars: Bar[]) {
  const v = lastValues(bars, [
    "RSI_14",
    "MACD",
    "MACD_SIGNAL",
    "ADX_14",
    "BB_PERCENT",
    "TREND_STRENGTH",
    "VOLUME_RATIO",
    "PLUS_DI",
    "MINUS_DI",
    "STOCH_14",
  ]);
  let bullish = 0;
  bullish += Number(v.RSI_14 > 50);
  bullish += Number(v.MACD > v.MACD_SIGNAL);
  bullish += Number(v.ADX_14 > 20);
  bullish += Number(v.BB_PERCENT > 0.5);
  bullish += Number(v.TREND_STRENGTH > 0);
  bullish += Number(v.VOLUME_RATIO > 1);
  bullish += Number(v.PLUS_DI > v.MINUS_DI);
  bullish += Number(v.STOCH_14 > 50);
  const score = bullish / 8;
  const bias: Bias = score >= 0.625 ? "BULLISH" : score <= 0.375 ? "BEARISH" : "NEUTRAL";
  return { score, bias, components: v };
}

export function tradePlan(bars: Bar[], riskReward = 2): TradePlan {
  const close = bars[bars.length - 1].close;
  const v = lastValues(bars, ["ATR_14"]);
  const atr = Math.max(v.ATR_14, close * 0.0008);
  const bias = confluenceScore(bars).bias;
  const direction: Action = bias === "BULLISH" ? "BUY" : bias === "BEARISH" ? "SELL" : "WAIT";
  if (direction === "WAIT") {
    return { direction, entry: close, stopLoss: null, takeProfit: null, riskReward, atr, calibrationTier: "atr_fallback" };
  }
  const stop = direction === "BUY" ? close - 1.5 * atr : close + 1.5 * atr;
  const target = direction === "BUY" ? close + 1.5 * atr * riskReward : close - 1.5 * atr * riskReward;
  return { direction, entry: close, stopLoss: stop, takeProfit: target, riskReward, atr, calibrationTier: "atr_fallback" };
}

export function marketStructure(bars: Bar[], lookback = 50) {
  const slice = bars.slice(-lookback);
  const hh: Swing[] = [];
  const ll: Swing[] = [];
  for (let i = 2; i < slice.length - 2; i++) {
    const h = slice[i].high;
    const l = slice[i].low;
    if (h > slice[i - 1].high && h > slice[i - 2].high && h > slice[i + 1].high && h > slice[i + 2].high) {
      hh.push({ index: i, price: h });
    }
    if (l < slice[i - 1].low && l < slice[i - 2].low && l < slice[i + 1].low && l < slice[i + 2].low) {
      ll.push({ index: i, price: l });
    }
  }
  const structure: Bias =
    hh.length >= 2 && hh[hh.length - 1].price > hh[hh.length - 2].price
      ? "BULLISH"
      : ll.length >= 2 && ll[ll.length - 1].price < ll[ll.length - 2].price
        ? "BEARISH"
        : "NEUTRAL";
  return { structure, higherHighs: hh.slice(-5), lowerLows: ll.slice(-5), breakoutStrength: hh.length + ll.length };
}

export function wyckoffAnalysis(bars: Bar[], lookback = 50) {
  const slice = bars.slice(-Math.min(lookback, bars.length));
  const c = slice.map((b) => b.close);
  const rets: number[] = [];
  for (let i = 1; i < c.length; i++) rets.push((c[i] - c[i - 1]) / c[i - 1]);
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length, 1));
  const slope = linregSlope(c);
  const priceRange = (Math.max(...c) - Math.min(...c)) / (c.reduce((a, b) => a + b, 0) / c.length);
  let phase = "TRANSITION";
  let confidence = 0.3;
  if (priceRange < 0.03 && vol < 0.005) {
    phase = slope >= 0 ? "ACCUMULATION" : "DISTRIBUTION";
    confidence = slope >= 0 ? 0.6 : 0.5;
  } else if (slope > 0 && vol > 0.01) {
    phase = "MARKUP";
    confidence = 0.7;
  } else if (slope < 0 && vol > 0.01) {
    phase = "MARKDOWN";
    confidence = 0.7;
  }
  return { phase, confidence, priceRange, volatility: vol, lookback };
}

export function fibonacciAnalysis(bars: Bar[], lookback = 50) {
  const slice = bars.slice(-lookback);
  const swingHigh = Math.max(...slice.map((b) => b.high));
  const swingLow = Math.min(...slice.map((b) => b.low));
  const diff = swingHigh - swingLow;
  const targets = {
    fib_0: swingHigh,
    fib_236: swingHigh - 0.236 * diff,
    fib_382: swingHigh - 0.382 * diff,
    fib_5: swingHigh - 0.5 * diff,
    fib_618: swingHigh - 0.618 * diff,
    fib_786: swingHigh - 0.786 * diff,
    fib_1: swingLow,
  };
  const current = slice[slice.length - 1].close;
  const nearest = (Object.entries(targets) as [string, number][]).reduce((a, b) =>
    Math.abs(b[1] - current) < Math.abs(a[1] - current) ? b : a,
  );
  return { swingHigh, swingLow, currentPrice: current, nearestTarget: nearest[0], nearestPrice: nearest[1], targets };
}

export function orderBlocks(bars: Bar[], lookback = 50) {
  const slice = bars.slice(-lookback);
  const bullish: Block[] = [];
  const bearish: Block[] = [];
  for (let i = 2; i < slice.length - 1; i++) {
    const cur = slice[i];
    const prev = slice[i - 1];
    if (cur.close > cur.open && prev.close < prev.open && cur.close > prev.high) {
      bullish.push({ index: i - 1, open: prev.open, close: prev.close, high: prev.high, low: prev.low });
    }
    if (cur.close < cur.open && prev.close > prev.open && cur.close < prev.low) {
      bearish.push({ index: i - 1, open: prev.open, close: prev.close, high: prev.high, low: prev.low });
    }
  }
  return { bullish: bullish.slice(-5), bearish: bearish.slice(-5) };
}

export function fairValueGap(bars: Bar[], lookback = 30) {
  const slice = bars.slice(-lookback);
  const bullish: Gap[] = [];
  const bearish: Gap[] = [];
  for (let i = 2; i < slice.length; i++) {
    const prev2 = slice[i - 2];
    const prev = slice[i - 1];
    const cur = slice[i];
    if (cur.low > prev.high && prev.low > prev2.high && prev.low > prev2.high) {
      const gapLow = prev2.high;
      const gapHigh = prev.low;
      if (gapHigh > gapLow) bullish.push({ startIndex: i - 2, endIndex: i, gapLow, gapHigh });
    }
    if (cur.high < prev.low && prev.high < prev2.low) {
      const gapLow = prev.high;
      const gapHigh = prev2.low;
      if (gapHigh > gapLow) bearish.push({ startIndex: i - 2, endIndex: i, gapLow, gapHigh });
    }
  }
  return { bullish: bullish.slice(-5), bearish: bearish.slice(-5) };
}

export function liquidityZones(bars: Bar[], lookback = 100) {
  const slice = bars.slice(-lookback);
  const h = slice.map((b) => b.high);
  const l = slice.map((b) => b.low);
  const { maxima } = extrema(h);
  const { minima } = extrema(l);
  return {
    resistanceLevels: [...new Set(maxima.map((i) => h[i]))].sort((a, b) => b - a).slice(0, 5),
    supportLevels: [...new Set(minima.map((i) => l[i]))].sort((a, b) => a - b).slice(0, 5),
  };
}

export function supplyDemand(bars: Bar[], lookback = 50) {
  const blocks = orderBlocks(bars, lookback);
  const fvg = fairValueGap(bars, lookback);
  const liquidity = liquidityZones(bars, lookback);
  const demandStrength = blocks.bullish.length + fvg.bullish.length;
  const supplyStrength = blocks.bearish.length + fvg.bearish.length;
  const zoneBias = demandStrength > supplyStrength ? "DEMAND" : supplyStrength > demandStrength ? "SUPPLY" : "BALANCED";
  return { orderBlocks: blocks, fairValueGaps: fvg, liquidityZones: liquidity, demandStrength, supplyStrength, zoneBias };
}

export function detectDivergence(bars: Bar[], lookback = 80) {
  const slice = bars.slice(-lookback);
  const c = slice.map((b) => b.close);
  const series = computeSeries(slice);
  const osc = series.RSI_14;
  const cExt = extrema(c);
  const iExt = extrema(osc);
  let bullish = false;
  let bearish = false;
  let hiddenBullish = false;
  let hiddenBearish = false;
  if (cExt.minima.length >= 2 && iExt.minima.length >= 2) {
    const c1 = cExt.minima[cExt.minima.length - 2];
    const c2 = cExt.minima[cExt.minima.length - 1];
    const i1 = iExt.minima[iExt.minima.length - 2];
    const i2 = iExt.minima[iExt.minima.length - 1];
    if (c[c2] < c[c1] && osc[i2] > osc[i1]) bullish = true;
    if (c[c2] > c[c1] && osc[i2] < osc[i1]) hiddenBullish = true;
  }
  if (cExt.maxima.length >= 2 && iExt.maxima.length >= 2) {
    const c1 = cExt.maxima[cExt.maxima.length - 2];
    const c2 = cExt.maxima[cExt.maxima.length - 1];
    const i1 = iExt.maxima[iExt.maxima.length - 2];
    const i2 = iExt.maxima[iExt.maxima.length - 1];
    if (c[c2] > c[c1] && osc[i2] < osc[i1]) bearish = true;
    if (c[c2] < c[c1] && osc[i2] > osc[i1]) hiddenBearish = true;
  }
  const bias: Bias = bullish && !bearish ? "BULLISH" : bearish && !bullish ? "BEARISH" : "NEUTRAL";
  return { bias, bullish, bearish, hiddenBullish, hiddenBearish };
}

export function divergenceStrategy(bars: Bar[]) {
  const d = detectDivergence(bars);
  if (d.bullish) return { action: "BUY" as Action, confidence: d.hiddenBullish ? 0.55 : 0.7 };
  if (d.bearish) return { action: "SELL" as Action, confidence: d.hiddenBearish ? 0.55 : 0.7 };
  return { action: "WAIT" as Action, confidence: 0 };
}

export function advancedScoring(bars: Bar[]) {
  const v = lastValues(bars, [
    "RSI_14",
    "MACD",
    "MACD_SIGNAL",
    "ADX_14",
    "BB_PERCENT",
    "TREND_STRENGTH",
    "VOLUME_RATIO",
    "PLUS_DI",
    "MINUS_DI",
    "STOCH_14",
    "CHOPPINESS_INDEX",
    "FISHER_TRANSFORM",
    "ELDER_RAY_BULL_POWER",
  ]);
  let bullish = 0;
  const checks = [
    v.RSI_14 > 50,
    v.MACD > v.MACD_SIGNAL,
    v.ADX_14 > 20,
    v.BB_PERCENT > 0.5,
    v.TREND_STRENGTH > 0,
    v.VOLUME_RATIO > 1,
    v.PLUS_DI > v.MINUS_DI,
    v.STOCH_14 > 50,
    v.CHOPPINESS_INDEX < 50,
    v.FISHER_TRANSFORM > 0,
    v.ELDER_RAY_BULL_POWER > 0,
  ];
  for (const c of checks) if (c) bullish += 1;
  const score = bullish / checks.length;
  const bias: Bias = score >= 0.6 ? "BULLISH" : score <= 0.4 ? "BEARISH" : "NEUTRAL";
  return { score, bullishSignals: bullish, totalSignals: checks.length, bias, indicators: v };
}
