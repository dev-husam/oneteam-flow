import { createApiClient, type RefreshTokenStore } from '@pt/api-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_KEY = 'pt.refresh-token';

/** The refresh token lives only in the platform keychain (iOS Keychain / Android Keystore), never in JS storage. */
export const refreshTokenStore: RefreshTokenStore = {
  get: () => SecureStore.getItemAsync(REFRESH_KEY),
  set: async (token) => {
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

// The Android emulator reaches the host machine at 10.0.2.2; a physical device needs EXPO_PUBLIC_API_URL.
const defaultUrl = Platform.OS === 'android' ? 'http://10.0.2.2:3001/api/v1' : 'http://localhost:3001/api/v1';

/** Also where the realtime connection goes (its origin). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? defaultUrl;

let onAuthLost: (() => void) | undefined;
export const setAuthLostHandler = (fn: (() => void) | undefined) => {
  onAuthLost = fn;
};

export const api = createApiClient({
  baseUrl: API_URL,
  clientType: Platform.OS === 'ios' ? 'ios' : 'android',
  deviceName: `${Platform.OS} ${String(Platform.Version)}`,
  refreshTokenStore,
  onAuthLost: () => onAuthLost?.(),
});
