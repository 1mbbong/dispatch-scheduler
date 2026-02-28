import { notFound, redirect } from 'next/navigation';
import { requireAuthServer } from '@/lib/auth';
import prisma from '@/lib/db';
import Link from 'next/link';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function EmployeeDetailPage({ params }: PageProps) {
    let auth;
    try {
        auth = await requireAuthServer();
    } catch {
        redirect('/login');
    }

    const { id } = await params;

    const employee = await prisma.employee.findFirst({
        where: { id, tenantId: auth.tenantId, isActive: true },
    });

    if (!employee) {
        notFound();
    }

    const now = new Date();

    const next14Days = new Date(now);
    next14Days.setDate(next14Days.getDate() + 14);

    const upcomingAssignments = await prisma.assignment.findMany({
        where: {
            employeeId: employee.id,
            date: { gte: now, lte: next14Days },
            schedule: { status: 'ACTIVE' },
        },
        include: { schedule: true },
        orderBy: { date: 'asc' },
    });

    const next90Days = new Date(now);
    next90Days.setDate(next90Days.getDate() + 90);

    const upcomingVacations = await prisma.vacation.findMany({
        where: {
            employeeId: employee.id,
            endDate: { gte: now },
            startDate: { lte: next90Days },
        },
        orderBy: { startDate: 'asc' },
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link href="/employees" className="text-sm font-medium text-indigo-600 hover:text-indigo-500 mb-2 inline-block">
                        &larr; Back to Employees
                    </Link>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">{employee.name}</h1>
                </div>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                <div className="px-4 py-5 sm:px-6 bg-gray-50">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Profile Information</h3>
                </div>
                <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
                    <dl className="sm:divide-y sm:divide-gray-200">
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Email</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{employee.email || '-'}</dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Phone</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{employee.phone || '-'}</dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Department</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{employee.department || '-'}</dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Team</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{employee.team || '-'}</dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Sub-Team</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{employee.subTeam || '-'}</dd>
                        </div>
                        <div className="py-3 sm:py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                            <dt className="text-sm font-medium text-gray-500">Join Year</dt>
                            <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{employee.joinYear || '-'}</dd>
                        </div>
                    </dl>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Upcoming Schedules */}
                <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                    <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Upcoming Schedules (Next 14 Days)</h3>
                    </div>
                    {upcomingAssignments.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">No schedules in the next 14 days.</div>
                    ) : (
                        <ul className="divide-y divide-gray-200">
                            {upcomingAssignments.map((assignment) => (
                                <li key={assignment.id} className="p-4 hover:bg-gray-50">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900">{assignment.schedule.title}</p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {format(new Date(assignment.date), 'MM/dd')} • {format(new Date(assignment.startTime), 'HH:mm')} - {format(new Date(assignment.endTime), 'HH:mm')}
                                            </p>
                                        </div>
                                        <div>
                                            <Link href={`/schedules/${assignment.scheduleId}`} className="text-xs text-indigo-600 hover:text-indigo-900">
                                                View
                                            </Link>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Upcoming Vacations */}
                <div className="bg-white shadow overflow-hidden sm:rounded-lg border border-gray-200">
                    <div className="px-4 py-5 sm:px-6 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Upcoming Vacations (Next 90 Days)</h3>
                    </div>
                    {upcomingVacations.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">No vacations scheduled in the next 90 days.</div>
                    ) : (
                        <ul className="divide-y divide-gray-200">
                            {upcomingVacations.map((vac) => (
                                <li key={vac.id} className="p-4 hover:bg-gray-50">
                                    <div className="flex flex-col">
                                        <div className="flex justify-between">
                                            <p className="text-sm font-medium text-gray-900">
                                                {format(new Date(vac.startDate), 'MMM d, yyyy')} - {format(new Date(vac.endDate), 'MMM d, yyyy')}
                                            </p>
                                            <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-800">
                                                Vacation
                                            </span>
                                        </div>
                                        {vac.reason && (
                                            <p className="text-xs text-gray-500 mt-1">Reason: {vac.reason}</p>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
