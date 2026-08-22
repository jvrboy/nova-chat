import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useNova } from '../../src/state/NovaProvider';
import { colors, radii } from '../../src/ui/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const toolIcons: Record<string, IconName> = {
  brain: 'bulb-outline',
  'git-branch': 'git-branch-outline',
  'book-open': 'book-outline',
  calculator: 'calculator-outline',
  scan: 'scan-outline',
  list: 'list-outline',
  sparkles: 'sparkles-outline',
  globe: 'globe-outline',
  'code-slash': 'code-slash-outline',
  construct: 'construct-outline',
  pulse: 'pulse-outline',
  'shield-checkmark': 'shield-checkmark-outline',
};

const promptStarters = [
  { icon: 'sparkles-outline' as IconName, label: 'Think deeper', prompt: 'Explore this idea with multiple perspectives and a clear recommendation.' },
  { icon: 'list-outline' as IconName, label: 'Build a plan', prompt: 'Turn my idea into a practical plan with milestones, risks, and next actions.' },
  { icon: 'document-text-outline' as IconName, label: 'Summarize', prompt: 'Summarize the key points, decisions, and open questions from this context.' },
  { icon: 'flash-outline' as IconName, label: 'Solve it', prompt: 'Help me solve this step by step and show the assumptions behind the answer.' },
  { icon: 'globe-outline' as IconName, label: '2026 tech brief', prompt: 'What are the most important technology news developments from the last 30 days of 2026? Cite the sources and explain why each matters.', tool: 'web-search-pro' },
];
const codeLanguages = ['python', 'javascript', 'typescript', 'r', 'bash'] as const;

