import { generateBars } from "./market";
import { SMT_PAIRS } from "./symbols";
import type { Timeframe } from "./types";

function swings(closes: number[], kind: "high" | "low") {
  const idx: number[] = [];
  for (let i = 2; i < closes.length - 2; i++) {
    if (kind === "high" && closes[i] >= closes[i - 1] && closes[i] >= closes[i + 1] && closes[i] >= closes[i - 2]) idx.push(i);
    if (kind === "low" && closes[i] <= closes[i - 1] && closes[i] <= closes[i + 1] && closes[i] <= closes[i - 2]) idx.push(i);
  }
  return idx;
}

export function smtCheck(a: string, b: string, corr: "pos" | "neg", timeframe: Timeframe = "1h") {
  const barsA = generateBars(a, timeframe, 240);
  const barsB = generateBars(b, timeframe, 240);
  const cA = barsA.map((x) => x.close);
  const cB = barsB.map((x) => x.close);
  const hiA = swings(cA, "high");
  const hiB = swings(cB, "high");
  const loA = swings(cA, "low");
  const loB = swings(cB, "low");
  let signal: "BULLISH" | "BEARISH" | "NONE" = "NONE";
  let detail = "No confirmed SMT at recent swings.";
  if (corr === "pos" && loA.length >= 2 && loB.length >= 2) {
    const aLL = cA[loA[loA.length - 1]] < cA[loA[loA.length - 2]];
    const bHL = cB[loB[loB.length - 1]] > cB[loB[loB.length - 2]];
    const aHL = cA[loA[loA.length - 1]] > cA[loA[loA.length - 2]];
    const bLL = cB[loB[loB.length - 1]] < cB[loB[loB.length - 2]];
    if (aLL && bHL) {
      signal = "BULLISH";
      detail = `${a} printed a lower low while ${b} held a higher low — correlated pair SMT.`;
    } else if (bLL && aHL) {
      signal = "BULLISH";
      detail = `${b} printed a lower low while ${a} held a higher low — correlated pair SMT.`;
    }
  }
  if (corr === "pos" && hiA.length >= 2 && hiB.length >= 2 && signal === "NONE") {
    const aHH = cA[hiA[hiA.length - 1]] > cA[hiA[hiA.length - 2]];
    const bLH = cB[hiB[hiB.length - 1]] < cB[hiB[hiB.length - 2]];
    if (aHH && bLH) {
      signal = "BEARISH";
      detail = `${a} made a higher high while ${b} failed — correlated pair SMT.`;
    }
  }
  if (corr === "neg" && loA.length >= 2 && hiB.length >= 2) {
    const aLL = cA[loA[loA.length - 1]] < cA[loA[loA.length - 2]];
    const bHH = cB[hiB[hiB.length - 1]] > cB[hiB[hiB.length - 2]];
    if (aLL && !bHH) {
      signal = "BULLISH";
      detail = `${a} sold off without the expected inverse strength in ${b}.`;
    }
  }
  return {
    a,
    b,
    corr,
    signal,
    detail,
    lastA: cA[cA.length - 1],
    lastB: cB[cB.length - 1],
  };
}

export function smtScan(timeframe: Timeframe = "1h") {
  return SMT_PAIRS.map((p) => ({ ...p, ...smtCheck(p.a, p.b, p.corr, timeframe) }));
}
