import { requireAuthServer } from '@/lib/auth';
import { getDashboardStats } from '@/lib/queries';
import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard/dashboard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let auth;
  try {
    auth = await requireAuthServer();
  } catch {
    redirect('/login');
  }

  const stats = await getDashboardStats(auth.tenantId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        Dashboard
      </h1>
      <Dashboard stats={stats} />
    </div>
  );
}
