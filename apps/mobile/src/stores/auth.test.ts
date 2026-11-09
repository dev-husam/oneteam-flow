import { act } from '@testing-library/react-native';

jest.mock('@/lib/api', () => ({
  api: { restoreSession: jest.fn(), auth: { login: jest.fn(), loginMfa: jest.fn(), logout: jest.fn() } },
  setAuthLostHandler: jest.fn(),
}));
jest.mock('@/lib/push', () => ({ unregisterPush: jest.fn(async () => undefined) }));
const mockApi = jest.requireMock('@/lib/api').api;
const mockUnregisterPush = jest.requireMock('@/lib/push').unregisterPush;

import { useAuth } from './auth';
import { usePrefs } from './prefs';

const user = { id: 'u1', email: 'a@b.co', fullName: 'A B' };
const session = { accessToken: 'tok', user };

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.setState({ status: 'anonymous', user: null });
});

describe('auth store', () => {
  it('signs in without MFA', async () => {
    mockApi.auth.login.mockResolvedValue(session);
    await expect(useAuth.getState().login('a@b.co', 'pw')).resolves.toEqual({ status: 'authenticated' });
    expect(useAuth.getState()).toMatchObject({ status: 'authenticated', user });
  });

  it('returns an MFA outcome without becoming authenticated, then completes with the code', async () => {
    mockApi.auth.login.mockResolvedValue({ mfaRequired: true, mfaToken: 'pending' });
    await expect(useAuth.getState().login('a@b.co', 'pw')).resolves.toEqual({ status: 'mfa', mfaToken: 'pending' });
    expect(useAuth.getState().status).toBe('anonymous');

    mockApi.auth.loginMfa.mockResolvedValue(session);
    await useAuth.getState().completeMfa('pending', '123456');
    expect(mockApi.auth.loginMfa).toHaveBeenCalledWith('pending', '123456');
    expect(useAuth.getState().status).toBe('authenticated');
  });

  it('keeps the previous state when sign-in fails', async () => {
    mockApi.auth.login.mockRejectedValue(new Error('INVALID_CREDENTIALS'));
    await expect(useAuth.getState().login('a@b.co', 'bad')).rejects.toThrow();
    expect(useAuth.getState().status).toBe('anonymous');
  });

  it('restores the session from the keychain token, or ends anonymous', async () => {
    mockApi.restoreSession.mockResolvedValueOnce(null);
    await useAuth.getState().restore();
    expect(useAuth.getState().status).toBe('anonymous');
  });

  it('sign-out stops pushes, clears the organization and memory even when the API call fails', async () => {
    useAuth.setState({ status: 'authenticated', user: user as never });
    usePrefs.setState({ activeOrgId: 'org-1' });
    mockApi.auth.logout.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await useAuth.getState().logout().catch(() => undefined);
    });
    expect(mockUnregisterPush).toHaveBeenCalled();
    expect(useAuth.getState()).toMatchObject({ status: 'anonymous', user: null });
    expect(usePrefs.getState().activeOrgId).toBeNull();
  });
});
