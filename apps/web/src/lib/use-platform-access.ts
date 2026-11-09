'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';

/** Whether the signed-in user holds a platform role (decides if the admin entry point is shown). */
export function usePlatformAccess() {
  const { status } = useAuth();
  return useQuery({ queryKey: ['platform-access'], queryFn: () => api.me.platformAccess(), enabled: status === 'authenticated', staleTime: 5 * 60_000 });
}
