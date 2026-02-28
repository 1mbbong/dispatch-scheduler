'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    format,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addWeeks,
    subWeeks,
    isSameDay,
    parseISO
} from 'date-fns';
import { cn } from '@/lib/utils';
import { SerializedScheduleWithAssignments, SerializedEmployeeWithStats, SerializedVacationWithEmployee } from '@/types';
import { CalendarCellQuickCreate } from '@/components/calendar-cell-quick-create';

interface WeekViewProps {
    initialDate: Date;
    schedules: SerializedScheduleWithAssignments[];
    employees: SerializedEmployeeWithStats[];
    vacations: SerializedVacationWithEmployee[];
    canManage: boolean;
}

export function WeekView({ initialDate, schedules, employees, vacations, canManage }: WeekViewProps) {
    const router = useRouter();

    const start = startOfWeek(initialDate, { weekStartsOn: 0 });
    const end = endOfWeek(initialDate, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });

    const handlePrevWeek = () => {
        const newDate = subWeeks(initialDate, 1);
        router.push(`?date=${format(newDate, 'yyyy-MM-dd')}`);
    };

    const handleNextWeek = () => {
        const newDate = addWeeks(initialDate, 1);
        router.push(`?date=${format(newDate, 'yyyy-MM-dd')}`);
    };

    const handleToday = () => {
        router.push(`?date=${format(new Date(), 'yyyy-MM-dd')}`);
    };

    const weekSchedules = useMemo(() => {
        const blocks = [];

        // Ensure we only process unique schedules
        const uniqueSchedules = new Map<string, typeof schedules[0]>();
        schedules.forEach(s => uniqueSchedules.set(s.id, s));

        for (const schedule of Array.from(uniqueSchedules.values())) {
            const sStart = parseISO(schedule.startTime);
            const sEnd = parseISO(schedule.endTime);

            // Find start and end columns for the current week [0-6]
            let startIndex = -1;
            let endIndex = -1;

            for (let i = 0; i < 7; i++) {
                const dayStart = new Date(days[i]); dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(days[i]); dayEnd.setHours(23, 59, 59, 999);

                // Intersects with this day?
                const intersects = sStart < dayEnd && sEnd > dayStart;
                if (intersects) {
                    if (startIndex === -1) startIndex = i;
                    endIndex = i;
                }
            }

            if (startIndex !== -1) {
                blocks.push({
                    schedule,
                    gridColumnStart: startIndex + 1,
                    gridColumnEnd: endIndex + 2,
                    startsBeforeWeek: sStart < start,
                    endsAfterWeek: sEnd > end,
                    startTime: sStart,
                    endTime: sEnd,
                });
            }
        }

        // Sort blocks: earlier start first, then longer duration first
        blocks.sort((a, b) => {
            if (a.startTime.getTime() !== b.startTime.getTime()) {
                return a.startTime.getTime() - b.startTime.getTime();
            }
            return (b.gridColumnEnd - b.gridColumnStart) - (a.gridColumnEnd - a.gridColumnStart);
        });

        return blocks;
    }, [schedules, days, start, end]);

    const weekVacations = useMemo(() => {
        const blocks = [];

        for (const vacation of vacations) {
            const vStart = parseISO(vacation.startDate);
            const vEnd = parseISO(vacation.endDate);

            // Find start and end columns for the current week [0-6]
            let startIndex = -1;
            let endIndex = -1;

            for (let i = 0; i < 7; i++) {
                const dayStart = new Date(days[i]); dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(days[i]); dayEnd.setHours(23, 59, 59, 999);

                // Intersects with this day? (half-open)
                if (vStart < dayEnd && vEnd > dayStart) {
                    if (startIndex === -1) startIndex = i;
                    endIndex = i;
                }
            }

            if (startIndex !== -1) {
                blocks.push({
                    vacation,
                    gridColumnStart: startIndex + 1,
                    gridColumnEnd: endIndex + 2,
                    startsBeforeWeek: vStart < start,
                    endsAfterWeek: vEnd > end,
                    startDate: vStart,
                    endDate: vEnd,
                });
            }
        }

        // Sort blocks: earlier start first
        blocks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

        return blocks;
    }, [vacations, days, start, end]);

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] bg-white rounded-lg shadow border">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center space-x-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {format(start, 'MMM d')} - {format(end, 'MMM d, yyyy')}
                    </h2>
                    <div className="flex items-center rounded-md border bg-white shadow-sm">
                        <button
                            onClick={handlePrevWeek}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r"
                        >
                            Prev
                        </button>
                        <button
                            onClick={handleToday}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 border-r"
                        >
                            Today
                        </button>
                        <button
                            onClick={handleNextWeek}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="min-w-[800px] h-full flex flex-col">
                    {/* Headers Row */}
                    <div className="grid grid-cols-7 border-b sticky top-0 bg-white z-20 divide-x">
                        {days.map((day) => {
                            const dateKey = format(day, 'yyyy-MM-dd');
                            const isToday = isSameDay(day, new Date());
                            return (
                                <div key={dateKey} className={cn("p-3 text-center group relative", isToday && "bg-blue-50")}>
                                    <p className={cn("text-xs font-semibold uppercase text-gray-500", isToday && "text-blue-600")}>
                                        {format(day, 'EEE')}
                                    </p>
                                    <p className={cn("text-lg font-medium text-gray-900", isToday && "text-blue-600")}>
                                        {format(day, 'd')}
                                    </p>
                                    {canManage && (
                                        <CalendarCellQuickCreate date={day} employees={employees} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Body Area */}
                    <div className="flex-1 relative">
                        {/* Background columns for clicks & borders */}
                        <div className="absolute inset-0 grid grid-cols-7 divide-x pointer-events-none">
                            {days.map(day => (
                                <div
                                    key={format(day, 'yyyy-MM-dd')}
                                    className="h-full bg-gray-50/30 pointer-events-auto"
                                />
                            ))}
                        </div>

                        {/* Vacation Layer (z-0) Underneath schedules */}
                        <div className="absolute inset-0 z-0 grid grid-cols-7 gap-y-1 p-2 pointer-events-none">
                            {weekVacations.map(block => {
                                const v = block.vacation;
                                return (
                                    <div
                                        key={v.id}
                                        className={cn(
                                            "flex items-center px-2 py-1 text-xs text-orange-700 bg-orange-100/80 border border-orange-200 pointer-events-auto opacity-70",
                                            block.startsBeforeWeek ? "rounded-l-none border-l-0" : "rounded-l-full",
                                            block.endsAfterWeek ? "rounded-r-none border-r-0" : "rounded-r-full"
                                        )}
                                        style={{ gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}` }}
                                        title={`${v.employee.name} — ${v.reason || 'Vacation'} (${format(block.startDate, 'MMM d')} - ${format(block.endDate, 'MMM d')})`}
                                    >
                                        <span className="font-semibold truncate mr-2">🌴 {v.employee.name}</span>
                                        <span className="truncate opacity-75">{v.reason || 'Vacation'}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Spanning blocks Grid (z-10) */}
                        <div className="relative z-10 grid grid-cols-7 gap-y-2 p-2 pointer-events-none">
                            {weekSchedules.map(block => {
                                const schedule = block.schedule;
                                const categoryColor = schedule.category ? (schedule.category as any).color : '#6366f1';

                                let timeLabel = '';
                                if (isSameDay(block.startTime, block.endTime)) {
                                    timeLabel = `${format(block.startTime, 'HH:mm')} - ${format(block.endTime, 'HH:mm')}`;
                                } else {
                                    timeLabel = `${format(block.startTime, 'MMM d, HH:mm')} - ${format(block.endTime, 'MMM d, HH:mm')}`;
                                }

                                return (
                                    <div
                                        key={schedule.id}
                                        className={cn(
                                            "group relative flex flex-col p-2 text-xs border shadow-sm hover:shadow-md transition-shadow cursor-pointer pointer-events-auto focus:outline-none focus:ring-2 focus:ring-indigo-500",
                                            block.startsBeforeWeek ? "rounded-l-sm border-l" : "rounded-l-md",
                                            block.endsAfterWeek ? "rounded-r-sm border-r" : "rounded-r-md"
                                        )}
                                        style={{
                                            gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                            borderLeftWidth: block.startsBeforeWeek ? '1px' : '4px',
                                            borderColor: categoryColor,
                                            backgroundColor: `${categoryColor}10`,
                                            ...(schedule.status === 'CANCELLED' ? {
                                                opacity: 0.6,
                                                borderStyle: 'dashed',
                                                backgroundColor: '#f9fafb',
                                                borderColor: '#d1d5db'
                                            } : {})
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Schedule: ${schedule.title}, ${timeLabel}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/schedules/${schedule.id}`);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                router.push(`/schedules/${schedule.id}`);
                                            }
                                        }}
                                    >
                                        <div className={`font-semibold truncate ${schedule.status === 'CANCELLED' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                            {schedule.title}
                                        </div>
                                        <div className={schedule.status === 'CANCELLED' ? 'text-gray-400 mb-1 truncate' : 'text-gray-500 mb-1 truncate'}>
                                            {schedule.category && (
                                                <span className="font-medium mr-1" style={{ color: schedule.status === 'CANCELLED' ? 'inherit' : categoryColor }}>
                                                    [{(schedule.category as any).name}]
                                                </span>
                                            )}
                                            {timeLabel}
                                        </div>

                                        {/* Assignments inline/overlap container */}
                                        <div className="flex flex-wrap items-center mt-1 gap-1">
                                            {schedule.assignments.length > 0 ? (
                                                <div className="flex -space-x-1 overflow-hidden shrink-0">
                                                    {schedule.assignments.map(a => (
                                                        <div
                                                            key={a.id}
                                                            className="inline-block h-5 w-5 rounded-full ring-2 ring-white bg-indigo-100 flex items-center justify-center text-[9px] font-bold text-indigo-700"
                                                            title={a.employee.name}
                                                        >
                                                            {a.employee.name.charAt(0)}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-orange-500 italic text-[10px]">Unassigned</span>
                                            )}
                                            {schedule.assignments.length > 5 && (
                                                <span className="text-[10px] text-gray-500 ml-1">
                                                    +{schedule.assignments.length - 5}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
