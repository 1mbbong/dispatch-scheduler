import { requireAuthServer } from '@/lib/auth';
import { getSchedules, getEmployees, getVacations } from '@/lib/queries';
import { MonthView } from '@/components/month-view';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { redirect } from 'next/navigation';
import { CalendarViewToggle } from '@/components/calendar-view-toggle';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ date?: string }>;
}

export default async function MonthCalendarPage({ searchParams }: PageProps) {
    const { date } = await searchParams;

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
    const [schedules, employees, vacations] = await Promise.all([
        getSchedules(auth!.tenantId, {
            startDate,
            endDate,
        }),
        getEmployees(auth!.tenantId),
        getVacations(auth!.tenantId, {
            startDate,
            endDate,
        }),
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

            <MonthView
                initialDate={currentDate}
                schedules={schedules}
                employees={employees}
                vacations={vacations}
                canManage={true}
            />
        </div>
    );
}
