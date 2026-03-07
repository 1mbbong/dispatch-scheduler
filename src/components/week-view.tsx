'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
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
import { isCancelledStatus } from '@/lib/labels';
import { SerializedScheduleWithAssignments, SerializedEmployeeWithStats, SerializedVacationWithEmployee, SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';
import { CalendarCellQuickCreate } from '@/components/calendar-cell-quick-create';
import { SelectionActionModal } from '@/components/selection-action-modal';

interface WeekViewProps {
    initialDate: Date;
    schedules: SerializedScheduleWithAssignments[];
    employees: SerializedEmployeeWithStats[];
    vacations: SerializedVacationWithEmployee[];
    canManage: boolean;
    customerAreas?: SerializedCustomerArea[];
    scheduleStatuses?: SerializedScheduleStatus[];
    workTypes?: SerializedWorkType[];
    offices?: { id: string, name: string }[];
}

export function WeekView({
    initialDate,
    schedules,
    employees,
    vacations,
    canManage,
    customerAreas = [],
    scheduleStatuses = [],
    workTypes = [],
    offices = []
}: WeekViewProps) {
    const router = useRouter();

    // Drag-to-select state
    const [selectionStart, setSelectionStart] = useState<Date | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showSelectionAction, setShowSelectionAction] = useState(false);
    const pointerOrigin = useRef<{ x: number; y: number } | null>(null);

    // Click-to-quick-create state
    const [quickCreateDay, setQuickCreateDay] = useState<Date | null>(null);

    const start = startOfWeek(initialDate, { weekStartsOn: 0 });
    const end = endOfWeek(initialDate, { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });

    // Normalised range (always start <= end)
    const rangeStart = selectionStart && selectionEnd
        ? (selectionStart <= selectionEnd ? selectionStart : selectionEnd)
        : null;
    const rangeEnd = selectionStart && selectionEnd
        ? (selectionStart <= selectionEnd ? selectionEnd : selectionStart)
        : null;

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

    // --- Pointer handlers for cells ---
    const handleCellPointerDown = (e: React.PointerEvent, day: Date) => {
        if (e.button !== 0) return;
        pointerOrigin.current = { x: e.clientX, y: e.clientY };
        setSelectionStart(day);
        setSelectionEnd(day);
        setIsDragging(false);
        setShowSelectionAction(false);
        setQuickCreateDay(null);
    };

    const handleCellPointerMove = (e: React.PointerEvent, day: Date) => {
        if (!pointerOrigin.current) return;
        const dx = Math.abs(e.clientX - pointerOrigin.current.x);
        const dy = Math.abs(e.clientY - pointerOrigin.current.y);
        if (dx > 6 || dy > 6) {
            if (!isDragging) setIsDragging(true);
            setSelectionEnd(day);
        }
    };

    const handleCellPointerUp = (day: Date) => {
        if (!pointerOrigin.current) return;

        if (isDragging) {
            // Finished dragging — show selection action
            setSelectionEnd(day);
            setShowSelectionAction(true);
        } else {
            // Click (no meaningful drag) — open quick create
            if (canManage) setQuickCreateDay(day);
            setSelectionStart(null);
            setSelectionEnd(null);
        }

        pointerOrigin.current = null;
        setIsDragging(false);
    };

    // Global pointer-up to catch releases outside cells
    useEffect(() => {
        const handleGlobalPointerUp = () => {
            if (pointerOrigin.current) {
                if (isDragging && selectionStart) {
                    setShowSelectionAction(true);
                } else {
                    setSelectionStart(null);
                    setSelectionEnd(null);
                }
                pointerOrigin.current = null;
                setIsDragging(false);
            }
        };
        window.addEventListener('pointerup', handleGlobalPointerUp);
        return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
    }, [isDragging, selectionStart]);

    // Escape to clear selection
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectionStart(null);
                setSelectionEnd(null);
                setShowSelectionAction(false);
                setQuickCreateDay(null);
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, []);

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
                                </div>
                            );
                        })}
                    </div>

                    {/* Body Area */}
                    <div className="flex-1 relative">
                        {/* Background columns for clicks & borders */}
                        <div className="absolute inset-0 grid grid-cols-7 divide-x pointer-events-none">
                            {days.map(day => {
                                const isSelected = selectionStart && selectionEnd && (isDragging || showSelectionAction) && (
                                    (day >= selectionStart && day <= selectionEnd) ||
                                    (day <= selectionStart && day >= selectionEnd)
                                );
                                const selectionActive = isDragging || showSelectionAction;
                                const isForceOpen = !selectionActive && quickCreateDay !== null && isSameDay(day, quickCreateDay);

                                return (
                                    <div
                                        key={format(day, 'yyyy-MM-dd')}
                                        className={cn(
                                            "h-full pointer-events-auto group/cell relative cursor-cell select-none",
                                            isSelected ? "bg-indigo-50/60" : "bg-gray-50/30"
                                        )}
                                        onPointerDown={(e) => handleCellPointerDown(e, day)}
                                        onPointerMove={(e) => handleCellPointerMove(e, day)}
                                        onPointerUp={() => handleCellPointerUp(day)}
                                    >
                                        {/* Quick Create overlay — hidden during selection */}
                                        {!selectionActive && (
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                {canManage && (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        <CalendarCellQuickCreate
                                                            date={day}
                                                            employees={employees}
                                                            customerAreas={customerAreas}
                                                            scheduleStatuses={scheduleStatuses}
                                                            workTypes={workTypes}
                                                            offices={offices}
                                                            forceOpen={isForceOpen}
                                                            onForceOpenHandled={() => setQuickCreateDay(null)}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
                                const isCancelled = isCancelledStatus(schedule.scheduleStatus);
                                const categoryColor = schedule.customerArea ? (schedule.customerArea as any).color : '#6366f1';

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
                                            ...(isCancelled ? {
                                                opacity: 0.6,
                                                borderStyle: 'dashed',
                                                backgroundColor: '#f9fafb',
                                                borderColor: '#d1d5db',
                                                borderLeftColor: '#9ca3af'
                                            } : {})
                                        }}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Schedule: ${schedule.title}, ${timeLabel}`}
                                        onPointerDown={(e) => e.stopPropagation()} // Prevent cell click logic
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
                                        <div className="flex items-center gap-1 overflow-hidden shrink-0">
                                            <div className={cn("font-semibold truncate", isCancelled ? 'text-gray-500 line-through' : 'text-gray-900')}>
                                                {schedule.title}
                                            </div>
                                            {/* Status Badge */}
                                            {schedule.scheduleStatus && !isCancelled && (
                                                <span
                                                    className="shrink-0 text-[9px] px-1 rounded border"
                                                    style={{
                                                        color: (schedule.scheduleStatus as any).color || '#374151',
                                                        borderColor: (schedule.scheduleStatus as any).color || '#d1d5db',
                                                        backgroundColor: `${(schedule.scheduleStatus as any).color || '#6b7280'}15`
                                                    }}>
                                                    {(schedule.scheduleStatus as any).name}
                                                </span>
                                            )}
                                            {/* Cancelled Marker */}
                                            {isCancelled && (
                                                <span className="shrink-0 text-[8px] px-1 rounded border border-gray-300 text-gray-500 bg-gray-100 uppercase tracking-wider">
                                                    취소
                                                </span>
                                            )}
                                        </div>

                                        <div className={isCancelled ? 'text-gray-400 mt-0.5 shrink-0 truncate' : 'text-slate-700 mt-0.5 shrink-0 truncate'}>
                                            {schedule.customerArea && (
                                                <span className="font-medium mr-1" style={{ color: isCancelled ? 'inherit' : categoryColor }}>
                                                    [{(schedule.customerArea as any).name}]
                                                </span>
                                            )}
                                            {timeLabel}
                                        </div>

                                        {/* Work Types */}
                                        {schedule.workTypes && schedule.workTypes.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1 mt-1 shrink-0 overflow-hidden">
                                                {schedule.workTypes.slice(0, 2).map((wt: any) => (
                                                    <span key={wt.workType.id} className="text-[9px] px-1.5 rounded bg-black/5 border border-black/10 text-gray-600 truncate max-w-[80px]">
                                                        {wt.workType.name}
                                                    </span>
                                                ))}
                                                {schedule.workTypes.length > 2 && (
                                                    <span className="text-[9px] px-1 rounded bg-black/5 border border-black/10 text-gray-600">
                                                        +{schedule.workTypes.length - 2}
                                                    </span>
                                                )}
                                            </div>
                                        )}

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
                    customerAreas={customerAreas}
                    scheduleStatuses={scheduleStatuses}
                    workTypes={workTypes}
                    offices={offices}
                />
            )}
        </div>
    );
}
