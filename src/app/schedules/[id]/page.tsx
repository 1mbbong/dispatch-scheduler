import { requireAuthServer, canManageSchedules } from '@/lib/auth';
import { getScheduleById, getEmployees, getOverlappingEmployeeEvents, getScheduleAuditLogs } from '@/lib/queries';
import { ScheduleDetail } from '@/components/schedules/schedule-detail';
import { notFound, redirect } from 'next/navigation';
import { parseISO } from 'date-fns';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ScheduleDetailPage({ params }: PageProps) {
    const { id } = await params;

    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    // Direct Prisma queries — no self-fetch
    const [schedule, employees, tenant, auditLogs, customerAreas, scheduleStatuses, workTypes, offices] = await Promise.all([
        getScheduleById(auth.tenantId, id),
        getEmployees(auth.tenantId),
        prisma.tenant.findUnique({
            where: { id: auth.tenantId },
            select: { categoryLabel: true },
        }),
        getScheduleAuditLogs(auth.tenantId, id),
        import('@/lib/queries').then(m => m.getCustomerAreas(auth.tenantId)),
        import('@/lib/queries').then(m => m.getScheduleStatuses(auth.tenantId)),
        import('@/lib/queries').then(m => m.getWorkTypes(auth.tenantId)),
        import('@/lib/queries').then(m => m.getOffices(auth.tenantId, false)),
    ]);

    if (!schedule) {
        notFound();
    }

    // Fetch overlapping events for ALL employees to support Availability Grouping UI
    const allEmployeeIds = employees.map((e: any) => e.id);
    const overlappingEvents = await getOverlappingEmployeeEvents(
        auth.tenantId,
        allEmployeeIds,
        parseISO(schedule.startTime),
        parseISO(schedule.endTime),
        schedule.id
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Schedule Details
                </h1>
            </div>

            <ScheduleDetail
                schedule={schedule}
                employees={employees}
                overlappingEvents={overlappingEvents}
                categoryLabel={tenant?.categoryLabel || 'Category'}
                canManage={canManageSchedules(auth.user.role)}
                auditLogs={auditLogs}
                customerAreas={customerAreas}
                scheduleStatuses={scheduleStatuses}
                workTypes={workTypes}
                offices={offices}
            />
        </div>
    );
}

