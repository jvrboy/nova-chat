/**
 * Trading Strategy Backtesting Engine for Nova Chat
 * Extracted and generalized from RSI + Bollinger Band Reversal strategy
 * Supports custom strategy definitions, backtesting, and Deriv API integration
  */
import { ichimokuCloudIndicator, fibonacciRetracementIndicator, superTrendIndicator } from "./technicalIndicators";
// --- Types ---

export type OHLCV = { timestamp: number; open: number; high: number; low: number; close: number; volume: number };
export type TradeSignal = 'LONG' | 'SHORT' | 'NEUTRAL';
export type TradeExitReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_EXIT' | 'SIGNAL_REVERSAL';

export type Trade = {
  id: number;
  entryTime: number;
  exitTime: number | null;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  pnlPips: number | null;
  exitReason: TradeExitReason | null;
  holdingBars: number;
  tpPrice: number;
  slPrice: number;
};

export type BacktestResult = {
  trades: Trade[];
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPips: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgHoldingBars: number;
  longTrades: number;
  shortTrades: number;
  longWinRate: number;
  shortWinRate: number;
  tpHits: number;
  slHits: number;
  timeExits: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  expectancy: number;
  equityCurve: number[];
  drawdownCurve: number[];
};

export type StrategyRule = {
  type: 'rsi_bb_reversal' | 'macd_cross' | 'stochastic_cross' | 'ema_cross' | 'ichimoku_supertrend' | 'fibonacci_breakout' | 'multi_indicator_confluence' | 'breakout' | 'mean_reversion' | 'custom';
  params: Record<string, number | string | boolean>;
};

export type StrategyDefinition = {
  name: string;
  description: string;
  timeframe: string;
  marketType: string;
  entryRules: StrategyRule[];
  exitRules: {
    tpAtrMult: number;
    slAtrMult: number;
    trailingStop?: boolean;
    trailingAtrMult?: number;
    maxHoldingBars: number;
  };
  riskManagement: {
    riskPerTrade: number; // % of account
    maxConcurrentPositions: number;
    minBarsBetweenTrades: number;
    reduceSizeHighVol?: boolean;
    highVolAtrMult?: number;
  };
};

// --- Technical Indicators (Proper Implementations) ---

export function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    result.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

export function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < data.length; i++) {
    prev = data[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function rsi(data: number[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < data.length; i++) gains.push(data[i] > data[i-1] ? data[i] - data[i-1] : 0);
  for (let i = 1; i < data.length; i++) losses.push(data[i] < data[i-1] ? data[i-1] - data[i] : 0);
  if (gains.length < period) return result;
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i <= gains.length; i++) {
    if (i > period) { avgGain = (avgGain * (period-1) + gains[i-1]) / period; avgLoss = (avgLoss * (period-1) + losses[i-1]) / period; }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

export function trueRange(data: OHLCV[]): number[] {
  const result: number[] = [];
  for (let i = 1; i < data.length; i++) {
    result.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - data[i-1].close), Math.abs(data[i].low - data[i-1].close)));
  }
  return result;
}

export function atr(data: OHLCV[], period: number = 14): number[] {
  const tr = trueRange(data);
  const result: number[] = [];
  if (tr.length < period) return result;
  let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < tr.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    result.push(prev);
  }
  return result;
}

export function bollingerBands(data: number[], period: number = 20, stdMult: number = 2): { upper: number[]; middle: number[]; lower: number[]; pctB: number[]; bandwidth: number[] } {
  const middle = sma(data, period);
  const upper: number[] = []; const lower: number[] = []; const pctB: number[] = []; const bandwidth: number[] = [];
  for (let i = 0; i < middle.length; i++) {
    const slice = data.slice(i, i + period);
    const mean = middle[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    const u = mean + stdMult * sd; const l = mean - stdMult * sd;
    upper.push(u); lower.push(l);
    pctB.push(sd === 0 ? 0.5 : (data[i + period - 1] - l) / (u - l));
    bandwidth.push(mean === 0 ? 0 : (u - l) / mean * 100);
  }
  return { upper, middle, lower, pctB, bandwidth };
}

export function macd(data: number[], fast: number = 12, slow: number = 26, signal: number = 9): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const fastEma = ema(data, fast);
  const slowEma = ema(data, slow);
  const offset = slow - fast;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) macdLine.push(fastEma[i + offset] - slowEma[i]);
  const signalLine = ema(macdLine, signal);
  const histOffset = signal - 1;
  const histogram: number[] = [];
  for (let i = 0; i < signalLine.length; i++) histogram.push(macdLine[i + histOffset] - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

export function stochastic(data: OHLCV[], kPeriod: number = 14, dPeriod: number = 3): { k: number[]; d: number[] } {
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < data.length; i++) {
    const highs = data.slice(i - kPeriod + 1, i + 1).map(d => d.high);
    const lows = data.slice(i - kPeriod + 1, i + 1).map(d => d.low);
    const hh = Math.max(...highs); const ll = Math.min(...lows);
    kValues.push(hh === ll ? 50 : ((data[i].close - ll) / (hh - ll)) * 100);
  }
  const dValues = sma(kValues, dPeriod);
  return { k: kValues, d: dValues };
}

