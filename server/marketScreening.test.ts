import { describe, expect, it } from "vitest";
import { screenMarketAssets, marketScreenSummary } from "./_core/marketScreening";
import { canInvokeTool, getToolPolicy } from "./_core/toolRegistry";
import { getPipeline } from "./_core/pipelines";

const makeCandles = (base: number, drift: number) => Array.from({ length: 80 }, (_, i) => ({ timestamp: 1_700_000_000 + i * 3600, open: base + i * drift, high: base + i * drift + 2, low: base + i * drift - 2, close: base + i * drift + .8, volume: 1000 + i * 10 }));

describe("market screening", () => {
  it("screens crypto and stock assets without execution outputs", () => {
    const results = screenMarketAssets([{ symbol: "BTC-USD", assetClass: "crypto", candles: makeCandles(100, .4), asOf: "2026-08-19T12:00:00Z" }, { symbol: "ACME", assetClass: "stock", candles: makeCandles(80, -.2) }]);
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveProperty("bias");
    expect(results[0]).not.toHaveProperty("order");
    expect(marketScreenSummary(results).count).toBe(2);
  });
});

describe("collaborative screening governance", () => {
  it("registers policies and multi-agent pipelines", () => {
    expect(getToolPolicy("market_screening_snapshot")?.risk).toBe("compute");
    expect(canInvokeTool("market_screening_snapshot", "crypto_screening_analyst").allowed).toBe(true);
    expect(canInvokeTool("market_screening_snapshot", "music_composer").allowed).toBe(false);
    expect(getPipeline("crypto-real-time-screen-pipeline")?.steps).toHaveLength(4);
    expect(getPipeline("equity-real-time-screen-pipeline")?.steps).toHaveLength(4);
  });
});
