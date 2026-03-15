import { redirect } from 'next/navigation';
import { requireAuthServer } from '@/lib/auth';
import { getCustomerAreas, getScheduleStatuses, getWorkTypes, getOffices } from '@/lib/queries';
import { LabelManager } from '@/components/settings/label-manager';
import { Suspense } from 'react';

export const metadata = {
    title: 'Label Settings | ORDI',
};

export default async function LabelsSettingsPage() {
    const auth = await requireAuthServer();
    if (auth.user.role !== 'ADMIN') {
        redirect('/');
    }

    const [customerAreas, statuses, workTypes, offices] = await Promise.all([
        getCustomerAreas(auth.tenantId, true), // include inactive
        getScheduleStatuses(auth.tenantId, true),
        getWorkTypes(auth.tenantId, true),
        getOffices(auth.tenantId, true),
    ]);

    return (
        <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Label Settings</h1>
            <p className="text-gray-500 mb-8 max-w-2xl">
                Manage the labels available across your workspace. Deactivating a label hides it from new selections, but preserves existing records.
            </p>

            <Suspense fallback={<div className="text-gray-500 py-10">Loading label manager...</div>}>
                <LabelManager
                    initialCustomerAreas={customerAreas}
                    initialStatuses={statuses}
                    initialWorkTypes={workTypes}
                    initialOffices={offices}
                />
            </Suspense>
        </div>
    );
}
