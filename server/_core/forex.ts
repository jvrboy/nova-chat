/**
 * Forex Analysis Tools for Nova Chat
 * Provides technical indicators, sentiment analysis, and market data tools
 */

// --- Technical Indicators ---

export type OHLCV = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };

export type TechnicalIndicatorResult = {
  name: string;
  values: number[];
  signal: 'bullish' | 'bearish' | 'neutral';
  description: string;
};

/** Simple Moving Average */
export function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

/** Exponential Moving Average */
export function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  // Start with SMA for the first value
  let prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < data.length; i++) {
    prev = (data[i] - prev) * multiplier + prev;
    result.push(prev);
  }
  return result;
}

/** Relative Strength Index */
export function rsi(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  if (gains.length < period) return result;
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i <= gains.length; i++) {
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

/** MACD */
export function macd(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const fastEma = ema(data, fastPeriod);
  const slowEma = ema(data, slowPeriod);
  // Align: fastEma starts at fastPeriod-1, slowEma starts at slowPeriod-1
  const offset = slowPeriod - fastPeriod;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  const signalLine = ema(macdLine, signalPeriod);
  const histogramOffset = signalPeriod - 1;
  const histogram: number[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + histogramOffset] - signalLine[i]);
  }
  return { macdLine, signalLine, histogram };
}

/** Bollinger Bands */
export function bollingerBands(data: number[], period: number = 20, stdDev: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < middle.length; i++) {
    const slice = data.slice(i, i + period);
    const mean = middle[i];
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(mean + stdDev * sd);
    lower.push(mean - stdDev * sd);
  }
  return { upper, middle, lower };
}

/** Stochastic Oscillator */
export function stochastic(highs: number[], lows: number[], closes: number[], kPeriod: number = 14, dPeriod: number = 3): { k: number[]; d: number[] } {
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...highSlice);
    const lowest = Math.min(...lowSlice);
    const k = highest === lowest ? 50 : ((closes[i] - lowest) / (highest - lowest)) * 100;
    kValues.push(k);
  }
  const dValues = sma(kValues, dPeriod);
  return { k: kValues, d: dValues };
}

/** Average True Range */
export function atr(data: OHLCV[], period: number = 14): number[] {
  const trValues: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
    trValues.push(tr);
  }
  if (trValues.length < period) return [];
  const result: number[] = [];
  let prev = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < trValues.length; i++) {
    prev = (prev * (period - 1) + trValues[i]) / period;
    result.push(prev);
  }
  return result;
}

/** Fibonacci Retracement Levels */
export function fibonacciRetracement(high: number, low: number): { level: string; price: number }[] {
  const diff = high - low;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  return ratios.map(r => ({ level: `${(r * 100).toFixed(1)}%`, price: high - diff * r }));
}

/** Pivot Points */
export function pivotPoints(high: number, low: number, close: number): { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number } {
  const pp = (high + low + close) / 3;
  return {
    pp,
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
  };
}

/** Volume Weighted Average Price */
export function vwap(data: OHLCV[]): number[] {
  const result: number[] = [];
  let cumVolume = 0;
  let cumTP = 0;
  for (const bar of data) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumVolume += bar.volume;
    cumTP += tp * bar.volume;
    result.push(cumTP / cumVolume);
  }
  return result;
}

// --- Sentiment Analysis ---

export type SentimentResult = {
  score: number; // -1 to 1
  label: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  signals: { indicator: string; signal: string; weight: number }[];
};

