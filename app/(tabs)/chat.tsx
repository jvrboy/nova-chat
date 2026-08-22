import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { findLocalTool, useNova } from '../../src/state/NovaProvider';
import type { Message } from '../../src/state/NovaProvider';
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
  analytics: 'analytics-outline',
  language: 'language-outline',
  pricetag: 'pricetag-outline',
  map: 'map-outline',
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
  { icon: 'scan-outline' as IconName, label: 'Audit a website', prompt: 'https://example.com', tool: 'web-scrape' },
];
const codeLanguages = ['python', 'javascript', 'typescript', 'r', 'bash'] as const;

// Tools that can ONLY run against the backend (network/LLM-backed).
// Everything else that has a local ToolDefinition executes fully on-device,
// even offline.
const backendOnlyTools = new Set(['web-search-pro', 'web-scrape', 'web-site-map', 'provider-status', 'summarize', 'code-generate', 'web-search-summary', 'translate', 'classify', 'code-execute']);

type SlashCommand = { match: RegExp; toolId?: string; prefix?: string; helpText?: string };
const slashCommands: SlashCommand[] = [
  { match: /^\/help\b/, helpText: 'Available commands\n/calc (2+3)*7   — calculator\n/wc <text>      — word & reading stats\n/uuid [count]   — UUID v4s\n/b64e | b64d    — base64 encode/decode\n/case camel|hi there — convert case\n/slug My Title! — url slug\n/pass 20 yes    — strong password\n/json {"a":1}   — validate/format JSON\n/color #55d6ff  — hex/rgb/hsl\n/ts 1750000000  — unix ⇄ ISO\n/base hex|ff    — number bases\n/regex \\d+|text — regex tester\n/url parse https://…\n/lorem 2 40     — placeholder text' },
  { match: /^\/calc\s+/i, toolId: 'calculator' },
  { match: /^\/wc\s+/is, toolId: 'word-count' },
  { match: /^\/uuid\b/i, toolId: 'uuid-generate' },
  { match: /^\/b64e\s+/is, toolId: 'base64-codec', prefix: 'encode|' },
  { match: /^\/b64d\s+/is, toolId: 'base64-codec', prefix: 'decode|' },
  { match: /^\/case\s+/i, toolId: 'case-convert' },
  { match: /^\/slug\s+/i, toolId: 'slugify' },
  { match: /^\/pass\b/i, toolId: 'password-generate' },
  { match: /^\/json\s+/is, toolId: 'json-format' },
  { match: /^\/color\s+/i, toolId: 'color-convert' },
  { match: /^\/ts\s+/i, toolId: 'timestamp-convert' },
  { match: /^\/base\s+/i, toolId: 'number-base' },
  { match: /^\/regex\s+/is, toolId: 'regex-test' },
  { match: /^\/url\s+/i, toolId: 'url-codec' },
  { match: /^\/lorem\b/i, toolId: 'lorem-ipsum' },
];

