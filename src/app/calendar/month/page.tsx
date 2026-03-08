import { requireAuthServer } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations, getLatestRescheduleSnapshots, getFilterDefaults } from '@/lib/queries';
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
    const params = await searchParams;

    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const currentDate = params.date ? new Date(params.date) : new Date();
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const [schedules, employees, vacations, customerAreas, scheduleStatuses, workTypes, offices, defaults] = await Promise.all([
        getSchedules(auth!.tenantId, { startDate, endDate }),
        getEmployees(auth!.tenantId),
        getVacations(auth!.tenantId, { startDate, endDate }),
        import('@/lib/queries').then(m => m.getCustomerAreas(auth!.tenantId)),
        import('@/lib/queries').then(m => m.getScheduleStatuses(auth!.tenantId)),
        import('@/lib/queries').then(m => m.getWorkTypes(auth!.tenantId)),
        import('@/lib/queries').then(m => m.getOffices(auth!.tenantId, false)),
        getFilterDefaults(auth!.tenantId),
    ]);

    // --- Merge: URL wins, else defaults, else hardcoded ---
    // Areas
    const areasRaw = params.areas;
    let effectiveAreas: string[] | null;
    if (areasRaw !== undefined) {
        effectiveAreas = areasRaw ? areasRaw.split(',') : null;
    } else if (defaults?.areas && defaults.areas !== 'ALL') {
        effectiveAreas = defaults.areas;
    } else {
        effectiveAreas = null; // All
    }

    // Unstaffed
    const effectiveUnstaffed = params.unstaffed !== undefined
        ? params.unstaffed === '1'
        : (defaults?.unstaffed ?? false);

    // Location
    let effectiveLoc: string | undefined;
    if (params.loc !== undefined) {
        effectiveLoc = params.loc;
    } else if (defaults?.loc) {
        const parts: string[] = [];
        if (defaults.loc.office) parts.push('office');
        if (defaults.loc.wfh) parts.push('wfh');
        if (defaults.loc.field) parts.push('field');
        effectiveLoc = parts.length === 3 ? undefined : (parts.length === 0 ? 'none' : parts.join(','));
    }

    // Ghosts (month-only)
    const effectiveGhosts = params.ghosts !== undefined
        ? params.ghosts !== '0'
        : (defaults?.ghosts ?? true);

    // DayCounts (month-only)
    const effectiveDayCounts = params.dayCounts !== undefined
        ? params.dayCounts !== '0'
        : (defaults?.dayCounts ?? true);

    // Ghost snapshots
    const rescheduleSnapshots = effectiveGhosts
        ? await getLatestRescheduleSnapshots(
            auth!.tenantId,
            schedules.filter((s: any) => s.workLocationType === 'FIELD').map((s: any) => s.id)
        )
        : {};

    const availabilitySummary = await import('@/lib/queries').then(m =>
        m.getAvailabilitySummary(auth!.tenantId, new Date(), effectiveAreas)
    );

    // --- Apply filters ---
    let filteredSchedules = schedules;

    if (effectiveAreas !== null) {
        filteredSchedules = filteredSchedules.filter((s: any) => {
            if (s.customerAreaId) return effectiveAreas!.includes(s.customerAreaId);
            return effectiveAreas!.includes('unassigned');
        });
    }

    if (effectiveLoc && effectiveLoc !== 'none') {
        const locTypes = effectiveLoc.split(',');
        const typeMap: Record<string, string> = { office: 'OFFICE', wfh: 'REMOTE', field: 'FIELD' };
        const allowedTypes = locTypes.map(l => typeMap[l]).filter(Boolean);
        filteredSchedules = filteredSchedules.filter((s: any) =>
            allowedTypes.includes(s.workLocationType || 'FIELD')
        );
    } else if (effectiveLoc === 'none') {
        filteredSchedules = [];
    }

    if (effectiveUnstaffed) {
        filteredSchedules = filteredSchedules.filter((s: any) =>
            !s.assignments || s.assignments.length === 0
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Calendar</h1>
                <div className="flex items-center gap-4">
                    <CustomerAreaSummaryBadges summary={availabilitySummary} />
                    <Suspense>
                        <CalendarFilter customerAreas={customerAreas} view="month" role={auth!.user.role} filterDefaults={defaults} />
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
                showDayCounts={effectiveDayCounts}
            />
        </div>
    );
}
