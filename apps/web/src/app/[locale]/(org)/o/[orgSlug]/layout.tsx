import { OrgShell } from '@/components/shell/org-shell';
import { OrgProvider } from '@/lib/org/org-context';

/** Everything under /o/[orgSlug] runs inside one organization: role, permissions and menu come from the server. */
export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <OrgProvider>
      <OrgShell>{children}</OrgShell>
    </OrgProvider>
  );
}
