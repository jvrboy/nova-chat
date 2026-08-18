import { describe, expect, it } from "vitest";
import { exportDawBundle, exportMidiCcMap, exportSerumStylePreset } from "./_core/dawExport";
import { createSerumStylePatch } from "./_core/synthTools";
import { canInvokeTool, listToolPolicies, recordToolFailure, resetToolCircuit } from "./_core/toolRegistry";

describe("tool governance and DAW exports", () => {
  it("enforces agent-specific permissions", () => {
    expect(canInvokeTool("create_synth_patch", "music_composer").allowed).toBe(true);
    expect(canInvokeTool("create_synth_patch", "forex_analyst").allowed).toBe(false);
    expect(listToolPolicies().some(policy => policy.name === "forex_signal_snapshot")).toBe(true);
  });

  it("opens and resets a per-tool circuit after failures", () => {
    resetToolCircuit("forex_signal_snapshot");
    for (let i = 0; i < 5; i += 1) recordToolFailure("forex_signal_snapshot", "test failure");
    expect(canInvokeTool("forex_signal_snapshot", "forex_analyst").allowed).toBe(false);
    resetToolCircuit("forex_signal_snapshot");
    expect(canInvokeTool("forex_signal_snapshot", "forex_analyst").allowed).toBe(true);
  });

  it("exports a patch to MIDI CC, Serum-style JSON, and a DAW bundle", () => {
    const patch = createSerumStylePatch({ name: "Test Bass", mood: "aggressive" });
    expect(exportMidiCcMap(patch).mappings.length).toBeGreaterThan(4);
    expect(exportSerumStylePreset(patch).compatibility.exactBinaryFxp).toBe(false);
    expect(exportDawBundle(patch).files).toHaveLength(2);
  });
});
