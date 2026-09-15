import { confluenceScore, marketRegime, marketStructure, supportResistance } from "./analysis";
import type { Action, Bar, Bias, Timeframe } from "./types";

function biasFromRows(bars: Bar[]) {
  const confluence = confluenceScore(bars);
  const regime = marketRegime(bars);
  const structure = marketStructure(bars);
  return {
    bias: confluence.bias,
    confluenceScore: confluence.score,
    regime: regime.regime,
    trendStrength: regime.trendStrength,
    structure: structure.structure,
  };
}

export function cascadingBias(rowsByTf: Partial<Record<Timeframe, Bar[]>>, order: Timeframe[]) {
  const perTimeframe: Record<string, ReturnType<typeof biasFromRows>> = {};
  for (const tf of order) {
    const bars = rowsByTf[tf];
    if (!bars || bars.length < 40) continue;
    perTimeframe[tf] = biasFromRows(bars);
  }
  const timeframes = order.filter((tf) => perTimeframe[tf]);

  let cascadeDirection: Bias | null = null;
  let cascadeOk = true;
  let breaksAt: string | null = null;
  for (const tf of timeframes) {
    const bias = perTimeframe[tf].bias;
    if (bias === "NEUTRAL") continue;
    if (cascadeDirection === null) {
      cascadeDirection = bias;
      continue;
    }
    if (bias !== cascadeDirection) {
      cascadeOk = false;
      breaksAt = tf;
      break;
    }
  }

  const alignedCount = timeframes.filter((tf) => perTimeframe[tf].bias === cascadeDirection).length;
  const alignmentPct = timeframes.length ? (alignedCount / timeframes.length) * 100 : 0;
  let recommended: Action = "WAIT";
  if (cascadeDirection && cascadeOk && alignmentPct >= (100 / timeframes.length) * Math.max(2, timeframes.length - 1)) {
    recommended = cascadeDirection === "BULLISH" ? "BUY" : "SELL";
  }
  const lowest = timeframes[timeframes.length - 1];
  const entryBars = lowest ? rowsByTf[lowest] : undefined;
  const entry = entryBars ? supportResistance(entryBars) : null;

  return {
    timeframesAnalyzed: timeframes,
    perTimeframe,
    cascadeDirection: cascadeDirection ?? "NEUTRAL",
    cascadeFullyAligned: cascadeOk && cascadeDirection !== null,
    alignmentPct,
    breaksAtTimeframe: breaksAt,
    recommendedAction: recommended,
    entryTimeframe: lowest,
    entryContext: entry
      ? { pivot: entry.pivot, rangeHigh: entry.rangeHigh, rangeLow: entry.rangeLow }
      : null,
  };
}

export type TopDownResult = ReturnType<typeof cascadingBias>;
