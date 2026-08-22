import { Stack, router } from 'expo-router';
import { StatusBar } from 'react-native';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { NovaProvider } from '../src/state/NovaProvider';
import { BackendProvider } from '../src/backend/BackendProvider';
import { DomainProvider } from '../src/backend/DomainProvider';

// Only these routes may be triggered from push-notification payloads —
// anything else is ignored so a malicious notification can't navigate the
// app to an arbitrary (or non-existent) screen.
const allowedNotificationRoutes = new Set([
  '/(tabs)/chat', '/(tabs)/projects', '/(tabs)/tools', '/(tabs)/operations', '/(tabs)/settings',
  '/access-control', '/analytics', '/audio', '/audit', '/automation', '/backend', '/backend-dashboard',
  '/capture', '/connectors', '/diagnostics', '/files', '/icon-gallery', '/jobs', '/notifications',
  '/observability', '/permissions', '/projects-hub', '/regions', '/resilience', '/search', '/storage',
  '/toolbox', '/tools-center', '/usage-dashboard', '/workflows',
]);

export default function RootLayout() {
  useEffect(() => { const subscription = Notifications.addNotificationResponseReceivedListener((response) => { const route = response.notification.request.content.data?.route; if (typeof route === 'string' && allowedNotificationRoutes.has(route)) router.push(route as never); }); return () => subscription.remove(); }, []);
  return <BackendProvider><DomainProvider><NovaProvider><StatusBar barStyle="light-content" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#07111f' } }} /></NovaProvider></DomainProvider></BackendProvider>;
}