/** Analyze market sentiment from multiple indicators */
export function analyzeSentiment(closes: number[], highs: number[], lows: number[]): SentimentResult {
  const signals: { indicator: string; signal: string; weight: number }[] = [];
  let weightedScore = 0;
  let totalWeight = 0;
  const last = closes[closes.length - 1];
  
  // RSI signal
  const rsiValues = rsi(closes, 14);
  if (rsiValues.length > 0) {
    const rsiLast = rsiValues[rsiValues.length - 1];
    let signal: string; let score: number;
    if (rsiLast < 30) { signal = 'Oversold - Potential Buy'; score = 0.8; }
    else if (rsiLast < 40) { signal = 'Approaching Oversold'; score = 0.4; }
    else if (rsiLast > 70) { signal = 'Overbought - Potential Sell'; score = -0.8; }
    else if (rsiLast > 60) { signal = 'Approaching Overbought'; score = -0.4; }
    else { signal = 'Neutral Zone'; score = 0; }
    signals.push({ indicator: `RSI(${rsiLast.toFixed(1)})`, signal, weight: 2 });
    weightedScore += score * 2;
    totalWeight += 2;
  }
  
  // MACD signal
  const macdResult = macd(closes);
  if (macdResult.histogram.length > 0) {
    const histLast = macdResult.histogram[macdResult.histogram.length - 1];
    const histPrev = macdResult.histogram[macdResult.histogram.length - 2];
    let signal: string; let score: number;
    if (histLast > 0 && histLast > histPrev) { signal = 'Bullish Momentum Increasing'; score = 0.7; }
    else if (histLast > 0) { signal = 'Bullish Momentum'; score = 0.3; }
    else if (histLast < 0 && histLast < histPrev) { signal = 'Bearish Momentum Increasing'; score = -0.7; }
    else { signal = 'Bearish Momentum'; score = -0.3; }
    signals.push({ indicator: 'MACD', signal, weight: 2 });
    weightedScore += score * 2;
    totalWeight += 2;
  }
  
  // Bollinger Band signal
  const bb = bollingerBands(closes);
  if (bb.upper.length > 0) {
    const upper = bb.upper[bb.upper.length - 1];
    const lower = bb.lower[bb.lower.length - 1];
    let signal: string; let score: number;
    if (last <= lower) { signal = 'Price Below Lower Band - Buy Signal'; score = 0.6; }
    else if (last >= upper) { signal = 'Price Above Upper Band - Sell Signal'; score = -0.6; }
    else { signal = 'Price Within Bands'; score = 0; }
    signals.push({ indicator: 'Bollinger Bands', signal, weight: 1.5 });
    weightedScore += score * 1.5;
    totalWeight += 1.5;
  }
  
  // SMA crossover signal
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  if (sma20.length > 0 && sma50.length > 0) {
    const s20 = sma20[sma20.length - 1];
    const s50 = sma50[sma50.length - 1];
    let signal: string; let score: number;
    if (s20 > s50) { signal = 'Golden Cross (SMA20 > SMA50)'; score = 0.5; }
    else { signal = 'Death Cross (SMA20 < SMA50)'; score = -0.5; }
    signals.push({ indicator: 'SMA Crossover', signal, weight: 1.5 });
    weightedScore += score * 1.5;
    totalWeight += 1.5;
  }
  
  // Stochastic signal
  if (highs.length === closes.length && lows.length === closes.length) {
    const stoch = stochastic(highs, lows, closes);
    if (stoch.k.length > 0) {
      const kLast = stoch.k[stoch.k.length - 1];
      let signal: string; let score: number;
      if (kLast < 20) { signal = 'Oversold'; score = 0.6; }
      else if (kLast > 80) { signal = 'Overbought'; score = -0.6; }
      else { signal = 'Neutral'; score = 0; }
      signals.push({ indicator: `Stochastic(${kLast.toFixed(1)})`, signal, weight: 1 });
      weightedScore += score * 1;
      totalWeight += 1;
    }
  }
  
  const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  let label: SentimentResult['label'];
  if (normalizedScore > 0.5) label = 'strong_buy';
  else if (normalizedScore > 0.15) label = 'buy';
  else if (normalizedScore < -0.5) label = 'strong_sell';
  else if (normalizedScore < -0.15) label = 'sell';
  else label = 'neutral';
  
  return { score: normalizedScore, label, signals };
}

// --- Pip Calculator ---

export type PipResult = {
  pips: number;
  pipValue: number;
  profitLoss: number;
  direction: 'long' | 'short';
};

/** Calculate pip movement and P/L for forex pairs */
export function calculatePips(
  entryPrice: number,
  exitPrice: number,
  lotSize: number,
  pair: string = 'EUR/USD',
  accountCurrency: string = 'USD',
  exchangeRate: number = 1
): PipResult {
  const isJpy = pair.toUpperCase().includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const pips = (exitPrice - entryPrice) / pipSize;
  const direction: PipResult['direction'] = pips >= 0 ? 'long' : 'short';
  const pipValue = isJpy ? (lotSize * 1000 * pipSize * exchangeRate) : (lotSize * 100000 * pipSize * exchangeRate);
  const profitLoss = Math.abs(pips) * pipValue * (pips >= 0 ? 1 : -1);
  return { pips: Math.abs(pips), pipValue, profitLoss, direction };
}

