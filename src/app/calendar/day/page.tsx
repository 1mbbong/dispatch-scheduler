import { requireAuthServer } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations, getFilterDefaults } from '@/lib/queries';
import { redirect } from 'next/navigation';
import { CalendarViewToggle } from '@/components/calendar-view-toggle';
import { CalendarFilter } from '@/components/calendar/calendar-filter';
import { CustomerAreaSummaryBadges } from '@/components/calendar/customer-area-summary';
import { DayView } from '@/components/day-view';
import { DayQuickCreate } from '@/components/day-quick-create';
import { Suspense } from 'react';
import { format, addDays, subDays } from 'date-fns';
import Link from 'next/link';
import { SerializedScheduleWithAssignments } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ date?: string, areas?: string, unstaffed?: string, loc?: string, people?: string }>;
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

export default async function DayCalendarPage({ searchParams }: PageProps) {
    const params = await searchParams;

    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const today = new Date();
    const currentDate = params.date
        ? (() => {
            const [y, m, d] = params.date!.split('-').map(Number);
            return new Date(y, m - 1, d);
        })()
        : today;

    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    const [schedules, employees, vacationsRaw, customerAreas, scheduleStatuses, workTypes, offices, defaults] = await Promise.all([
        getSchedules(auth.tenantId, { startDate: dayStart, endDate: dayEnd }),
        getEmployees(auth.tenantId),
        getVacations(auth.tenantId, { startDate: dayStart, endDate: dayEnd }),
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
        m.getAvailabilitySummary(auth.tenantId, currentDate, effectiveAreas)
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

    const displayDate = format(currentDate, 'EEEE, MMMM d, yyyy');
    const prevDate = format(subDays(currentDate, 1), 'yyyy-MM-dd');
    const nextDate = format(addDays(currentDate, 1), 'yyyy-MM-dd');
    const todayDate = format(today, 'yyyy-MM-dd');
    const peopleLevelLabels = ['Off', 'Names', 'Full'];

    return (
        <div className="space-y-4">
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
                        <CalendarFilter customerAreas={customerAreas} view="day" role={auth.user.role} filterDefaults={defaults} />
                    </Suspense>
                    <Suspense>
                        <CalendarViewToggle />
                    </Suspense>
                </div>
            </div>

            <div className="bg-white shadow rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-lg font-semibold text-gray-900 w-48">{displayDate}</h2>
                        <DayQuickCreate
                            initialDate={currentDate}
                            employees={employees}
                            customerAreas={customerAreas}
                            scheduleStatuses={scheduleStatuses}
                            workTypes={workTypes}
                            offices={offices}
                        />
                    </div>
                    <div className="flex items-center rounded-md border bg-white shadow-sm">
                        <a href={`?date=${prevDate}`} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r">Prev</a>
                        <a href={`?date=${todayDate}`} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r">Today</a>
                        <a href={`?date=${nextDate}`} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Next</a>
                    </div>
                </div>

                <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
                    <DayView
                        schedules={filteredSchedules}
                        peopleLevel={peopleLevel}
                        employees={employees}
                        vacations={vacationsRaw}
                    />
                </div>
            </div>

            {filteredSchedules.length > 0 && (
                <div className="bg-white shadow rounded-lg border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                            Day Schedules
                            <span className="ml-2 font-normal text-gray-400">{filteredSchedules.length}</span>
                        </h3>
                    </div>
                    <ul className="divide-y divide-gray-100">
                        {filteredSchedules.map((schedule: SerializedScheduleWithAssignments) => {
                            const start = new Date(schedule.startTime);
                            const end = new Date(schedule.endTime);
                            const isCancelled = schedule.status === 'CANCELLED';
                            const assignmentCount = schedule.assignments?.length ?? 0;
                            return (
                                <li key={schedule.id}>
                                    <Link href={`/schedules/${schedule.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-medium truncate ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{schedule.title}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                                                {assignmentCount > 0 && <span className="ml-2 text-indigo-600">{assignmentCount} assigned</span>}
                                            </p>
                                        </div>
                                        <span className={`ml-3 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isCancelled ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'}`}>
                                            {isCancelled ? 'Cancelled' : 'Active'}
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
