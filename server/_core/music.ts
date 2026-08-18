/**
 * Music Creation & Analysis Tools for Nova Chat
 * Provides music theory, chord generation, melody creation, and composition tools
 */

// --- Music Theory ---

export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type NoteName = typeof NOTES[number];

export const SCALES: Record<string, number[]> = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor:    [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:     [0, 2, 3, 5, 7, 9, 11],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  locrian:          [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor:  [0, 2, 4, 7, 9],
  pentatonicMinor:  [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  wholeTone:        [0, 2, 4, 6, 8, 10],
  diminished:       [0, 2, 3, 5, 6, 8, 9, 11],
};

export const CHORD_TYPES: Record<string, number[]> = {
  major:          [0, 4, 7],
  minor:          [0, 3, 7],
  diminished:     [0, 3, 6],
  augmented:      [0, 4, 8],
  sus2:           [0, 2, 7],
  sus4:           [0, 5, 7],
  major7:         [0, 4, 7, 11],
  minor7:         [0, 3, 7, 10],
  dominant7:      [0, 4, 7, 10],
  diminished7:    [0, 3, 6, 9],
  halfDim7:       [0, 3, 6, 10],
  augmented7:     [0, 4, 8, 10],
  add9:           [0, 4, 7, 14],
  major9:         [0, 4, 7, 11, 14],
  minor9:         [0, 3, 7, 10, 14],
  dominant9:      [0, 4, 7, 10, 14],
  major11:        [0, 4, 7, 11, 14, 17],
  minor11:        [0, 3, 7, 10, 14, 17],
  dominant13:     [0, 4, 7, 10, 14, 21],
  power:          [0, 7],
};

export const KEY_SIGNATURES = [
  'C major / A minor', 'G major / E minor', 'D major / B minor',
  'A major / F# minor', 'E major / C# minor', 'B major / G# minor',
  'F# major / D# minor', 'C# major / A# minor', 'F major / D minor',
  'Bb major / G minor', 'Eb major / C minor', 'Ab major / F minor',
  'Db major / Bb minor', 'Gb major / Eb minor', 'Cb major / Ab minor',
] as const;

/** Get note name from MIDI number */
export function midiToNote(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTES[midi % 12];
  return `${note}${octave}`;
}

/** Get MIDI number from note name */
export function noteToMidi(note: string): number {
  const match = note.match(/^([A-G]#?)(\d)$/);
  if (!match) throw new Error(`Invalid note format: ${note}`);
  const noteIndex = NOTES.indexOf(match[1] as NoteName);
  if (noteIndex === -1) throw new Error(`Unknown note: ${match[1]}`);
  return (parseInt(match[2]) + 1) * 12 + noteIndex;
}

/** Get notes in a scale */
export function getScaleNotes(root: NoteName, scaleName: string): string[] {
  const intervals = SCALES[scaleName];
  if (!intervals) throw new Error(`Unknown scale: ${scaleName}. Available: ${Object.keys(SCALES).join(', ')}`);
  const rootIndex = NOTES.indexOf(root);
  return intervals.map(interval => NOTES[(rootIndex + interval) % 12]);
}

/** Get notes in a chord */
export function getChordNotes(root: NoteName, chordType: string): string[] {
  const intervals = CHORD_TYPES[chordType];
  if (!intervals) throw new Error(`Unknown chord type: ${chordType}. Available: ${Object.keys(CHORD_TYPES).join(', ')}`);
  const rootIndex = NOTES.indexOf(root);
  return intervals.map(interval => NOTES[(rootIndex + interval) % 12]);
}

/** Get chords that belong to a scale (diatonic chords) */
export function getScaleChords(root: NoteName, scaleName: string): { chord: string; degree: string; type: string }[] {
  const scaleIntervals = SCALES[scaleName];
  if (!scaleIntervals) throw new Error(`Unknown scale: ${scaleName}`);
  const rootIndex = NOTES.indexOf(root);
  const degreeNames = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii'];
  const result: { chord: string; degree: string; type: string }[] = [];
  for (let i = 0; i < scaleIntervals.length; i++) {
    const noteIndex = (rootIndex + scaleIntervals[i]) % 12;
    const note = NOTES[noteIndex];
    // Determine chord quality from intervals between scale degrees
    let type = 'major';
    if (i + 1 < scaleIntervals.length && i + 2 < scaleIntervals.length) {
      const third = (scaleIntervals[i + 2] - scaleIntervals[i]) % 12;
      const fifth = (scaleIntervals[i + 4] - scaleIntervals[i]) % 12;
      if (third === 3 && fifth === 7) type = 'minor';
      else if (third === 3 && fifth === 6) type = 'diminished';
      else if (third === 4 && fifth === 8) type = 'augmented';
    }
    result.push({
      chord: `${note}`,
      degree: degreeNames[i] || `${i + 1}`,
      type,
    });
  }
  return result;
}

/** Generate a chord progression */
export function generateChordProgression(
  root: NoteName,
  scaleName: string,
  degrees: number[] = [1, 4, 5, 1],
  variations: boolean = true
): { chord: string; symbol: string; notes: string[] }[] {
  const scaleChords = getScaleChords(root, scaleName);
  return degrees.map(degree => {
    const idx = Math.max(0, Math.min(degree - 1, scaleChords.length - 1));
    const sc = scaleChords[idx];
    const notes = getChordNotes(sc.chord as NoteName, sc.type);
    let suffix = '';
    if (variations) {
      const r = Math.random();
      if (r < 0.15) suffix = '7';
      else if (r < 0.25) suffix = 'sus4';
      else if (r < 0.3) suffix = 'add9';
    }
    return {
      chord: sc.chord,
      symbol: `${sc.chord}${sc.type === 'minor' ? 'm' : sc.type === 'diminished' ? 'dim' : sc.type === 'augmented' ? 'aug' : ''}${suffix}`,
      notes: suffix ? getChordNotes(sc.chord as NoteName, suffix === '7' ? (sc.type === 'minor' ? 'minor7' : 'dominant7') : suffix) : notes,
    };
  });
}

/** Generate a melody from a scale */
export function generateMelody(
  root: NoteName,
  scaleName: string,
  length: number = 16,
  octaveRange: [number, number] = [4, 5]
): { note: string; midi: number; duration: string; velocity: number }[] {
  const scaleNotes = getScaleNotes(root, scaleName);
  const durations = ['quarter', 'quarter', 'quarter', 'eighth', 'eighth', 'half', 'quarter'];
  const melody: { note: string; midi: number; duration: string; velocity: number }[] = [];
  let prevNoteIndex = Math.floor(scaleNotes.length / 2);
  for (let i = 0; i < length; i++) {
    // Stepwise motion with occasional leaps
    const step = Math.random() < 0.7
      ? (Math.random() < 0.5 ? 1 : -1)
      : (Math.random() < 0.5 ? 2 : -2);
    prevNoteIndex = Math.max(0, Math.min(scaleNotes.length - 1, prevNoteIndex + step));
    const note = scaleNotes[prevNoteIndex];
    const octave = octaveRange[0] + Math.floor(Math.random() * (octaveRange[1] - octaveRange[0] + 1));
    const midi = noteToMidi(`${note}${octave}`);
    melody.push({
      note: `${note}${octave}`,
      midi,
      duration: durations[Math.floor(Math.random() * durations.length)],
      velocity: 60 + Math.floor(Math.random() * 40),
    });
  }
  // End on root or fifth for resolution
  const lastNote = scaleNotes[0];
  melody[melody.length - 1] = { note: `${lastNote}${octaveRange[0]}`, midi: noteToMidi(`${lastNote}${octaveRange[0]}`), duration: 'half', velocity: 70 };
  return melody;
}

/** Generate a bass line from chord progression */
export function generateBassLine(
  chordProgression: { chord: string; notes: string[] }[],
  pattern: 'root' | 'walking' | 'octave' = 'root'
): { note: string; midi: number; duration: string }[] {
  const bassNotes: { note: string; midi: number; duration: string }[] = [];
  for (const chord of chordProgression) {
    const root = chord.notes[0];
    const rootMidi = noteToMidi(`${root}2`);
    switch (pattern) {
      case 'root':
        bassNotes.push({ note: `${root}2`, midi: rootMidi, duration: 'whole' });
        break;
      case 'walking': {
        const scale = [0, 2, 4, 5, 7, 9, 11];
        for (let i = 0; i < 4; i++) {
          const noteIndex = (NOTES.indexOf(root as NoteName) + scale[i % scale.length]) % 12;
          const note = NOTES[noteIndex];
          bassNotes.push({ note: `${note}2`, midi: noteToMidi(`${note}2`), duration: 'quarter' });
        }
        break;
      }
      case 'octave':
        bassNotes.push({ note: `${root}2`, midi: rootMidi, duration: 'half' });
        bassNotes.push({ note: `${root}3`, midi: rootMidi + 12, duration: 'half' });
        break;
    }
  }
  return bassNotes;
}

/** Analyze a chord progression for tension/resolution */
export function analyzeProgression(progression: string[]): {
  totalTension: number;
  resolution: 'strong' | 'moderate' | 'weak' | 'none';
  analysis: string;
} {
  // Tension values for scale degrees (1-based)
  const tensionMap: Record<string, number> = {
    'I': 0, 'ii': 0.3, 'iii': 0.4, 'IV': 0.2, 'V': 0.8, 'vi': 0.3, 'vii': 0.9,
  };
  const resolutionMap: Record<string, string> = {
    'V-I': 'perfect', 'vii-I': 'deceptive', 'IV-I': 'plagal',
    'ii-V': 'secondary', 'vi-IV': 'interrupted',
  };
  let totalTension = 0;
  const tensions: number[] = [];
  for (const chord of progression) {
    const tension = tensionMap[chord] ?? 0.5;
    tensions.push(tension);
    totalTension += tension;
  }
  const avgTension = totalTension / progression.length;
  let resolution: 'strong' | 'moderate' | 'weak' | 'none' = 'none';
  if (progression.length >= 2) {
    const lastTwo = `${progression[progression.length - 2]}-${progression[progression.length - 1]}`;
    const res = resolutionMap[lastTwo];
    if (res === 'perfect') resolution = 'strong';
    else if (res === 'plagal' || res === 'secondary') resolution = 'moderate';
    else if (res) resolution = 'weak';
  }
  const analysis = `Average tension: ${(avgTension * 100).toFixed(0)}%. ` +
    (resolution === 'strong' ? 'Strong resolution to tonic. Classic cadence.' :
     resolution === 'moderate' ? 'Moderate resolution. Some forward motion remains.' :
     resolution === 'weak' ? 'Weak or deceptive resolution. Creates expectation.' :
     'No clear resolution. The progression feels open-ended.');
  return { totalTension: avgTension, resolution, analysis };
}

/** Generate a drum pattern */
export function generateDrumPattern(
  style: 'rock' | 'jazz' | 'hiphop' | 'electronic' | 'latin' = 'rock',
  bars: number = 4,
  stepsPerBar: number = 16
): { instrument: string; pattern: boolean[] }[] {
  const patterns: Record<string, Record<string, boolean[]>> = {
    rock: {
      kick:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      snare:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    },
    jazz: {
      ride:    [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,1],
      kick:    [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
      snare:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    },
    hiphop: {
      kick:    [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      snare:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    },
    electronic: {
      kick:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      clap:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      hihat:   [1,0,1,0, 1,0,1,0, 1,0,1,1, 1,0,1,0],
      bass:    [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0],
    },
    latin: {
      kick:    [1,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0],
      snare:   [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,0],
      hihat:   [1,0,1,1, 0,1,1,0, 1,1,0,1, 1,0,1,0],
      cowbell: [1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,1],
    },
  };
  const stylePattern = patterns[style] || patterns.rock;
  return Object.entries(stylePattern).map(([instrument, pattern]) => ({
    instrument,
    pattern: Array.from({ length: bars * stepsPerBar }, (_, i) => !!pattern[i % pattern.length]),
  }));
}

/** Convert melody to ABC notation */
export function melodyToABC(melody: { note: string; duration: string; velocity: number }[],
  title: string = 'Nova Composition',
  composer: string = 'Nova AI',
  meter: string = '4/4',
  tempo: number = 120
): string {
  const durationMap: Record<string, string> = {
    'whole': '1', 'half': '2', 'quarter': '', 'eighth': '8', 'sixteenth': '16',
  };
  const noteMap: Record<string, string> = {
    'C': 'C', 'C#': '^C', 'D': 'D', 'D#': '^D', 'E': 'E',
    'F': 'F', 'F#': '^F', 'G': 'G', 'G#': '^G', 'A': 'A', 'A#': '^A', 'B': 'B',
  };
  let abc = `X:1\nT:${title}\nC:${composer}\nM:${meter}\nQ:1/4=${tempo}\nK:C\n`;
  for (const item of melody) {
    const noteName = item.note.replace(/\d/g, '');
    const octave = parseInt(item.note.replace(/[^0-9]/g, '')) || 4;
    let abcNote = noteMap[noteName] || noteName;
    if (octave < 4) abcNote = abcNote.toLowerCase().repeat(4 - octave);
    else if (octave > 4) abcNote = abcNote.toUpperCase().repeat(octave - 4);
    else abcNote = abcNote.toLowerCase();
    const dur = durationMap[item.duration] || '';
    abc += `${abcNote}${dur} `;
  }
  return abc.trim() + '\n';
}

/** Generate a complete song structure */
export type SongStructure = {
  title: string;
  key: string;
  scale: string;
  tempo: number;
  timeSignature: string;
  sections: {
    name: string;
    chords: { chord: string; symbol: string; notes: string[] }[];
    melody: { note: string; midi: number; duration: string; velocity: number }[];
    bass: { note: string; midi: number; duration: string }[];
    drums: { instrument: string; pattern: boolean[] }[];
  }[];
  abcNotation: string;
};

export function generateSong(
  root: NoteName = 'C',
  scaleName: string = 'major',
  style: 'rock' | 'jazz' | 'pop' | 'electronic' | 'classical' = 'pop',
  sections: string[] = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro']
): SongStructure {
  const sectionChordDegrees: Record<string, number[]> = {
    intro: [1, 4, 5, 4],
    verse: [1, 5, 6, 4],
    chorus: [4, 5, 1, 1],
    bridge: [6, 4, 1, 5],
    outro: [1, 4, 1, 1],
  };
  const tempos: Record<string, number> = { rock: 120, jazz: 140, pop: 110, electronic: 128, classical: 90 };
  const songSections = sections.map(sectionName => {
    const degrees = sectionChordDegrees[sectionName] || [1, 4, 5, 1];
    const chords = generateChordProgression(root, scaleName, degrees, false);
    const melody = generateMelody(root, scaleName, 16);
    const bass = generateBassLine(chords, 'walking');
    const drums = generateDrumPattern(style === 'pop' ? 'rock' : style, 2);
    return { name: sectionName, chords, melody, bass, drums };
  });
  const allMelody = songSections.flatMap(s => s.melody);
  return {
    title: `Nova ${style.charAt(0).toUpperCase() + style.slice(1)} in ${root} ${scaleName}`,
    key: root,
    scale: scaleName,
    tempo: tempos[style] || 120,
    timeSignature: '4/4',
    sections: songSections,
    abcNotation: melodyToABC(allMelody, `Nova ${style} Song`, 'Nova AI'),
  };
}
