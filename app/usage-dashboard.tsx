import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBackend } from '../src/backend/BackendProvider';
import { backendGetDashboard, UsageDashboard } from '../src/backend/novaApi';
import { colors, radii } from '../src/ui/theme';

// In-app view of the backend's /api/observability/dashboard aggregate — real
// usage data (requests, errors, latency, agent runs, jobs, approvals) instead
// of only being visible via curl/API calls.
export default function UsageDashboardScreen() {
  const { config, health } = useBackend();
  const backendConnected = config.mode === 'remote' && Boolean(config.baseUrl) && health.status === 'healthy';
  const [data, setData] = useState<UsageDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!backendConnected) { setError('Connect a backend in Settings → Backend to see live usage data.'); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await backendGetDashboard(config);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage dashboard.');
    } finally {
      setLoading(false);
    }
  }, [config, backendConnected]);

  useEffect(() => { void load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}>
        <View style={s.header}>
          <View>
            <Text style={s.eyebrow}>NOVA / OBSERVABILITY</Text>
            <Text style={s.title}>Usage Dashboard</Text>
          </View>
          <Pressable style={s.close} onPress={() => router.back()}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Text style={s.subtitle}>Live 24h backend metrics: requests, tool performance, agent runs, job status, and pending approvals.</Text>

        {loading && !data && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />}
        {error && <View style={s.errorCard}><Ionicons name="warning-outline" size={20} color={colors.dangerText} /><Text style={s.errorText}>{error}</Text></View>}

        {data && (
          <>
            <View style={s.grid}>
              <Metric label="Requests (24h)" value={data.requests.requests} />
              <Metric label="Server errors" value={data.requests.server_errors ?? 0} />
              <Metric label="Avg latency (ms)" value={Math.round(data.requests.avg_latency_ms ?? 0)} />
              <Metric label="Pending approvals" value={data.pendingApprovals} />
              <Metric label="Chats" value={data.chatCount} />
              <Metric label="Memories" value={data.memoryCount} />
            </View>

            <Text style={s.section}>Tool usage and performance</Text>
            <View style={s.panel}>
              {data.toolStats.length === 0 && <Text style={s.empty}>No tool executions recorded in the last 24h.</Text>}
              {data.toolStats.map((row) => {
                const successRate = row.executions ? Math.round((row.successes / row.executions) * 100) : 0;
                return <View key={row.tool_id} style={s.toolRow}><View style={s.copy}><Text style={s.rowLabel}>{row.tool_id}</Text><Text style={s.meta}>{successRate}% success · avg {Math.round(row.avg_duration_ms || 0)} ms · max {Math.round(row.p95_duration_ms || 0)} ms</Text></View><Text style={s.rowValue}>{row.executions}</Text></View>;
              })}
            </View>

            <Text style={s.section}>Recent tool history</Text>
            <View style={s.panel}>
              {data.recentToolExecutions.length === 0 && <Text style={s.empty}>No recent tool history.</Text>}
              {data.recentToolExecutions.slice(0, 12).map((row) => <View key={row.id} style={s.toolRow}><View style={s.copy}><Text style={s.rowLabel}>{row.tool_id}</Text><Text style={s.meta}>{row.actor_id} · {new Date(row.created_at).toLocaleString()}</Text></View><Text style={[s.rowValue, row.status === 'error' && s.failure]}>{row.duration_ms} ms</Text></View>)}
            </View>

            <Text style={s.section}>Agent runs by agent</Text>
            <View style={s.panel}>
              {data.agentRuns.length === 0 && <Text style={s.empty}>No agent runs in the last 24h.</Text>}
              {data.agentRuns.map((row) => (
                <View key={row.agent_key} style={s.row}>
                  <Text style={s.rowLabel}>{row.agent_key}</Text>
                  <Text style={s.rowValue}>{row.count}</Text>
                </View>
              ))}
            </View>

            <Text style={s.section}>Job queue status</Text>
            <View style={s.panel}>
              {data.jobStats.length === 0 && <Text style={s.empty}>No jobs recorded.</Text>}
              {data.jobStats.map((row) => (
                <View key={row.status} style={s.row}>
                  <Text style={s.rowLabel}>{row.status}</Text>
                  <Text style={s.rowValue}>{row.count}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.metric}>
      <Text style={s.metricValue}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  close: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, color: colors.primary, fontWeight: '700' },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  errorCard: { padding: 14, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { color: colors.dangerText, flex: 1, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { width: '31%', minWidth: 90, padding: 12, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  metricValue: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  metricLabel: { color: colors.muted, fontSize: 11, marginTop: 4 },
  section: { color: colors.muted, textTransform: 'uppercase', fontSize: 11, letterSpacing: 1.4, fontWeight: '800', marginTop: 8 },
  panel: { backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' },
  toolRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1 },
  rowLabel: { color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
  rowValue: { color: colors.primary, fontWeight: '800' },
  failure: { color: colors.dangerText },
  meta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  empty: { color: colors.muted, padding: 14, fontSize: 13 },
});
