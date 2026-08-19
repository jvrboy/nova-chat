import { describe, expect, it } from "vitest";
import { indicatorSuite, adxIndicator, bollingerIndicator, macdIndicator, vwapIndicator, ichimokuCloudIndicator, fibonacciRetracementIndicator, superTrendIndicator } from "./_core/technicalIndicators";
import { arpeggiate, chordProgression, humanizeNotes, midiNoteName, swingQuantize } from "./_core/musicPro";
import { canInvokeTool, getToolPolicy } from "./_core/toolRegistry";

const candles = Array.from({ length: 120 }, (_, i) => ({ timestamp: i, open: 100 + i * .1, high: 101 + i * .1 + (i % 3) * .2, low: 99 + i * .1, close: 100.4 + i * .12, volume: 1000 + i * 5 }));

describe("expanded technical indicators", () => {
  it("returns finite values for trend, momentum, volatility, and volume indicators", () => {
    const suite = indicatorSuite(candles);
    for (const value of Object.values(suite)) expect(JSON.stringify(value)).not.toContain("NaN");
    expect(Number.isFinite(macdIndicator(candles).histogram)).toBe(true);
    expect(Number.isFinite(bollingerIndicator(candles).bandwidth)).toBe(true);
    expect(Number.isFinite(adxIndicator(candles).adx)).toBe(true);
    expect(vwapIndicator(candles).value).toBeGreaterThan(0);
  });
  it("supports requested indicator subsets and rejects unknown names explicitly", () => {
    const result = indicatorSuite(candles, ["hma", "keltner", "unknown_indicator"]);
    expect(result).toHaveProperty("hma");
    expect(result).toHaveProperty("keltner");
    expect(result.unknown_indicator).toEqual({ error: "Unknown indicator" });
    const extended = indicatorSuite(candles, ["awesomeOscillator", "forceIndex", "cmf", "vortex", "fisher", "rvi", "massIndex", "chandelier"]);
    expect(Object.keys(extended)).toHaveLength(8);
    const advanced = indicatorSuite(candles, ["ichimoku", "fibonacci", "supertrend"]);
    expect(advanced).toHaveProperty("ichimoku");
    expect(advanced).toHaveProperty("fibonacci");
    expect(advanced).toHaveProperty("supertrend");
    expect(Number.isFinite(ichimokuCloudIndicator(candles).cloudTop)).toBe(true);
    expect(Object.keys(fibonacciRetracementIndicator(candles).levels)).toHaveLength(7);
    expect(["up", "down"].includes(superTrendIndicator(candles).direction)).toBe(true);
  });
});

describe("advanced music arrangement", () => {
  const events = [{ note: 60, start: .13, duration: .25, velocity: 90 }, { note: 64, start: .61, duration: .25, velocity: 80 }];
  it("generates bounded deterministic musical structures", () => {
    expect(chordProgression(60, "major")).toHaveLength(4);
    expect(arpeggiate([60, 64, 67], "updown", 2)).toHaveLength(8);
    expect(swingQuantize(events, .25, .7)[1].start).toBe(.5);
    expect(humanizeNotes(events, .01, 5, 7)).toEqual(humanizeNotes(events, .01, 5, 7));
    expect(midiNoteName(60)).toBe("C4");
  });
});

describe("agentic tool governance", () => {
  it("registers new tools with bounded permissions", () => {
    expect(getToolPolicy("technical_indicator_suite")?.maxCallsPerMinute).toBe(30);
    expect(getToolPolicy("agentic_workflow_plan")?.risk).toBe("compute");
    expect(canInvokeTool("agentic_workflow_plan", "security_reviewer").allowed).toBe(true);
    expect(canInvokeTool("technical_indicator_suite", "music_composer").allowed).toBe(false);
  });
});
