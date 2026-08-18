export type OscillatorWave = "sine" | "triangle" | "saw" | "square" | "wavetable" | "noise";
export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch" | "comb";
export type LfoShape = "sine" | "triangle" | "saw" | "square" | "random";

export type SynthPatch = {
  name: string;
  genre: string;
  tempo: number;
  oscillators: Array<{
    id: string;
    wave: OscillatorWave;
    wavetable?: string;
    octave: number;
    semitones: number;
    fine: number;
    unison: number;
    detune: number;
    level: number;
    pan: number;
  }>;
  noise?: { type: "white" | "pink" | "vinyl" | "metal"; level: number };
  filter: { type: FilterType; cutoffHz: number; resonance: number; drive: number; keytrack: number };
  envelopes: {
    amp: { attack: number; decay: number; sustain: number; release: number };
    filter: { attack: number; decay: number; sustain: number; release: number; amount: number };
  };
  lfos: Array<{ id: string; shape: LfoShape; rateHz: number; synced?: string; amount: number }>;

  modulation: Array<{ source: string; destination: string; amount: number; curve: "linear" | "exponential" | "bipolar" }>;
  effects: Array<{ type: "distortion" | "compressor" | "delay" | "reverb" | "chorus" | "phaser" | "eq"; mix: number; parameters: Record<string, number | string> }>;
  macroControls: Array<{ name: string; mappings: Array<{ destination: string; min: number; max: number }> }>;
  tags: string[];
  notes: string[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeSynthPatch(patch: SynthPatch): SynthPatch {
  return {
    ...patch,
    tempo: clamp(patch.tempo, 20, 300),
    oscillators: patch.oscillators.map(oscillator => ({
      ...oscillator,
      octave: clamp(oscillator.octave, -4, 4),
      semitones: clamp(oscillator.semitones, -24, 24),
      fine: clamp(oscillator.fine, -100, 100),
      unison: clamp(Math.round(oscillator.unison), 1, 16),
      detune: clamp(oscillator.detune, 0, 1),
      level: clamp(oscillator.level, 0, 1),
      pan: clamp(oscillator.pan, -1, 1),
    })),
    filter: { ...patch.filter, cutoffHz: clamp(patch.filter.cutoffHz, 20, 20_000), resonance: clamp(patch.filter.resonance, 0, 1), drive: clamp(patch.filter.drive, 0, 1), keytrack: clamp(patch.filter.keytrack, 0, 1) },
    envelopes: {
      amp: { ...patch.envelopes.amp, attack: Math.max(0, patch.envelopes.amp.attack), decay: Math.max(0, patch.envelopes.amp.decay), sustain: clamp(patch.envelopes.amp.sustain, 0, 1), release: Math.max(0, patch.envelopes.amp.release) },
      filter: { ...patch.envelopes.filter, attack: Math.max(0, patch.envelopes.filter.attack), decay: Math.max(0, patch.envelopes.filter.decay), sustain: clamp(patch.envelopes.filter.sustain, 0, 1), release: Math.max(0, patch.envelopes.filter.release), amount: clamp(patch.envelopes.filter.amount, -1, 1) },
    },
  };
}

export function createSerumStylePatch(input: {
  name: string;
  genre?: string;
  mood?: "dark" | "bright" | "aggressive" | "organic" | "ambient";
  tempo?: number;
  rootNote?: string;
  wavetable?: string;
}): SynthPatch {
  const mood = input.mood ?? "bright";
  const presets = {
    dark: { cutoffHz: 850, resonance: .62, drive: .48, reverb: .18, distortion: .34, attack: .01, release: .42 },
    bright: { cutoffHz: 5200, resonance: .2, drive: .1, reverb: .3, distortion: .08, attack: .005, release: .8 },
    aggressive: { cutoffHz: 2200, resonance: .78, drive: .72, reverb: .12, distortion: .65, attack: .001, release: .25 },
    organic: { cutoffHz: 3400, resonance: .24, drive: .08, reverb: .45, distortion: .04, attack: .02, release: 1.2 },
    ambient: { cutoffHz: 1900, resonance: .35, drive: .05, reverb: .72, distortion: .02, attack: .8, release: 3.5 },
  }[mood];
  const preset = presets;
  const patch: SynthPatch = {
    name: input.name,
    genre: input.genre ?? "electronic",
    tempo: input.tempo ?? 128,
    oscillators: [
      { id: "osc-a", wave: "wavetable", wavetable: input.wavetable ?? "Basic Shapes", octave: 0, semitones: 0, fine: 0, unison: mood === "ambient" ? 4 : 2, detune: .08, level: .85, pan: 0 },
      { id: "osc-b", wave: "saw", octave: -1, semitones: 0, fine: mood === "dark" ? -7 : 7, unison: 1, detune: 0, level: .45, pan: 0 },
    ],
    noise: { type: mood === "organic" ? "vinyl" : "white", level: mood === "ambient" ? .08 : .03 },
    filter: { type: "lowpass", cutoffHz: preset.cutoffHz, resonance: preset.resonance, drive: preset.drive, keytrack: .35 },
    envelopes: { amp: { attack: preset.attack, decay: .45, sustain: mood === "aggressive" ? .72 : .85, release: preset.release }, filter: { attack: .01, decay: .55, sustain: .25, release: .6, amount: mood === "bright" ? .45 : .72 } },
    lfos: [{ id: "lfo-1", shape: "sine", rateHz: 5.2, synced: "1/8", amount: mood === "ambient" ? .12 : .06 }, { id: "lfo-2", shape: "triangle", rateHz: .3, synced: "2 bars", amount: .18 }],
    modulation: [{ source: "env-filter", destination: "filter.cutoff", amount: mood === "aggressive" ? .82 : .58, curve: "exponential" }, { source: "lfo-1", destination: "osc-a.wavetablePosition", amount: .18, curve: "linear" }, { source: "velocity", destination: "filter.cutoff", amount: .22, curve: "linear" }],
    effects: [{ type: "distortion", mix: preset.distortion, parameters: { mode: "soft-clipping", drive: preset.drive } }, { type: "compressor", mix: .42, parameters: { threshold: -18, ratio: 3.5, attack: 8, release: 90 } }, { type: "delay", mix: mood === "ambient" ? .28 : .12, parameters: { time: "1/4", feedback: .28, width: .7 } }, { type: "reverb", mix: preset.reverb, parameters: { size: mood === "ambient" ? .95 : .62, damping: .35 } }],
    macroControls: [{ name: "Movement", mappings: [{ destination: "lfo-1.amount", min: 0, max: .6 }, { destination: "filter.cutoff", min: preset.cutoffHz * .4, max: Math.min(18_000, preset.cutoffHz * 2.5) }] }, { name: "Impact", mappings: [{ destination: "distortion.mix", min: 0, max: .8 }, { destination: "env-filter.amount", min: .1, max: 1 }] }],
    tags: [mood, input.genre ?? "electronic", "serum-style", input.rootNote ?? "C"],
    notes: ["Designed as a synth patch specification for Xfer Serum-style routing.", "Map oscillator, filter, envelope, LFO, macro, and effect fields into a DAW/plugin adapter.", "Use the normalized output as a reproducible starting point rather than a proprietary preset file."],
  };
  return normalizeSynthPatch(patch);
}

export function analyzeSynthPatch(patch: SynthPatch) {
  const normalized = normalizeSynthPatch(patch);
  const brightness = clamp(normalized.filter.cutoffHz / 12_000 + normalized.filter.resonance * .2, 0, 1);
  const movement = clamp(normalized.lfos.reduce((sum, lfo) => sum + lfo.amount, 0) / Math.max(1, normalized.lfos.length), 0, 1);
  const density = clamp(normalized.oscillators.length / 4 + normalized.oscillators.reduce((sum, oscillator) => sum + oscillator.unison, 0) / 32, 0, 1);
  const risks = [
    normalized.filter.resonance > .85 ? "High resonance may create sharp peaks; monitor headroom." : null,
    normalized.effects.some(effect => effect.type === "reverb" && effect.mix > .7) ? "Large reverb mix may mask transients." : null,
    normalized.oscillators.some(oscillator => oscillator.unison > 8) ? "High unison can create phase and CPU pressure." : null,
  ].filter((value): value is string => Boolean(value));
  return { brightness, movement, density, spectralCharacter: brightness > .7 ? "bright" : brightness < .3 ? "dark" : "balanced", risks };
}

export function createModulationMatrix(patch: SynthPatch) {
  return patch.modulation.map((route, index) => ({ id: `route-${index + 1}`, ...route, normalizedAmount: clamp(Math.abs(route.amount), 0, 1) }));
}
