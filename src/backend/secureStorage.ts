import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
const PREFIX = 'nova.secure.';
export async function getSecret(key: string) { if (typeof window !== 'undefined' && typeof document !== 'undefined') return AsyncStorage.getItem(`${PREFIX}${key}`); try { return await SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); } catch { return AsyncStorage.getItem(`${PREFIX}${key}`); } }
export async function setSecret(key: string, value: string) { if (typeof window !== 'undefined' && typeof document !== 'undefined') { await AsyncStorage.setItem(`${PREFIX}${key}`, value); return; } try { await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); } catch { await AsyncStorage.setItem(`${PREFIX}${key}`, value); } }
export async function deleteSecret(key: string) { if (typeof window !== 'undefined' && typeof document !== 'undefined') { await AsyncStorage.removeItem(`${PREFIX}${key}`); return; } try { await SecureStore.deleteItemAsync(key); } catch { await AsyncStorage.removeItem(`${PREFIX}${key}`); } }
