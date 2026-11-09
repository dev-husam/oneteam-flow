import { isMfaChallenge, type User } from '@pt/api-client';
import { create } from 'zustand';
import { api, setAuthLostHandler } from '@/lib/api';
import { unregisterPush } from '@/lib/push';
import { usePrefs } from './prefs';

type Status = 'loading' | 'authenticated' | 'anonymous';
export type LoginOutcome = { status: 'authenticated' } | { status: 'mfa'; mfaToken: string };

interface AuthState {
  status: Status;
  user: User | null;
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

let restoring: Promise<void> | null = null;

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  /** Called once at start: the keychain refresh token is exchanged for a session (and rotated). */
  restore() {
    restoring ??= api.restoreSession().then(
      (user) => set(user ? { status: 'authenticated', user } : { status: 'anonymous', user: null }),
      () => set({ status: 'anonymous', user: null }),
    );
    return restoring;
  },
  async login(email, password) {
    const result = await api.auth.login(email, password);
    if (isMfaChallenge(result)) return { status: 'mfa', mfaToken: result.mfaToken };
    set({ status: 'authenticated', user: result.user });
    return { status: 'authenticated' };
  },
  async completeMfa(mfaToken, code) {
    const session = await api.auth.loginMfa(mfaToken, code);
    set({ status: 'authenticated', user: session.user });
  },
  async logout() {
    try {
      await unregisterPush(); // stop pushes to this device before the session ends
      await api.auth.logout();
    } finally {
      // Nothing of the previous user may stay in memory.
      usePrefs.getState().setActiveOrg(null);
      set({ status: 'anonymous', user: null });
    }
  },
  setUser: (user) => set({ user }),
}));

// A refresh failure (revoked session, suspended account) ends the session everywhere in the app.
setAuthLostHandler(() => useAuth.setState({ status: 'anonymous', user: null }));
