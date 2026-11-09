import { AuthShell } from '@/components/shell/auth-shell';

/** Auth-styled pages that work whether or not the visitor is signed in (e-mail confirmation, password reset). */
export default function NeutralLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
