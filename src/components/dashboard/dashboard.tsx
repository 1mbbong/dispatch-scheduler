'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';

interface DashboardProps {
    stats: {
        todaySchedules: {
            id: string;
            title: string;
            startTime: string;
            endTime: string;
            status: string;
            assignments: { employee: { id: string; name: string } }[];
        }[];
        unassignedCount: number;
        totalActiveSchedules: number;
        upcomingVacations: {
            id: string;
            startDate: string;
            endDate: string;
            reason: string | null;
            employee: { id: string; name: string };
        }[];
        totalEmployees: number;
    };
}

export function Dashboard({ stats }: DashboardProps) {
    const {
        todaySchedules,
        unassignedCount,
        totalActiveSchedules,
        upcomingVacations,
        totalEmployees,
    } = stats;

    return (
        <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Today's Schedules"
                    value={todaySchedules.length}
                    href="/calendar/week"
                    accent="indigo"
                />
                <StatCard
                    label="Unassigned"
                    value={unassignedCount}
                    sub={`/ ${totalActiveSchedules} active`}
                    href="/calendar/week"
                    accent={unassignedCount > 0 ? 'amber' : 'green'}
                />
                <StatCard
                    label="Upcoming Vacations"
                    value={upcomingVacations.length}
                    sub="next 7 days"
                    href="/vacations"
                    accent={upcomingVacations.length > 0 ? 'rose' : 'green'}
                />
                <StatCard
                    label="Active Employees"
                    value={totalEmployees}
                    href="/employees"
                    accent="slate"
                />
            </div>

            {/* Today's schedules */}
            <section className="bg-white rounded-lg shadow border">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">Today&apos;s Schedules</h2>
                    <Link href="/calendar/week" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        View week →
                    </Link>
                </div>
                {todaySchedules.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-400 text-center">No schedules for today.</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {todaySchedules.map((s) => (
                            <li key={s.id}>
                                <Link
                                    href={`/schedules/${s.id}`}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{s.title}</p>
                                        <p className="text-xs text-gray-500">
                                            {format(parseISO(s.startTime), 'h:mm a')} – {format(parseISO(s.endTime), 'h:mm a')}
                                        </p>
                                    </div>
                                    <div className="ml-4 flex-shrink-0">
                                        {s.assignments.length > 0 ? (
                                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                                                {s.assignments.length} assigned
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                Unassigned
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Upcoming vacations */}
            <section className="bg-white rounded-lg shadow border">
                <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">Upcoming Vacations (7 days)</h2>
                    <Link href="/vacations" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        View all →
                    </Link>
                </div>
                {upcomingVacations.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-400 text-center">No upcoming vacations.</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {upcomingVacations.map((v) => (
                            <li key={v.id} className="flex items-center justify-between px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900">{v.employee.name}</p>
                                    <p className="text-xs text-gray-500">
                                        {format(parseISO(v.startDate), 'MMM d')} – {format(parseISO(v.endDate), 'MMM d, yyyy')}
                                    </p>
                                </div>
                                {v.reason && (
                                    <span className="ml-4 text-xs text-gray-400 truncate max-w-[200px]">{v.reason}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

// ---------- Small helper ----------

const accentMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
    rose: 'bg-rose-50 text-rose-700',
    slate: 'bg-slate-50 text-slate-700',
};

function StatCard({ label, value, sub, href, accent }: {
    label: string;
    value: number;
    sub?: string;
    href: string;
    accent: string;
}) {
    return (
        <Link
            href={href}
            className="rounded-lg border bg-white p-4 shadow-sm hover:shadow transition-shadow"
        >
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${accentMap[accent] ?? accentMap.slate}`}>
                {value === 0 ? 'None' : `${value} item${value !== 1 ? 's' : ''}`}
            </span>
        </Link>
    );
}
