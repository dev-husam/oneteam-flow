import { AdminOrganizationDetail } from '@/features/admin/admin-orgs';

export default async function Page({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <AdminOrganizationDetail orgId={orgId} />;
}