export function adx(data: OHLCV[], period: number = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const tr = trueRange(data);
  if (tr.length < period) return { adx: [], plusDI: [], minusDI: [] };
  const plusDM: number[] = []; const minusDM: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const upMove = data[i].high - data[i-1].high;
    const downMove = data[i-1].low - data[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  const smoothTR: number[] = []; const smoothPDM: number[] = []; const smoothMDM: number[] = [];
  let sTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let sPDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let sMDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  smoothTR.push(sTR); smoothPDM.push(sPDM); smoothMDM.push(sMDM);
  for (let i = period; i < tr.length; i++) {
    sTR = sTR - sTR/period + tr[i];
    sPDM = sPDM - sPDM/period + plusDM[i];
    sMDM = sMDM - sMDM/period + minusDM[i];
    smoothTR.push(sTR); smoothPDM.push(sPDM); smoothMDM.push(sMDM);
  }
  const plusDI = smoothPDM.map((v, i) => smoothTR[i] === 0 ? 0 : (v / smoothTR[i]) * 100);
  const minusDI = smoothMDM.map((v, i) => smoothTR[i] === 0 ? 0 : (v / smoothTR[i]) * 100);
  const dx = plusDI.map((v, i) => {
    const sum = v + minusDI[i]; return sum === 0 ? 0 : Math.abs(v - minusDI[i]) / sum * 100;
  });
  const adxValues = ema(dx, period);
  return { adx: adxValues, plusDI, minusDI };
}

export function williamsR(data: OHLCV[], period: number = 14): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const highs = data.slice(i - period + 1, i + 1).map(d => d.high);
    const lows = data.slice(i - period + 1, i + 1).map(d => d.low);
    const hh = Math.max(...highs); const ll = Math.min(...lows);
    result.push(hh === ll ? -50 : ((hh - data[i].close) / (hh - ll)) * -100);
  }
  return result;
}

export function cci(data: OHLCV[], period: number = 20): number[] {
  const tp = data.map(d => (d.high + d.low + d.close) / 3);
  const tpSma = sma(tp, period);
  const result: number[] = [];
  for (let i = 0; i < tpSma.length; i++) {
    const slice = tp.slice(i, i + period);
    const mean = tpSma[i];
    const meanDev = slice.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
    result.push(meanDev === 0 ? 0 : (tp[i + period - 1] - mean) / (0.015 * meanDev));
  }
  return result;
}

export function obv(data: OHLCV[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i-1].close) result.push(result[i-1] + data[i].volume);
    else if (data[i].close < data[i-1].close) result.push(result[i-1] - data[i].volume);
    else result.push(result[i-1]);
  }
  return result;
}

export function vwap(data: OHLCV[]): number[] {
  const result: number[] = [];
  let cumTPV = 0; let cumV = 0;
  for (const bar of data) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumTPV += tp * bar.volume;
    cumV += bar.volume;
    result.push(cumV === 0 ? bar.close : cumTPV / cumV);
  }
  return result;
}

// --- Signal Generation ---

