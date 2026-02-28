import { requireAuthServer, canManageVacations } from '@/lib/auth';
import { getVacationsPaginated, getEmployees } from '@/lib/queries';
import { VacationList } from '@/components/vacations/vacation-list';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ page?: string; pageSize?: string }>;
}

export default async function VacationsPage({ searchParams }: PageProps) {
    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const params = await searchParams;

    // Direct Prisma queries — no self-fetch
    const [result, employees] = await Promise.all([
        getVacationsPaginated(auth.tenantId, params),
        getEmployees(auth.tenantId),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Vacations
                </h1>
            </div>

            <VacationList
                initialVacations={result.items}
                employees={employees}
                canManage={canManageVacations(auth.user.role)}
                page={result.page}
                pageSize={result.pageSize}
                totalCount={result.totalCount}
                totalPages={result.totalPages}
            />
        </div>
    );
}

