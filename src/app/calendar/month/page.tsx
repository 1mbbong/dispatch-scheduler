import { requireAuthServer } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations, getLatestRescheduleSnapshots } from '@/lib/queries';
import { MonthView } from '@/components/month-view';
import { CustomerAreaFilter } from '@/components/calendar/customer-area-filter';
import { CustomerAreaSummaryBadges } from '@/components/calendar/customer-area-summary';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { redirect } from 'next/navigation';
import { CalendarViewToggle } from '@/components/calendar-view-toggle';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ date?: string, areas?: string }>;
}

export default async function MonthCalendarPage({ searchParams }: PageProps) {
    const { date, areas } = await searchParams;

    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    // Default to current date if no date param is provided
    const currentDate = date ? new Date(date) : new Date();

    // Determine the calendar grid boundaries
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    // Load schedules and employees in parallel
    const [schedules, employees, vacations, customerAreas, scheduleStatuses, workTypes, offices] = await Promise.all([
        getSchedules(auth!.tenantId, {
            startDate,
            endDate,
        }),
        getEmployees(auth!.tenantId),
        getVacations(auth!.tenantId, {
            startDate,
            endDate,
        }),
        import('@/lib/queries').then(m => m.getCustomerAreas(auth!.tenantId)),
        import('@/lib/queries').then(m => m.getScheduleStatuses(auth!.tenantId)),
        import('@/lib/queries').then(m => m.getWorkTypes(auth!.tenantId)),
        import('@/lib/queries').then(m => m.getOffices(auth!.tenantId, false)),
    ]);



    const scheduleIds = schedules
        .filter((s: any) => s.workLocationType === 'FIELD')
        .map((s: any) => s.id);
    const rescheduleSnapshots = await getLatestRescheduleSnapshots(auth!.tenantId, scheduleIds);

    const selectedAreas = areas ? areas.split(',') : null;
    const availabilitySummary = await import('@/lib/queries').then(m =>
        m.getAvailabilitySummary(auth!.tenantId, new Date(), selectedAreas)
    );

    const filteredSchedules = selectedAreas === null
        ? schedules
        : schedules.filter((s: any) => {
            if (s.customerAreaId) return selectedAreas.includes(s.customerAreaId);
            return selectedAreas.includes('unassigned');
        });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Calendar
                </h1>
                <div className="flex items-center gap-4">
                    <CustomerAreaSummaryBadges summary={availabilitySummary} />
                    <Suspense>
                        <CustomerAreaFilter customerAreas={customerAreas} />
                    </Suspense>
                    <Suspense>
                        <CalendarViewToggle />
                    </Suspense>
                </div>
            </div>

            <MonthView
                initialDate={currentDate}
                schedules={filteredSchedules}
                employees={employees}
                vacations={vacations}
                canManage={true}
                rescheduleSnapshots={rescheduleSnapshots}
                customerAreas={customerAreas}
                scheduleStatuses={scheduleStatuses}
                workTypes={workTypes}
                offices={offices}
            />
        </div>
    );
}
