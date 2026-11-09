import { AppShell } from '@/components/shell/app-shell';
import { RequireAuth } from '@/components/shell/auth-guards';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
