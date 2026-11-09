import { AuthShell } from '@/components/shell/auth-shell';
import { RedirectIfAuthed } from '@/components/shell/auth-guards';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <RedirectIfAuthed>
      <AuthShell>{children}</AuthShell>
    </RedirectIfAuthed>
  );
}
