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
import { isCancelledStatus } from '@/lib/labels';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/toast';
import { SerializedScheduleWithAssignments, SerializedEmployeeWithStats, SerializedVacationWithEmployee, SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';
import { CalendarCellQuickCreate } from '@/components/calendar-cell-quick-create';
import { SelectionActionModal } from '@/components/selection-action-modal';

interface MonthViewProps {
    initialDate: Date;
    schedules: SerializedScheduleWithAssignments[];
    employees: SerializedEmployeeWithStats[];
    vacations: SerializedVacationWithEmployee[];
    canManage: boolean;
    rescheduleSnapshots?: Record<string, { prevStartTime: string, prevEndTime: string }>;
    customerAreas?: SerializedCustomerArea[];
    scheduleStatuses?: SerializedScheduleStatus[];
    workTypes?: SerializedWorkType[];
    offices?: { id: string, name: string }[];
    showDayCounts?: boolean;
    peopleLevel?: number;
}

const LANE_CAP_ENABLED = false; // future tenant setting hook
const LANE_CAP_MAX = 3;

export function MonthView({
    // ...
    // other props down below

    initialDate,
    schedules,
    employees,
    vacations,
    canManage,
    rescheduleSnapshots = {},
    customerAreas = [],
    scheduleStatuses = [],
    workTypes = [],
    offices = [],
    showDayCounts = true,
    peopleLevel = 0,
}: MonthViewProps) {
    const router = useRouter();

    const [selectionStart, setSelectionStart] = useState<Date | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<Date | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showSelectionAction, setShowSelectionAction] = useState(false);

    // Drag-and-drop reschedule state
    const [draggedSchedule, setDraggedSchedule] = useState<{ schedule: SerializedScheduleWithAssignments; originalStart: Date; originalEnd: Date } | null>(null);
    const [hoveredDropDate, setHoveredDropDate] = useState<string | null>(null); // YYYY-MM-DD
    const [confirmReschedule, setConfirmReschedule] = useState<{ schedule: SerializedScheduleWithAssignments; newStart: Date; newEnd: Date } | null>(null);
    const [isRescheduling, setIsRescheduling] = useState(false);
    const toast = useToast();

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
                const isOriginalDragged = draggedSchedule ? schedule.id === draggedSchedule.schedule.id : false;

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
                            endTime: sEnd,
                            isOriginalDragged
                        });
                    }
                }
            }

            // Inject the Hover Preview block if calculating
            if (draggedSchedule && hoveredDropDate) {
                const { schedule, originalStart, originalEnd } = draggedSchedule;
                const durationMs = originalEnd.getTime() - originalStart.getTime();

                const hoverDay = new Date(`${hoveredDropDate}T00:00:00`);
                // Assume drop defaults to the original local start HH:MM
                const newStart = new Date(hoverDay);
                newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), originalStart.getMilliseconds());
                const newEnd = new Date(newStart.getTime() + durationMs);

                if (newStart <= weekEndLocal && newEnd >= weekStartLocal) {
                    let startIndex = -1;
                    let endIndex = -1;

                    for (let i = 0; i < 7; i++) {
                        const dayStart = new Date(weekDays[i]); dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(weekDays[i]); dayEnd.setHours(23, 59, 59, 999);

                        if (newStart <= dayEnd && newEnd >= dayStart) {
                            if (startIndex === -1) startIndex = i;
                            endIndex = i;
                        }
                    }

                    if (startIndex !== -1) {
                        blocks.push({
                            schedule: { ...schedule, id: '__preview__' },
                            isPreview: true, // Special tag for ghost styling
                            gridColumnStart: startIndex + 1,
                            gridColumnEnd: endIndex + 2,
                            startsBeforeWeek: newStart < weekStartLocal,
                            endsAfterWeek: newEnd > weekEndLocal,
                            startTime: newStart,
                            endTime: newEnd
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
    }, [weeks, schedules, draggedSchedule, hoveredDropDate]);

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

    // Pre-calculate shadow blocks per week for rescheduled items
    const shadowsByWeek = useMemo(() => {
        if (!rescheduleSnapshots || Object.keys(rescheduleSnapshots).length === 0) {
            return weeks.map(() => []);
        }

        return weeks.map((weekDays) => {
            const weekStartLocal = new Date(weekDays[0]);
            weekStartLocal.setHours(0, 0, 0, 0);
            const weekEndLocal = new Date(weekDays[6]);
            weekEndLocal.setHours(23, 59, 59, 999);

            const blocks: any[] = [];
            const uniqueSchedules = new Map<string, typeof schedules[0]>();
            schedules.forEach(s => uniqueSchedules.set(s.id, s));

            for (const schedule of Array.from(uniqueSchedules.values())) {
                const snapshot = rescheduleSnapshots[schedule.id];
                if (!snapshot) continue;

                const prevStart = parseISO(snapshot.prevStartTime);
                const prevEnd = parseISO(snapshot.prevEndTime);

                // Intersect with this week row?
                if (prevStart <= weekEndLocal && prevEnd >= weekStartLocal) {
                    let startIndex = -1;
                    let endIndex = -1;

                    for (let i = 0; i < 7; i++) {
                        const dayStart = new Date(weekDays[i]); dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(weekDays[i]); dayEnd.setHours(23, 59, 59, 999);

                        if (prevStart <= dayEnd && prevEnd >= dayStart) {
                            if (startIndex === -1) startIndex = i;
                            endIndex = i;
                        }
                    }

                    if (startIndex !== -1) {
                        blocks.push({
                            schedule,
                            gridColumnStart: startIndex + 1,
                            gridColumnEnd: endIndex + 2,
                            startsBeforeWeek: prevStart < weekStartLocal,
                            endsAfterWeek: prevEnd > weekEndLocal,
                            startTime: prevStart,
                            endTime: prevEnd
                        });
                    }
                }
            }

            blocks.sort((a, b) => {
                if (a.startTime.getTime() !== b.startTime.getTime()) {
                    return a.startTime.getTime() - b.startTime.getTime();
                }
                return (b.gridColumnEnd - b.gridColumnStart) - (a.gridColumnEnd - a.gridColumnStart);
            });

            return blocks;
        });
    }, [weeks, schedules, rescheduleSnapshots]);

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

            blocks.sort((a, b) => {
                if (a.startDate.getTime() !== b.startDate.getTime()) {
                    return a.startDate.getTime() - b.startDate.getTime();
                }
                return (b.gridColumnEnd - b.gridColumnStart) - (a.gridColumnEnd - a.gridColumnStart);
            });

            // Lane assignment
            const lanes: { colEnd: number }[] = [];

            blocks.forEach(block => {
                let assignedLane = -1;
                for (let i = 0; i < lanes.length; i++) {
                    // Span starts when previous span has ended.
                    if (block.gridColumnStart > lanes[i].colEnd) {
                        assignedLane = i;
                        break;
                    }
                }

                if (assignedLane === -1) {
                    lanes.push({ colEnd: block.gridColumnEnd });
                    block.laneIndex = lanes.length - 1;
                } else {
                    lanes[assignedLane].colEnd = block.gridColumnEnd;
                    block.laneIndex = assignedLane;
                }
            });

            return blocks;
        });
    }, [weeks, vacations]);

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                if (selectionStart) {
                    setShowSelectionAction(true);
                }
            }
            if (draggedSchedule) {
                setDraggedSchedule(null);
                setHoveredDropDate(null);
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isDragging, selectionStart, selectionEnd, draggedSchedule]);

    // Handle Escape key to clear selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowSelectionAction(false);
                setSelectionStart(null);
                setSelectionEnd(null);
                setIsDragging(false);
                setHoveredDropDate(null);
                setDraggedSchedule(null);
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

    // Drag and drop handlers
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
        // We do not check isDragging here because native DnD runs concurrently with pointer events.
        if (!canManage) return;
        e.preventDefault(); // allow drop

        if (draggedSchedule) {
            const dateStr = format(day, 'yyyy-MM-dd');
            if (hoveredDropDate !== dateStr) {
                setHoveredDropDate(dateStr);
            }
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: Date) => {
        if (!canManage || !draggedSchedule) return;
        e.preventDefault();

        const { schedule, originalStart, originalEnd } = draggedSchedule;

        // Calculate the exact duration in ms
        const durationMs = originalEnd.getTime() - originalStart.getTime();

        // New start time preserves original hours/minutes
        const newStart = new Date(day);
        newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds(), originalStart.getMilliseconds());

        // New end time preserves duration
        const newEnd = new Date(newStart.getTime() + durationMs);

        // Only prompt if the day actually changed
        if (!isSameDay(newStart, originalStart)) {
            setConfirmReschedule({ schedule, newStart, newEnd });
        }

        setDraggedSchedule(null); // Clear drag state
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
                // Treat 409 as generic server conflict and show returned error
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
                    const weekBlocks = schedulesByWeek[weekIndex].map(b => ({ ...b, isGhost: false }));
                    const shadowBlocks = shadowsByWeek[weekIndex].map(b => ({ ...b, isGhost: true }));

                    const combinedBlocks = [...shadowBlocks, ...weekBlocks];
                    combinedBlocks.sort((a, b) => {
                        if (a.startTime.getTime() !== b.startTime.getTime()) {
                            return a.startTime.getTime() - b.startTime.getTime();
                        }
                        const durationDiff = (b.gridColumnEnd - b.gridColumnStart) - (a.gridColumnEnd - a.gridColumnStart);
                        if (durationDiff !== 0) return durationDiff;
                        // Sort live blocks first, then preview ghosts, then standard ghosts
                        if (a.isPreview && !b.isPreview) return 1;
                        if (!a.isPreview && b.isPreview) return -1;
                        return a.isGhost ? -1 : 1;
                    });

                    // Group blocks into lanes to calculate over-stacking per row
                    const maxLanes = LANE_CAP_ENABLED ? LANE_CAP_MAX : 999;
                    const lanes: any[][] = [];
                    const overflowCounts = new Array(7).fill(0);

                    combinedBlocks.forEach(block => {
                        if (block.isOriginalDragged) {
                            block.laneIndex = 0;
                            return; // skip lane occupancy so it doesn't push down the preview
                        }

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

                    // Add back the original dragged elements so they stay mounted for HTML5 DnD to survive
                    combinedBlocks.forEach(block => {
                        if (block.isOriginalDragged) {
                            visibleBlocks.push(block);
                        }
                    });

                    const rowMinHeight = LANE_CAP_ENABLED ? undefined : Math.max(100, lanes.length * 24 + 40);

                    return (
                        <div
                            key={weekIndex}
                            className="relative flex-1 grid grid-cols-7 border-b group"
                            style={{ minHeight: rowMinHeight ? `${rowMinHeight}px` : undefined }}
                        >
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
                                        onDragOver={(e) => handleDragOver(e, day)}
                                        onDrop={(e) => handleDrop(e, day)}
                                        className={cn(
                                            "relative min-h-[100px] p-2 border-r flex flex-col transition-colors cursor-cell select-none",
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
                                            )} draggable={false}>
                                                {format(day, dateFormat)}
                                            </span>
                                            {showDayCounts && totalSchedulesCount > 0 && (
                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 rounded-full z-10">
                                                    {totalSchedulesCount}
                                                </span>
                                            )}
                                            {peopleLevel >= 2 && (() => {
                                                const dayD = new Date(day); dayD.setHours(0, 0, 0, 0);
                                                const dayE = new Date(day); dayE.setHours(23, 59, 59, 999);
                                                const vacOnDay = vacations.filter(v => {
                                                    const vs = new Date(v.startDate); const ve = new Date(v.endDate);
                                                    return vs < dayE && ve > dayD;
                                                }).length;
                                                const schedOnDay = new Set(
                                                    schedules.filter(s => {
                                                        const ss = new Date(s.startTime); const se = new Date(s.endTime);
                                                        return ss < dayE && se > dayD;
                                                    }).flatMap(s => s.assignments?.map((a: any) => a.employee?.id) || [])
                                                ).size;
                                                const avail = Math.max(0, employees.length - vacOnDay - schedOnDay);
                                                return (
                                                    <div className="flex gap-0.5 mt-0.5 pointer-events-none">
                                                        <span className="text-[8px] px-0.5 rounded bg-green-50 text-green-700">A:{avail}</span>
                                                        {vacOnDay > 0 && <span className="text-[8px] px-0.5 rounded bg-amber-50 text-amber-600">V:{vacOnDay}</span>}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        {/* Quick Create overlay anchored to the cell */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                            {canManage && !isDragging && !showSelectionAction && (
                                                <div className="group/cell w-full h-full flex items-center justify-center">
                                                    <CalendarCellQuickCreate
                                                        date={day}
                                                        employees={employees}
                                                        customerAreas={customerAreas}
                                                        scheduleStatuses={scheduleStatuses}
                                                        workTypes={workTypes}
                                                        offices={offices}
                                                    />
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
                                                style={{
                                                    gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                                    gridRowStart: block.laneIndex + 1,
                                                }}
                                                title={`🌴 ${v.employee.name} — ${v.reason || 'Vacation'} (${format(block.startDate, 'MMM d')} - ${format(block.endDate, 'MMM d')})`}
                                            >
                                                <span className="font-semibold truncate mr-2">🌴 {v.employee.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 3) Unified Spanning Overlay (z-10) for both Ghosts and Live Schedules */}
                            <div className="absolute inset-0 pt-8 pb-1 px-1 pointer-events-none">
                                <div className="grid grid-cols-7 gap-y-1 h-full content-start">
                                    {visibleBlocks.map((block, idx) => {
                                        const schedule = block.schedule;

                                        if (block.isPreview) {
                                            return (
                                                <div
                                                    key={`preview-${weekIndex}-${idx}`}
                                                    className={cn(
                                                        "mx-0.5 px-1.5 py-1 sm:py-0.5 rounded transition-all pointer-events-none select-none",
                                                        "opacity-60 border-2 border-dashed border-gray-400 bg-gray-100",
                                                        block.startsBeforeWeek ? "rounded-l-none border-l-0 ml-0" : "rounded-l border-l-2",
                                                        block.endsAfterWeek ? "rounded-r-none mr-0" : "rounded-r"
                                                    )}
                                                    style={{
                                                        gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                                    }}
                                                >
                                                    <div className="w-full h-full min-h-[16px]" />
                                                </div>
                                            );
                                        }

                                        if (block.isGhost) {
                                            return (
                                                <div
                                                    key={`shadow-${schedule.id}-${weekIndex}-${idx}`}
                                                    className={cn(
                                                        "mx-0.5 px-1.5 py-0.5 text-[10px] sm:text-xs truncate rounded cursor-pointer pointer-events-auto transition-opacity z-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 select-none",
                                                        "opacity-80 border border-dashed border-gray-400 bg-gray-50/60 hover:bg-gray-100 text-gray-800",
                                                        block.startsBeforeWeek ? "rounded-l-none border-l-0 ml-0" : "rounded-l",
                                                        block.endsAfterWeek ? "rounded-r-none mr-0" : "rounded-r"
                                                    )}
                                                    style={{
                                                        gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                                    }}
                                                    title={`Rescheduled: ${schedule.title} (Click to see History)`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        router.push(`/schedules/${schedule.id}?tab=history`);
                                                    }}
                                                >
                                                    <div className="font-medium truncate flex items-center gap-1 text-slate-800">
                                                        <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider text-slate-500 px-1 border border-slate-300 rounded-sm bg-slate-100">RESCHEDULED</span>
                                                        <span>{schedule.title}</span>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const isCancelled = isCancelledStatus(schedule.scheduleStatus);
                                        const catColor = schedule.customerArea ? (schedule.customerArea as any).color : '#4f46e5';

                                        return (
                                            <div
                                                key={`${schedule.id}-${weekIndex}-${idx}`}
                                                className={cn(
                                                    "mx-0.5 px-1.5 py-1 sm:py-0.5 text-[10px] sm:text-xs truncate rounded cursor-pointer pointer-events-auto transition-opacity z-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 select-none",
                                                    isCancelled ? 'opacity-70 border-dashed border bg-gray-50/50' : 'hover:opacity-90',
                                                    block.startsBeforeWeek ? "rounded-l-none border-l-0 ml-0" : "rounded-l border-l-2",
                                                    block.endsAfterWeek ? "rounded-r-none mr-0" : "rounded-r",
                                                    block.isOriginalDragged && "opacity-0 pointer-events-none"
                                                )}
                                                style={isCancelled ? {
                                                    gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                                    borderColor: '#9ca3af',
                                                } : {
                                                    gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                                                    borderColor: catColor,
                                                    backgroundColor: `${catColor}15`,
                                                    color: catColor
                                                }}
                                                title={`${schedule.title}${schedule.customerArea ? ` (${(schedule.customerArea as any).name})` : ''}`}
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
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center gap-1 overflow-hidden w-full h-full">
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
                                                    <div className={cn("truncate flex-1 font-medium", isCancelled ? "text-gray-500 line-through" : "text-slate-800")} draggable={false}>
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

                                                    {/* Work Types */}
                                                    {schedule.workTypes && schedule.workTypes.length > 0 && (
                                                        <div className="hidden xl:flex items-center gap-0.5 shrink-0">
                                                            {schedule.workTypes.slice(0, 1).map((wt: any) => (
                                                                <span key={wt.workType.id} className="text-[8px] px-1 rounded bg-black/5 border border-black/10 text-gray-600 truncate max-w-[60px]">
                                                                    {wt.workType.name}
                                                                </span>
                                                            ))}
                                                            {schedule.workTypes.length > 1 && (
                                                                <span className="text-[8px] px-1 rounded bg-black/5 border border-black/10 text-gray-600">
                                                                    +{schedule.workTypes.length - 1}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Assignee summary (people >= 1) */}
                                                    {peopleLevel >= 1 && schedule.assignments && schedule.assignments.length > 0 && (
                                                        <span className="shrink-0 text-[8px] text-indigo-600 truncate max-w-[80px]" title={schedule.assignments.map((a: any) => a.employee?.name).join(', ')}>
                                                            👤 {schedule.assignments.slice(0, 2).map((a: any) => a.employee?.name?.split(' ')[0]).join(', ')}{schedule.assignments.length > 2 ? ` +${schedule.assignments.length - 2}` : ''}
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
                                                                    schedule: schedule,
                                                                    originalStart: parseISO(schedule.startTime),
                                                                    originalEnd: parseISO(schedule.endTime)
                                                                });
                                                            }}
                                                            onDragEnd={() => setDraggedSchedule(null)}
                                                            className="ml-auto flex items-center justify-center w-3 cursor-grab hover:bg-black/10 rounded-r opacity-50 hover:opacity-100"
                                                            title="Drag to reschedule"
                                                            aria-label="Drag to reschedule"
                                                        >
                                                            <span className="text-[10px] select-none leading-none tracking-tighter" style={{ marginTop: '-2px' }}>⠿</span>
                                                        </div>
                                                    )}
                                                </div>
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
            </div >

            {/* Range Selection Action Modal */}
            {
                showSelectionAction && rangeStart && rangeEnd && (
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
                )
            }

            {/* Drag and Drop Confirm Modal */}
            {
                confirmReschedule && (
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
                                        className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
