import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

jest.mock('./api', () => ({ api: { me: { registerDevice: jest.fn(async () => undefined), unregisterDevice: jest.fn(async () => undefined) } } }));
const mockApi = jest.requireMock('./api').api;
import { registerPush, unregisterPush } from './push';

beforeEach(() => jest.clearAllMocks());

describe('push registration', () => {
  it('registers the Expo token with the API and remembers it for sign-out', async () => {
    await expect(registerPush('ar')).resolves.toBe('ExponentPushToken[testtesttesttest]');
    expect(mockApi.me.registerDevice).toHaveBeenCalledWith(expect.objectContaining({ expoPushToken: 'ExponentPushToken[testtesttesttest]', locale: 'ar' }));
    await unregisterPush();
    expect(mockApi.me.unregisterDevice).toHaveBeenCalledWith('ExponentPushToken[testtesttesttest]');
    expect(await SecureStore.getItemAsync('pt.push-token')).toBeNull();
  });

  it('does nothing when the user denies permission', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    await expect(registerPush('en')).resolves.toBeNull();
    expect(mockApi.me.registerDevice).not.toHaveBeenCalled();
  });

  it('never throws: a failing API must not break the app', async () => {
    mockApi.me.registerDevice.mockRejectedValueOnce(new Error('network'));
    await expect(registerPush('en')).resolves.toBeNull();
  });

  it('unregister without a stored token is a no-op', async () => {
    await SecureStore.deleteItemAsync('pt.push-token');
    await unregisterPush();
    expect(mockApi.me.unregisterDevice).not.toHaveBeenCalled();
  });
});
