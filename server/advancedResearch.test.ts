import { describe, expect, it, vi } from "vitest";
import { INDICATOR_CATALOG, computeIndicator, indicatorSnapshot } from "./_core/indicatorEngine";
import { runBacktest, runForwardTest, walkForwardAnalysis } from "./_core/researchEngine";
import { createSerumStylePatch } from "./_core/synthTools";
import { exportDawBundle } from "./_core/dawExport";
import { neuralFeatureVector, neuralForward, recallMemories, storeMemory } from "./_core/brainSystem";
import { executePipeline, getPipeline } from "./_core/pipelines";

const candles = Array.from({ length: 260 }, (_, index) => {
  const close = 100 + index * .12 + Math.sin(index / 6) * 2;
  return { timestamp: index + 1, open: close - .15, high: close + .6, low: close - .6, close, volume: 1_000 + index * 3 };
});

describe("advanced indicator engine", () => {
  it("publishes 230+ catalog entries with functional values", () => {
    expect(INDICATOR_CATALOG.length).toBeGreaterThanOrEqual(230);
    const output = computeIndicator("ema_20", candles);
    expect(output.values).toHaveLength(candles.length);
    expect(Number.isFinite(output.values.at(-1))).toBe(true);
  });
  it("supports category snapshots and rejects unknown indicators", () => {
    expect(indicatorSnapshot(candles).length).toBeGreaterThan(3);
    expect(() => computeIndicator("unknown_14", candles)).toThrow();
  });
});

describe("backtest and forward-test engines", () => {
  it("returns cost-aware backtest metrics and trades", () => {
    const report = runBacktest(candles, { fastPeriod: 10, slowPeriod: 30 });
    expect(report.mode).toBe("backtest");
    expect(report.finalEquity).toBeTypeOf("number");
    expect(report.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(report.disclaimer).toContain("not a guarantee");
  });
  it("keeps forward results separate from the training report", () => {
    const report = runForwardTest(candles, { trainPercent: 70 });
    expect(report.mode).toBe("forward-test");
    expect(report.holdout.tradeCount).toBeTypeOf("number");
    expect(report.generalizationGapPct).toBeTypeOf("number");
  });
  it("runs multiple walk-forward folds", () => {
    const report = walkForwardAnalysis(candles, { folds: 3 });
    expect(report.folds.length).toBeGreaterThan(1);
  });
});

describe("brain and sound backend utilities", () => {
  it("stores and recalls relevant user memory", () => {
    const userId = `test-${Date.now()}`;
    storeMemory({ userId, kind: "preference", text: "User prefers dark analog bass patches", tags: ["sound", "bass"], importance: .8 });
    expect(recallMemories(userId, "dark bass", 1)[0].text).toContain("dark analog bass");
  });
  it("runs a deterministic dense neural forward pass and feature vector", () => {
    expect(neuralForward([2, 3], [{ weights: [[1, 1]], bias: [0], activation: "relu" }])).toEqual([5]);
    expect(neuralFeatureVector([1, 2, 3]).length).toBe(5);
  });
  it("exports the generated patch as a DAW bundle", () => {
    const patch = createSerumStylePatch({ name: "Pipeline Patch", mood: "dark" });
    expect(exportDawBundle(patch).format).toBe("nova-daw-bundle");
  });
});

describe("pipeline integration", () => {
  it("contains the sound and quantitative pipelines", () => {
    expect(getPipeline("sound-design-pipeline")?.steps.length).toBeGreaterThan(1);
    expect(getPipeline("quant-research-pipeline")?.steps.length).toBeGreaterThan(1);
  });
  it("executes the sound pipeline with mocked agent responses", async () => {
    const agents = await import("./_core/agents");
    const spy = vi.spyOn(agents, "runAgent").mockResolvedValue({ agentId: "sound_designer", agentName: "Sound Designer", messages: [], toolResults: [], finalResponse: "structured patch response", stepsUsed: 1 });
    const result = await executePipeline("sound-design-pipeline", "dark bass for 128 BPM");
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    spy.mockRestore();
  });
  it("executes the quantitative pipeline with mocked agent responses", async () => {
    const agents = await import("./_core/agents");
    const spy = vi.spyOn(agents, "runAgent").mockResolvedValue({ agentId: "quant_researcher", agentName: "Quantitative Researcher", messages: [], toolResults: [], finalResponse: "quantitative report", stepsUsed: 1 });
    const result = await executePipeline("quant-research-pipeline", "analyze EUR/USD OHLCV and identify regime risk");
    expect(result.success).toBe(true);
    expect(result.steps.map(step => step.status)).toEqual(["success", "success"]);
    spy.mockRestore();
  });
});
