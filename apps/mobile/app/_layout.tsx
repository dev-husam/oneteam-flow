import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@pt/api-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useBrand } from '@/stores/brand';
import { usePrefs } from '@/stores/prefs';
import { useColors } from '@/ui/theme';

/**
 * Root: providers, one-time startup (preferences, session restore from the keychain) and the route guards.
 * Guards only decide which screens exist; the API enforces access on every call.
 */
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: (n, e) => n < 2 && (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) },
        },
      }),
  );
  const hydrated = usePrefs((s) => s.hydrated);
  const activeOrgId = usePrefs((s) => s.activeOrgId);
  const status = useAuth((s) => s.status);
  const c = useColors();

  useEffect(() => {
    void usePrefs.getState().hydrate();
    void useAuth.getState().restore();
    // The administrator's name, logo and colours: cached copy first, then the current one (again whenever the app returns).
    const loadBrand = () => void useBrand.getState().load(() => api.config.public());
    loadBrand();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && loadBrand());
    return () => sub.remove();
  }, []);

  // A different user must never see the previous user's cached data (or design choice).
  useEffect(() => {
    if (status === 'anonymous') {
      queryClient.clear();
      useBrand.getState().setPersonalDesign(null);
    }
    if (status === 'authenticated') {
      api.me.design.current().then((mine) => useBrand.getState().setPersonalDesign(mine.enabled ? mine.design : null)).catch(() => undefined);
    }
  }, [status, queryClient]);

  if (!hydrated || status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  const signedIn = status === 'authenticated';
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="select-organization" />
          </Stack.Protected>
          <Stack.Protected guard={signedIn && Boolean(activeOrgId)}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
