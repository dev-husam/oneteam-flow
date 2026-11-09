import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '@pt/api-client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('expo-router', () => {
  const replace = jest.fn();
  return { __replace: replace, useRouter: () => ({ replace }), Link: ({ children }: { children: React.ReactNode }) => children };
});
jest.mock('@/lib/api', () => ({ api: { auth: { login: jest.fn(), loginMfa: jest.fn() } }, setAuthLostHandler: jest.fn() }));
jest.mock('@/lib/push', () => ({ unregisterPush: jest.fn() }));
const mockReplace = jest.requireMock('expo-router').__replace;
const mockApi = jest.requireMock('@/lib/api').api;

import Login from '../app/(auth)/login';

const renderLogin = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <Login />
    </SafeAreaProvider>,
  );
const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);
const session = { accessToken: 't', user: { id: 'u' } };
beforeEach(() => jest.clearAllMocks());

describe('Login screen', () => {
  it('signs in and goes to the app', async () => {
    mockApi.auth.login.mockResolvedValue(session);
    renderLogin();
    type('Email address', 'A@B.co ');
    type('Password', 'pw');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockApi.auth.login).toHaveBeenCalledWith('a@b.co', 'pw'); // trimmed and lowercased
  });

  it('shows a localized message for wrong credentials and stays on the form', async () => {
    mockApi.auth.login.mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 401));
    renderLogin();
    type('Email address', 'a@b.co');
    type('Password', 'bad');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('The email or password is incorrect.')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('asks for the second factor, then completes sign-in', async () => {
    mockApi.auth.login.mockResolvedValue({ mfaRequired: true, mfaToken: 'pending' });
    mockApi.auth.loginMfa.mockResolvedValue(session);
    renderLogin();
    type('Email address', 'a@b.co');
    type('Password', 'pw');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Two-factor verification')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled?.();
    type('Verification code', '123456');
    fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockApi.auth.loginMfa).toHaveBeenCalledWith('pending', '123456');
  });

  it('returns to the password step when the second-factor window has ended', async () => {
    mockApi.auth.login.mockResolvedValue({ mfaRequired: true, mfaToken: 'pending' });
    mockApi.auth.loginMfa.mockRejectedValue(new ApiError('MFA_TOKEN_INVALID', 401));
    renderLogin();
    type('Email address', 'a@b.co');
    type('Password', 'pw');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Two-factor verification');
    type('Verification code', '123456');
    fireEvent.press(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Welcome back')).toBeTruthy();
  });
});