export function generateRSIBBSignal(candles: OHLCV[], params?: { rsiPeriod?: number; rsiOversold?: number; rsiOverbought?: number; bbPeriod?: number; bbStdDev?: number }): TradeSignal[] {
  const rsiPeriod = params?.rsiPeriod ?? 14;
  const rsiOversold = params?.rsiOversold ?? 35;
  const rsiOverbought = params?.rsiOverbought ?? 65;
  const bbPeriod = params?.bbPeriod ?? 20;
  const bbStdDev = params?.bbStdDev ?? 2;
  const closes = candles.map(c => c.close);
  const rsiVals = rsi(closes, rsiPeriod);
  const bb = bollingerBands(closes, bbPeriod, bbStdDev);
  const signals: TradeSignal[] = [];
  // Align all arrays to the same index space (offset by the longest lookback)
  const offset = Math.max(rsiPeriod, bbPeriod) - 1;
  for (let i = 0; i < candles.length; i++) {
    const rsiIdx = i - offset;
    const bbIdx = i - bbPeriod + 1;
    if (rsiIdx < 0 || bbIdx < 0 || bbIdx >= bb.lower.length) { signals.push('NEUTRAL'); continue; }
    const price = candles[i].close;
    const rsiVal = rsiVals[rsiIdx];
    const lowerBand = bb.lower[bbIdx];
    const upperBand = bb.upper[bbIdx];
    if (price <= lowerBand && rsiVal < rsiOversold) signals.push('LONG');
    else if (price >= upperBand && rsiVal > rsiOverbought) signals.push('SHORT');
    else signals.push('NEUTRAL');
  }
  return signals;
}

export function generateMACDCrossSignal(candles: OHLCV[], params?: { fast?: number; slow?: number; signal?: number }): TradeSignal[] {
  const { histogram } = macd(candles.map(c => c.close), params?.fast ?? 12, params?.slow ?? 26, params?.signal ?? 9);
  const signals: TradeSignal[] = [];
  const offset = 26 - 1 + 9 - 1; // slow + signal alignment
  for (let i = 0; i < candles.length; i++) {
    const histIdx = i - offset;
    if (histIdx < 1 || histIdx >= histogram.length) { signals.push('NEUTRAL'); continue; }
    if (histogram[histIdx - 1] <= 0 && histogram[histIdx] > 0) signals.push('LONG');
    else if (histogram[histIdx - 1] >= 0 && histogram[histIdx] < 0) signals.push('SHORT');
    else signals.push('NEUTRAL');
  }
  return signals;
}

export function generateStochasticCrossSignal(candles: OHLCV[], params?: { kPeriod?: number; dPeriod?: number; overbought?: number; oversold?: number }): TradeSignal[] {
  const kP = params?.kPeriod ?? 14;
  const dP = params?.dPeriod ?? 3;
  const ob = params?.overbought ?? 80;
  const os = params?.oversold ?? 20;
  const { k, d } = stochastic(candles, kP, dP);
  const signals: TradeSignal[] = [];
  const offset = kP - 1 + dP - 1;
  for (let i = 0; i < candles.length; i++) {
    const dIdx = i - offset;
    if (dIdx < 1 || dIdx >= d.length) { signals.push('NEUTRAL'); continue; }
    const kIdx = dIdx + dP - 1;
    if (k[kIdx] > d[dIdx] && k[kIdx] < ob && k[kIdx-1] <= d[dIdx-1]) signals.push('LONG');
    else if (k[kIdx] < d[dIdx] && k[kIdx] > os && k[kIdx-1] >= d[dIdx-1]) signals.push('SHORT');
    else signals.push('NEUTRAL');
  }
  return signals;
}

