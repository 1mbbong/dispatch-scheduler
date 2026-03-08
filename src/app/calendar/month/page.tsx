import { requireAuthServer } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations, getLatestRescheduleSnapshots } from '@/lib/queries';
import { MonthView } from '@/components/month-view';
import { CalendarFilter } from '@/components/calendar/calendar-filter';
import { CustomerAreaSummaryBadges } from '@/components/calendar/customer-area-summary';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { redirect } from 'next/navigation';
import { CalendarViewToggle } from '@/components/calendar-view-toggle';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ date?: string, areas?: string, unstaffed?: string, loc?: string, ghosts?: string, dayCounts?: string }>;
}

export default async function MonthCalendarPage({ searchParams }: PageProps) {
    const { date, areas, unstaffed, loc, ghosts, dayCounts } = await searchParams;

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

    // Ghost snapshots: only for FIELD schedules, and only if ghosts toggle is on
    const showGhosts = ghosts !== '0';
    const rescheduleSnapshots = showGhosts
        ? await getLatestRescheduleSnapshots(
            auth!.tenantId,
            schedules.filter((s: any) => s.workLocationType === 'FIELD').map((s: any) => s.id)
        )
        : {};

    const selectedAreas = areas ? areas.split(',') : null;
    const availabilitySummary = await import('@/lib/queries').then(m =>
        m.getAvailabilitySummary(auth!.tenantId, new Date(), selectedAreas)
    );

    // --- Apply filters ---
    let filteredSchedules = schedules;

    // Area filter
    if (selectedAreas !== null) {
        filteredSchedules = filteredSchedules.filter((s: any) => {
            if (s.customerAreaId) return selectedAreas.includes(s.customerAreaId);
            return selectedAreas.includes('unassigned');
        });
    }

    // Location filter (loc param: office,wfh,field)
    if (loc && loc !== 'none') {
        const locTypes = loc.split(',');
        const typeMap: Record<string, string> = { office: 'OFFICE', wfh: 'REMOTE', field: 'FIELD' };
        const allowedTypes = locTypes.map(l => typeMap[l]).filter(Boolean);
        filteredSchedules = filteredSchedules.filter((s: any) =>
            allowedTypes.includes(s.workLocationType || 'FIELD')
        );
    } else if (loc === 'none') {
        filteredSchedules = [];
    }

    // Unstaffed filter (assignments eagerly loaded by getSchedules)
    if (unstaffed === '1') {
        filteredSchedules = filteredSchedules.filter((s: any) =>
            !s.assignments || s.assignments.length === 0
        );
    }

    const showDayCounts = dayCounts !== '0';

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Calendar
                </h1>
                <div className="flex items-center gap-4">
                    <CustomerAreaSummaryBadges summary={availabilitySummary} />
                    <Suspense>
                        <CalendarFilter customerAreas={customerAreas} view="month" />
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
                showDayCounts={showDayCounts}
            />
        </div>
    );
}
