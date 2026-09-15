import type { Bar } from "./types";

const SESSIONS: Record<string, [number, number]> = {
  SYDNEY: [21, 6],
  TOKYO: [0, 9],
  LONDON: [7, 16],
  NEW_YORK: [12, 21],
};
const OVERLAPS: Record<string, [number, number]> = {
  LONDON_NEW_YORK: [12, 16],
  TOKYO_LONDON: [7, 9],
};

function inWindow(hour: number, start: number, end: number) {
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function sessionFor(date = new Date()) {
  const hour = date.getUTCHours();
  const active = Object.entries(SESSIONS)
    .filter(([, [s, e]]) => inWindow(hour, s, e))
    .map(([n]) => n);
  const overlaps = Object.entries(OVERLAPS)
    .filter(([, [s, e]]) => inWindow(hour, s, e))
    .map(([n]) => n);
  const tier =
    overlaps.includes("LONDON_NEW_YORK") ? "PEAK" : active.includes("LONDON") ? "HIGH" : active.length ? "MEDIUM" : "LOW";
  const liquidityScore = tier === "PEAK" ? 1 : tier === "HIGH" ? 0.85 : tier === "MEDIUM" ? 0.6 : 0.4;
  const multiplier = tier === "LOW" ? 0.8 : tier === "MEDIUM" ? 0.92 : 1;
  return {
    utcHour: hour,
    activeSessions: active,
    overlaps,
    liquidityTier: tier as "PEAK" | "HIGH" | "MEDIUM" | "LOW",
    liquidityScore,
    confidenceMultiplier: multiplier,
  };
}

export function hourlyProfile(bars: Bar[]) {
  const buckets = new Map<number, { tr: number; move: number; n: number }>();
  for (let i = 1; i < bars.length; i++) {
    const hour = new Date(bars[i].timestamp).getUTCHours();
    const prev = bars[i - 1];
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev.close),
      Math.abs(bars[i].low - prev.close),
    );
    const rec = buckets.get(hour) ?? { tr: 0, move: 0, n: 0 };
    rec.tr += (tr / bars[i].close) * 100;
    rec.move += (Math.abs(bars[i].close - bars[i].open) / bars[i].close) * 100;
    rec.n += 1;
    buckets.set(hour, rec);
  }
  const hours = [...buckets.entries()]
    .map(([hour, r]) => ({
      hour,
      meanTrueRangePct: r.tr / r.n,
      meanAbsMovePct: r.move / r.n,
      bars: r.n,
    }))
    .sort((a, b) => a.hour - b.hour);
  const ranked = [...hours].sort((a, b) => b.meanTrueRangePct - a.meanTrueRangePct);
  return {
    hours,
    mostVolatileHoursUtc: ranked.slice(0, 3),
    quietestHoursUtc: ranked.slice(-3).reverse(),
  };
}