export function generateIchimokuSuperTrendSignal(candles: OHLCV[], params?: { conversionPeriod?: number; basePeriod?: number; spanPeriod?: number; displacement?: number; superTrendPeriod?: number; multiplier?: number }): TradeSignal[] { return candles.map((_, i) => { const slice = candles.slice(0, i + 1); if (slice.length < Math.max(params?.spanPeriod ?? 52, params?.superTrendPeriod ?? 10)) return 'NEUTRAL'; const cloud = ichimokuCloudIndicator(slice, params?.conversionPeriod ?? 9, params?.basePeriod ?? 26, params?.spanPeriod ?? 52, params?.displacement ?? 26); const trend = superTrendIndicator(slice, params?.superTrendPeriod ?? 10, params?.multiplier ?? 3); return cloud.bias === "above-cloud" && trend.direction === "up" ? "LONG" : cloud.bias === "below-cloud" && trend.direction === "down" ? "SHORT" : "NEUTRAL"; }); }
export function generateFibonacciBreakoutSignal(candles: OHLCV[], params?: { lookback?: number; thresholdBps?: number }): TradeSignal[] { const lookback = params?.lookback ?? 100; const threshold = (params?.thresholdBps ?? 5) / 10000; return candles.map((_, i) => { const slice = candles.slice(0, i + 1); if (slice.length < Math.min(lookback, 20)) return 'NEUTRAL'; const fib = fibonacciRetracementIndicator(slice, lookback); const close = slice.at(-1)?.close ?? 0; const levels = Object.values(fib.levels).map(Number); const upper = Math.max(...levels); const lower = Math.min(...levels); return close > upper * (1 + threshold) ? "LONG" : close < lower * (1 - threshold) ? "SHORT" : "NEUTRAL"; }); }
export function generateConfluenceSignal(candles: OHLCV[]): TradeSignal[] { return candles.map((_, i) => { const slice = candles.slice(0, i + 1); if (slice.length < 30) return 'NEUTRAL'; const cloud = ichimokuCloudIndicator(slice); const trend = superTrendIndicator(slice); const emaSignal = generateEMACrossSignal(slice).at(-1); const votes = [cloud.bias === "above-cloud" ? 1 : cloud.bias === "below-cloud" ? -1 : 0, trend.direction === "up" ? 1 : -1, emaSignal === "LONG" ? 1 : emaSignal === "SHORT" ? -1 : 0]; return votes.reduce((sum, vote) => sum + vote, 0) >= 2 ? "LONG" : votes.reduce((sum, vote) => sum + vote, 0) <= -2 ? "SHORT" : "NEUTRAL"; }); }
export function generateEMACrossSignal(candles: OHLCV[], params?: { fast?: number; slow?: number }): TradeSignal[] {
  const fast = params?.fast ?? 12;
  const slow = params?.slow ?? 26;
  const fastEma = ema(candles.map(c => c.close), fast);
  const slowEma = ema(candles.map(c => c.close), slow);
  const signals: TradeSignal[] = [];
  const offset = slow - 1;
  const fastOffset = slow - fast;
  for (let i = 0; i < candles.length; i++) {
    const sIdx = i - offset;
    if (sIdx < 1 || sIdx >= slowEma.length) { signals.push('NEUTRAL'); continue; }
    const fIdx = sIdx + fastOffset;
    if (fastEma[fIdx] > slowEma[sIdx] && fastEma[fIdx - 1] <= slowEma[sIdx - 1]) signals.push('LONG');
    else if (fastEma[fIdx] < slowEma[sIdx] && fastEma[fIdx - 1] >= slowEma[sIdx - 1]) signals.push('SHORT');
    else signals.push('NEUTRAL');
  }
  return signals;
}

// --- Backtesting Engine ---

