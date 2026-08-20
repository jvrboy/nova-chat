import { Stack, router } from 'expo-router';
import { StatusBar } from 'react-native';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { NovaProvider } from '../src/state/NovaProvider';
import { BackendProvider } from '../src/backend/BackendProvider';
import { DomainProvider } from '../src/backend/DomainProvider';

export default function RootLayout() {
  useEffect(() => { const subscription = Notifications.addNotificationResponseReceivedListener((response) => { const route = response.notification.request.content.data?.route; if (typeof route === 'string' && route.startsWith('/')) router.push(route as never); }); return () => subscription.remove(); }, []);
  return <BackendProvider><DomainProvider><NovaProvider><StatusBar barStyle="light-content" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#07111f' } }} /></NovaProvider></DomainProvider></BackendProvider>;
}
