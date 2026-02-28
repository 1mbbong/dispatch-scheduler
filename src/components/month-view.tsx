'use client';

import { useRouter } from 'next/navigation';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameMonth,
    isSameDay,
    parseISO
} from 'date-fns';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect } from 'react';
import { SerializedScheduleWithAssignments, SerializedEmployeeWithStats, SerializedVacationWithEmployee } from '@/types';
import { CalendarCellQuickCreate } from '@/components/calendar-cell-quick-create';
import { SelectionActionModal } from '@/components/selection-action-modal';

interface MonthViewProps {
    initialDate: Date;
    schedules: SerializedScheduleWithAssignments[];
    employees: SerializedEmployeeWithStats[];
    vacations: SerializedVacationWithEmployee[];
    canManage: boolean;
}

export function MonthView({ initialDate, schedules, employees, vacations, canManage }: MonthViewProps) {
    const router = useRouter();

    const [selectionStart, setSelectionStart] = useState<Date | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showSelectionAction, setShowSelectionAction] = useState(false);

    const monthStart = startOfMonth(initialDate);
    const monthEnd = endOfMonth(initialDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const dateFormat = "d";
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const handlePrevMonth = () => {
        router.push(`?date=${format(subMonths(initialDate, 1), 'yyyy-MM-dd')}`);
    };

    const handleNextMonth = () => {
        router.push(`?date=${format(addMonths(initialDate, 1), 'yyyy-MM-dd')}`);
    };

    const handleToday = () => {
        router.push(`?date=${format(new Date(), 'yyyy-MM-dd')}`);
    };

    // Group days into weeks (chunks of 7)
    const weeks = useMemo(() => {
        const result: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            result.push(days.slice(i, i + 7));
        }
        return result;
    }, [days]);

    // Pre-calculate schedules per week for the spanning overlay
    const schedulesByWeek = useMemo(() => {
        return weeks.map((weekDays) => {
            const weekStartLocal = new Date(weekDays[0]);
            weekStartLocal.setHours(0, 0, 0, 0);
            const weekEndLocal = new Date(weekDays[6]);
            weekEndLocal.setHours(23, 59, 59, 999);

            const blocks: any[] = [];
            const uniqueSchedules = new Map<string, typeof schedules[0]>();
            schedules.forEach(s => uniqueSchedules.set(s.id, s));

            for (const schedule of Array.from(uniqueSchedules.values())) {
                const sStart = parseISO(schedule.startTime);
                const sEnd = parseISO(schedule.endTime);

                // Intersect with this week row?
                if (sStart <= weekEndLocal && sEnd >= weekStartLocal) {
                    let startIndex = -1;
                    let endIndex = -1;

                    for (let i = 0; i < 7; i++) {
                        const dayStart = new Date(weekDays[i]); dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(weekDays[i]); dayEnd.setHours(23, 59, 59, 999);

                        if (sStart <= dayEnd && sEnd >= dayStart) {
                            if (startIndex === -1) startIndex = i;
                            endIndex = i;
                        }
                    }

                    if (startIndex !== -1) {
                        blocks.push({
                            schedule,
                            gridColumnStart: startIndex + 1,
                            gridColumnEnd: endIndex + 2,
                            startsBeforeWeek: sStart < weekStartLocal,
                            endsAfterWeek: sEnd > weekEndLocal,
                            startTime: sStart,
                            endTime: sEnd
                        });
                    }
                }
            }

            // Sort blocks: earlier start first, then longer duration
            blocks.sort((a, b) => {
                if (a.startTime.getTime() !== b.startTime.getTime()) {
                    return a.startTime.getTime() - b.startTime.getTime();
                }
                return (b.gridColumnEnd - b.gridColumnStart) - (a.gridColumnEnd - a.gridColumnStart);
            });

            return blocks;
        });
    }, [weeks, schedules]);

    const schedulesByDay = useMemo(() => {
        const map = new Map<string, number>();
        days.forEach(day => {
            const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

            let count = 0;
            schedules.forEach(s => {
                const sStart = parseISO(s.startTime);
                const sEnd = parseISO(s.endTime);
                if (sStart < dayEnd && sEnd > dayStart) count++;
            });
            map.set(format(day, 'yyyy-MM-dd'), count);
        });
        return map;
    }, [schedules, days]);

    // Pre-calculate vacations per week for the spanning overlay
    const vacationsByWeek = useMemo(() => {
        return weeks.map((weekDays) => {
            const weekStartLocal = new Date(weekDays[0]);
            weekStartLocal.setHours(0, 0, 0, 0);

            const weekEndExclusiveLocal = new Date(weekDays[6]);
            weekEndExclusiveLocal.setHours(0, 0, 0, 0);
            weekEndExclusiveLocal.setDate(weekEndExclusiveLocal.getDate() + 1);

            const blocks: any[] = [];

            for (const vacation of vacations) {
                const vStart = parseISO(vacation.startDate);
                const vEnd = parseISO(vacation.endDate);

                // Intersect with this week row using half-open boundaries
                if (vStart < weekEndExclusiveLocal && vEnd > weekStartLocal) {
                    let startIndex = -1;
                    let endIndexExclusive = -1;

                    for (let i = 0; i < 7; i++) {
                        const dayStart = new Date(weekDays[i]); dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(weekDays[i]); dayEnd.setHours(23, 59, 59, 999);

                        if (vStart < dayEnd && vEnd > dayStart) {
                            if (startIndex === -1) startIndex = i;
                            endIndexExclusive = i;
                        }
                    }

                    if (startIndex !== -1) {
                        blocks.push({
                            vacation,
                            gridColumnStart: startIndex + 1,
                            gridColumnEnd: endIndexExclusive + 2,
                            startsBeforeWeek: vStart < weekStartLocal,
                            endsAfterWeek: vEnd >= weekEndExclusiveLocal,
                            startDate: vStart,
                            endDate: vEnd
                        });
                    }
                }
            }

            blocks.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
            return blocks;
        });
    }, [weeks, vacations]);

    // Handle global mouse up to stop dragging if they release outside calendar
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                if (selectionStart) {
                    setShowSelectionAction(true);
                }
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isDragging, selectionStart, selectionEnd]);

    // Handle Escape key to clear selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowSelectionAction(false);
                setSelectionStart(null);
                setSelectionEnd(null);
                setIsDragging(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const rangeStart = selectionStart && selectionEnd ? (selectionStart < selectionEnd ? selectionStart : selectionEnd) : null;
    const rangeEnd = selectionStart && selectionEnd ? (selectionStart > selectionEnd ? selectionStart : selectionEnd) : null;

    const handleCellMouseDown = (day: Date) => {
        if (!canManage) return;

        // Reset and treat as new selection
        setShowSelectionAction(false);
        setSelectionStart(day);
        setSelectionEnd(day);
        setIsDragging(true);
    };

    const handleCellMouseEnter = (day: Date) => {
        if (!canManage || !isDragging) return;
        setSelectionEnd(day);
    };

    const handleCellMouseUp = (day: Date) => {
        if (!canManage || !isDragging) return;
        setIsDragging(false);
        // Whether it's the same day or a range, open the modal!
        if (selectionStart) {
            setShowSelectionAction(true);
        }
    };

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="flex flex-col h-[calc(100vh-200px)] bg-white rounded-lg shadow border">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">
                    {format(initialDate, 'MMMM yyyy')}
                </h2>
                <div className="flex items-center space-x-4">
                    <div className="flex items-center rounded-md border bg-white shadow-sm">
                        <button
                            onClick={handlePrevMonth}
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
                            onClick={handleNextMonth}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Next
                        </button>
                    </div>
                </div>

            </div>

            {/* Days Header */}
            <div className="grid grid-cols-7 border-b bg-gray-50">
                {weekDays.map((day) => (
                    <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 min-h-0 flex flex-col">
                {weeks.map((weekDays, weekIndex) => {
                    const weekBlocks = schedulesByWeek[weekIndex];

                    // Group blocks into lanes to calculate over-stacking per row
                    const maxLanes = 3;
                    const lanes: any[][] = [];
                    const overflowCounts = new Array(7).fill(0);

                    weekBlocks.forEach(block => {
                        let placed = false;
                        for (let l = 0; l < maxLanes; l++) {
                            if (!lanes[l]) lanes[l] = [];
                            // check if this lane is free for the block's column span
                            const overlap = lanes[l].some(existing =>
                                !(block.gridColumnEnd <= existing.gridColumnStart || block.gridColumnStart >= existing.gridColumnEnd)
                            );
                            if (!overlap) {
                                lanes[l].push(block);
                                placed = true;
                                break;
                            }
                        }
                        if (!placed) {
                            // Overflowing blocks increment the count for every day they span
                            for (let c = block.gridColumnStart - 1; c < block.gridColumnEnd - 1; c++) {
                                overflowCounts[c]++;
                            }
                        }
                    });

                    // Flatten back the successfully placed visible blocks
                    const visibleBlocks = lanes.flat();

                    return (
                        <div key={weekIndex} className="relative flex-1 grid grid-cols-7 border-b group">
                            {/* 1) Background Day Cells (Interactive) */}
                            {weekDays.map((day, colIndex) => {
                                const dateKey = format(day, 'yyyy-MM-dd');
                                const totalSchedulesCount = schedulesByDay.get(dateKey) || 0;
                                const isToday = isSameDay(day, new Date());
                                const isCurrentMonth = isSameMonth(day, monthStart);

                                const isSelected = selectionStart && selectionEnd && (
                                    (day >= selectionStart && day <= selectionEnd) ||
                                    (day <= selectionStart && day >= selectionEnd)
                                );
                                const isRangeStart = rangeStart && isSameDay(day, rangeStart);
                                const isRangeEnd = rangeEnd && isSameDay(day, rangeEnd);

                                return (
                                    <div
                                        key={day.toISOString()}
                                        onMouseDown={(e) => {
                                            if (e.target !== e.currentTarget) return; // ignore clicks on foreground items
                                            handleCellMouseDown(day);
                                        }}
                                        onMouseEnter={() => handleCellMouseEnter(day)}
                                        onMouseUp={() => handleCellMouseUp(day)}
                                        className={cn(
                                            "relative min-h-[100px] p-2 border-r flex flex-col transition-colors cursor-cell",
                                            isSelected ? "bg-indigo-50/60" : "hover:bg-gray-50",
                                            !isSelected && !isCurrentMonth && "bg-gray-50/50 text-gray-400",
                                            !isSelected && isToday && "bg-blue-50/30",
                                            isRangeStart && "border-l-[3px] border-l-indigo-500",
                                            isRangeEnd && "border-r-[3px] border-r-indigo-500"
                                        )}
                                    >
                                        <div className="flex justify-between items-start pointer-events-none">
                                            <span className={cn(
                                                "text-sm font-medium h-6 w-6 flex items-center justify-center rounded-full transition-colors",
                                                isToday && !isSelected && "bg-blue-600 text-white",
                                                isSelected && isToday && "bg-indigo-600 text-white"
                                            )}>
                                                {format(day, dateFormat)}
                                            </span>
                                            {totalSchedulesCount > 0 && (
                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 rounded-full z-10">
                                                    {totalSchedulesCount}
                                                </span>
                                            )}
                                        </div>
                                        {/* Quick Create overlay anchored to the cell */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                            {canManage && !isDragging && !showSelectionAction && (
                                                <div className="group/cell w-full h-full flex items-center justify-center">
                                                    <CalendarCellQuickCreate date={day} employees={employees} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* 2) Vacation Layer (z-0) Underneath schedules */}
                            <div className="absolute inset-0 pt-8 pb-1 px-1 z-0 pointer-events-none">
                                <div className="grid grid-cols-7 gap-y-1 h-full content-start">
                                    {vacationsByWeek[weekIndex].map((block, idx) => {
                                        const v = block.vacation;
                                        return (
                                            <div
                                                key={`vacation-${v.id}-${weekIndex}-${idx}`}
                                                className={cn(
                                                    "mx-0.5 px-1.5 py-0.5 text-[10px] sm:text-xs text-orange-700 bg-orange-100/80 border border-orange-200 pointer-events-auto opacity-70 truncate",
                                                    block.startsBeforeWeek ? "rounded-l-none border-l-0 ml-0" : "rounded-l-full",
                                                    block.endsAfterWeek ? "rounded-r-none mr-0" : "rounded-r-full"
                                                )}
                                                style={{ gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}` }}
                                                title={`🌴 ${v.employee.name} — ${v.reason || 'Vacation'} (${format(block.startDate, 'MMM d')} - ${format(block.endDate, 'MMM d')})`}
                                            >
                                                <span className="font-semibold truncate mr-2">🌴 {v.employee.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3) Foreground Spanning Overlay (z-10) */}
                            <div className="absolute inset-0 pt-8 pb-1 px-1 pointer-events-none">
                                <div className="grid grid-cols-7 gap-y-1 h-full content-start">
                                    {visibleBlocks.map((block, idx) => {
                                        const schedule = block.schedule;
                                        const isCancelled = schedule.status === 'CANCELLED';
                                        const catColor = schedule.category ? (schedule.category as any).color : '#4f46e5';

                                        return (
                                            <div
                                                key={`${schedule.id}-${weekIndex}-${idx}`}
                                                className={cn(
                                                    "mx-0.5 px-1.5 py-0.5 text-[10px] sm:text-xs truncate rounded cursor-pointer pointer-events-auto transition-opacity z-10 focus:outline-none focus:ring-2 focus:ring-indigo-500",
                                                    isCancelled ? 'opacity-60 line-through' : 'hover:opacity-90',
                                                    block.startsBeforeWeek ? "rounded-l-none border-l-0 ml-0" : "rounded-l border-l-2",
                                                    block.endsAfterWeek ? "rounded-r-none mr-0" : "rounded-r"
                                                )}
                                                style={{
                                                    gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                                    borderColor: isCancelled ? '#d1d5db' : catColor,
                                                    backgroundColor: isCancelled ? '#f9fafb' : `${catColor}15`,
                                                    color: isCancelled ? '#6b7280' : catColor
                                                }}
                                                title={`${schedule.title}${schedule.category ? ` (${(schedule.category as any).name})` : ''}`}
                                                role="button"
                                                tabIndex={0}
                                                aria-label={`Schedule: ${schedule.title}, ${format(block.startTime, 'MMM d')} to ${format(block.endTime, 'MMM d')}`}
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
                                                {schedule.title}
                                            </div>
                                        );
                                    })}

                                    {/* Render Overflow Chips */}
                                    {overflowCounts.map((count, colIdx) => {
                                        if (count === 0) return null;
                                        const targetDate = format(weekDays[colIdx], 'yyyy-MM-dd');
                                        return (
                                            <div
                                                key={`overflow-${colIdx}`}
                                                className="text-[10px] text-gray-500 font-medium px-1.5 pointer-events-auto hover:text-gray-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded"
                                                style={{ gridColumn: colIdx + 1, gridRow: maxLanes + 1 }}
                                                role="button"
                                                tabIndex={0}
                                                aria-label={`View ${count} more schedules on ${targetDate}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/calendar/day?date=${targetDate}`);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        router.push(`/calendar/day?date=${targetDate}`);
                                                    }
                                                }}
                                            >
                                                + {count} more
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Range Selection Action Modal */}
            {showSelectionAction && rangeStart && rangeEnd && (
                <SelectionActionModal
                    startDate={rangeStart}
                    endDate={rangeEnd}
                    employees={employees}
                    onClose={() => {
                        setShowSelectionAction(false);
                        setSelectionStart(null);
                        setSelectionEnd(null);
                    }}
                />
            )}
        </div>
    );
}
