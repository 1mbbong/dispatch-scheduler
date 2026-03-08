import { requireAuthServer } from '@/lib/auth';
import { getSchedules, getEmployees } from '@/lib/queries';
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
    searchParams: Promise<{ date?: string, areas?: string, unstaffed?: string, loc?: string }>;
}

export default async function DayCalendarPage({ searchParams }: PageProps) {
    const { date, areas, unstaffed, loc } = await searchParams;

    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const today = new Date();
    // Safe local date parsing (avoid UTC pitfall with date-only strings)
    const currentDate = date
        ? (() => {
            const [y, m, d] = date.split('-').map(Number);
            return new Date(y, m - 1, d);
        })()
        : today;

    // Day range for schedule overlap query
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Load schedules and employees in parallel
    const [schedules, employees, customerAreas, scheduleStatuses, workTypes, offices] = await Promise.all([
        getSchedules(auth.tenantId, {
            startDate: dayStart,
            endDate: dayEnd,
        }),
        getEmployees(auth.tenantId),
        import('@/lib/queries').then(m => m.getCustomerAreas(auth.tenantId)),
        import('@/lib/queries').then(m => m.getScheduleStatuses(auth.tenantId)),
        import('@/lib/queries').then(m => m.getWorkTypes(auth.tenantId)),
        import('@/lib/queries').then(m => m.getOffices(auth.tenantId, false)),
    ]);

    const selectedAreas = areas ? areas.split(',') : null;
    const availabilitySummary = await import('@/lib/queries').then(m =>
        m.getAvailabilitySummary(auth.tenantId, currentDate, selectedAreas)
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

    // Location filter
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

    const displayDate = format(currentDate, 'EEEE, MMMM d, yyyy');
    const prevDate = format(subDays(currentDate, 1), 'yyyy-MM-dd');
    const nextDate = format(addDays(currentDate, 1), 'yyyy-MM-dd');
    const todayDate = format(today, 'yyyy-MM-dd');

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Calendar
                </h1>
                <div className="flex items-center gap-4">
                    <CustomerAreaSummaryBadges summary={availabilitySummary} />
                    <Suspense>
                        <CalendarFilter customerAreas={customerAreas} view="day" />
                    </Suspense>
                    <Suspense>
                        <CalendarViewToggle />
                    </Suspense>
                </div>
            </div>

            <div className="bg-white shadow rounded-lg border overflow-hidden">
                {/* Day header: date display + navigation + quick create */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-lg font-semibold text-gray-900 w-48">
                            {displayDate}
                        </h2>
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
                        <a
                            href={`?date=${prevDate}`}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r"
                        >
                            Prev
                        </a>
                        <a
                            href={`?date=${todayDate}`}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r"
                        >
                            Today
                        </a>
                        <a
                            href={`?date=${nextDate}`}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Next
                        </a>
                    </div>
                </div>

                {/* Timeline */}
                <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
                    <DayView schedules={filteredSchedules} />
                </div>
            </div>

            {/* Day Schedules card list */}
            {filteredSchedules.length > 0 && (
                <div className="bg-white shadow rounded-lg border overflow-hidden">
                    <div className="px-4 py-3 border-b bg-gray-50">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                            Day Schedules
                            <span className="ml-2 font-normal text-gray-400">
                                {filteredSchedules.length}
                            </span>
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
                                    <Link
                                        href={`/schedules/${schedule.id}`}
                                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-medium truncate ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                {schedule.title}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                                                {assignmentCount > 0 && (
                                                    <span className="ml-2 text-indigo-600">
                                                        {assignmentCount} assigned
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <span
                                            className={`ml-3 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isCancelled
                                                ? 'bg-gray-100 text-gray-500'
                                                : 'bg-green-50 text-green-700'
                                                }`}
                                        >
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
