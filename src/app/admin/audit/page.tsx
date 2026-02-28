import { requireAuthServer, isAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AuditLogViewer } from '@/components/admin/audit-log-viewer';

export default async function AdminAuditPage() {
    const auth = await requireAuthServer();

    if (!isAdmin(auth.user.role)) {
        redirect('/');
    }

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Recent actions and changes across your workspace.
                </p>
            </div>
            <AuditLogViewer />
        </div>
    );
}
