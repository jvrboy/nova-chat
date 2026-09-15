import { confluenceScore, divergenceStrategy, marketRegime, marketStructure, supplyDemand } from "./analysis";
import { analyzeSymbol } from "./unified";
import type { Action, Bar, Timeframe, Vote } from "./types";

const WEIGHTS: Record<string, number> = {
  confluence_score: 0.16,
  market_regime: 0.14,
  market_structure: 0.14,
  supply_demand: 0.12,
  divergence_strategy: 0.14,
  unified_bias: 0.18,
  session: 0.12,
};

function toAction(raw: string): Action {
  if (raw === "BULLISH" || raw === "BUY" || raw === "DEMAND" || raw === "TRENDING_UP") return "BUY";
  if (raw === "BEARISH" || raw === "SELL" || raw === "SUPPLY" || raw === "TRENDING_DOWN") return "SELL";
  return "HOLD";
}

function scoreOf(dir: Action) {
  if (dir === "BUY") return 1;
  if (dir === "SELL") return -1;
  return 0;
}

function vote(voter: string, direction: Action, confidence: number, reason: string): Vote {
  return { voter, direction, confidence, weight: WEIGHTS[voter] ?? 0.1, reason };
}

export function votesForBars(bars: Bar[], symbol: string, timeframe: Timeframe): Vote[] {
  const conf = confluenceScore(bars);
  const regime = marketRegime(bars);
  const structure = marketStructure(bars);
  const sd = supplyDemand(bars);
  const div = divergenceStrategy(bars);
  const unified = analyzeSymbol(bars, symbol, timeframe);
  return [
    vote("confluence_score", toAction(conf.bias), Math.abs(conf.score - 0.5) * 2, `score ${conf.score.toFixed(2)}`),
    vote("market_regime", toAction(regime.regime), Math.min(1, regime.trendStrength), regime.regime),
    vote("market_structure", toAction(structure.structure), structure.structure === "NEUTRAL" ? 0.3 : 0.7, structure.structure),
    vote("supply_demand", toAction(sd.zoneBias), 0.55, `${sd.zoneBias} D${sd.demandStrength}/S${sd.supplyStrength}`),
    vote("divergence_strategy", div.action === "WAIT" ? "HOLD" : div.action, div.confidence, div.action),
    vote("unified_bias", toAction(unified.overallBias), unified.overallConfidence, unified.overallBias),
  ];
}

export function aggregateVotes(votes: Vote[]) {
  let num = 0;
  let den = 0;
  for (const v of votes) {
    const w = v.weight * Math.max(0.15, v.confidence);
    num += scoreOf(v.direction) * w;
    den += w;
  }
  const net = den ? num / den : 0;
  const direction: Action = net > 0.18 ? "BUY" : net < -0.18 ? "SELL" : "WAIT";
  const confidence = Math.min(1, Math.abs(net));
  return { net, direction, confidence };
}

export function runSymbol(barsByTf: Partial<Record<Timeframe, Bar[]>>, symbol: string, primary: Timeframe) {
  const tfs = (Object.keys(barsByTf) as Timeframe[]).filter((tf) => (barsByTf[tf]?.length ?? 0) >= 40);
  const perTf = tfs.map((tf) => {
    const bars = barsByTf[tf]!;
    const votes = votesForBars(bars, symbol, tf);
    const agg = aggregateVotes(votes);
    return { timeframe: tf, status: "OK" as const, bars: bars.length, votes, ...agg };
  });
  const primaryBars = barsByTf[primary] ?? (perTf[0] ? barsByTf[perTf[0].timeframe] : undefined);
  const overall = aggregateVotes(perTf.flatMap((t) => t.votes));
  const last = primaryBars ?? Object.values(barsByTf).find((b) => b && b.length);
  if (!last) {
    return {
      symbol,
      primaryTimeframe: primary,
      direction: "WAIT" as const,
      entry: 0,
      stopLoss: null,
      takeProfit: null,
      confidence: 0,
      net: 0,
      calibrationTier: "atr_fallback" as const,
      perTimeframe: perTf,
      generatedAt: Date.now(),
    };
  }
  const close = last[last.length - 1].close;
  const atr = Math.max(close * 0.001, (last.slice(-14).reduce((a, b) => a + (b.high - b.low), 0) / 14));
  const stop = overall.direction === "BUY" ? close - 1.5 * atr : overall.direction === "SELL" ? close + 1.5 * atr : close;
  const target = overall.direction === "BUY" ? close + 3 * atr : overall.direction === "SELL" ? close - 3 * atr : close;
  return {
    symbol,
    primaryTimeframe: primary,
    direction: overall.direction,
    entry: close,
    stopLoss: overall.direction === "WAIT" ? null : stop,
    takeProfit: overall.direction === "WAIT" ? null : target,
    confidence: overall.confidence,
    net: overall.net,
    calibrationTier: "atr_fallback" as const,
    perTimeframe: perTf,
    generatedAt: Date.now(),
  };
}

export type ConfluenceSignal = ReturnType<typeof runSymbol>;
