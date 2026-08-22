import * as Speech from 'expo-speech';

// Text-to-speech for assistant replies. expo-speech ships inside Expo Go and
// is linked by `expo prebuild`, so no extra native setup is required.

const cleanForSpeech = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_#>|]/g, '')
    .replace(/\bhttps?:\/\/\S+/g, 'link')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3500);

export async function speakAloud(text: string): Promise<void> {
  const clean = cleanForSpeech(text);
  if (!clean) return;
  stopSpeaking();
  Speech.speak(clean, { rate: 1.0, pitch: 1.0 });
}

export function stopSpeaking(): void {
  try { Speech.stop(); } catch { /* nothing playing */ }
}

export function isSpeechAvailable(): boolean {
  try { return typeof Speech.speak === 'function'; } catch { return false; }
}