export default function ChatScreen() {
  const { activeChat, sendMessage, runProductionTool, createChat, backendConnected, streamingReply, tools } = useNova();
  const [text, setText] = useState('');
  const [toolSheetOpen, setToolSheetOpen] = useState(false);
  const [toolQuery, setToolQuery] = useState('');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [codeLanguage, setCodeLanguage] = useState<(typeof codeLanguages)[number]>('python');
  const listRef = useRef<FlatList>(null);

  const visibleTools = useMemo(() => {
    const query = toolQuery.trim().toLowerCase();
    return tools.filter((tool) => !query || `${tool.name} ${tool.description} ${tool.category}`.toLowerCase().includes(query));
  }, [toolQuery, tools]);

  const submit = (value = text) => {
    const trimmed = value.trim();
    if (!trimmed || streamingReply) return;
    if (activeTool === 'web-search-pro') {
      void runProductionTool(activeTool, { query: trimmed, limit: 5, scrapeContent: true });
    } else if (activeTool === 'code-execute') {
      void runProductionTool(activeTool, { code: trimmed, language: codeLanguage });
    } else {
      const enriched = activeTool ? `[Use ${activeTool}] ${trimmed}` : trimmed;
      sendMessage(enriched);
    }
    setText('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const useStarter = (prompt: string, tool?: string) => {
    setText(prompt);
    if (tool) setActiveTool(tool);
  };

  const copyOrShare = async (messageText: string) => {
    try {
      await Share.share({ message: messageText });
    } catch {
      Alert.alert('Could not share', 'Nova could not open the system share sheet.');
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>{backendConnected ? 'NOVA / CONNECTED' : 'NOVA / OFFLINE WORKSPACE'}</Text>
            <Text style={s.title}>Chat</Text>
          </View>
          <View style={s.headerActions}>
            <Pressable accessibilityLabel="Open backend settings" onPress={() => router.push('/backend')} style={s.iconButton}>
              <Ionicons name={backendConnected ? 'cloud-done-outline' : 'cloud-offline-outline'} size={20} color={backendConnected ? colors.success : colors.muted} />
            </Pressable>
            <Pressable accessibilityLabel="Start new conversation" onPress={createChat} style={s.iconButton}>
              <Ionicons name="create-outline" size={21} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <View style={s.context}>
          <View style={[s.live, { backgroundColor: backendConnected ? colors.success : colors.muted }]} />
          <Text style={s.contextText}>{backendConnected ? 'Live AI backend connected' : 'Local heuristics only'}</Text>
          {streamingReply ? <ActivityIndicator size="small" color={colors.primary} style={s.spinner} /> : <Text style={s.contextMeta}>{backendConnected ? 'streaming + RAG + tools' : `${tools.length} tools ready`}</Text>}
        </View>

        {activeChat.messages.length === 0 && (
          <View style={s.starterWrap}>
            <Text style={s.starterEyebrow}>QUICK START</Text>
            <Text style={s.starterTitle}>What are we working on?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.starterRow}>
              {promptStarters.map((starter) => (
                <Pressable key={starter.label} onPress={() => useStarter(starter.prompt, starter.tool)} style={({ pressed }) => [s.starterCard, pressed && s.pressed]}>
                  <Ionicons name={starter.icon} size={19} color={colors.primary} />
                  <Text style={s.starterLabel}>{starter.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={activeChat.messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={s.messages}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[s.message, item.role === 'user' ? s.userMessage : s.assistantMessage, item.error && s.errorMessage]}>
              <View style={s.messageHeader}>
                <Text style={s.role}>{item.role === 'user' ? 'YOU' : 'NOVA'}{item.tool ? `  ·  ${item.tool.toUpperCase()}` : ''}</Text>
                {item.role === 'assistant' && !item.pending && !!item.text && (
                  <Pressable accessibilityLabel="Share response" onPress={() => void copyOrShare(item.text)} hitSlop={8}>
                    <Ionicons name="share-outline" size={16} color={colors.muted} />
                  </Pressable>
                )}
              </View>
              {item.pending && !item.text ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[s.messageText, item.error && s.errorText]}>{item.text}{item.pending ? ' ▍' : ''}</Text>}
            </View>
          )}
          ListEmptyComponent={<View style={s.empty}><View style={s.emptyOrb}><Ionicons name="sparkles" size={26} color={colors.bg} /></View><Text style={s.emptyTitle}>A capable second brain</Text><Text style={s.emptyText}>Ask Nova to reason, plan, summarize, remember, or calculate. Use the tool drawer to make the right capability explicit.</Text></View>}
        />

        {activeTool && (
          <View style={s.activeToolBar}>
            <Ionicons name={toolIcons[tools.find((tool) => tool.id === activeTool)?.icon ?? 'sparkles'] ?? 'sparkles-outline'} size={16} color={colors.primary} />
            <Text style={s.activeToolText}>Using <Text style={s.activeToolName}>{tools.find((tool) => tool.id === activeTool)?.name ?? activeTool}</Text></Text>
            {activeTool === 'code-execute' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.languageRow}>{codeLanguages.map((language) => <Pressable key={language} onPress={() => setCodeLanguage(language)} style={[s.languagePill, codeLanguage === language && s.languagePillActive]}><Text style={[s.languageText, codeLanguage === language && s.languageTextActive]}>{language}</Text></Pressable>)}</ScrollView>}
            <Pressable onPress={() => setActiveTool(null)} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable>
          </View>
        )}

        <View style={s.composer}>
          <Pressable accessibilityLabel="Choose a Nova tool" onPress={() => setToolSheetOpen(true)} style={s.toolTrigger}>
            <Ionicons name="add" size={20} color={colors.primary} />
          </Pressable>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={() => submit()} returnKeyType="send" placeholder="Ask Nova anything" placeholderTextColor={colors.muted} style={s.input} multiline />
          <Pressable accessibilityLabel="Send message" onPress={() => submit()} style={[s.send, (!text.trim() || streamingReply) && s.sendDisabled]}>
            {streamingReply ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="arrow-up" size={20} color={colors.bg} />}
          </Pressable>
        </View>

        {toolSheetOpen && (
          <View style={s.sheetBackdrop}>
            <Pressable style={s.sheetDismiss} onPress={() => setToolSheetOpen(false)} />
            <View style={s.sheet}>
              <View style={s.sheetHandle} />
              <View style={s.sheetHeader}><View><Text style={s.sheetEyebrow}>NOVA / CAPABILITIES</Text><Text style={s.sheetTitle}>Choose a tool</Text></View><Pressable onPress={() => setToolSheetOpen(false)}><Ionicons name="close" size={22} color={colors.muted} /></Pressable></View>
              <View style={s.searchBox}><Ionicons name="search-outline" size={18} color={colors.muted} /><TextInput value={toolQuery} onChangeText={setToolQuery} placeholder="Search tools" placeholderTextColor={colors.muted} style={s.searchInput} /></View>
              <ScrollView style={s.toolList} keyboardShouldPersistTaps="handled">
                {visibleTools.map((tool) => (
                  <Pressable key={tool.id} onPress={() => { setActiveTool(tool.id); setToolSheetOpen(false); setToolQuery(''); }} style={({ pressed }) => [s.toolRow, pressed && s.pressed]}>
                    <View style={s.toolIcon}><Ionicons name={toolIcons[tool.icon] ?? 'sparkles-outline'} size={20} color={colors.primary} /></View>
                    <View style={s.toolCopy}><Text style={s.toolName}>{tool.name}</Text><Text style={s.toolDescription}>{tool.description}</Text><Text style={s.toolCategory}>{tool.category.toUpperCase()}</Text></View>
                    {activeTool === tool.id ? <Ionicons name="checkmark-circle" size={21} color={colors.success} /> : <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
                  </Pressable>
                ))}
                {!visibleTools.length && <Text style={s.noResults}>No matching tools.</Text>}
              </ScrollView>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 }, iconButton: { backgroundColor: colors.surface2, borderRadius: radii.sm, padding: 10 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, color: colors.primary, fontWeight: '700' }, title: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 4 },
  context: { marginHorizontal: 20, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  live: { width: 8, height: 8, borderRadius: 4 }, contextText: { color: colors.text, fontSize: 12, fontWeight: '700' }, contextMeta: { color: colors.muted, fontSize: 12, marginLeft: 'auto' }, spinner: { marginLeft: 'auto' },
  starterWrap: { paddingTop: 18 }, starterEyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: '800', paddingHorizontal: 20 }, starterTitle: { color: colors.text, fontSize: 18, fontWeight: '800', paddingHorizontal: 20, marginTop: 5 }, starterRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 }, starterCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, padding: 12, minWidth: 126, gap: 10 }, starterLabel: { color: colors.text, fontSize: 12, fontWeight: '700' }, pressed: { opacity: 0.72 },
  messages: { padding: 20, gap: 12, flexGrow: 1 }, message: { borderRadius: radii.md, padding: 15, maxWidth: '88%' }, assistantMessage: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderTopLeftRadius: 4 }, userMessage: { backgroundColor: colors.surface2, alignSelf: 'flex-end', borderTopRightRadius: 4 }, errorMessage: { borderWidth: 1, borderColor: '#ff6b6b' }, messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14 }, role: { fontSize: 10, letterSpacing: 1.2, color: colors.primary, fontWeight: '800', marginBottom: 7 }, messageText: { color: colors.text, fontSize: 15, lineHeight: 22 }, errorText: { color: '#ff9b9b' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 35 }, emptyOrb: { width: 54, height: 54, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 20, textAlign: 'center' }, emptyText: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 21, marginTop: 8 },
  activeToolBar: { marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface2, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', gap: 8 }, activeToolText: { color: colors.muted, fontSize: 12, flex: 1 }, activeToolName: { color: colors.text, fontWeight: '800' }, languageRow: { gap: 4 }, languagePill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface }, languagePillActive: { backgroundColor: colors.primary }, languageText: { color: colors.muted, fontSize: 9, fontWeight: '800' }, languageTextActive: { color: colors.bg },
  composer: { margin: 12, padding: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }, toolTrigger: { backgroundColor: colors.surface2, borderRadius: 18, padding: 8, marginBottom: 2 }, input: { flex: 1, color: colors.text, fontSize: 15, maxHeight: 100, paddingHorizontal: 8, paddingVertical: 8 }, send: { backgroundColor: colors.primary, borderRadius: 20, padding: 10, minWidth: 40, alignItems: 'center' }, sendDisabled: { opacity: 0.38 },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.56)', justifyContent: 'flex-end' }, sheetDismiss: { flex: 1 }, sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '78%', padding: 20, paddingTop: 10 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sheetEyebrow: { color: colors.primary, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }, sheetTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 4 }, searchBox: { marginTop: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, color: colors.text, paddingVertical: 11, fontSize: 14 }, toolList: { marginTop: 12 }, toolRow: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomColor: colors.border, borderBottomWidth: 1 }, toolIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, toolCopy: { flex: 1 }, toolName: { color: colors.text, fontSize: 14, fontWeight: '800' }, toolDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, toolCategory: { color: colors.primary, fontSize: 9, letterSpacing: 1.1, fontWeight: '800', marginTop: 5 }, noResults: { color: colors.muted, textAlign: 'center', padding: 24 },
});
