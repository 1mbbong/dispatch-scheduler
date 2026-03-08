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
import { useToast } from '@/components/ui/toast';
import { SerializedScheduleWithAssignments, SerializedEmployeeWithStats, SerializedVacationWithEmployee, SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';
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
    peopleLevel?: number;
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
    offices = [],
    peopleLevel = 0,
}: WeekViewProps) {
    const router = useRouter();
    const toast = useToast();

    // Drag-to-select state
    const [selectionStart, setSelectionStart] = useState<Date | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showSelectionAction, setShowSelectionAction] = useState(false);
    const pointerOrigin = useRef<{ x: number; y: number } | null>(null);

    // DnD reschedule state
    const [draggedSchedule, setDraggedSchedule] = useState<{ schedule: SerializedScheduleWithAssignments; originalStart: Date; originalEnd: Date } | null>(null);
    const [hoveredDropDate, setHoveredDropDate] = useState<string | null>(null); // YYYY-MM-DD
    const [confirmReschedule, setConfirmReschedule] = useState<{ schedule: SerializedScheduleWithAssignments; newStart: Date; newEnd: Date } | null>(null);
    const [isRescheduling, setIsRescheduling] = useState(false);

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

    const handleCellPointerDown = (e: React.PointerEvent, day: Date) => {
        if (e.button !== 0) return;
        pointerOrigin.current = { x: e.clientX, y: e.clientY };
        setSelectionStart(day);
        setSelectionEnd(day);
        setIsDragging(false);
        setShowSelectionAction(false);
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
            // Finished dragging — show selection action for the range
            setSelectionEnd(day);
        } else {
            // Click (no drag) — treat as single-day selection (matches MonthView)
            setSelectionStart(day);
            setSelectionEnd(day);
        }

        // Both click and drag open SelectionActionModal
        if (canManage) setShowSelectionAction(true);

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
            if (draggedSchedule) {
                setDraggedSchedule(null);
                setHoveredDropDate(null);
            }
        };
        window.addEventListener('pointerup', handleGlobalPointerUp);
        return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
    }, [isDragging, selectionStart, draggedSchedule]);

    // --- DnD reschedule handlers ---
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
        if (isDragging || !canManage) return;
        e.preventDefault();

        if (draggedSchedule) {
            const dateStr = format(day, 'yyyy-MM-dd');
            if (hoveredDropDate !== dateStr) {
                setHoveredDropDate(dateStr);
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
        if (isDragging || !canManage || !draggedSchedule) return;
        e.preventDefault();

        const { schedule, originalStart, originalEnd } = draggedSchedule;
        const durationMs = originalEnd.getTime() - originalStart.getTime();

        const newStart = new Date(day);
        newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), originalStart.getMilliseconds());
        const newEnd = new Date(newStart.getTime() + durationMs);

        // Local-day comparison to avoid UTC off-by-one
        const dayChanged = format(newStart, 'yyyy-MM-dd') !== format(originalStart, 'yyyy-MM-dd');

        if (dayChanged) {
            setConfirmReschedule({ schedule, newStart, newEnd });
        }
        setDraggedSchedule(null);
        setHoveredDropDate(null);
    };

    const executeReschedule = async () => {
        if (!confirmReschedule) return;
        setIsRescheduling(true);
        try {
            const res = await fetch(`/api/schedules/${confirmReschedule.schedule.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startTime: confirmReschedule.newStart.toISOString(),
                    endTime: confirmReschedule.newEnd.toISOString(),
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                toast.error(`Error: ${data.error || 'Conflict detected or update failed'}`);
                setConfirmReschedule(null);
                return;
            }

            toast.success('Schedule updated.');
            setConfirmReschedule(null);
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Error updating schedule');
            setConfirmReschedule(null);
        } finally {
            setIsRescheduling(false);
        }
    };

    // Scroll lock for confirm modal
    useEffect(() => {
        if (!confirmReschedule) return;
        const originalStyle = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, [confirmReschedule]);

    // Escape to clear selection
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectionStart(null);
                setSelectionEnd(null);
                setShowSelectionAction(false);
                if (!isRescheduling) setConfirmReschedule(null);
                setDraggedSchedule(null);
                setHoveredDropDate(null);
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
            // If dragging, ignore the original schedule
            if (draggedSchedule && schedule.id === draggedSchedule.schedule.id) {
                continue;
            }

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

        if (draggedSchedule && hoveredDropDate) {
            const { schedule, originalStart, originalEnd } = draggedSchedule;
            const durationMs = originalEnd.getTime() - originalStart.getTime();

            const hoverDay = new Date(`${hoveredDropDate}T00:00:00`);
            const newStart = new Date(hoverDay);
            newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), originalStart.getMilliseconds());
            const newEnd = new Date(newStart.getTime() + durationMs);

            let startIndex = -1;
            let endIndex = -1;

            for (let i = 0; i < 7; i++) {
                const dayStart = new Date(days[i]); dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(days[i]); dayEnd.setHours(23, 59, 59, 999);

                // Intersects with this day?
                const intersects = newStart < dayEnd && newEnd > dayStart;
                if (intersects) {
                    if (startIndex === -1) startIndex = i;
                    endIndex = i;
                }
            }

            if (startIndex !== -1) {
                blocks.push({
                    schedule: { ...schedule, id: '__preview__' },
                    isPreview: true,
                    gridColumnStart: startIndex + 1,
                    gridColumnEnd: endIndex + 2,
                    startsBeforeWeek: newStart < start,
                    endsAfterWeek: newEnd > end,
                    startTime: newStart,
                    endTime: newEnd,
                });
            }
        }

        // Sort blocks: earlier start first, then longer duration first
        blocks.sort((a, b) => {
            if (a.startTime.getTime() !== b.startTime.getTime()) {
                return a.startTime.getTime() - b.startTime.getTime();
            }
            const durationDiff = (b.gridColumnEnd - b.gridColumnStart) - (a.gridColumnEnd - a.gridColumnStart);
            if (durationDiff !== 0) return durationDiff;
            if (a.isPreview && !b.isPreview) return 1;
            if (!a.isPreview && b.isPreview) return -1;
            return 0;
        });

        return blocks;
    }, [schedules, days, start, end, draggedSchedule, hoveredDropDate]);

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
                                    {peopleLevel >= 2 && (() => {
                                        const dayD = new Date(day); dayD.setHours(0, 0, 0, 0);
                                        const dayE = new Date(day); dayE.setHours(23, 59, 59, 999);
                                        const vacOnDay = vacations.filter(v => {
                                            const vs = new Date(v.startDate); const ve = new Date(v.endDate);
                                            return vs < dayE && ve > dayD;
                                        }).length;
                                        const schedEmps = new Set(
                                            schedules.filter(s => {
                                                const ss = new Date(s.startTime); const se = new Date(s.endTime);
                                                return ss < dayE && se > dayD;
                                            }).flatMap(s => s.assignments?.map((a: any) => a.employee?.id) || [])
                                        ).size;
                                        const avail = Math.max(0, employees.length - vacOnDay - schedEmps);
                                        return (
                                            <div className="flex gap-0.5 mt-0.5 justify-center">
                                                <span className="text-[8px] px-0.5 rounded bg-green-50 text-green-700">A:{avail}</span>
                                                {vacOnDay > 0 && <span className="text-[8px] px-0.5 rounded bg-amber-50 text-amber-600">V:{vacOnDay}</span>}
                                            </div>
                                        );
                                    })()}
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

                                return (
                                    <div
                                        key={format(day, 'yyyy-MM-dd')}
                                        className={cn(
                                            "h-full pointer-events-auto relative cursor-cell select-none transition-colors",
                                            isSelected ? "bg-indigo-50/60" : "bg-gray-50/30 hover:bg-gray-100/50"
                                        )}
                                        onPointerDown={(e) => handleCellPointerDown(e, day)}
                                        onPointerMove={(e) => handleCellPointerMove(e, day)}
                                        onPointerUp={() => handleCellPointerUp(day)}
                                        onDragOver={(e) => handleDragOver(e, day)}
                                        onDrop={(e) => handleDrop(e, day)}
                                    />
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

                                if (block.isPreview) {
                                    return (
                                        <div
                                            key={`preview-${schedule.id}`}
                                            className={cn(
                                                "group relative flex flex-col p-2 text-xs transition-all pointer-events-none select-none",
                                                "opacity-60 border-2 border-dashed border-gray-400 bg-gray-100",
                                                block.startsBeforeWeek ? "rounded-l-none border-l-0" : "rounded-l-md",
                                                block.endsAfterWeek ? "rounded-r-none border-r-0" : "rounded-r-md"
                                            )}
                                            style={{
                                                gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                            }}
                                        >
                                            <div className="w-full h-full min-h-[32px]" />
                                        </div>
                                    );
                                }

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
                                            {(() => {
                                                const wlt = (schedule as any).workLocationType;
                                                const chip = wlt === 'OFFICE' && (schedule as any).office?.name
                                                    ? (schedule as any).office.name
                                                    : wlt === 'REMOTE' ? 'WFH'
                                                        : (schedule.customerArea as any)?.name || null;
                                                return chip ? (
                                                    <span className="shrink-0 text-[9px] px-1 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium">
                                                        {chip}
                                                    </span>
                                                ) : null;
                                            })()}
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
                                            {/* Drag Handle */}
                                            {canManage && (
                                                <div
                                                    draggable={true}
                                                    onDragStart={(e) => {
                                                        e.stopPropagation();
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        e.dataTransfer.setData('text/plain', schedule.id);

                                                        const img = new Image();
                                                        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                                                        e.dataTransfer.setDragImage(img, 0, 0);

                                                        setDraggedSchedule({
                                                            schedule,
                                                            originalStart: parseISO(schedule.startTime),
                                                            originalEnd: parseISO(schedule.endTime)
                                                        });
                                                    }}
                                                    onDragEnd={() => setDraggedSchedule(null)}
                                                    className="ml-auto flex items-center justify-center w-4 cursor-grab hover:bg-black/10 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                                                    title="Drag to reschedule"
                                                    aria-label="Drag to reschedule"
                                                >
                                                    <span className="text-[10px] select-none leading-none tracking-tighter" style={{ marginTop: '-2px' }}>⠿</span>
                                                </div>
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
                                        {peopleLevel >= 1 && (
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
                                        )}
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

            {/* DnD Confirm Reschedule Modal */}
            {confirmReschedule && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="confirm-modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 z-40 bg-transparent backdrop-blur-sm backdrop-brightness-90 transition-all" aria-hidden="true" onClick={() => !isRescheduling && setConfirmReschedule(null)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="relative z-50 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="confirm-modal-title">
                                    Confirm Reschedule
                                </h3>
                                <div className="mt-2 text-sm text-gray-600 space-y-3">
                                    <p>Are you sure you want to move <strong>{confirmReschedule.schedule.title}</strong>?</p>
                                    <div className="bg-gray-50 rounded p-3 border">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-gray-500 w-12">From:</span>
                                            <span className="font-medium text-red-600 line-through">
                                                {format(parseISO(confirmReschedule.schedule.startTime), 'MMM d, yyyy HH:mm')} - {format(parseISO(confirmReschedule.schedule.endTime), 'HH:mm')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500 w-12">To:</span>
                                            <span className="font-medium text-green-700">
                                                {format(confirmReschedule.newStart, 'MMM d, yyyy HH:mm')} - {format(confirmReschedule.newEnd, 'HH:mm')}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="rounded-md bg-amber-50 p-3 border border-amber-200 mt-4">
                                        <div className="flex">
                                            <div className="ml-3">
                                                <h3 className="text-sm font-medium text-amber-800">Note</h3>
                                                <div className="mt-1 text-sm text-amber-700">
                                                    Per-day assignments are NOT automatically shifted. You will need to re-verify assignments manually after moving.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse border-t">
                                <button
                                    type="button"
                                    onClick={executeReschedule}
                                    disabled={isRescheduling}
                                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                                >
                                    {isRescheduling ? 'Saving...' : 'Confirm'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => !isRescheduling && setConfirmReschedule(null)}
                                    disabled={isRescheduling}
                                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
