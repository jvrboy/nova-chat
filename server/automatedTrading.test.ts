import { describe, expect, it } from "vitest";
import { BUILT_IN_STRATEGIES, generateConfluenceSignal, generateFibonacciBreakoutSignal, generateIchimokuSuperTrendSignal } from "./_core/tradingStrategy";
import { runAutomatedBacktest } from "./_core/automatedBacktest";
import { buildCoinbaseSubscription, detectSequenceGap, normalizeMarketEvent } from "./_core/marketStreams";

const candles = Array.from({ length: 160 }, (_, i) => ({ timestamp: i, open: 100 + i * .2, high: 101 + i * .2, low: 99 + i * .2, close: 100.5 + i * .22, volume: 1000 + i * 3 }));

describe("advanced automated trading", () => {
  it("generates bounded indicator-driven signal arrays", () => {
    expect(generateIchimokuSuperTrendSignal(candles)).toHaveLength(candles.length);
    expect(generateFibonacciBreakoutSignal(candles)).toHaveLength(candles.length);
    expect(generateConfluenceSignal(candles)).toHaveLength(candles.length);
    expect(BUILT_IN_STRATEGIES.map(strategy => strategy.name)).toEqual(expect.arrayContaining(["Ichimoku + SuperTrend Regime", "Fibonacci Range Breakout", "Multi-Indicator Confluence"]));
  });
  it("applies explicit commission and slippage metadata", () => {
    const result = runAutomatedBacktest(candles, BUILT_IN_STRATEGIES[4], { commissionBps: 10, slippageBps: 5 });
    expect(result.execution.frictionRate).toBe(.0015);
    expect(result.disclaimer).toContain("historical simulations");
  });
});

describe("market stream adapters", () => {
  it("builds bounded Coinbase subscriptions and normalizes events", () => {
    expect(buildCoinbaseSubscription(["BTC-USD"], "ticker")).toEqual({ type: "subscribe", channel: "ticker", product_ids: ["BTC-USD"] });
    const events = normalizeMarketEvent("coinbase", { type: "ticker", product_id: "BTC-USD", price: "100", sequence_num: 3 }, "crypto");
    expect(events[0]?.symbol).toBe("BTC-USD");
    expect(events[0]?.price).toBe(100);
  });
  it("detects sequence gaps for replay/resync handling", () => {
    expect(detectSequenceGap(3, 5).gap).toBe(true);
    expect(detectSequenceGap(3, 4).gap).toBe(false);
  });
});
