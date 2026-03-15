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
import { RescheduleConfirmModal } from '@/components/schedules/reschedule-confirm-modal';
import { getDnDEligibility } from '@/lib/dnd/eligibility';

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
    const [confirmReschedule, setConfirmReschedule] = useState<{ schedule: SerializedScheduleWithAssignments; newStart: Date; newEnd: Date } | null>(null);

    const lastToastTime = useRef<number>(0);

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
            }
        };
        window.addEventListener('pointerup', handleGlobalPointerUp);
        return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
    }, [isDragging, selectionStart, draggedSchedule]);

    // --- DnD reschedule handlers ---
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
        if (!canManage || !draggedSchedule) return;
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
        if (!canManage || !draggedSchedule) return;
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
    };

    const handleRescheduleComplete = () => {
        setConfirmReschedule(null);
        router.refresh();
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
                setConfirmReschedule(null);
                setDraggedSchedule(null);
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
            const isOriginalDragged = draggedSchedule ? schedule.id === draggedSchedule.schedule.id : false;

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
                    isOriginalDragged
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
            return 0;
        });

        return blocks;
    }, [schedules, days, start, end, draggedSchedule]);

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
                                        // Legacy cell-level drops, kept for safety when draggedSchedule misses
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
                        <div className="relative z-10 grid grid-cols-7 gap-y-2 p-2">
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
                                            "group relative flex flex-col p-2 text-xs border shadow-sm hover:shadow-md transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500",
                                            block.startsBeforeWeek ? "rounded-l-sm border-l" : "rounded-l-md",
                                            block.endsAfterWeek ? "rounded-r-sm border-r" : "rounded-r-md",
                                            block.isOriginalDragged && "opacity-0 pointer-events-none",
                                            (!block.isOriginalDragged && !!draggedSchedule) ? "pointer-events-none" : "pointer-events-auto"
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
                                            {(() => {
                                                const eligibility = getDnDEligibility(schedule, canManage);
                                                return (
                                                    <div
                                                        draggable={eligibility.draggable}
                                                        onPointerDown={(e) => {
                                                            if (!eligibility.draggable) {
                                                                const now = Date.now();
                                                                if (now - lastToastTime.current > 1200) {
                                                                    toast.error(eligibility.reason || '이동할 수 없는 항목입니다.');
                                                                    lastToastTime.current = now;
                                                                }
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            } else {
                                                                // DO NOTHING (allow native HTML drag)
                                                            }
                                                        }}
                                                        onDragStart={(e) => {
                                                            if (!eligibility.draggable) {
                                                                e.preventDefault();
                                                                return;
                                                            }
                                                            e.stopPropagation();

                                                            const img = new Image();
                                                            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                                                            e.dataTransfer.setDragImage(img, 0, 0);

                                                            setDraggedSchedule({
                                                                schedule,
                                                                originalStart: parseISO(schedule.startTime),
                                                                originalEnd: parseISO(schedule.endTime)
                                                            });
                                                        }}
                                                        onDragEnd={() => {
                                                            setDraggedSchedule(null);
                                                        }}
                                                        className={cn(
                                                            "ml-auto flex items-center justify-center w-4 rounded transition-opacity",
                                                            eligibility.draggable
                                                                ? "cursor-grab hover:bg-black/10 opacity-0 group-hover:opacity-60 hover:!opacity-100"
                                                                : "cursor-not-allowed opacity-30"
                                                        )}
                                                        title={eligibility.draggable ? "Drag to reschedule" : eligibility.reason}
                                                        aria-label={eligibility.draggable ? "Drag to reschedule" : "Cannot reschedule"}
                                                    >
                                                        <span className="text-[10px] select-none leading-none tracking-tighter" style={{ marginTop: '-2px' }}>⠿</span>
                                                    </div>
                                                );
                                            })()}
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

            {/* A-08 Reschedule Staffing Decision Modal */}
            {confirmReschedule && (
                <RescheduleConfirmModal
                    schedule={confirmReschedule.schedule}
                    newStart={confirmReschedule.newStart}
                    newEnd={confirmReschedule.newEnd}
                    onComplete={handleRescheduleComplete}
                    onCancel={() => setConfirmReschedule(null)}
                />
            )}
        </div>
    );
}
