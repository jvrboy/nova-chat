import { computeSeries } from "./indicators";
import type { Rule, Strategy } from "./strategies";
import type { Bar } from "./types";

const OPS: Record<Rule["operator"], (a: number, b: number) => boolean> = {
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  "==": (a, b) => a === b,
};

function resolve(values: Record<string, number>, ref: number | string): number {
  if (typeof ref === "number") return ref;
  return values[ref] ?? 0;
}

function match(values: Record<string, number>, rules: Rule[], logic: "AND" | "OR") {
  if (!rules.length) return false;
  const hits = rules.map((r) => OPS[r.operator](values[r.indicator] ?? 0, resolve(values, r.value)));
  return logic === "OR" ? hits.some(Boolean) : hits.every(Boolean);
}

function rowValues(series: Record<string, number[]>, i: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, arr] of Object.entries(series)) out[k] = arr[i] ?? 0;
  return out;
}

export type ClosedTrade = {
  direction: "BUY" | "SELL";
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  pnl: number;
  reason: string;
};

export function runBacktest(bars: Bar[], strategy: Strategy, initial = 10_000) {
  if (bars.length < 40) throw new Error("Backtest requires at least 40 bars");
  const series = computeSeries(bars);
  let cash = initial;
  let position: {
    direction: "BUY" | "SELL";
    entry: number;
    stop: number;
    target: number;
    size: number;
    entryTime: number;
    entryIndex: number;
  } | null = null;
  const trades: ClosedTrade[] = [];
  const equity: { t: number; equity: number }[] = [];
  const pipLot = 100_000;

  for (let i = 30; i < bars.length; i++) {
    const values = rowValues(series, i);
    const bar = bars[i];
    if (position) {
      const hitStop =
        position.direction === "BUY" ? bar.low <= position.stop : bar.high >= position.stop;
      const hitTarget =
        position.direction === "BUY" ? bar.high >= position.target : bar.low <= position.target;
      const timeExit = strategy.maxBarsInTrade > 0 && i - position.entryIndex >= strategy.maxBarsInTrade;
      const ruleExit = match(values, strategy.exitRules, strategy.logic);
      let exitPrice: number | null = null;
      let reason = "";
      if (hitStop) {
        exitPrice = position.stop;
        reason = "STOP";
      } else if (hitTarget) {
        exitPrice = position.target;
        reason = "TARGET";
      } else if (ruleExit) {
        exitPrice = bar.close;
        reason = "RULE";
      } else if (timeExit) {
        exitPrice = bar.close;
        reason = "TIME";
      }
      if (exitPrice != null) {
        const pnl =
          (position.direction === "BUY" ? exitPrice - position.entry : position.entry - exitPrice) *
          position.size *
          pipLot;
        cash += pnl;
        trades.push({
          direction: position.direction,
          entryTime: position.entryTime,
          exitTime: bar.timestamp,
          entry: position.entry,
          exit: exitPrice,
          pnl,
          reason,
        });
        position = null;
      }
    }
    if (!position && match(values, strategy.entryRules, strategy.logic)) {
      let direction: "BUY" | "SELL" = strategy.direction === "AUTO" ? "BUY" : strategy.direction;
      if (strategy.direction === "AUTO") {
        direction = (values.TREND_STRENGTH ?? 0) >= 0 ? "BUY" : "SELL";
      }
      const next = bars[Math.min(i + 1, bars.length - 1)];
      const entry = next.open;
      const atr = Math.max(values.ATR_14 ?? 0, entry * 0.0008);
      const stopDist = atr * strategy.atrStopMultiple;
      const risk = cash * (strategy.riskPerTradePct / 100);
      const size = Math.max(0.0001, risk / Math.max(stopDist * pipLot, 1e-9));
      const stop = direction === "BUY" ? entry - stopDist : entry + stopDist;
      const target = direction === "BUY" ? entry + stopDist * strategy.takeProfitMultiple : entry - stopDist * strategy.takeProfitMultiple;
      position = { direction, entry, stop, target, size, entryTime: next.timestamp, entryIndex: i + 1 };
    }
    const mark = bar.close;
    const floating = position
      ? (position.direction === "BUY" ? mark - position.entry : position.entry - mark) * position.size * pipLot
      : 0;
    equity.push({ t: bar.timestamp, equity: cash + floating });
  }

  if (position) {
    const final = bars[bars.length - 1];
    const pnl =
      (position.direction === "BUY" ? final.close - position.entry : position.entry - final.close) *
        position.size *
        pipLot;
    cash += pnl;
    trades.push({
      direction: position.direction,
      entryTime: position.entryTime,
      exitTime: final.timestamp,
      entry: position.entry,
      exit: final.close,
      pnl,
      reason: "END_OF_DATA",
    });
    equity.push({ t: final.timestamp, equity: cash });
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, b) => a + b.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
  const peak = equity.reduce(
    (acc, p) => {
      const peakEq = Math.max(acc.peak, p.equity);
      const dd = (peakEq - p.equity) / peakEq;
      return { peak: peakEq, maxDd: Math.max(acc.maxDd, dd) };
    },
    { peak: initial, maxDd: 0 },
  );
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].equity;
    if (prev) rets.push((equity[i].equity - prev) / prev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(rets.length, 1);
  const std = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length, 1));
  const neg = rets.filter((r) => r < 0);
  const down = Math.sqrt(neg.reduce((a, b) => a + b * b, 0) / Math.max(neg.length, 1));
  const net = cash - initial;
  return {
    initial,
    finalEquity: cash,
    netProfit: net,
    totalReturn: net / initial,
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : grossWin / grossLoss,
    expectancy: trades.length ? net / trades.length : 0,
    maxDrawdown: peak.maxDd,
    sharpe: std ? (mean / std) * Math.sqrt(252) : 0,
    sortino: down ? (mean / down) * Math.sqrt(252) : 0,
    equity,
    closed: trades,
  };
}

export type BacktestResult = ReturnType<typeof runBacktest>;
