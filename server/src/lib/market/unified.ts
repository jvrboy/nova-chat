import {
  advancedScoring,
  candlestickPatterns,
  confluenceScore,
  detectDivergence,
  divergenceStrategy,
  fibonacciAnalysis,
  marketRegime,
  marketStructure,
  supportResistance,
  supplyDemand,
  tradePlan,
  volatilityProfile,
  wyckoffAnalysis,
} from "./analysis";
import { formatPrice } from "./format";
import type { Bar, Bias, Timeframe } from "./types";

function fmt(symbol: string, value: number) {
  return formatPrice(symbol, value);
}

function commentary(
  symbol: string,
  timeframe: Timeframe,
  regime: ReturnType<typeof marketRegime>,
  sr: ReturnType<typeof supportResistance>,
  patterns: ReturnType<typeof candlestickPatterns>,
  confluence: ReturnType<typeof confluenceScore>,
  sd: ReturnType<typeof supplyDemand>,
  structure: ReturnType<typeof marketStructure>,
  wyckoff: ReturnType<typeof wyckoffAnalysis>,
  divergence: ReturnType<typeof detectDivergence>,
  plan: ReturnType<typeof tradePlan>,
): string {
  const lines: string[] = [];
  lines.push(
    `${symbol} (${timeframe}): market regime is ${regime.regime} (trend strength ${regime.trendStrength.toFixed(2)}, annualized volatility ${(regime.annualizedVolatility * 100).toFixed(1)}%).`,
  );
  lines.push(
    `Confluence score is ${confluence.score.toFixed(2)}, leaning ${confluence.bias}; market structure reads ${structure.structure} with ${structure.higherHighs.length} recent higher-highs and ${structure.lowerLows.length} recent lower-lows.`,
  );
  lines.push(`Wyckoff phase estimate: ${wyckoff.phase} (confidence ${(wyckoff.confidence * 100).toFixed(0)}%).`);
  lines.push(
    `Key levels: pivot ${fmt(symbol, sr.pivot)}, resistance ${fmt(symbol, sr.resistance1)}/${fmt(symbol, sr.resistance2)}, support ${fmt(symbol, sr.support1)}/${fmt(symbol, sr.support2)}. Nearest psychological level ${fmt(symbol, sr.psychologicalLevels.nearestRoundLevel)}.`,
  );
  if (sr.dynamicZones.resistanceZones[0]) {
    const top = sr.dynamicZones.resistanceZones[0];
    lines.push(`Strongest dynamic resistance zone at ${fmt(symbol, top.level)} (${top.touches} touches).`);
  }
  if (sr.dynamicZones.supportZones[0]) {
    const top = sr.dynamicZones.supportZones[0];
    lines.push(`Strongest dynamic support zone at ${fmt(symbol, top.level)} (${top.touches} touches).`);
  }
  lines.push(
    `Supply & demand: ${sd.zoneBias} bias (demand strength ${sd.demandStrength}, supply strength ${sd.supplyStrength}).`,
  );
  if (patterns.patterns.length) lines.push(`Recent candlestick pattern(s): ${patterns.patterns.join(", ")}.`);
  if (divergence.bias !== "NEUTRAL") {
    lines.push(`Divergence system reads ${divergence.bias} across the scanned oscillators.`);
  }
  if (plan.direction !== "WAIT" && plan.stopLoss != null && plan.takeProfit != null) {
    lines.push(
      `Trade plan: ${plan.direction} at ${fmt(symbol, plan.entry)}, stop ${fmt(symbol, plan.stopLoss)}, target ${fmt(symbol, plan.takeProfit)} (R:R ${plan.riskReward}).`,
    );
  } else {
    lines.push("Trade plan: WAIT — confluence is not decisive enough for an entry right now.");
  }
  return lines.join(" ");
}

export function analyzeSymbol(bars: Bar[], symbol: string, timeframe: Timeframe, lookback = 20) {
  if (bars.length < 40) throw new Error("Unified analysis requires at least 40 OHLCV bars");
  const regime = marketRegime(bars, lookback);
  const sr = supportResistance(bars, lookback);
  const vol = volatilityProfile(bars, lookback);
  const patterns = candlestickPatterns(bars);
  const confluence = confluenceScore(bars);
  const plan = tradePlan(bars);
  const structure = marketStructure(bars, Math.max(lookback, 50));
  const wyckoff = wyckoffAnalysis(bars, Math.max(lookback, 50));
  const fibonacci = fibonacciAnalysis(bars, Math.max(lookback, 50));
  const scoring = advancedScoring(bars);
  const sd = supplyDemand(bars, Math.max(lookback, 50));
  const divergence = detectDivergence(bars);
  const divStrategy = divergenceStrategy(bars);
  const text = commentary(symbol, timeframe, regime, sr, patterns, confluence, sd, structure, wyckoff, divergence, plan);

  const bullVotes = [
    confluence.bias === "BULLISH",
    regime.regime === "TRENDING_UP",
    structure.structure === "BULLISH",
    sd.zoneBias === "DEMAND",
    divergence.bias === "BULLISH",
  ].filter(Boolean).length;
  const bearVotes = [
    confluence.bias === "BEARISH",
    regime.regime === "TRENDING_DOWN",
    structure.structure === "BEARISH",
    sd.zoneBias === "SUPPLY",
    divergence.bias === "BEARISH",
  ].filter(Boolean).length;
  const overallBias: Bias = bullVotes > bearVotes ? "BULLISH" : bearVotes > bullVotes ? "BEARISH" : "NEUTRAL";
  const overallConfidence = Math.max(bullVotes, bearVotes) / 5;

  return {
    symbol,
    timeframe,
    overallBias,
    overallConfidence,
    commentary: text,
    regime,
    supportResistance: sr,
    volatility: vol,
    patterns,
    confluence,
    advancedScoring: scoring,
    marketStructure: structure,
    wyckoff,
    fibonacci,
    supplyDemand: sd,
    divergence,
    divergenceStrategy: divStrategy,
    tradePlan: plan,
    generatedAt: Date.now(),
  };
}

export type UnifiedAnalysis = ReturnType<typeof analyzeSymbol>;
