import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export type CapabilityStatus = { camera: PermissionState; microphone: PermissionState; notifications: PermissionState; mediaLibrary: PermissionState };

const isWeb = Platform.OS === 'web';

function normalize(status?: string | null): PermissionState {
  if (!status) return 'unavailable';
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  if (status === 'undetermined') return 'undetermined';
  return 'unavailable';
}

export async function getCapabilityStatus(): Promise<CapabilityStatus> {
  if (isWeb) return { camera: 'unavailable', microphone: 'unavailable', notifications: 'unavailable', mediaLibrary: 'unavailable' };
  const [camera, microphone, notifications, mediaLibrary] = await Promise.all([
    ImagePicker.getCameraPermissionsAsync().catch(() => ({ status: 'unavailable' })),
    getRecordingPermissionsAsync().catch(() => ({ status: 'unavailable' })),
    Notifications.getPermissionsAsync().catch(() => ({ status: 'unavailable' })),
    MediaLibrary.getPermissionsAsync().catch(() => ({ status: 'unavailable' })),
  ]);
  return { camera: normalize(camera.status), microphone: normalize(microphone.status), notifications: normalize(notifications.status), mediaLibrary: normalize(mediaLibrary.status) };
}

export async function requestCapability(name: keyof CapabilityStatus): Promise<PermissionState> {
  if (isWeb) return 'unavailable';
  if (name === 'camera') return normalize((await ImagePicker.requestCameraPermissionsAsync()).status);
  if (name === 'microphone') return normalize((await requestRecordingPermissionsAsync()).status);
  if (name === 'notifications') return normalize((await Notifications.requestPermissionsAsync()).status);
  return normalize((await MediaLibrary.requestPermissionsAsync()).status);
}

export async function pickFiles(multiple = true) {
  if (isWeb) return { canceled: true, assets: [] };
  return DocumentPicker.getDocumentAsync({ type: '*/*', multiple, copyToCacheDirectory: true });
}

export async function capturePhoto() {
  if (isWeb) return { canceled: true, assets: [] };
  const permission = await requestCapability('camera');
  if (permission !== 'granted') return { canceled: true, assets: [], permission };
  return ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
}

export async function pickMedia() {
  if (isWeb) return { canceled: true, assets: [] };
  const permission = await requestCapability('mediaLibrary');
  if (permission !== 'granted') return { canceled: true, assets: [], permission };
  return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 0.9 });
}

export async function shareFile(uri: string, mimeType = 'application/octet-stream') {
  if (isWeb || !(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Export from Nova' });
  return true;
}

export async function scheduleLocalNotification(title: string, body: string, data: Record<string, string> = {}) {
  if (isWeb) return false;
  const permission = await requestCapability('notifications');
  if (permission !== 'granted') return false;
  await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
  return true;
}

export async function ensureWorkspaceDirectory() {
  const root = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? ''}nova-workspace/`;
  if (!root) throw new Error('Nova storage is unavailable on this platform.');
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists) await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  return root;
}

export async function readFileText(uri: string) { return FileSystem.readAsStringAsync(uri); }
export async function writeFileText(uri: string, contents: string) { await FileSystem.writeAsStringAsync(uri, contents); }
export async function deleteFile(uri: string) { await FileSystem.deleteAsync(uri, { idempotent: true }); }
export async function getFileInfo(uri: string) { return FileSystem.getInfoAsync(uri); }
export { FileSystem };