export default function ChatScreen() {
  const { activeChat, sendMessage, runProductionTool, runLocalToolInChat, decideBackendApproval, createChat, saveMemory, backendConnected, streamingReply, tools } = useNova();
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

    // Slash commands execute instantly on-device, even offline.
    if (trimmed.startsWith('/')) {
      const helpMatch = /^\/help\b/i.test(trimmed);
      const command = slashCommands.find((entry) => entry.match.test(trimmed));
      if (helpMatch) {
        Alert.alert('Nova slash commands', slashCommands.find((entry) => entry.helpText)?.helpText ?? '');
      } else if (command?.toolId) {
        const args = trimmed.replace(command.match, '').trim();
        const payload = command.prefix ? `${command.prefix}${args}` : args;
        void runLocalToolInChat(command.toolId, payload);
      } else {
        Alert.alert('Unknown command', 'Type /help to see every available slash command.');
      }
      setText('');
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      return;
    }

    if (activeTool && findLocalTool(activeTool)) {
      // Locally executable tool — runs on-device with no backend required.
      void runLocalToolInChat(activeTool, trimmed);
    } else if (activeTool === 'web-search-pro') {
      void runProductionTool(activeTool, { query: trimmed, limit: 5, scrapeContent: true });
    } else if (activeTool === 'web-scrape') {
      void runProductionTool(activeTool, { url: trimmed, onlyMainContent: true });
    } else if (activeTool === 'web-site-map') {
      void runProductionTool(activeTool, { url: trimmed, limit: 100 });
    } else if (activeTool === 'provider-status') {
      void runProductionTool(activeTool, {});
    } else if (activeTool === 'summarize') {
      void runProductionTool(activeTool, { text: trimmed, style: 'executive' });
    } else if (activeTool === 'code-generate') {
      void runProductionTool(activeTool, { description: trimmed, language: codeLanguage });
    } else if (activeTool === 'web-search-summary') {
      const urls = trimmed.split(/[\s,]+/).filter((value) => /^https:\/\//i.test(value)).slice(0, 5);
      void runProductionTool(activeTool, { urls, focus: 'the key facts and differences across these sources' });
    } else if (activeTool === 'translate') {
      void runProductionTool(activeTool, { text: trimmed, targetLanguage: 'English' });
    } else if (activeTool === 'classify') {
      void runProductionTool(activeTool, { text: trimmed, labels: ['urgent', 'actionable', 'informational', 'other'] });
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

  const exportConversation = async () => {
    const header = `Nova conversation — ${activeChat.title} — ${new Date().toLocaleString()}`;
    const body = activeChat.messages
      .map((message: Message) => `[${message.role === 'user' ? 'You' : 'Nova'}${message.tool ? ` · ${message.tool}` : ''}] ${message.text}`)
      .join('\n\n');
    try {
      await Share.share({ message: `${header}\n\n${body}` });
    } catch {
      Alert.alert('Could not export', 'Nova could not open the system share sheet.');
    }
  };

  const rememberMessage = (message: Message) => {
    const content = message.text.slice(0, 800).trim();
    if (!content) return;
    saveMemory(content, ['chat', message.tool ?? 'conversation']);
    Alert.alert('Saved to Memory Vault', 'Find it later via Global Search or the backend memory recall.');
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
            <Pressable accessibilityLabel="Export conversation" onPress={() => void exportConversation()} style={s.iconButton}>
              <Ionicons name="download-outline" size={20} color={colors.text} />
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
                  <View style={s.messageActions}>
                    <Pressable accessibilityLabel="Save to memory" onPress={() => rememberMessage(item)} hitSlop={8}>
                      <Ionicons name="bookmark-outline" size={16} color={colors.muted} />
                    </Pressable>
                    <Pressable accessibilityLabel="Share response" onPress={() => void copyOrShare(item.text)} hitSlop={8}>
                      <Ionicons name="share-outline" size={16} color={colors.muted} />
                    </Pressable>
                  </View>
                )}
              </View>
              {item.pending && !item.text ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[s.messageText, item.error && s.errorText]}>{item.text}{item.pending ? ' ▍' : ''}</Text>}
              {item.approvalId && !item.pending && <View style={s.approvalActions}><Text style={s.approvalHint}>This action is waiting for your decision. Nothing runs until you approve it.</Text><View style={s.approvalButtons}><Pressable style={s.approveButton} onPress={() => void decideBackendApproval(item.approvalId!, true)}><Text style={s.approveText}>Approve</Text></Pressable><Pressable style={s.rejectButton} onPress={() => void decideBackendApproval(item.approvalId!, false)}><Text style={s.rejectText}>Reject</Text></Pressable></View></View>}
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
  messages: { padding: 20, gap: 12, flexGrow: 1 }, message: { borderRadius: radii.md, padding: 15, maxWidth: '88%' }, assistantMessage: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderTopLeftRadius: 4 }, userMessage: { backgroundColor: colors.surface2, alignSelf: 'flex-end', borderTopRightRadius: 4 }, errorMessage: { borderWidth: 1, borderColor: colors.danger }, messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 14 }, messageActions: { flexDirection: 'row', gap: 12 }, role: { fontSize: 10, letterSpacing: 1.2, color: colors.primary, fontWeight: '800', marginBottom: 7 }, messageText: { color: colors.text, fontSize: 15, lineHeight: 22 }, errorText: { color: colors.dangerText },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 35 }, emptyOrb: { width: 54, height: 54, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 20, textAlign: 'center' }, emptyText: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 21, marginTop: 8 },
  approvalActions: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }, approvalHint: { color: colors.muted, fontSize: 11 }, approvalButtons: { flexDirection: 'row', gap: 8 }, approveButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }, approveText: { color: colors.bg, fontSize: 11, fontWeight: '900' }, rejectButton: { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border }, rejectText: { color: colors.text, fontSize: 11, fontWeight: '800' }, activeToolBar: { marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface2, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', gap: 8 }, activeToolText: { color: colors.muted, fontSize: 12, flex: 1 }, activeToolName: { color: colors.text, fontWeight: '800' }, languageRow: { gap: 4 }, languagePill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface }, languagePillActive: { backgroundColor: colors.primary }, languageText: { color: colors.muted, fontSize: 9, fontWeight: '800' }, languageTextActive: { color: colors.bg },
  composer: { margin: 12, padding: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.lg, flexDirection: 'row', alignItems: 'flex-end', gap: 6 }, toolTrigger: { backgroundColor: colors.surface2, borderRadius: 18, padding: 8, marginBottom: 2 }, input: { flex: 1, color: colors.text, fontSize: 15, maxHeight: 100, paddingHorizontal: 8, paddingVertical: 8 }, send: { backgroundColor: colors.primary, borderRadius: 20, padding: 10, minWidth: 40, alignItems: 'center' }, sendDisabled: { opacity: 0.38 },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.56)', justifyContent: 'flex-end' }, sheetDismiss: { flex: 1 }, sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '78%', padding: 20, paddingTop: 10 }, sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 }, sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sheetEyebrow: { color: colors.primary, fontSize: 10, letterSpacing: 1.4, fontWeight: '800' }, sheetTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 4 }, searchBox: { marginTop: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, color: colors.text, paddingVertical: 11, fontSize: 14 }, toolList: { marginTop: 12 }, toolRow: { paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomColor: colors.border, borderBottomWidth: 1 }, toolIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, toolCopy: { flex: 1 }, toolName: { color: colors.text, fontSize: 14, fontWeight: '800' }, toolDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, toolCategory: { color: colors.primary, fontSize: 9, letterSpacing: 1.1, fontWeight: '800', marginTop: 5 }, noResults: { color: colors.muted, textAlign: 'center', padding: 24 },
});
