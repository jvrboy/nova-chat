import type { OHLCV } from "./forex";
import { atr, ema, rsi } from "./forex";

export type ResearchConfig = { fastPeriod?: number; slowPeriod?: number; rsiPeriod?: number; longRsi?: number; shortRsi?: number; initialCapital?: number; riskPerTrade?: number; feeBps?: number; slippageBps?: number; maxHoldingBars?: number };
export type ResearchTrade = { entryIndex: number; exitIndex: number; side: "long" | "short"; entry: number; exit: number; quantity: number; grossPnl: number; costs: number; netPnl: number; returnPct: number; reason: string };

const defaults: Required<ResearchConfig> = { fastPeriod: 20, slowPeriod: 50, rsiPeriod: 14, longRsi: 55, shortRsi: 45, initialCapital: 100_000, riskPerTrade: .01, feeBps: 1, slippageBps: 2, maxHoldingBars: 40 };
const resolveConfig = (config: ResearchConfig = {}) => ({ ...defaults, ...config });
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const std = (values: number[]) => { const average = mean(values); return Math.sqrt(mean(values.map(value => (value - average) ** 2))); };

function signalAt(index: number, data: OHLCV[], config: Required<ResearchConfig>) {
  const closes = data.map(bar => bar.close), fast = ema(closes, config.fastPeriod), slow = ema(closes, config.slowPeriod), momentum = rsi(closes, config.rsiPeriod);
  const fastValue = fast[index] ?? closes[index], slowValue = slow[index] ?? closes[index], rsiValue = momentum[index] ?? 50;
  if (fastValue > slowValue && rsiValue >= config.longRsi) return "long" as const;
  if (fastValue < slowValue && rsiValue <= config.shortRsi) return "short" as const;
  return "flat" as const;
}

export function runBacktest(data: OHLCV[], inputConfig: ResearchConfig = {}) {
  if (data.length < 60) throw new Error("Backtest requires at least 60 OHLCV candles.");
  const config = resolveConfig(inputConfig), atrValues = atr(data, Math.min(config.rsiPeriod, 20));
  let equity = config.initialCapital, peak = equity, maxDrawdown = 0;
  const trades: ResearchTrade[] = [];
  let open: { index: number; side: "long" | "short"; price: number; quantity: number } | null = null;
  for (let index = Math.max(config.slowPeriod, config.rsiPeriod) + 1; index < data.length; index += 1) {
    const current = data[index], signal = signalAt(index, data, config);
    if (!open && signal !== "flat") {
      const price = current.close * (1 + (signal === "long" ? config.slippageBps : -config.slippageBps) / 10_000);
      const riskAmount = equity * config.riskPerTrade;
      const stopDistance = Math.max(atrValues[index] ?? price * .005, price * .001);
      open = { index, side: signal, price, quantity: riskAmount / stopDistance };
      continue;
    }
    if (!open) continue;
    const holding = index - open.index;
    const reverse = (open.side === "long" && signal === "short") || (open.side === "short" && signal === "long");
    if (reverse || holding >= config.maxHoldingBars || signal === "flat") {
      const exit = current.close * (1 + (open.side === "long" ? -config.slippageBps : config.slippageBps) / 10_000);
      const grossPnl = (open.side === "long" ? exit - open.price : open.price - exit) * open.quantity;
      const notional = (open.price + exit) * open.quantity;
      const costs = notional * (config.feeBps / 10_000);
      const netPnl = grossPnl - costs;
      equity += netPnl;
      trades.push({ entryIndex: open.index, exitIndex: index, side: open.side, entry: open.price, exit, quantity: open.quantity, grossPnl, costs, netPnl, returnPct: open.price ? (netPnl / (open.price * open.quantity)) * 100 : 0, reason: reverse ? "signal-reversal" : holding >= config.maxHoldingBars ? "time-stop" : "flat-signal" });
      open = null;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, peak ? (peak - equity) / peak : 0);
    }
  }
  const winners = trades.filter(trade => trade.netPnl > 0), losers = trades.filter(trade => trade.netPnl <= 0), returns = trades.map(trade => trade.returnPct);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.netPnl, 0), grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0));
  return { mode: "backtest", config, initialCapital: config.initialCapital, finalEquity: equity, netPnl: equity - config.initialCapital, returnPct: ((equity / config.initialCapital) - 1) * 100, tradeCount: trades.length, winRate: trades.length ? winners.length / trades.length : 0, profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0, expectancy: mean(trades.map(trade => trade.netPnl)), volatility: std(returns), maxDrawdownPct: maxDrawdown * 100, trades, disclaimer: "Historical simulation is not a guarantee of future performance. Results depend on data quality, costs, and execution assumptions." };
}

export function runForwardTest(data: OHLCV[], inputConfig: ResearchConfig & { trainPercent?: number } = {}) {
  const trainPercent = Math.min(90, Math.max(50, inputConfig.trainPercent ?? 70));
  const split = Math.max(60, Math.floor(data.length * trainPercent / 100));
  if (data.length - split < Math.max(60, (inputConfig.slowPeriod ?? defaults.slowPeriod) + 10)) throw new Error("Forward test requires a sufficiently large holdout segment for out-of-sample simulation.");
  const config = resolveConfig(inputConfig);
  const train = runBacktest(data.slice(0, split), config);
  const holdout = data.slice(Math.max(0, split - config.slowPeriod), data.length).map((bar, index, values) => ({ ...bar, timestamp: bar.timestamp || index + split - config.slowPeriod }));
  const test = runBacktest(holdout, config);
  return { mode: "forward-test", splitIndex: split, trainPercent, train: { finalEquity: train.finalEquity, returnPct: train.returnPct, tradeCount: train.tradeCount, maxDrawdownPct: train.maxDrawdownPct }, holdout: { finalEquity: test.finalEquity, returnPct: test.returnPct, tradeCount: test.tradeCount, maxDrawdownPct: test.maxDrawdownPct, trades: test.trades }, generalizationGapPct: train.returnPct - test.returnPct, disclaimer: "Forward testing is an out-of-sample research report, not a live execution result or financial recommendation." };
}

export function walkForwardAnalysis(data: OHLCV[], config: ResearchConfig & { folds?: number } = {}) {
  const folds = Math.max(2, Math.min(8, config.folds ?? 4));
  const results = [];
  const foldSize = Math.floor(data.length / (folds + 1));
  for (let fold = 0; fold < folds; fold += 1) {
    const trainEnd = foldSize * (fold + 2), testEnd = Math.min(data.length, trainEnd + foldSize);
    if (testEnd - trainEnd < 10) continue;
    const report = runForwardTest(data.slice(0, testEnd), { ...config, trainPercent: (trainEnd / testEnd) * 100 });
    results.push({ fold: fold + 1, trainEnd, testEnd, holdoutReturnPct: report.holdout.returnPct, maxDrawdownPct: report.holdout.maxDrawdownPct, tradeCount: report.holdout.tradeCount });
  }
  return { folds: results, averageHoldoutReturnPct: mean(results.map(result => result.holdoutReturnPct)), averageDrawdownPct: mean(results.map(result => result.maxDrawdownPct)), disclaimer: "Walk-forward results are research diagnostics and require independent validation." };
}
