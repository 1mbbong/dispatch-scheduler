'use client';

import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { isCancelledStatus } from '@/lib/labels';
import { SerializedScheduleWithAssignments } from '@/types';

// Timeline constants
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 22;
const TOTAL_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR; // 16
const HOUR_HEIGHT_PX = 64; // pixels per hour slot

interface DayViewProps {
    schedules: SerializedScheduleWithAssignments[];
}

/**
 * Day View timeline: renders schedule blocks on a vertical 06:00–22:00 grid.
 * Blocks are positioned by start/end time. Clamped to grid range visually.
 */
export function DayView({ schedules }: DayViewProps) {
    const router = useRouter();

    const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => TIMELINE_START_HOUR + i);

    /**
     * Convert a Date/time to a pixel offset from the top of the timeline.
     * Clamp to [0, totalHeight] to handle schedules outside 06:00–22:00.
     */
    const timeToOffset = (date: Date): number => {
        const fractionalHour = date.getHours() + date.getMinutes() / 60;
        const hoursFromStart = fractionalHour - TIMELINE_START_HOUR;
        const clamped = Math.max(0, Math.min(TOTAL_HOURS, hoursFromStart));
        return clamped * HOUR_HEIGHT_PX;
    };

    const totalHeight = TOTAL_HOURS * HOUR_HEIGHT_PX;

    return (
        <div className="relative flex border-t" style={{ height: totalHeight }}>
            {/* Hour labels column */}
            <div className="flex-shrink-0 w-16 relative border-r bg-gray-50/50">
                {hours.map((hour) => (
                    <div
                        key={hour}
                        className="absolute left-0 right-0 flex items-start justify-end pr-2"
                        style={{ top: (hour - TIMELINE_START_HOUR) * HOUR_HEIGHT_PX }}
                    >
                        <span className="text-xs text-gray-400 -translate-y-1/2 font-mono">
                            {String(hour).padStart(2, '0')}:00
                        </span>
                    </div>
                ))}
            </div>

            {/* Timeline body with hour grid lines + blocks */}
            <div className="flex-1 relative">
                {/* Grid lines */}
                {hours.map((hour) => (
                    <div
                        key={hour}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ top: (hour - TIMELINE_START_HOUR) * HOUR_HEIGHT_PX }}
                    />
                ))}

                {/* Schedule blocks */}
                {schedules.map((schedule, idx) => {
                    const start = parseISO(schedule.startTime);
                    const end = parseISO(schedule.endTime);
                    const top = timeToOffset(start);
                    const bottom = timeToOffset(end);
                    const height = Math.max(bottom - top, 24); // min height for visibility

                    const isCancelled = isCancelledStatus(schedule.scheduleStatus);
                    const assignmentCount = schedule.assignments?.length ?? 0;

                    // Simple overlap offset: stagger by index position
                    // This gives a left offset to each block so overlaps are visible
                    const leftOffset = idx * 8;
                    const maxLeft = 40; // cap offset

                    // Determine block colors dynamically using customerArea color
                    const customerArea = schedule.customerArea;
                    const catColor = (customerArea as any)?.color;

                    let blockStyles;
                    if (isCancelled) {
                        blockStyles = {
                            backgroundColor: '#f9fafb', // gray-50
                            borderColor: '#d1d5db', // gray-300
                            borderStyle: 'dashed',
                            color: '#6b7280', // gray-500
                        };
                    } else if (catColor) {
                        blockStyles = {
                            backgroundColor: `${catColor}15`, // extremely light tint
                            borderColor: catColor,
                            borderStyle: 'solid',
                            color: '#111827', // text-gray-900
                        };
                    } else {
                        blockStyles = {
                            backgroundColor: '#eef2ff', // indigo-50
                            borderColor: '#6366f1', // indigo-500
                            borderStyle: 'solid',
                            color: '#111827',
                        };
                    }

                    return (
                        <div
                            key={schedule.id}
                            onClick={() => router.push(`/schedules/${schedule.id}`)}
                            title={`${schedule.title}\n${customerArea ? `Area: ${customerArea.name}\n` : ''}${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`}
                            className={`absolute rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition-shadow hover:shadow-md overflow-hidden border-l-4 ${isCancelled ? 'opacity-60' : ''}`}
                            style={{
                                top,
                                height,
                                left: `calc(${Math.min(leftOffset, maxLeft)}px + 4px)`,
                                right: '8px',
                                zIndex: 10 + idx,
                                backgroundColor: blockStyles.backgroundColor,
                                borderColor: blockStyles.borderColor,
                                borderStyle: blockStyles.borderStyle,
                            }}
                        >
                            <div className="flex items-start justify-between gap-1 overflow-hidden" style={{ color: isCancelled ? '#6b7280' : blockStyles.color, textDecoration: isCancelled ? 'line-through' : 'none' }}>
                                <div className="flex items-center gap-1 truncate flex-1">
                                    {(() => {
                                        const wlt = (schedule as any).workLocationType;
                                        const chip = wlt === 'OFFICE' && (schedule as any).office?.name
                                            ? (schedule as any).office.name
                                            : wlt === 'REMOTE' ? 'WFH'
                                                : (customerArea as any)?.name || null;
                                        return chip ? (
                                            <span className="shrink-0 text-[9px] px-1 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium" style={{ textDecoration: 'none' }}>
                                                {chip}
                                            </span>
                                        ) : null;
                                    })()}
                                    <span className="font-semibold truncate">{schedule.title}</span>
                                </div>
                                {/* Status badge */}
                                {schedule.scheduleStatus && !isCancelled && (
                                    <span
                                        className="shrink-0 text-[9px] px-1 rounded border"
                                        style={{
                                            color: (schedule.scheduleStatus as any).color || '#374151',
                                            borderColor: (schedule.scheduleStatus as any).color || '#d1d5db',
                                            backgroundColor: `${(schedule.scheduleStatus as any).color || '#6b7280'}15`,
                                            textDecoration: 'none'
                                        }}>
                                        {(schedule.scheduleStatus as any).name}
                                    </span>
                                )}
                            </div>
                            <div className={`${isCancelled ? 'text-gray-400' : 'text-gray-500'} flex items-center flex-wrap gap-1 mt-0.5`}>
                                <span>{format(start, 'HH:mm')}–{format(end, 'HH:mm')}</span>
                                {assignmentCount > 0 && (
                                    <span className="text-indigo-600 font-medium">
                                        · {assignmentCount} ppl
                                    </span>
                                )}
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

                            {isCancelled && (
                                <div className="mt-0.5">
                                    <span className="inline-block text-[9px] px-1 rounded border border-gray-300 text-gray-500 bg-gray-100 uppercase tracking-wider">
                                        취소
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Empty state */}
                {schedules.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <p className="text-sm text-gray-400">No schedules on this day</p>
                    </div>
                )}
            </div>
        </div>
    );
}
