import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Locale } from '@pt/i18n';
import { api } from './api';

const TOKEN_KEY = 'pt.push-token';

/**
 * Asks for notification permission and registers this device's Expo push token with the API.
 * Silent no-op when permission is denied, on simulators, or while no EAS project id is configured.
 * Returns the token when registered.
 */
export async function registerPush(locale: Locale): Promise<string | null> {
  try {
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId) return null;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.me.registerDevice({ expoPushToken: token, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', locale });
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return token;
  } catch {
    return null; // push is an enhancement: never block the app on it
  }
}

export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await api.me.unregisterDevice(token);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* best effort: the server also revokes devices on sign-out everywhere */
  }
}
