import { describe, expect, it } from "vitest";
import { confluenceSnapshot, fibonacciLevels, ichimoku, pivotPoints, supertrend, volumeProfile } from "./_core/technicalAdvanced";
import { chordExtensions, drumGrid, euclideanRhythm, quantizeNotes, scaleNotes, shapeAutomation } from "./_core/musicPro";
import { getSkill, listSkills } from "./_core/skillRegistry";
import { getPipeline, listPipelines } from "./_core/pipelines";

const candles = Array.from({ length: 80 }, (_, i) => ({ timestamp: i, open: 100 + i * .2, high: 101 + i * .2, low: 99 + i * .2, close: 100.5 + i * .2, volume: 1000 + i * 10 }));

describe("advanced backend capabilities", () => {
  it("calculates market structure and confluence outputs", () => {
    expect(pivotPoints(candles.at(-1)!)).toHaveProperty("r1");
    expect(fibonacciLevels(candles).levels).toHaveLength(8);
    expect(ichimoku(candles).cloudBias).toMatch(/bullish|bearish|inside-cloud/);
    expect(supertrend(candles).atr).toBeGreaterThan(0);
    expect(volumeProfile(candles).bins).toHaveLength(12);
    expect(confluenceSnapshot(candles).bias).toMatch(/bullish|bearish|neutral/);
  });

  it("generates deterministic music-production primitives", () => {
    expect(scaleNotes(60, "major", 2)).toHaveLength(14);
    expect(chordExtensions(60, "dominant", [7, 9])).toContain(74);
    expect(euclideanRhythm(16, 5)).toHaveLength(16);
    expect(drumGrid(16, .5, 9)).toEqual(drumGrid(16, .5, 9));
    expect(quantizeNotes([{ note: 60, start: .13, duration: .2, velocity: 90 }], .25)[0].start).toBe(.25);
    expect(shapeAutomation([0, 1], "sine", 9)).toHaveLength(9);
  });

  it("exposes reusable skills and new production pipelines", () => {
    expect(listSkills()).toHaveLength(6);
    expect(getSkill("music-production")?.tools).toContain("music_quantize");
    expect(listPipelines().map(p => p.id)).toEqual(expect.arrayContaining(["music-production-pipeline", "market-structure-pipeline", "release-qa-pipeline"]));
    expect(getPipeline("data-quality-pipeline")?.steps).toHaveLength(3);
  });
});