export function runBacktest(candles: OHLCV[], strategy: StrategyDefinition): BacktestResult {
  const signals = generateSignals(candles, strategy.entryRules);
  const atrVals = atr(candles, 14);
  const atrOffset = 14; // ATR needs 15 candles (14 + 1 for TR)
  const trades: Trade[] = [];
  let tradeId = 0;
  let activeTrade: Trade | null = null;
  let lastExitBar = -999;
  const equity = 10000;
  const equityCurve: number[] = [equity];
  let peak = equity;
  const drawdownCurve: number[] = [0];
  let maxDD = 0;
  const isJpy = strategy.name.toLowerCase().includes('jpy');
  const pipSize = isJpy ? 0.01 : 0.0001;

  for (let i = 0; i < candles.length; i++) {
    const currentAtr = i - atrOffset >= 0 && i - atrOffset < atrVals.length ? atrVals[i - atrOffset] : (candles[i].high - candles[i].low);

    // Check active trade exit conditions
    if (activeTrade) {
      const trade = activeTrade;
      trade.holdingBars++;
      let exitPrice: number | null = null;
      let exitReason: TradeExitReason | null = null;

      if (trade.direction === 'LONG') {
        if (candles[i].high >= trade.tpPrice) { exitPrice = trade.tpPrice; exitReason = 'TAKE_PROFIT'; }
        else if (candles[i].low <= trade.slPrice) { exitPrice = trade.slPrice; exitReason = 'STOP_LOSS'; }
      } else {
        if (candles[i].low <= trade.tpPrice) { exitPrice = trade.tpPrice; exitReason = 'TAKE_PROFIT'; }
        else if (candles[i].high >= trade.slPrice) { exitPrice = trade.slPrice; exitReason = 'STOP_LOSS'; }
      }

      if (trade.holdingBars >= strategy.exitRules.maxHoldingBars && !exitPrice) {
        exitPrice = candles[i].close;
        exitReason = 'TIME_EXIT';
      }

      // Check for signal reversal
      if (!exitPrice && signals[i] !== 'NEUTRAL') {
        if (trade.direction === 'LONG' && signals[i] === 'SHORT') { exitPrice = candles[i].close; exitReason = 'SIGNAL_REVERSAL'; }
        else if (trade.direction === 'SHORT' && signals[i] === 'LONG') { exitPrice = candles[i].close; exitReason = 'SIGNAL_REVERSAL'; }
      }

      if (exitPrice && exitReason) {
        trade.exitPrice = exitPrice;
        trade.exitTime = candles[i].timestamp;
        trade.exitReason = exitReason;
        const pipDiff = trade.direction === 'LONG' ? (exitPrice - trade.entryPrice) : (trade.entryPrice - exitPrice);
        trade.pnlPips = Math.round(pipDiff / pipSize * 100) / 100;
        trade.pnl = pipDiff * trade.quantity;
        trades.push(trade);
        activeTrade = null;
        lastExitBar = i;
      }
    }

    // Check for new entry
    if (!activeTrade && signals[i] !== 'NEUTRAL' && (i - lastExitBar) >= (strategy.riskManagement.minBarsBetweenTrades ?? 5)) {
      const tpAtrMult = strategy.exitRules.tpAtrMult;
      const slAtrMult = strategy.exitRules.slAtrMult;
      const direction = signals[i] as 'LONG' | 'SHORT';
      const entryPrice = candles[i].close;
      const tpPrice = direction === 'LONG' ? entryPrice + tpAtrMult * currentAtr : entryPrice - tpAtrMult * currentAtr;
      const slPrice = direction === 'LONG' ? entryPrice - slAtrMult * currentAtr : entryPrice + slAtrMult * currentAtr;
      tradeId++;
      activeTrade = {
        id: tradeId, entryTime: candles[i].timestamp, exitTime: null, direction,
        entryPrice, exitPrice: null, quantity: 1, pnl: null, pnlPips: null,
        exitReason: null, holdingBars: 0, tpPrice, slPrice,
      };
    }

    // Update equity curve
    const currentEquity = equity + trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    equityCurve.push(currentEquity);
    if (currentEquity > peak) peak = currentEquity;
    const dd = peak > 0 ? (peak - currentEquity) / peak * 100 : 0;
    drawdownCurve.push(-dd);
    if (dd > maxDD) maxDD = dd;
  }

  return computeStats(trades, equityCurve, drawdownCurve);
}

function generateSignals(candles: OHLCV[], rules: StrategyRule[]): TradeSignal[] {
  for (const rule of rules) {
    switch (rule.type) {
      case 'rsi_bb_reversal': return generateRSIBBSignal(candles, rule.params as any);
      case 'macd_cross': return generateMACDCrossSignal(candles, rule.params as any);
      case 'stochastic_cross': return generateStochasticCrossSignal(candles, rule.params as any);
      case 'ema_cross': return generateEMACrossSignal(candles, rule.params as any);
      case 'ichimoku_supertrend': return generateIchimokuSuperTrendSignal(candles, rule.params as any);
      case 'fibonacci_breakout': return generateFibonacciBreakoutSignal(candles, rule.params as any);
      case 'multi_indicator_confluence': return generateConfluenceSignal(candles);
    }
  }
  return candles.map(() => 'NEUTRAL');
}

