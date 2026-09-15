import {
  candlestickPatterns,
  detectDivergence,
  marketRegime,
  marketStructure,
  supportResistance,
  supplyDemand,
} from "./analysis";
import { lastValues } from "./indicators";
import type { Action, Bar } from "./types";

export type Evidence = { category: string; side: "bull" | "bear"; strength: number; detail: string };

function item(category: string, side: "bull" | "bear", strength: number, detail: string): Evidence {
  return { category, side, strength: Math.max(0, Math.min(1, strength)), detail };
}

export function collectEvidence(bars: Bar[]): Evidence[] {
  const v = lastValues(bars, [
    "RSI_14",
    "MACD",
    "ADX_14",
    "TREND_STRENGTH",
    "BB_PERCENT",
    "STOCH_14",
    "ATR_PERCENT",
    "VOLUME_RATIO",
  ]);
  const out: Evidence[] = [];
  const regime = marketRegime(bars, 50);
  if (regime.regime === "TRENDING_UP") {
    out.push(item("trend", "bull", Math.min(regime.trendStrength, 1), `regime TRENDING_UP (strength ${regime.trendStrength.toFixed(2)})`));
  } else if (regime.regime === "TRENDING_DOWN") {
    out.push(item("trend", "bear", Math.min(regime.trendStrength, 1), `regime TRENDING_DOWN (strength ${regime.trendStrength.toFixed(2)})`));
  }
  const structure = marketStructure(bars);
  if (structure.structure === "BULLISH") out.push(item("structure", "bull", 0.6, `${structure.higherHighs.length} higher highs`));
  if (structure.structure === "BEARISH") out.push(item("structure", "bear", 0.6, `${structure.lowerLows.length} lower lows`));
  if (v.TREND_STRENGTH > 0) out.push(item("trend", "bull", Math.min(Math.abs(v.TREND_STRENGTH) * 200, 0.8), "trend strength positive"));
  if (v.TREND_STRENGTH < 0) out.push(item("trend", "bear", Math.min(Math.abs(v.TREND_STRENGTH) * 200, 0.8), "trend strength negative"));
  if (v.MACD > 0) out.push(item("momentum", "bull", 0.55, "MACD positive"));
  if (v.MACD < 0) out.push(item("momentum", "bear", 0.55, "MACD negative"));
  if (v.RSI_14 < 32) out.push(item("momentum", "bull", Math.min((32 - v.RSI_14) / 18, 0.9), `RSI oversold (${v.RSI_14.toFixed(1)})`));
  if (v.RSI_14 > 68) out.push(item("momentum", "bear", Math.min((v.RSI_14 - 68) / 18, 0.9), `RSI overbought (${v.RSI_14.toFixed(1)})`));
  if (v.ADX_14 > 25) out.push(item("volatility", v.TREND_STRENGTH >= 0 ? "bull" : "bear", Math.min(v.ADX_14 / 50, 0.8), `ADX ${v.ADX_14.toFixed(1)}`));
  const sd = supplyDemand(bars);
  if (sd.zoneBias === "DEMAND") out.push(item("zones", "bull", 0.5, "demand zones dominate"));
  if (sd.zoneBias === "SUPPLY") out.push(item("zones", "bear", 0.5, "supply zones dominate"));
  const div = detectDivergence(bars);
  if (div.bullish) out.push(item("divergence", "bull", 0.7, "regular bullish RSI divergence"));
  if (div.bearish) out.push(item("divergence", "bear", 0.7, "regular bearish RSI divergence"));
  const patterns = candlestickPatterns(bars);
  for (const p of patterns.patterns) {
    if (p === "HAMMER" || p === "BULLISH_ENGULFING") out.push(item("patterns", "bull", 0.45, p));
    if (p === "SHOOTING_STAR" || p === "BEARISH_ENGULFING") out.push(item("patterns", "bear", 0.45, p));
  }
  const sr = supportResistance(bars);
  const last = bars[bars.length - 1].close;
  const distS = Math.abs(last - sr.support1) / last;
  const distR = Math.abs(last - sr.resistance1) / last;
  if (distS < distR) out.push(item("levels", "bull", 0.35, "price nearer support"));
  else out.push(item("levels", "bear", 0.35, "price nearer resistance"));
  if (v.VOLUME_RATIO > 1.2) out.push(item("volatility", v.MACD >= 0 ? "bull" : "bear", 0.4, "volume expansion"));
  return out;
}

function caseScore(items: Evidence[]) {
  const cats = new Set(items.map((i) => i.category));
  const raw = items.reduce((a, b) => a + b.strength, 0);
  return raw * (1 + 0.08 * Math.max(0, cats.size - 1));
}

export function runDebate(bars: Bar[]) {
  const evidence = collectEvidence(bars);
  const bull = evidence.filter((e) => e.side === "bull").sort((a, b) => b.strength - a.strength);
  const bear = evidence.filter((e) => e.side === "bear").sort((a, b) => b.strength - a.strength);
  const bullScore = caseScore(bull);
  const bearScore = caseScore(bear);
  const margin = bullScore - bearScore;
  let verdict: Action = "HOLD";
  if (margin > 0.6) verdict = "BUY";
  else if (margin < -0.6) verdict = "SELL";
  const confidence = Math.min(1, Math.abs(margin) / (bullScore + bearScore + 0.01));
  const required =
    verdict === "HOLD"
      ? "Need a cleaner cascade or a decisive oscillator turn before acting."
      : verdict === "BUY"
        ? "Hold only if price accepts above the nearest support and ADX stays elevated."
        : "Hold only if price rejects the nearest resistance and momentum stays negative.";
  const reasoning =
    verdict === "BUY"
      ? `Bull case outscores the bear case (${bullScore.toFixed(2)} vs ${bearScore.toFixed(2)}). Trend, structure, and momentum agree more than they conflict.`
      : verdict === "SELL"
        ? `Bear case outscores the bull case (${bearScore.toFixed(2)} vs ${bullScore.toFixed(2)}). Supply, structure, and momentum dominate the tape.`
        : `The two books are too close (${bullScore.toFixed(2)} vs ${bearScore.toFixed(2)}). Judge stands aside until one side adds independent categories.`;
  return { bull, bear, bullScore, bearScore, margin, verdict, confidence, required, reasoning };
}

export type DebateResult = ReturnType<typeof runDebate>;
