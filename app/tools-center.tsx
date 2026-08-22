import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { findLocalTool, useNova } from '../src/state/NovaProvider';
import { colors, radii } from '../src/ui/theme';

export default function ToolsCenter() {
  const { startRun, tools } = useNova();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const visible = tools.filter((tool) => !query || `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const run = async (id: string, name: string) => {
    const local = findLocalTool(id);
    if (!local) {
      Alert.alert('Cloud tool', `${name} runs against the connected backend. Open it in Chat → tool drawer while a backend is connected.`);
      return;
    }
    setRunningId(id);
    try {
      const output = await startRun(`Run ${name}`, id);
      if (output === null) {
        Alert.alert('Approval gate', `${name} is ${local.risk}-risk. Approve it under Operations → Approvals to execute it.`);
      } else {
        Alert.alert(name, output.length > 900 ? `${output.slice(0, 900)}…` : output);
      }
    } finally {
      setRunningId(null);
    }
  };
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}><View style={s.header}><View><Text style={s.eyebrow}>NOVA / AGENT RUNTIME</Text><Text style={s.title}>Tools</Text></View><Pressable style={s.close} onPress={() => router.back()}><Ionicons name="close" size={20} color={colors.text} /></Pressable></View><Text style={s.subtitle}>Safe on-device tools execute immediately; review-gated ones pause in Approvals first. Cloud tools need the backend — results also land in the chat transcript.</Text><View style={s.searchBox}><Ionicons name="search-outline" size={17} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Filter tools" placeholderTextColor={colors.muted} style={s.searchInput} /></View>{visible.map((tool) => <Pressable key={tool.id} style={s.tool} onPress={() => void run(tool.id, tool.name)} disabled={runningId === tool.id}><View style={s.icon}>{runningId === tool.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={findLocalTool(tool.id) ? 'sparkles-outline' : 'cloud-outline'} size={21} color={findLocalTool(tool.id) ? colors.primary : colors.muted} />}</View><View style={s.copy}><Text style={s.name}>{tool.name}</Text><Text style={s.desc}>{tool.description}</Text><Text style={s.meta}>{findLocalTool(tool.id) ? `${tool.category} · on-device · ${tool.id}` : `${tool.category} · cloud · ${tool.id}`}</Text></View><Ionicons name={findLocalTool(tool.id) ? 'play-circle-outline' : 'cloud-outline'} color={findLocalTool(tool.id) ? colors.primary : colors.muted} size={22} /></Pressable>)}{!visible.length && <Text style={s.empty}>No matching tools.</Text>}<Pressable style={s.diag} onPress={() => router.push('/diagnostics')}><Text style={s.diagText}>Open runtime diagnostics</Text><Ionicons name="chevron-forward" color={colors.primary} size={18} /></Pressable></ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, content: { padding: 20, gap: 10 }, header: { flexDirection: 'row', justifyContent: 'space-between' }, close: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, eyebrow: { fontSize: 10, letterSpacing: 1.5, color: colors.primary, fontWeight: '700' }, title: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 4 }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 10 }, searchBox: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, color: colors.text, paddingVertical: 11, fontSize: 14 }, tool: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, name: { color: colors.text, fontWeight: '800', fontSize: 15 }, desc: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, meta: { color: colors.primary, fontSize: 11, marginTop: 6 }, empty: { color: colors.muted, textAlign: 'center', padding: 20 }, diag: { marginTop: 4, padding: 15, borderRadius: radii.md, backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, diagText: { color: colors.primary, fontWeight: '800' } });
