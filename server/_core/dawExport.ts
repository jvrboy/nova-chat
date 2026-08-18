import type { SynthPatch } from "./synthTools";

export type MidiCcMapping = { cc: number; name: string; destination: string; min: number; max: number; value: number; unit?: string };

const clamp = (value: number, min = 0, max = 127) => Math.max(min, Math.min(max, Math.round(value)));
const normalizedToCc = (value: number) => clamp(value * 127);

export function exportMidiCcMap(patch: SynthPatch) {
  const normalized = patch;
  const mappings: MidiCcMapping[] = [
    { cc: 1, name: "Modulation", destination: "lfo-1.amount", min: 0, max: 1, value: normalizedToCc(normalized.lfos[0]?.amount ?? 0) },
    { cc: 2, name: "Breath / Movement", destination: "filter.cutoff", min: 20, max: 20_000, value: clamp(((normalized.filter.cutoffHz - 20) / 19_980) * 127) },
    { cc: 16, name: "Macro Movement", destination: normalized.macroControls[0]?.name ?? "macro-1", min: 0, max: 1, value: 64 },
    { cc: 17, name: "Macro Impact", destination: normalized.macroControls[1]?.name ?? "macro-2", min: 0, max: 1, value: 64 },
    { cc: 71, name: "Resonance", destination: "filter.resonance", min: 0, max: 1, value: normalizedToCc(normalized.filter.resonance) },
    { cc: 74, name: "Brightness", destination: "filter.cutoff", min: 20, max: 20_000, value: clamp(((normalized.filter.cutoffHz - 20) / 19_980) * 127) },
    { cc: 75, name: "Envelope Attack", destination: "env-amp.attack", min: 0, max: 10, value: clamp((normalized.envelopes.amp.attack / 10) * 127) },
    { cc: 76, name: "Envelope Release", destination: "env-amp.release", min: 0, max: 15, value: clamp((normalized.envelopes.amp.release / 15) * 127) },
  ];
  return { format: "midi-cc-map", version: 1, patchName: normalized.name, channel: 1, mappings, instructions: ["Send MIDI CC values on channel 1.", "CC 74 and CC 71 are standard brightness/resonance controls.", "CC 16 and CC 17 are generic macro lanes; map them to the destination names in your DAW or synth."], disclaimer: "MIDI CC destinations vary by instrument and DAW. Verify mappings before recording automation." };
}

export function exportSerumStylePreset(patch: SynthPatch) {
  const normalized = patch;
  return {
    format: "serum-style-json",
    version: 1,
    compatibility: { target: "Xfer Serum-style", exactBinaryFxp: false, reason: "Serum .fxp is a proprietary binary preset format; this manifest preserves the musical and modulation parameters for a dedicated plugin adapter." },
    metadata: { name: normalized.name, author: "Nova", genre: normalized.genre, tempo: normalized.tempo, tags: normalized.tags },
    oscA: normalized.oscillators[0] ? { wavetable: normalized.oscillators[0].wavetable ?? normalized.oscillators[0].wave, octave: normalized.oscillators[0].octave, semitones: normalized.oscillators[0].semitones, fine: normalized.oscillators[0].fine, unison: normalized.oscillators[0].unison, detune: normalized.oscillators[0].detune, level: normalized.oscillators[0].level } : null,
    oscB: normalized.oscillators[1] ? { wavetable: normalized.oscillators[1].wavetable ?? normalized.oscillators[1].wave, octave: normalized.oscillators[1].octave, semitones: normalized.oscillators[1].semitones, fine: normalized.oscillators[1].fine, unison: normalized.oscillators[1].unison, detune: normalized.oscillators[1].detune, level: normalized.oscillators[1].level } : null,
    noise: normalized.noise ?? null,
    filter: normalized.filter,
    envelopes: normalized.envelopes,
    lfos: normalized.lfos,
    modulationMatrix: normalized.modulation,
    effects: normalized.effects,
    macros: normalized.macroControls,
    notes: normalized.notes,
  };
}

export function exportDawBundle(patch: SynthPatch) {
  return { format: "nova-daw-bundle", version: 1, patch: exportSerumStylePreset(patch), midi: exportMidiCcMap(patch), files: [{ name: `${patch.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-patch"}.serum-style.json`, mediaType: "application/json" }, { name: `${patch.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "nova-patch"}.midi-cc.json`, mediaType: "application/json" }] };
}
