'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type CalendarView = 'month' | 'week' | 'day';

const VIEWS: { key: CalendarView; label: string }[] = [
    { key: 'month', label: 'Month' },
    { key: 'week', label: 'Week' },
    { key: 'day', label: 'Day' },
];

/**
 * Compact segmented toggle for switching between Month / Week / Day calendar views.
 * Placed above the calendar grid. Active view is inferred from the current pathname.
 * The `?date=` param is preserved across view switches.
 */
export function CalendarViewToggle() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Determine active view from pathname
    const activeView: CalendarView =
        pathname.includes('/calendar/day') ? 'day' :
            pathname.includes('/calendar/week') ? 'week' :
                'month';

    // Preserve current date param when switching views
    const dateParam = searchParams.get('date');
    const buildHref = (view: CalendarView) => {
        const base = `/calendar/${view}`;
        return dateParam ? `${base}?date=${dateParam}` : base;
    };

    return (
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 shadow-sm">
            {VIEWS.map(({ key, label }) => {
                const isActive = key === activeView;
                return (
                    <Link
                        key={key}
                        href={buildHref(key)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${isActive
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {label}
                    </Link>
                );
            })}
        </div>
    );
}
