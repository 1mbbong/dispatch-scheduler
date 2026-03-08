import { requireAuthServer, canManageSchedules } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations, getFilterDefaults } from '@/lib/queries';
import { WeekView } from '@/components/week-view';
import { CalendarFilter } from '@/components/calendar/calendar-filter';
import { CustomerAreaSummaryBadges } from '@/components/calendar/customer-area-summary';
import { startOfWeek, endOfWeek } from 'date-fns';
import { redirect } from 'next/navigation';
import { CalendarViewToggle } from '@/components/calendar-view-toggle';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ date?: string, areas?: string, unstaffed?: string, loc?: string, dayCounts?: string, people?: string }>;
}

function buildPeopleToggleHref(currentParams: Record<string, string | undefined>, currentLevel: number): string {
    const next = (currentLevel + 1) % 3;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(currentParams)) {
        if (k === 'people' || !v) continue;
        params.set(k, v);
    }
    if (next !== 0) params.set('people', String(next));
    const qs = params.toString();
    return qs ? `?${qs}` : '?';
}

export default async function WeekCalendarPage({ searchParams }: PageProps) {
    const params = await searchParams;

    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const today = new Date();
    const currentDate = params.date ? new Date(params.date) : today;
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });

    const [schedules, employees, vacations, customerAreas, scheduleStatuses, workTypes, offices, defaults] = await Promise.all([
        getSchedules(auth.tenantId, { startDate: start, endDate: end }),
        getEmployees(auth.tenantId),
        getVacations(auth.tenantId, { startDate: start, endDate: end }),
        import('@/lib/queries').then(m => m.getCustomerAreas(auth.tenantId)),
        import('@/lib/queries').then(m => m.getScheduleStatuses(auth.tenantId)),
        import('@/lib/queries').then(m => m.getWorkTypes(auth.tenantId)),
        import('@/lib/queries').then(m => m.getOffices(auth.tenantId, false)),
        getFilterDefaults(auth.tenantId),
    ]);

    const peopleLevel = params.people ? parseInt(params.people, 10) || 0 : 0;

    // --- Merge filter defaults ---
    const areasRaw = params.areas;
    let effectiveAreas: string[] | null;
    if (areasRaw !== undefined) {
        effectiveAreas = areasRaw ? areasRaw.split(',') : null;
    } else if (defaults?.areas && defaults.areas !== 'ALL') {
        effectiveAreas = defaults.areas;
    } else {
        effectiveAreas = null;
    }

    const effectiveUnstaffed = params.unstaffed !== undefined
        ? params.unstaffed === '1'
        : (defaults?.unstaffed ?? false);

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

    const availabilitySummary = await import('@/lib/queries').then(m =>
        m.getAvailabilitySummary(auth.tenantId, today, effectiveAreas)
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

    const peopleLevelLabels = ['Off', 'Names', 'Full'];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Calendar</h1>
                <div className="flex items-center gap-4">
                    <CustomerAreaSummaryBadges summary={availabilitySummary} />
                    <a
                        href={buildPeopleToggleHref(params as any, peopleLevel)}
                        title={`People: ${peopleLevelLabels[peopleLevel]} → ${peopleLevelLabels[(peopleLevel + 1) % 3]}`}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-md border shadow-sm transition-colors ${peopleLevel > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                            }`}
                    >
                        👤 <span className="text-[10px]">{peopleLevel}</span>
                    </a>
                    <Suspense>
                        <CalendarFilter customerAreas={customerAreas} view="week" role={auth.user.role} filterDefaults={defaults} />
                    </Suspense>
                    <Suspense>
                        <CalendarViewToggle />
                    </Suspense>
                </div>
            </div>

            <WeekView
                initialDate={currentDate}
                schedules={filteredSchedules}
                employees={employees}
                vacations={vacations}
                canManage={true}
                customerAreas={customerAreas}
                scheduleStatuses={scheduleStatuses}
                workTypes={workTypes}
                offices={offices}
                peopleLevel={peopleLevel}
            />
        </div>
    );
}
