import { runBacktest, type OHLCV, type StrategyDefinition, type BacktestResult } from "./tradingStrategy";
import { walkForwardAnalysis } from "./researchEngine";

export type BacktestExecution = { commissionBps?: number; slippageBps?: number; initialCapital?: number; walkForwardFolds?: number };

export function runAutomatedBacktest(candles: OHLCV[], strategy: StrategyDefinition, execution: BacktestExecution = {}) {
  const commissionBps = Math.max(0, execution.commissionBps ?? 0);
  const slippageBps = Math.max(0, execution.slippageBps ?? 0);
  const base = runBacktest(candles, strategy);
  const frictionRate = (commissionBps + slippageBps) / 10_000;
  const adjustedTrades = base.trades.map(trade => { const notional = Math.abs(trade.entryPrice) * Math.max(1, trade.quantity) + Math.abs(trade.exitPrice ?? trade.entryPrice) * Math.max(1, trade.quantity); const friction = notional * frictionRate; return { ...trade, pnl: (trade.pnl ?? 0) - friction }; });
  const adjustedPnl = adjustedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const adjusted = { ...base, trades: adjustedTrades, totalPnl: adjustedPnl, expectancy: adjustedTrades.length ? adjustedPnl / adjustedTrades.length : 0, execution: { commissionBps, slippageBps, frictionRate }, disclaimer: "Automated backtests are historical simulations, not live execution or financial advice. Results are sensitive to data quality, costs, slippage, liquidity, and regime changes." };
  const walkForward = execution.walkForwardFolds && execution.walkForwardFolds >= 2 ? walkForwardAnalysis(candles, { folds: Math.min(8, Math.floor(execution.walkForwardFolds)) }) : undefined;
  return { ...adjusted, walkForward } as BacktestResult & { execution: { commissionBps: number; slippageBps: number; frictionRate: number }; walkForward?: ReturnType<typeof walkForwardAnalysis> };
}
