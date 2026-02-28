import { requireAuthServer, canManageEmployees } from '@/lib/auth';
import { getEmployeesPaginated } from '@/lib/queries';
import { EmployeeList } from '@/components/employees/employee-list';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ page?: string; pageSize?: string }>;
}

export default async function EmployeesPage({ searchParams }: PageProps) {
    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const params = await searchParams;

    // Direct Prisma query — no self-fetch
    const result = await getEmployeesPaginated(auth.tenantId, params);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Employees
                </h1>
            </div>

            <EmployeeList
                initialEmployees={result.items}
                canManage={canManageEmployees(auth.user.role)}
                page={result.page}
                pageSize={result.pageSize}
                totalCount={result.totalCount}
                totalPages={result.totalPages}
            />
        </div>
    );
}

