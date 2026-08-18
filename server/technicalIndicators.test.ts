import { describe, expect, it } from "vitest";
import { indicatorSuite, adxIndicator, bollingerIndicator, macdIndicator, vwapIndicator } from "./_core/technicalIndicators";
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
