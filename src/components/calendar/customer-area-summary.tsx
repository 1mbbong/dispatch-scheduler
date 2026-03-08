'use client';

interface CustomerAreaSummaryBadgesProps {
    summary: {
        totalEmployees: number;
        vacationCount: number;
        overbookedCount: number;
        availableCount: number;
    } | null;
}

export function CustomerAreaSummaryBadges({ summary }: CustomerAreaSummaryBadgesProps) {
    if (!summary) return null;

    return (
        <div className="flex items-center gap-2 text-xs font-medium border rounded-md px-2 py-1.5 bg-white shadow-sm h-[36px]">
            <span className="text-gray-600 px-1 border-r border-gray-200">
                Staff: <span className="text-gray-900">{summary.totalEmployees}</span>
            </span>
            <span className="text-green-600 px-1 border-r border-gray-200">
                Available: <span className="text-green-700">{summary.availableCount}</span>
            </span>
            <span className="text-orange-600 px-1 border-r border-gray-200">
                Vacation: <span className="text-orange-700">{summary.vacationCount}</span>
            </span>
            <span className="text-red-600 px-1">
                Overbooked: <span className="text-red-700">{summary.overbookedCount}</span>
            </span>
        </div>
    );
}
