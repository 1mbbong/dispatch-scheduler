import { requireAuthServer, canManageSchedules } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations } from '@/lib/queries';
import { WeekView } from '@/components/week-view';
import { startOfWeek, endOfWeek } from 'date-fns';
import { redirect } from 'next/navigation';
import { CalendarViewToggle } from '@/components/calendar-view-toggle';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ date?: string }>;
}

export default async function WeekCalendarPage({ searchParams }: PageProps) {
    const { date } = await searchParams;

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
    const [schedules, employees, vacations] = await Promise.all([
        getSchedules(auth.tenantId, { startDate: start, endDate: end }),
        getEmployees(auth.tenantId),
        getVacations(auth.tenantId, { startDate: start, endDate: end }),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Calendar
                </h1>
                <Suspense>
                    <CalendarViewToggle />
                </Suspense>
            </div>

            <WeekView
                initialDate={currentDate}
                schedules={schedules}
                employees={employees}
                vacations={vacations}
                canManage={true}
            />
        </div>
    );
}