function computeStats(trades: Trade[], equityCurve: number[], drawdownCurve: number[]): BacktestResult {
  const wins = trades.filter(t => (t.pnl ?? 0) > 0);
  const losses = trades.filter(t => (t.pnl ?? 0) < 0);
  const totalWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const longs = trades.filter(t => t.direction === 'LONG');
  const shorts = trades.filter(t => t.direction === 'SHORT');
  const longWins = longs.filter(t => (t.pnl ?? 0) > 0);
  const shortWins = shorts.filter(t => (t.pnl ?? 0) > 0);
  const returns = equityCurve.slice(1).map((v, i) => i === 0 ? 0 : (v - equityCurve[i]) / equityCurve[i]);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / (returns.length || 1));
  const negReturns = returns.filter(r => r < 0);
  const downDev = Math.sqrt(negReturns.reduce((s, r) => s + r ** 2, 0) / (negReturns.length || 1));
  // Consecutive wins/losses
  let maxConsWins = 0, maxConsLosses = 0, consWins = 0, consLosses = 0;
  for (const t of trades) {
    if ((t.pnl ?? 0) > 0) { consWins++; consLosses = 0; maxConsWins = Math.max(maxConsWins, consWins); }
    else if ((t.pnl ?? 0) < 0) { consLosses++; consWins = 0; maxConsLosses = Math.max(maxConsLosses, consLosses); }
    else { consWins = 0; consLosses = 0; }
  }
  return {
    trades, totalTrades: trades.length, winRate: trades.length > 0 ? (wins.length / trades.length * 100) : 0,
    totalPnl: Math.round(trades.reduce((s, t) => s + (t.pnl ?? 0), 0) * 100) / 100,
    totalPnlPips: Math.round(trades.reduce((s, t) => s + (t.pnlPips ?? 0), 0) * 100) / 100,
    avgWin: wins.length > 0 ? totalWin / wins.length : 0, avgLoss: losses.length > 0 ? -totalLoss / losses.length : 0,
    profitFactor: totalLoss === 0 ? 0 : totalWin / totalLoss,
    maxDrawdown: Math.round(Math.max(...drawdownCurve.map(Math.abs)) * 100) / 100,
    maxDrawdownPct: Math.round(Math.max(...drawdownCurve.map(Math.abs)) * 100) / 100,
    sharpeRatio: stdReturn === 0 ? 0 : Math.round((avgReturn / stdReturn) * 100) / 100,
    sortinoRatio: downDev === 0 ? 0 : Math.round((avgReturn / downDev) * 100) / 100,
    avgHoldingBars: trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.holdingBars, 0) / trades.length * 10) / 10 : 0,
    longTrades: longs.length, shortTrades: shorts.length,
    longWinRate: longs.length > 0 ? (longWins.length / longs.length * 100) : 0,
    shortWinRate: shorts.length > 0 ? (shortWins.length / shorts.length * 100) : 0,
    tpHits: trades.filter(t => t.exitReason === 'TAKE_PROFIT').length,
    slHits: trades.filter(t => t.exitReason === 'STOP_LOSS').length,
    timeExits: trades.filter(t => t.exitReason === 'TIME_EXIT').length,
    consecutiveWins: maxConsWins, consecutiveLosses: maxConsLosses,
    expectancy: trades.length > 0 ? (trades.reduce((s, t) => s + (t.pnl ?? 0), 0)) / trades.length : 0,
    equityCurve, drawdownCurve,
  };
}

// --- Built-in Strategies ---

