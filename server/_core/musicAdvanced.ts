import { getChordNotes, noteToMidi, midiToNote, type NoteName } from "./music";

export type ChordEvent = { root: NoteName; type: string; duration?: number };
export type VoicedChord = ChordEvent & { notes: string[]; midi: number[]; inversion: number; octave: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function voiceChord(event: ChordEvent, options: { octave?: number; spread?: number; inversion?: number } = {}): VoicedChord {
  const octave = options.octave ?? 4, spread = options.spread ?? 4, inversion = options.inversion ?? 0;
  const notes = getChordNotes(event.root, event.type).map(note => noteToMidi(`${note}${octave}`));
  const rotated = notes.map((_, index) => notes[(index + inversion) % notes.length] + (index < inversion ? 12 : 0)).sort((a, b) => a - b);
  const midi = rotated.map((note, index) => note + Math.floor(index * spread / Math.max(1, rotated.length - 1)) * 12);
  return { ...event, notes: midi.map(midiToNote), midi, inversion, octave };
}

export function voiceLeadProgression(progression: ChordEvent[], options: { octave?: number } = {}) {
  const voices: VoicedChord[] = [];
  progression.forEach((event, index) => {
    const candidate = voiceChord(event, { octave: options.octave ?? 4, inversion: index % 3 });
    if (index === 0) { voices.push(candidate); return; }
    const previous = voices[index - 1].midi;
    const midi = candidate.midi.map((note, voice) => { const target = previous[voice] ?? note; const alternatives = [note - 12, note, note + 12]; return alternatives.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0]; });
    voices.push({ ...candidate, midi, notes: midi.map(midiToNote) });
  });
  const totalMovement = voices.slice(1).reduce((sum: number, voice: VoicedChord, index: number) => sum + voice.midi.reduce((inner: number, note: number, voiceIndex: number) => inner + Math.abs(note - (voices[index].midi[voiceIndex] ?? note)), 0), 0);
  return { voices, totalMovement };
}

export function generateArpeggio(notes: number[], pattern: "up" | "down" | "updown" | "random" = "up", steps = 16, subdivision = "1/16") {
  const sorted = [...notes].sort((a, b) => a - b); const sequence = pattern === "down" ? [...sorted].reverse() : pattern === "updown" ? [...sorted, ...sorted.slice(1, -1).reverse()] : sorted; const output: number[] = []; for (let index = 0; index < steps; index += 1) output.push(sequence[index % sequence.length] + Math.floor(index / sequence.length) * 12); return { pattern, subdivision, steps, midi: output, notes: output.map(midiToNote) };
}

export function reharmonize(progression: ChordEvent[], mode: "diatonic" | "secondary-dominants" | "modal-mixture" = "diatonic") {
  if (mode === "diatonic") return progression;
  if (mode === "secondary-dominants") return progression.map((event, index) => index % 2 ? { ...event, type: event.type.includes("7") ? event.type : "7" } : event);
  return progression.map((event, index) => index % 2 ? { ...event, type: event.type.includes("m") ? event.type : "m" } : event);
}

export function generateGroove(input: { steps?: number; swing?: number; accentEvery?: number; velocityMin?: number; velocityMax?: number } = {}) {
  const steps = input.steps ?? 16, swing = clamp(input.swing ?? .08, 0, .5), accentEvery = Math.max(1, input.accentEvery ?? 4); return Array.from({ length: steps }, (_, index) => ({ step: index, beat: index / 4 + (index % 2 ? swing : 0), velocity: index % accentEvery === 0 ? input.velocityMax ?? 115 : input.velocityMin ?? 75, gate: index % 4 === 3 ? .75 : .95 }));
}

export function generateMidiAutomation(input: { destination: string; start: number; end: number; bars?: number; resolution?: number; curve?: "linear" | "ease-in" | "ease-out" | "sine" }) {
  const bars = input.bars ?? 8, resolution = input.resolution ?? 16, points = bars * resolution, curve = input.curve ?? "linear"; const values = Array.from({ length: points }, (_, index) => { const t = points <= 1 ? 1 : index / (points - 1); const shaped = curve === "ease-in" ? t ** 2 : curve === "ease-out" ? 1 - (1 - t) ** 2 : curve === "sine" ? (1 - Math.cos(t * Math.PI)) / 2 : t; return { bar: index / resolution, value: input.start + (input.end - input.start) * shaped }; }); return { destination: input.destination, bars, resolution, values };
}