// --- Risk Management ---

export type RiskResult = {
  positionSize: number;
  riskAmount: number;
  stopLossPips: number;
  takeProfitPips: number;
  riskRewardRatio: number;
  recommendedLotSize: number;
};

/** Calculate position size based on risk parameters */
export function calculateRisk(
  accountBalance: number,
  riskPercent: number,
  entryPrice: number,
  stopLossPrice: number,
  takeProfitPrice: number,
  pair: string = 'EUR/USD'
): RiskResult {
  const isJpy = pair.toUpperCase().includes('JPY');
  const pipSize = isJpy ? 0.01 : 0.0001;
  const riskAmount = accountBalance * (riskPercent / 100);
  const stopLossPips = Math.abs(entryPrice - stopLossPrice) / pipSize;
  const takeProfitPips = Math.abs(takeProfitPrice - entryPrice) / pipSize;
  const pipValue = isJpy ? 1000 * pipSize : 100000 * pipSize;
  const recommendedLotSize = stopLossPips > 0 ? riskAmount / (stopLossPips * pipValue) : 0;
  return {
    positionSize: recommendedLotSize,
    riskAmount,
    stopLossPips,
    takeProfitPips,
    riskRewardRatio: takeProfitPips / (stopLossPips || 1),
    recommendedLotSize: Math.min(recommendedLotSize, Math.floor(accountBalance / 1000) * 0.1), // Cap at reasonable size
  };
}

// --- Correlation ---

/** Calculate Pearson correlation between two price series */
export function correlation(seriesA: number[], seriesB: number[]): number {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 2) return 0;
  const a = seriesA.slice(0, n);
  const b = seriesB.slice(0, n);
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

// --- Full Market Analysis ---

export type MarketAnalysis = {
  timestamp: string;
  pair: string;
  currentPrice: number;
  indicators: {
    sma20: number | null;
    sma50: number | null;
    rsi: number | null;
    macd: { line: number | null; signal: number | null; histogram: number | null };
    bollingerBands: { upper: number | null; middle: number | null; lower: number | null };
    stochastic: { k: number | null; d: number | null };
    atr: number | null;
  };
  fibonacci: { level: string; price: number }[];
  pivotPoints: { pp: number; r1: number; r2: number; s1: number; s2: number } | null;
  sentiment: SentimentResult;
  support: number;
  resistance: number;
};

/** Run full technical analysis on OHLCV data */
export function fullAnalysis(data: OHLCV[], pair: string = 'EUR/USD'): MarketAnalysis {
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const currentPrice = closes[closes.length - 1];
  
  const sma20Val = sma(closes, 20);
  const sma50Val = sma(closes, 50);
  const rsiVal = rsi(closes, 14);
  const macdVal = macd(closes);
  const bbVal = bollingerBands(closes);
  const stochVal = stochastic(highs, lows, closes);
  const atrVal = atr(data, 14);
  const fibVal = fibonacciRetracement(Math.max(...highs.slice(-100)), Math.min(...lows.slice(-100)));
  const pivotVal = pivotPoints(
    Math.max(...highs.slice(-1)),
    Math.min(...lows.slice(-1)),
    currentPrice
  );
  const sentimentVal = analyzeSentiment(closes, highs, lows);
  
  const last = (arr: number[]) => arr.length > 0 ? arr[arr.length - 1] : null;
  
  return {
    timestamp: new Date().toISOString(),
    pair,
    currentPrice,
    indicators: {
      sma20: last(sma20Val),
      sma50: last(sma50Val),
      rsi: last(rsiVal),
      macd: { line: last(macdVal.macdLine), signal: last(macdVal.signalLine), histogram: last(macdVal.histogram) },
      bollingerBands: { upper: last(bbVal.upper), middle: last(bbVal.middle), lower: last(bbVal.lower) },
      stochastic: { k: last(stochVal.k), d: last(stochVal.d) },
      atr: last(atrVal),
    },
    fibonacci: fibVal,
    pivotPoints: { pp: pivotVal.pp, r1: pivotVal.r1, r2: pivotVal.r2, s1: pivotVal.s1, s2: pivotVal.s2 },
    sentiment: sentimentVal,
    support: Math.min(...lows.slice(-20)),
    resistance: Math.max(...highs.slice(-20)),
  };
}