export const BUILT_IN_STRATEGIES: StrategyDefinition[] = [
  {
    name: 'RSI + BB Reversal',
    description: 'Mean reversion combining RSI overbought/oversold with Bollinger Band extremes. Best for ranging markets on V75.',
    timeframe: '1M',
    marketType: 'ranging',
    entryRules: [{ type: 'rsi_bb_reversal', params: { rsiPeriod: 14, rsiOversold: 35, rsiOverbought: 65, bbPeriod: 20, bbStdDev: 2 } }],
    exitRules: { tpAtrMult: 1.5, slAtrMult: 1.2, maxHoldingBars: 30 },
    riskManagement: { riskPerTrade: 2, maxConcurrentPositions: 3, minBarsBetweenTrades: 5 },
  },
  {
    name: 'MACD Crossover',
    description: 'Classic MACD histogram zero-line crossover strategy. Good for trending markets.',
    timeframe: '5M',
    marketType: 'trending',
    entryRules: [{ type: 'macd_cross', params: { fast: 12, slow: 26, signal: 9 } }],
    exitRules: { tpAtrMult: 2.0, slAtrMult: 1.0, trailingStop: true, trailingAtrMult: 1.0, maxHoldingBars: 60 },
    riskManagement: { riskPerTrade: 2, maxConcurrentPositions: 2, minBarsBetweenTrades: 10 },
  },
  {
    name: 'Stochastic Cross',
    description: 'Stochastic %K/%D crossover in overbought/oversold zones. Ranging market scalping.',
    timeframe: '1M',
    marketType: 'ranging',
    entryRules: [{ type: 'stochastic_cross', params: { kPeriod: 14, dPeriod: 3, overbought: 80, oversold: 20 } }],
    exitRules: { tpAtrMult: 1.5, slAtrMult: 1.0, maxHoldingBars: 20 },
    riskManagement: { riskPerTrade: 1.5, maxConcurrentPositions: 3, minBarsBetweenTrades: 3 },
  },
  {
    name: 'EMA Cross Trend',
    description: 'Fast/slow EMA crossover for trend following. Works well on higher timeframes.',
    timeframe: '15M',
    marketType: 'trending',
    entryRules: [{ type: 'ema_cross', params: { fast: 12, slow: 26 } }],
    exitRules: { tpAtrMult: 3.0, slAtrMult: 1.5, trailingStop: true, trailingAtrMult: 1.5, maxHoldingBars: 100 },
    riskManagement: { riskPerTrade: 2, maxConcurrentPositions: 2, minBarsBetweenTrades: 15 },
  },
  {
    name: 'Ichimoku + SuperTrend Regime',
    description: 'Trend-regime strategy requiring price above/below the Ichimoku cloud and matching SuperTrend direction.',
    timeframe: '1H',
    marketType: 'trending',
    entryRules: [{ type: 'ichimoku_supertrend', params: { conversionPeriod: 9, basePeriod: 26, spanPeriod: 52, superTrendPeriod: 10, multiplier: 3 } }],
    exitRules: { tpAtrMult: 3.0, slAtrMult: 1.5, trailingStop: true, trailingAtrMult: 1.5, maxHoldingBars: 120 },
    riskManagement: { riskPerTrade: 1, maxConcurrentPositions: 1, minBarsBetweenTrades: 20 },
  },
  {
    name: 'Fibonacci Range Breakout',
    description: 'Breakout screen using recent Fibonacci range extremes with ATR-based exits and bounded lookback.',
    timeframe: '15M',
    marketType: 'breakout',
    entryRules: [{ type: 'fibonacci_breakout', params: { lookback: 100, thresholdBps: 5 } }],
    exitRules: { tpAtrMult: 2.5, slAtrMult: 1.25, trailingStop: true, trailingAtrMult: 1.25, maxHoldingBars: 80 },
    riskManagement: { riskPerTrade: 1, maxConcurrentPositions: 1, minBarsBetweenTrades: 25 },
  },
  {
    name: 'Multi-Indicator Confluence',
    description: 'Requires agreement from Ichimoku location, SuperTrend direction, and EMA crossover before entering.',
    timeframe: '4H',
    marketType: 'trending',
    entryRules: [{ type: 'multi_indicator_confluence', params: {} }],
    exitRules: { tpAtrMult: 3.5, slAtrMult: 1.75, trailingStop: true, trailingAtrMult: 1.5, maxHoldingBars: 160 },
    riskManagement: { riskPerTrade: .75, maxConcurrentPositions: 1, minBarsBetweenTrades: 30 },
  },
];

// --- Candlestick Pattern Detection (REAL implementations) ---

export type CandlePattern = {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  reliability: 'low' | 'medium' | 'high';
  description: string;
};

