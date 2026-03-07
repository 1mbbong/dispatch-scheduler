import { requireAuthServer, canManageSchedules } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations } from '@/lib/queries';
import { WeekView } from '@/components/week-view';
import { CustomerAreaFilter } from '@/components/calendar/customer-area-filter';
import { CustomerAreaSummaryBadges } from '@/components/calendar/customer-area-summary';
import { startOfWeek, endOfWeek } from 'date-fns';
import { redirect } from 'next/navigation';
import { CalendarViewToggle } from '@/components/calendar-view-toggle';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ date?: string, areas?: string }>;
}

export default async function WeekCalendarPage({ searchParams }: PageProps) {
    const { date, areas } = await searchParams;

    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const today = new Date();
    const currentDate = date ? new Date(date) : today;

    // Calculate week range (Sunday start)
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });

    // Direct Prisma queries — no self-fetch
    const [schedules, employees, vacations, customerAreas, scheduleStatuses, workTypes, offices] = await Promise.all([
        getSchedules(auth.tenantId, { startDate: start, endDate: end }),
        getEmployees(auth.tenantId),
        getVacations(auth.tenantId, { startDate: start, endDate: end }),
        import('@/lib/queries').then(m => m.getCustomerAreas(auth.tenantId)),
        import('@/lib/queries').then(m => m.getScheduleStatuses(auth.tenantId)),
        import('@/lib/queries').then(m => m.getWorkTypes(auth.tenantId)),
        import('@/lib/queries').then(m => m.getOffices(auth.tenantId, false)),
    ]);

    const selectedAreas = areas ? areas.split(',') : null;
    const availabilitySummary = await import('@/lib/queries').then(m =>
        m.getAvailabilitySummary(auth.tenantId, today, selectedAreas)
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
            />
        </div>
    );
}

