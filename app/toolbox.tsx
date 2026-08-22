import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { findLocalTool, useNova } from '../src/state/NovaProvider';
import type { ToolDefinition } from '../src/agent/runtime';
import { colors, radii } from '../src/ui/theme';

const examples: Record<string, string> = {
  calculator: '(18 + 4) * 2.5',
  'word-count': 'Nova turns scattered notes into decisions.',
  'case-convert': 'camel | convert this title',
  slugify: 'My Best Blog Post! |',
  'base64-codec': 'encode | Ship it Friday',
  'url-codec': 'parse | https://nova.app/search?q=tools&page=2',
  'uuid-generate': '3',
  'password-generate': '24 yes',
  'json-format': '{"b":2,"a":1}',
  'regex-test': '[A-Z]{3}-\\d{4} | Codes: NOVA-2026 and ABC-9999',
  'timestamp-convert': '1780000000',
  'number-base': 'hex | ff00cc',
  'color-convert': '#55d6ff',
  'lorem-ipsum': '2 30',
};

export default function Toolbox() {
  const router = useRouter();
  const { startRun } = useNova();
  const [selectedId, setSelectedId] = useState('calculator');
  const [input, setInput] = useState(examples.calculator ?? '');
  const [output, setOutput] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const utilityTools = useMemo(() => ['calculator', 'word-count', 'case-convert', 'slugify', 'base64-codec', 'url-codec', 'uuid-generate', 'password-generate', 'json-format', 'regex-test', 'timestamp-convert', 'number-base', 'color-convert', 'lorem-ipsum'].map(findLocalTool).filter((tool): tool is ToolDefinition => Boolean(tool)), []);
  const selected = findLocalTool(selectedId);

  const pick = (id: string) => {
    setSelectedId(id);
    setOutput(null);
    setNotice(null);
    setInput(examples[id] ?? '');
  };

  const run = async () => {
    if (!selected || !input.trim() || running) return;
    setRunning(true);
    setOutput(null);
    setNotice(null);
    try {
      const result = await startRun(input, selected.id);
      if (result === null) setNotice(`${selected.name} needs approval first — see Operations → Approvals.`);
      else setOutput(result);
    } catch {
      setNotice('Unexpected failure while running the tool.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>NOVA / ON-DEVICE</Text>
            <Text style={s.title}>Toolbox</Text>
          </View>
          <Pressable style={s.close} onPress={() => router.back()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Text style={s.subtitle}>Instant utilities that run entirely on your device — no network, no backend, no data leaves the phone.</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillRow}>
          {utilityTools.map((tool) => (
            <Pressable key={tool.id} onPress={() => pick(tool.id)} style={[s.pill, selectedId === tool.id && s.pillActive]}>
              <Text style={[s.pillText, selectedId === tool.id && s.pillTextActive]}>{tool.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {selected && (
          <>
            <Text style={s.toolDescription}>{selected.description}</Text>
            <TextInput value={input} onChangeText={setInput} placeholder={`Input, e.g. ${examples[selected.id] ?? 'text'}`} placeholderTextColor={colors.muted} style={s.input} multiline autoCapitalize="none" autoCorrect={false} />
            <Pressable accessibilityLabel="Run tool" onPress={() => void run()} disabled={running || !input.trim()} style={[s.runButton, (!input.trim() || running) && s.runDisabled]}>
              {running ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="flash" size={17} color={colors.bg} />}
              <Text style={s.runText}>{running ? 'Running…' : `Run ${selected.name}`}</Text>
            </Pressable>

            {output !== null && (
              <View style={s.resultCard}>
                <View style={s.resultHeader}>
                  <Text style={s.resultEyebrow}>RESULT</Text>
                  <Pressable accessibilityLabel="Share result" hitSlop={8} onPress={() => void Share.share({ message: output })}>
                    <Ionicons name="share-outline" size={17} color={colors.muted} />
                  </Pressable>
                </View>
                <Text selectable style={s.output}>{output}</Text>
              </View>
            )}
            {notice && (
              <View style={s.noticeCard}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.warning} />
                <Text style={s.noticeText}>{notice}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  close: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, color: colors.primary, fontWeight: '700' },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  pillRow: { gap: 8, paddingVertical: 4 },
  pill: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  pillTextActive: { color: colors.bg },
  toolDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, color: colors.text, minHeight: 96, padding: 14, fontSize: 14, textAlignVertical: 'top' },
  runButton: { backgroundColor: colors.primary, borderRadius: radii.sm, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  runDisabled: { opacity: 0.45 },
  runText: { color: colors.bg, fontWeight: '800', fontSize: 14 },
  resultCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: 14, gap: 8 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultEyebrow: { color: colors.success, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' },
  output: { color: colors.text, fontSize: 13, lineHeight: 20, fontFamily: undefined },
  noticeCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeText: { color: colors.warning, flex: 1, fontSize: 13, lineHeight: 19 },
});
