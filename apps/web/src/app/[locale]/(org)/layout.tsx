import { RequireAuth } from '@/components/shell/auth-guards';

export default function OrgGroupLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
