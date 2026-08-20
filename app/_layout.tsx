import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { NovaProvider } from '../src/state/NovaProvider';

export default function RootLayout() {
  return <NovaProvider><StatusBar barStyle="light-content" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#07111f' } }} /></NovaProvider>;
}
