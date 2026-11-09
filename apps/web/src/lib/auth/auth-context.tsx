'use client';

import { useQueryClient } from '@tanstack/react-query';
import { isMfaChallenge, type User } from '@pt/api-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from '@/i18n/navigation';
import { api, setAuthLostHandler } from '@/lib/api';

type Status = 'loading' | 'authenticated' | 'anonymous';

export type LoginOutcome = { status: 'authenticated'; user: User } | { status: 'mfa'; mfaToken: string };

interface AuthContextValue {
  status: Status;
  user: User | null;
  /** Accounts with two-factor authentication get an `mfa` outcome and finish with `completeMfa`. */
  login: (email: string, password: string) => Promise<LoginOutcome>;
  completeMfa: (mfaToken: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  setUser: (user: User) => void;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Shared across React strict-mode double mounts so the refresh token is rotated only once at startup.
let restoring: Promise<User | null> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ status: Status; user: User | null }>({ status: 'loading', user: null });

  useEffect(() => {
    let active = true;
    restoring ??= api.restoreSession().finally(() => {
      restoring = null;
    });
    void restoring.then((user) => {
      if (active) setState(user ? { status: 'authenticated', user } : { status: 'anonymous', user: null });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setAuthLostHandler(() => {
      queryClient.clear();
      setState({ status: 'anonymous', user: null });
      router.replace('/login?reason=session');
    });
    return () => setAuthLostHandler(undefined);
  }, [queryClient, router]);

  const login = useCallback(async (email: string, password: string): Promise<LoginOutcome> => {
    const result = await api.auth.login(email, password);
    if (isMfaChallenge(result)) return { status: 'mfa', mfaToken: result.mfaToken };
    setState({ status: 'authenticated', user: result.user });
    return { status: 'authenticated', user: result.user };
  }, []);

  const completeMfa = useCallback(async (mfaToken: string, code: string) => {
    const session = await api.auth.loginMfa(mfaToken, code);
    setState({ status: 'authenticated', user: session.user });
    return session.user;
  }, []);

  const endSession = useCallback(
    async (call: () => Promise<void>) => {
      try {
        await call();
      } finally {
        // Nothing of the previous user may stay in memory.
        queryClient.clear();
        setState({ status: 'anonymous', user: null });
      }
    },
    [queryClient],
  );

  const logout = useCallback(() => endSession(() => api.auth.logout()), [endSession]);
  const logoutAll = useCallback(() => endSession(() => api.auth.logoutAll()), [endSession]);

  const setUser = useCallback((user: User) => setState({ status: 'authenticated', user }), []);
  const reloadUser = useCallback(async () => {
    setState({ status: 'authenticated', user: await api.me.get() });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, completeMfa, logout, logoutAll, setUser, reloadUser }),
    [state, login, completeMfa, logout, logoutAll, setUser, reloadUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser can only be used on authenticated pages');
  return user;
}
