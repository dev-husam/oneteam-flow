import { AdminShell } from '@/components/shell/admin-shell';
import { RequireAuth } from '@/components/shell/auth-guards';
import { AdminGate } from '@/features/admin/admin-gate';

/** Platform administration: its own frame and its own gate (platform role + verified two-factor session). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AdminShell>
        <AdminGate>{children}</AdminGate>
      </AdminShell>
    </RequireAuth>
  );
}
