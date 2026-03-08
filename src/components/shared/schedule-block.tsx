import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { getDnDEligibility } from '@/lib/dnd/eligibility';
import { isCancelledStatus } from '@/lib/labels';
import { SerializedScheduleWithAssignments } from '@/types';

interface ScheduleBlockProps {
    schedule: any; // Using any or SerializedScheduleWithAssignments depending on exact type needs
    block: any;
    weekIndex: number;
    canManage: boolean;
    draggedSchedule: any | null;
    setDraggedSchedule: (val: any | null) => void;
    viewType: 'month' | 'week';
}

export function ScheduleBlock({
    schedule,
    block,
    weekIndex,
    canManage,
    draggedSchedule,
    setDraggedSchedule,
    viewType
}: ScheduleBlockProps) {
    const router = useRouter();
    const toast = useToast();
    const lastToastTime = useRef<number>(0);

    // Common properties
    const isCancelled = isCancelledStatus(schedule.scheduleStatus);
    const catColor = schedule.customerArea ? (schedule.customerArea as any).color : '#4f46e5';
    const isOriginalDragged = block.isOriginalDragged;

    // Eligibility
    const eligibility = getDnDEligibility(schedule, canManage, block);

    // Drag tracking logic (Opacity 0 / visually hidden during drag)
    const hiddenStyle = isOriginalDragged ? { opacity: 0, pointerEvents: 'none' as const } : {};

    // -------------------------------------------------------------
    // LIVE SCHEDULE BLOCK
    // -------------------------------------------------------------

    const timeLabel = viewType === 'week' ? `${format(parseISO(schedule.startTime), 'HH:mm')} - ${format(parseISO(schedule.endTime), 'HH:mm')}` : null;
    const peopleLevel = (schedule.assignments?.length || 0);

    return (
        <div
            className={cn(
                "mx-0.5 transition-opacity z-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 select-none group",
                viewType === 'month' ? "px-1.5 py-1 sm:py-0.5 text-[10px] sm:text-xs truncate rounded" : "flex flex-col p-1.5 sm:p-2 text-xs h-full min-h-[60px] overflow-hidden",
                isCancelled ? 'opacity-70 border-dashed border bg-gray-50/50' : 'hover:opacity-90',
                viewType === 'month' ? (block.startsBeforeWeek ? "rounded-l-none border-l-0 ml-0" : "rounded-l border-l-2") : (block.startsBeforeWeek ? "rounded-l-sm border-l" : "rounded-l-md"),
                viewType === 'month' ? (block.endsAfterWeek ? "rounded-r-none mr-0" : "rounded-r") : (block.endsAfterWeek ? "rounded-r-sm border-r" : "rounded-r-md"),
                eligibility.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
            )}
            style={{
                gridColumn: `${block.gridColumnStart} / ${block.gridColumnEnd}`,
                ...(viewType === 'week' ? { borderLeftWidth: block.startsBeforeWeek ? '1px' : '4px' } : {}),
                ...(isCancelled ? {
                    borderColor: viewType === 'month' ? '#9ca3af' : '#d1d5db',
                    backgroundColor: viewType === 'week' ? '#f9fafb' : undefined,
                    borderLeftColor: viewType === 'week' ? '#9ca3af' : undefined
                } : {
                    borderColor: catColor,
                    backgroundColor: `${catColor}15`,
                    color: viewType === 'month' ? catColor : undefined
                }),
                ...hiddenStyle // Hides original block while dragging
            }}
            title={`${schedule.title}${schedule.customerArea ? ` (${(schedule.customerArea as any).name})` : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`Schedule: ${schedule.title}, ${format(block.startTime, 'MMM d')} to ${format(block.endTime, 'MMM d')}`}

            draggable={eligibility.draggable}
            onPointerDown={(e) => {
                // DELTA: If draggable=false, intercept pointerdown to show toast + preventDefault
                if (!eligibility.draggable) {
                    const now = Date.now();
                    if (now - lastToastTime.current > 1200) {
                        toast.error(eligibility.reason || '이동할 수 없는 항목입니다.');
                        lastToastTime.current = now;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                } else {
                    // DELTA: If draggable=true, do NOT preventDefault/stopPropagation
                    // Let the native HTML5 drag engine pick it up natively.
                }
            }}
            onDragStart={(e) => {
                if (!eligibility.draggable) {
                    e.preventDefault();
                    return;
                }
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
            onDragEnd={() => {
                setDraggedSchedule(null);
            }}

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
            <div className={cn("flex items-center gap-1 overflow-hidden", viewType === 'month' ? "w-full h-full" : "shrink-0")}>
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

                <div className={cn("truncate font-medium", viewType === 'month' ? "flex-1" : "font-semibold", isCancelled ? (viewType === 'month' ? "text-gray-500 line-through" : "text-gray-500 line-through") : (viewType === 'month' ? "text-slate-800" : "text-gray-900"))} draggable={false}>
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

                {viewType === 'month' && schedule.workTypes && schedule.workTypes.length > 0 && (
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

                {viewType === 'month' && peopleLevel >= 1 && schedule.assignments && schedule.assignments.length > 0 && (
                    <span className="shrink-0 text-[8px] text-indigo-600 truncate max-w-[80px]" title={schedule.assignments.map((a: any) => a.employee?.name).join(', ')}>
                        👤 {schedule.assignments.slice(0, 2).map((a: any) => a.employee?.name?.split(' ')[0]).join(', ')}{schedule.assignments.length > 2 ? ` +${schedule.assignments.length - 2}` : ''}
                    </span>
                )}

                {/* Visual Handle just for Month view */}
                {viewType === 'month' && (
                    <div
                        className={cn(
                            "ml-auto flex items-center justify-center w-3 rounded-r transition-opacity",
                            eligibility.draggable ? "opacity-50 hover:opacity-100" : "opacity-30"
                        )}
                    >
                        <span className="text-[10px] select-none leading-none tracking-tighter" style={{ marginTop: '-2px' }}>⠿</span>
                    </div>
                )}

                {/* Visual Handle for Week view */}
                {viewType === 'week' && (
                    <div
                        className={cn(
                            "ml-auto flex items-center justify-center w-4 rounded transition-opacity",
                            eligibility.draggable ? "opacity-0 group-hover:opacity-60 hover:!opacity-100" : "opacity-30"
                        )}
                    >
                        <span className="text-[10px] select-none leading-none tracking-tighter" style={{ marginTop: '-2px' }}>⠿</span>
                    </div>
                )}
            </div>

            {viewType === 'week' && (
                <div className={isCancelled ? 'text-gray-400 mt-0.5 shrink-0 truncate' : 'text-slate-700 mt-0.5 shrink-0 truncate'}>
                    {schedule.customerArea && (
                        <span className="font-medium mr-1" style={{ color: isCancelled ? 'inherit' : catColor }}>
                            [{(schedule.customerArea as any).name}]
                        </span>
                    )}
                    {timeLabel}
                </div>
            )}
        </div>
    );
}
