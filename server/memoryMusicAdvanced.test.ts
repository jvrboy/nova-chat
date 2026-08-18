import { describe, expect, it } from "vitest";
import { conv1d, ensembleForward, neuralForward, recurrentSequenceForward, softmax } from "./_core/brainSystem";
import { createEmbedding, retentionPolicy } from "./_core/persistentMemory";
import { INDICATOR_CATALOG, computeIndicator } from "./_core/indicatorEngine";
import { generateArpeggio, generateGroove, generateMidiAutomation, voiceChord, voiceLeadProgression } from "./_core/musicAdvanced";

const candles = Array.from({ length: 80 }, (_, index) => { const close = 100 + index * .2; return { timestamp: index, open: close - .1, high: close + .4, low: close - .4, close, volume: 1000 + index }; });

describe("persistent memory and neural extensions", () => {
  it("creates normalized deterministic vectors and exposes retention defaults", () => {
    const a = createEmbedding("dark bass patch");
    expect(a).toEqual(createEmbedding("dark bass patch"));
    expect(Math.sqrt(a.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 5);
    expect(retentionPolicy().defaults.preference).toBeGreaterThan(retentionPolicy().defaults["tool-result"]);
  });
  it("supports softmax, convolution, recurrence, and ensembles", () => {
    expect(softmax([1, 2]).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
    expect(conv1d([1, 2, 3], [1, 1])).toEqual([3, 5]);
    expect(recurrentSequenceForward([[1], [2]], [{ weights: [[1, 0]], bias: [0], activation: "linear" }]).outputs).toHaveLength(2);
    expect(ensembleForward([2], [[{ weights: [[1]], bias: [0] }], [{ weights: [[2]], bias: [0] }]]).mean[0]).toBe(3);
  });
});

describe("advanced technical analysis and music tools", () => {
  it("has more than 400 functional indicator variants", () => {
    expect(INDICATOR_CATALOG.length).toBeGreaterThan(400);
    expect(Number.isFinite(computeIndicator("cmf_14", candles).values.at(-1))).toBe(true);
  });
  it("generates voicings, arpeggios, grooves, and automation", () => {
    const chord = voiceChord({ root: "C", type: "major" });
    expect(chord.midi.length).toBeGreaterThan(2);
    expect(voiceLeadProgression([{ root: "C", type: "major" }, { root: "F", type: "major" }]).voices).toHaveLength(2);
    expect(generateArpeggio(chord.midi, "up", 8).midi).toHaveLength(8);
    expect(generateGroove({ steps: 8 })).toHaveLength(8);
    expect(generateMidiAutomation({ destination: "filter.cutoff", start: 0, end: 1, bars: 2 }).values.length).toBeGreaterThan(1);
  });
});
