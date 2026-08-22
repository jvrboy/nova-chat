import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useBackend } from '../src/backend/BackendProvider';
import { backendAccessRequest } from '../src/backend/novaApi';
import { colors, radii } from '../src/ui/theme';

type Role = { id: string; name: string; description: string };

export default function AccessControlScreen() {
  const { config } = useBackend();
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleName, setRoleName] = useState('researcher');
  const [roleDescription, setRoleDescription] = useState('Can research and analyze, but cannot run sensitive tools.');
  const [actorId, setActorId] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [toolId, setToolId] = useState('web-search-pro');
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');
  const [loading, setLoading] = useState(false);
  const [pluginName, setPluginName] = useState('');
  const [pluginEndpoint, setPluginEndpoint] = useState('');
  const [pluginDescription, setPluginDescription] = useState('');

  const loadRoles = async () => {
    if (!config.baseUrl) return;
    try { const result = await backendAccessRequest<{ roles: Role[] }>(config, '/roles'); setRoles(result.roles); if (!selectedRole && result.roles[0]) setSelectedRole(result.roles[0]); } catch (error) { Alert.alert('Could not load roles', error instanceof Error ? error.message : 'Backend unavailable.'); }
  };
  useEffect(() => { void loadRoles(); }, [config.baseUrl]);

  const createRole = async () => {
    setLoading(true);
    try { await backendAccessRequest(config, '/roles', { method: 'POST', body: JSON.stringify({ name: roleName, description: roleDescription }) }); setRoleName(''); await loadRoles(); Alert.alert('Role created', 'The new role is ready for member assignment.'); } catch (error) { Alert.alert('Could not create role', error instanceof Error ? error.message : 'Request failed.'); } finally { setLoading(false); }
  };
  const assignMember = async () => {
    if (!selectedRole || !actorId.trim()) return Alert.alert('Missing member', 'Enter an actor ID and select a role.');
    setLoading(true);
    try { await backendAccessRequest(config, `/roles/${selectedRole.id}/members`, { method: 'POST', body: JSON.stringify({ actorId: actorId.trim() }) }); Alert.alert('Member assigned', `${actorId.trim()} is now ${selectedRole.name}.`); setActorId(''); } catch (error) { Alert.alert('Could not assign member', error instanceof Error ? error.message : 'Request failed.'); } finally { setLoading(false); }
  };
  const createPlugin = async () => {
    if (!pluginName.trim() || !pluginEndpoint.trim()) return Alert.alert('Missing plugin details', 'Enter a name and HTTPS endpoint.');
    setLoading(true);
    try { await backendAccessRequest(config, '/plugins', { method: 'POST', body: JSON.stringify({ name: pluginName.trim(), endpoint: pluginEndpoint.trim(), description: pluginDescription.trim(), method: 'POST', risk: 'review' }) }); Alert.alert('Plugin registered', 'The HTTPS plugin is ready for role permissions.'); setPluginName(''); setPluginEndpoint(''); setPluginDescription(''); } catch (error) { Alert.alert('Could not register plugin', error instanceof Error ? error.message : 'Request failed.'); } finally { setLoading(false); }
  };
  const setPermission = async () => {
    if (!selectedRole || !toolId.trim()) return Alert.alert('Missing permission', 'Select a role and enter a tool ID.');
    setLoading(true);
    try { await backendAccessRequest(config, `/roles/${selectedRole.id}/tools/${encodeURIComponent(toolId.trim())}`, { method: 'PUT', body: JSON.stringify({ effect }) }); Alert.alert('Permission updated', `${effect} access set for ${toolId.trim()}.`); } catch (error) { Alert.alert('Could not update permission', error instanceof Error ? error.message : 'Request failed.'); } finally { setLoading(false); }
  };

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <View style={s.header}><View><Text style={s.eyebrow}>NOVA / GOVERNANCE</Text><Text style={s.title}>Access control</Text></View><Pressable style={s.close} onPress={() => router.back()}><Ionicons name="close" size={20} color={colors.text} /></Pressable></View>
    <Text style={s.subtitle}>Manage workspace roles, member assignments, and least-privilege tool access. Changes require an admin-scoped backend identity.</Text>
    {!config.baseUrl && <View style={s.warning}><Ionicons name="cloud-offline-outline" size={19} color={colors.primary} /><Text style={s.warningText}>Connect a backend in Settings → Backend to manage roles.</Text></View>}
    <Text style={s.section}>Roles</Text><View style={s.card}><TextInput value={roleName} onChangeText={setRoleName} placeholder="Role name" placeholderTextColor={colors.muted} autoCapitalize="none" style={s.input} /><TextInput value={roleDescription} onChangeText={setRoleDescription} placeholder="Description" placeholderTextColor={colors.muted} style={s.input} /><Pressable disabled={loading || !config.baseUrl} onPress={() => void createRole()} style={s.primaryButton}><Ionicons name="add-circle-outline" size={18} color={colors.bg} /><Text style={s.primaryText}>Create role</Text></Pressable></View>
    <View style={s.roleList}>{roles.map((role) => <Pressable key={role.id} onPress={() => setSelectedRole(role)} style={[s.role, selectedRole?.id === role.id && s.roleSelected]}><View style={s.roleIcon}><Ionicons name="people-outline" size={18} color={selectedRole?.id === role.id ? colors.bg : colors.primary} /></View><View style={s.copy}><Text style={s.roleName}>{role.name}</Text><Text style={s.meta}>{role.description || 'No description'}</Text></View>{selectedRole?.id === role.id && <Ionicons name="checkmark-circle" size={19} color={colors.success} />}</Pressable>)}</View>
    <Text style={s.section}>Assign a member</Text><View style={s.card}><TextInput value={actorId} onChangeText={setActorId} placeholder="Actor ID (for example key:abc123)" placeholderTextColor={colors.muted} autoCapitalize="none" style={s.input} /><Text style={s.selected}>Selected role: <Text style={s.selectedValue}>{selectedRole?.name ?? 'none'}</Text></Text><Pressable disabled={loading || !config.baseUrl} onPress={() => void assignMember()} style={s.secondaryButton}><Text style={s.secondaryText}>Assign member</Text></Pressable></View>
    <Text style={s.section}>Custom plugin</Text><View style={s.card}><TextInput value={pluginName} onChangeText={setPluginName} placeholder="Plugin name" placeholderTextColor={colors.muted} style={s.input} /><TextInput value={pluginEndpoint} onChangeText={setPluginEndpoint} placeholder="https://api.example.com/nova" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} style={s.input} /><TextInput value={pluginDescription} onChangeText={setPluginDescription} placeholder="What this integration does" placeholderTextColor={colors.muted} style={s.input} /><Text style={s.meta}>Credentials are referenced by a backend environment secret; Nova never stores API keys in the mobile app.</Text><Pressable disabled={loading || !config.baseUrl} onPress={() => void createPlugin()} style={s.secondaryButton}><Text style={s.secondaryText}>Register HTTPS plugin</Text></Pressable></View>
    <Text style={s.section}>Tool permission</Text><View style={s.card}><TextInput value={toolId} onChangeText={setToolId} placeholder="Tool ID, e.g. web-search-pro" placeholderTextColor={colors.muted} autoCapitalize="none" style={s.input} /><View style={s.effectRow}>{(['allow', 'deny'] as const).map((value) => <Pressable key={value} onPress={() => setEffect(value)} style={[s.effect, effect === value && s.effectActive]}><Text style={[s.effectText, effect === value && s.effectTextActive]}>{value.toUpperCase()}</Text></Pressable>)}</View><Pressable disabled={loading || !config.baseUrl} onPress={() => void setPermission()} style={s.secondaryButton}><Text style={s.secondaryText}>Save permission</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.bg }, content: { padding: 20, gap: 12 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, close: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, eyebrow: { fontSize: 10, letterSpacing: 1.5, color: colors.primary, fontWeight: '700' }, title: { color: colors.text, fontSize: 30, fontWeight: '800', marginTop: 4 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 4 }, section: { color: colors.muted, fontSize: 11, letterSpacing: 1.4, fontWeight: '800', marginTop: 8 }, card: { padding: 14, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 }, input: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, color: colors.text, padding: 11 }, primaryButton: { backgroundColor: colors.primary, borderRadius: 11, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, primaryText: { color: colors.bg, fontWeight: '900' }, secondaryButton: { backgroundColor: colors.surface2, borderRadius: 11, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }, secondaryText: { color: colors.text, fontWeight: '800' }, roleList: { gap: 8 }, role: { padding: 12, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }, roleSelected: { borderColor: colors.primary }, roleIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1 }, roleName: { color: colors.text, fontWeight: '800' }, meta: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }, selected: { color: colors.muted, fontSize: 12 }, selectedValue: { color: colors.text, fontWeight: '800' }, effectRow: { flexDirection: 'row', gap: 8 }, effect: { flex: 1, padding: 11, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center' }, effectActive: { backgroundColor: colors.primary }, effectText: { color: colors.muted, fontSize: 11, fontWeight: '900' }, effectTextActive: { color: colors.bg }, warning: { padding: 12, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 }, warningText: { color: colors.muted, flex: 1, lineHeight: 18 } });
