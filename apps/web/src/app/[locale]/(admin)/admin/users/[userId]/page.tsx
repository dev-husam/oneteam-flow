import { AdminUserDetail } from '@/features/admin/admin-users';

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <AdminUserDetail userId={userId} />;
}