export function detectCandlePatterns(candles: OHLCV[]): CandlePattern[][] {
  return candles.map((c, i) => {
    const patterns: CandlePattern[] = [];
    if (i < 1) return patterns;
    const prev = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const isBullish = c.close > c.open;
    const prevBody = Math.abs(prev.close - prev.open);
    const prevRange = prev.high - prev.low;
    const prevIsBullish = prev.close > prev.open;
    // Doji
    if (body < range * 0.1 && range > 0) patterns.push({ name: 'Doji', type: 'neutral', reliability: 'medium', description: 'Indecision candle - potential reversal' });
    // Hammer
    if (lowerWick > body * 2 && upperWick < body * 0.5 && !isBullish && lowerWick > range * 0.6) patterns.push({ name: 'Hammer', type: 'bullish', reliability: 'high', description: 'Bullish reversal after downtrend' });
    // Shooting Star
    if (upperWick > body * 2 && lowerWick < body * 0.5 && isBullish && upperWick > range * 0.6) patterns.push({ name: 'Shooting Star', type: 'bearish', reliability: 'high', description: 'Bearish reversal after uptrend' });
    // Bullish Engulfing
    if (isBullish && !prevIsBullish && c.open <= prev.close && c.close >= prev.open && body > prevBody) patterns.push({ name: 'Bullish Engulfing', type: 'bullish', reliability: 'high', description: 'Strong bullish reversal pattern' });
    // Bearish Engulfing
    if (!isBullish && prevIsBullish && c.open >= prev.close && c.close <= prev.open && body > prevBody) patterns.push({ name: 'Bearish Engulfing', type: 'bearish', reliability: 'high', description: 'Strong bearish reversal pattern' });
    // Morning Star / Evening Star
    if (i >= 2) {
      const twoBefore = candles[i - 2];
      const twoBeforeBody = Math.abs(twoBefore.close - twoBefore.open);
      if (!prevIsBullish && prevBody < twoBeforeBody * 0.3 && isBullish && body > twoBeforeBody * 0.5 && c.close > (twoBefore.open + twoBefore.close) / 2) patterns.push({ name: 'Morning Star', type: 'bullish', reliability: 'high', description: 'Three-candle bullish reversal' });
      if (prevIsBullish && prevBody < twoBeforeBody * 0.3 && !isBullish && body > twoBeforeBody * 0.5 && c.close < (twoBefore.open + twoBefore.close) / 2) patterns.push({ name: 'Evening Star', type: 'bearish', reliability: 'high', description: 'Three-candle bearish reversal' });
    }
    // Piercing Line
    if (!isBullish && prevIsBullish && c.open < prev.low && c.close > (prev.open + prev.close) / 2 && c.close < prev.open) patterns.push({ name: 'Piercing Line', type: 'bullish', reliability: 'medium', description: 'Bullish reversal - price pierces midpoint' });
    // Dark Cloud Cover
    if (isBullish && !prevIsBullish && c.open > prev.high && c.close < (prev.open + prev.close) / 2 && c.close > prev.open) patterns.push({ name: 'Dark Cloud Cover', type: 'bearish', reliability: 'medium', description: 'Bearish reversal - dark cloud pattern' });
    // Spinning Top
    if (body < range * 0.25 && upperWick > body * 0.5 && lowerWick > body * 0.5) patterns.push({ name: 'Spinning Top', type: 'neutral', reliability: 'low', description: 'Indecision with significant wicks' });
    // Marubozu
    if (upperWick < range * 0.05 && lowerWick < range * 0.05 && body > range * 0.8) {
      patterns.push({ name: isBullish ? 'Bullish Marubozu' : 'Bearish Marubozu', type: isBullish ? 'bullish' : 'bearish', reliability: 'medium', description: `Strong ${isBullish ? 'buying' : 'selling'} pressure` });
    }
    return patterns;
  });
}

// --- Deriv API Integration ---

export type DerivCandle = { epoch: number; open: number; high: number; low: number; close: number; ask: number; bid: number };

export function buildDerivWebSocketURL(appId: string = '1089'): string {
  return `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
}

export function buildDerivCandleRequest(symbol: string, granularity: number = 60, count: number = 1000): string {
  return JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count, end: 'latest', granularity, style: 'candles' });
}

export function buildDerivSubscriptionRequest(symbol: string, granularity: number = 60): string {
  return JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count: 1, end: 'latest', granularity, style: 'candles', subscribe: 1 });
}

export function parseDerivCandles(response: { candles: Array<{ epoch: number; open: number; high: number; low: number; close: number }> }): OHLCV[] {
  return (response.candles ?? []).map(c => ({ timestamp: c.epoch * 1000, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }));
}

export const DERIV_SYMBOLS = [
  { symbol: 'R_10', name: 'Volatility 10 Index', pipSize: 0.001 },
  { symbol: 'R_25', name: 'Volatility 25 Index', pipSize: 0.001 },
  { symbol: 'R_50', name: 'Volatility 50 Index', pipSize: 0.001 },
  { symbol: 'R_75', name: 'Volatility 75 Index', pipSize: 0.001 },
  { symbol: 'R_100', name: 'Volatility 100 Index', pipSize: 0.001 },
  { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index', pipSize: 0.00001 },
  { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index', pipSize: 0.00001 },
  { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index', pipSize: 0.00001 },
  { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index', pipSize: 0.00001 },
  { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index', pipSize: 0.00001 },
];
