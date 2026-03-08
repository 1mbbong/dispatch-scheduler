'use client';

import { useState, useRef, useEffect } from 'react';
import { SerializedScheduleWithAssignments, SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';
import { useToast } from '@/components/ui/toast';
import useSWR from 'swr';
import { format, eachDayOfInterval, parseISO, isSameDay } from 'date-fns';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface ScheduleFormProps {
    schedule?: SerializedScheduleWithAssignments | null;
    initialDate?: Date;
    initialEndDate?: Date;
    onSuccess: () => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
    customerAreas?: SerializedCustomerArea[];
    scheduleStatuses?: SerializedScheduleStatus[];
    workTypes?: SerializedWorkType[];
    offices?: { id: string, name: string }[];
}

export function ScheduleForm({ schedule, initialDate, initialEndDate, onSuccess, onCancel, onDirtyChange, customerAreas = [], scheduleStatuses = [], workTypes = [], offices = [] }: ScheduleFormProps) {
    const toast = useToast();
    const [title, setTitle] = useState(schedule?.title || '');
    const [description, setDescription] = useState(schedule?.description || '');

    // State for Labels
    const [customerAreaId, setCustomerAreaId] = useState(schedule?.customerArea?.id || '');
    const [statusId, setStatusId] = useState((schedule as any)?.scheduleStatus?.id || '');
    const defaultWorkTypeIds = schedule?.workTypes?.map((wt: any) => wt.workType?.id) || [];
    const [workTypeIds, setWorkTypeIds] = useState<string[]>(defaultWorkTypeIds);

    const [workLocationType, setWorkLocationType] = useState<'OFFICE' | 'FIELD' | 'REMOTE'>((schedule as any)?.workLocationType || 'FIELD');
    const [officeId, setOfficeId] = useState((schedule as any)?.officeId || '');

    // Format Date to "YYYY-MM-DDTHH:MM" using local components (no UTC pitfalls)
    const toLocalDatetimeString = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${day}T${h}:${min}`;
    };

    // Create-mode defaults: selectedDate 09:00 / 10:00. Edit-mode: use existing values.
    const getDefaultStart = (): string => {
        if (schedule?.startTime) return toLocalDatetimeString(new Date(schedule.startTime));
        const d = initialDate ? new Date(initialDate) : new Date();
        d.setHours(9, 0, 0, 0);
        return toLocalDatetimeString(d);
    };

    const getDefaultEnd = (): string => {
        if (schedule?.endTime) return toLocalDatetimeString(new Date(schedule.endTime));

        let d = initialEndDate ? new Date(initialEndDate) : (initialDate ? new Date(initialDate) : new Date());

        // If it's a multi-day span (initialDate < initialEndDate), default to an end-of-workday time (17:30)
        if (initialDate && initialEndDate && initialDate.getTime() < initialEndDate.getTime()) {
            d.setHours(17, 30, 0, 0);
        } else {
            // Otherwise, default to 1 hour after start
            d.setHours(10, 0, 0, 0);
        }
        return toLocalDatetimeString(d);
    };

    const [startTime, setStartTime] = useState(getDefaultStart());
    const [endTime, setEndTime] = useState(getDefaultEnd());
    const [endManuallyEdited, setEndManuallyEdited] = useState(!!schedule);

    // Selected assignees per day (date string YYYY-MM-DD -> Set of employee IDs)
    const [selectedAssigneesByDay, setSelectedAssigneesByDay] = useState<Record<string, Set<string>>>(() => {
        const initialMap: Record<string, Set<string>> = {};
        if (schedule?.assignments) {
            schedule.assignments.forEach(a => {
                if (a.date) {
                    const localDateStr = format(parseISO(a.date), 'yyyy-MM-dd');
                    if (!initialMap[localDateStr]) {
                        initialMap[localDateStr] = new Set();
                    }
                    initialMap[localDateStr].add(a.employeeId);
                }
            });
        }
        return initialMap;
    });

    // Track initial values for dirty state
    const initialValues = useRef({
        title: schedule?.title || '',
        description: schedule?.description || '',
        customerAreaId: schedule?.customerArea?.id || '',
        statusId: (schedule as any)?.scheduleStatus?.id || '',
        workTypeIds: defaultWorkTypeIds,
        workLocationType: (schedule as any)?.workLocationType || 'FIELD',
        officeId: (schedule as any)?.officeId || '',
        startTime: getDefaultStart(),
        endTime: getDefaultEnd(),
    });

    useEffect(() => {
        if (!onDirtyChange) return;
        const isNowDirty =
            title !== initialValues.current.title ||
            description !== initialValues.current.description ||
            customerAreaId !== initialValues.current.customerAreaId ||
            statusId !== initialValues.current.statusId ||
            JSON.stringify(workTypeIds) !== JSON.stringify(initialValues.current.workTypeIds) ||
            workLocationType !== initialValues.current.workLocationType ||
            officeId !== initialValues.current.officeId ||
            startTime !== initialValues.current.startTime ||
            endTime !== initialValues.current.endTime;

        onDirtyChange(isNowDirty);
    }, [title, description, customerAreaId, statusId, workTypeIds, workLocationType, officeId, startTime, endTime, onDirtyChange]);

    const handleStartTimeChange = (val: string) => {
        setStartTime(val);
        if (!val) return;

        const startD = new Date(val);
        if (isNaN(startD.getTime())) return;

        let shouldAutoSet = false;
        if (!endTime) {
            shouldAutoSet = true;
        } else {
            const endD = new Date(endTime);
            if (isNaN(endD.getTime()) || endD <= startD || !endManuallyEdited) {
                shouldAutoSet = true;
            }
        }

        if (shouldAutoSet) {
            const newEnd = new Date(startD.getTime() + 60 * 60 * 1000);
            setEndTime(toLocalDatetimeString(newEnd));
        }
    };

    const handleEndTimeChange = (val: string) => {
        setEndTime(val);
        setEndManuallyEdited(true);
    };

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch availability based on current start and end times
    const startD = new Date(startTime);
    const endD = new Date(endTime);
    const isValidRange = !isNaN(startD.getTime()) && !isNaN(endD.getTime()) && startD < endD;

    const { data: availabilityData, isLoading: isAvailabilityLoading } = useSWR(
        isValidRange ? `/api/availability?startDate=${startD.toISOString()}&endDate=${endD.toISOString()}` : null,
        fetcher
    );

    const toggleAssignee = (dateStr: string, employeeId: string) => {
        setSelectedAssigneesByDay(prev => {
            const nextMap = { ...prev };
            const currentSet = nextMap[dateStr] ? new Set(nextMap[dateStr]) : new Set<string>();

            if (currentSet.has(employeeId)) {
                currentSet.delete(employeeId);
            } else {
                currentSet.add(employeeId);
            }

            nextMap[dateStr] = currentSet;
            return nextMap;
        });

        // Mark as dirty
        if (onDirtyChange) onDirtyChange(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const url = schedule
                ? `/api/schedules/${schedule.id}`
                : '/api/schedules';

            const method = schedule ? 'PATCH' : 'POST';

            const start = new Date(startTime);
            const end = new Date(endTime);

            if (start >= end) {
                setError('시작 시간은 종료 시간보다 앞서야 합니다.');
                setIsLoading(false);
                return;
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    description,
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                    customerAreaId: customerAreaId === '' ? null : customerAreaId,
                    statusId: statusId === '' ? null : statusId,
                    workTypeIds: workTypeIds,
                    workLocationType,
                    officeId: workLocationType === 'OFFICE' ? officeId : null,
                }),
            });

            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }

            if (!res.ok) {
                const data = await res.json();
                if (res.status === 409) {
                    setError(`겹치는 스케줄이 있습니다: ${data.error || 'Overlap conflict'}`);
                } else if (res.status === 401 || res.status === 403) {
                    setError('권한이 없습니다. 다시 로그인해주세요.');
                } else {
                    setError(data.error || 'Operation failed');
                }
                return;
            }

            const savedSchedule = await res.json();
            const realScheduleId = schedule?.id || savedSchedule.id;

            // --- SYNC ASSIGNMENTS ---
            // 1) Build desired state from selectedAssigneesByDay (ignoring days outside schedule range)
            const days = eachDayOfInterval({ start: new Date(startTime), end: new Date(endTime) });
            const desiredAssignments: Array<{ dateStr: string, employeeId: string }> = [];
            days.forEach(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const selectedSet = selectedAssigneesByDay[dateStr];
                if (selectedSet) {
                    selectedSet.forEach(empId => desiredAssignments.push({ dateStr, employeeId: empId }));
                }
            });

            // 2) Build current state from schedule.assignments (only if editing)
            const currentAssignments = schedule?.assignments || [];

            // 3) Calculate diff
            const toAdd = desiredAssignments.filter(desired =>
                !currentAssignments.some(curr =>
                    curr.employeeId === desired.employeeId &&
                    curr.date && format(parseISO(curr.date), 'yyyy-MM-dd') === desired.dateStr
                )
            );

            const toRemove = currentAssignments.filter(curr =>
                !desiredAssignments.some(desired =>
                    desired.employeeId === curr.employeeId &&
                    curr.date && desired.dateStr === format(parseISO(curr.date), 'yyyy-MM-dd')
                )
            );

            // 4) Execute Adds and Removes concurrently
            let warningsCount = 0;
            const promises: Promise<any>[] = [];

            // Additions (with allowConflicts override)
            for (const add of toAdd) {
                const [y, m, d] = add.dateStr.split('-').map(Number);
                const utcMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();

                promises.push(
                    fetch('/api/assignments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            scheduleId: realScheduleId,
                            employeeId: add.employeeId,
                            date: utcMidnight,
                            allowConflicts: true,
                        }),
                    }).then(async r => {
                        if (r.ok) {
                            const data = await r.json();
                            if (data.warnings && data.warnings.length > 0) {
                                // Accumulate count of warnings (data.warnings is an array of warning objects)
                                warningsCount += data.warnings.length;
                            }
                        }
                    })
                );
            }

            // Removals
            for (const rm of toRemove) {
                promises.push(
                    fetch(`/api/assignments/${rm.id}`, { method: 'DELETE' })
                );
            }

            if (promises.length > 0) {
                await Promise.allSettled(promises);
            }

            if (warningsCount > 0) {
                toast.info(`⚠️ Saved with ${warningsCount} warnings`);
            } else {
                toast.success(schedule ? 'Schedule updated' : 'Schedule created');
            }
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    // Render Per-Day Assignment Chips
    const renderPerDayAssignments = () => {
        if (!isValidRange || !availabilityData) return null;
        if (isAvailabilityLoading) return <div className="text-sm text-gray-500 py-4">가용 인원 분석 중...</div>;

        const { employees = [], vacations = [], schedules = [] } = availabilityData;

        // Calculate days cleanly without overflow risks
        const formStart = new Date(startTime);
        const formEnd = new Date(endTime);
        // Important: eachDayOfInterval fails if end < start, but we shielded it with isValidRange.
        const days = eachDayOfInterval({ start: formStart, end: formEnd });

        let unstaffedDaysCount = 0;
        const unstaffedDates: string[] = [];

        return (
            <div className="mt-6 border-t pt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-4">일자별 배차 선택 (클릭하여 배정)</h3>
                <div className="space-y-4 max-h-72 overflow-y-auto pr-2">
                    {days.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

                        const selectedIds = selectedAssigneesByDay[dateStr] || new Set<string>();

                        if (selectedIds.size === 0) {
                            unstaffedDaysCount++;
                            unstaffedDates.push(format(day, 'MMM d'));
                        }

                        // Find status for each employee on this specific day
                        const bucketAssigned: typeof employees = [];
                        const bucketAvailable: typeof employees = [];
                        const bucketOverbooked: Array<typeof employees[0] & { conflictContext?: string }> = [];
                        const bucketVacation: typeof employees = [];

                        employees.forEach((emp: any) => {
                            if (selectedIds.has(emp.id)) {
                                bucketAssigned.push(emp);
                                return;
                            }

                            // Check vacation overlap
                            const hasVacation = vacations.some((v: any) =>
                                v.employeeId === emp.id &&
                                parseISO(v.startDate) <= dayEnd &&
                                parseISO(v.endDate) >= dayStart
                            );

                            if (hasVacation) {
                                bucketVacation.push(emp);
                                return;
                            }

                            // Check schedule overlap for this day
                            const conflictSchedule = schedules.find((s: any) =>
                                // Schedule itself must overlap the day
                                parseISO(s.startTime) < dayEnd && parseISO(s.endTime) > dayStart &&
                                // AND the employee must be assigned to it on THIS specific day OR the schedule is legacy (no specific date)
                                // AND it's not the current schedule we are editing
                                s.id !== schedule?.id &&
                                s.assignments.some((a: any) =>
                                    a.employeeId === emp.id &&
                                    (!a.date || isSameDay(parseISO(a.date), day))
                                )
                            );

                            if (conflictSchedule) {
                                let loc = conflictSchedule.workLocationType === 'OFFICE' ? (conflictSchedule.office?.name || 'Office')
                                    : conflictSchedule.workLocationType === 'REMOTE' ? 'WFH' : 'Field';
                                if (conflictSchedule.customerArea) loc += ` · ${conflictSchedule.customerArea.name}`;

                                bucketOverbooked.push({
                                    ...emp,
                                    conflictContext: `${conflictSchedule.title} (${loc})`
                                });
                            } else {
                                bucketAvailable.push(emp);
                            }
                        });

                        return (
                            <div key={dateStr} className="bg-gray-50 rounded-md p-3 border border-gray-100 relative">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs font-semibold text-gray-700">{format(day, 'MMM d, yyyy (EEE)')}</p>
                                    {selectedIds.size === 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                                            미배정 (Unstaffed)
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    {/* Assigned Category (always top) */}
                                    {(bucketAssigned.length > 0 || bucketAvailable.length > 0 || bucketOverbooked.length > 0 || bucketVacation.length > 0) && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {/* 1. Assigned */}
                                            {bucketAssigned.map((emp: any) => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => toggleAssignee(dateStr, emp.id)}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border-2 border-indigo-500 hover:bg-indigo-200 transition-colors"
                                                >
                                                    <span className="mr-1">✓</span> {emp.name}
                                                </button>
                                            ))}

                                            {/* 2. Available */}
                                            {bucketAvailable.map((emp: any) => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => toggleAssignee(dateStr, emp.id)}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 hover:border-gray-400 transition-colors"
                                                >
                                                    {emp.name}
                                                </button>
                                            ))}

                                            {/* 3. Overbooked */}
                                            {bucketOverbooked.map((emp: any) => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => toggleAssignee(dateStr, emp.id)}
                                                    title={emp.conflictContext}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-800 border border-yellow-300 hover:bg-yellow-100 transition-colors group relative"
                                                >
                                                    <span className="mr-1">⚠️</span> {emp.name}
                                                    {/* Tooltip-like context on hover inside the button for larger screens */}
                                                    <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-sm whitespace-nowrap z-10 pointer-events-none">
                                                        {emp.conflictContext}
                                                    </span>
                                                </button>
                                            ))}

                                            {/* 4. Vacation */}
                                            {bucketVacation.map((emp: any) => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    onClick={() => toggleAssignee(dateStr, emp.id)}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-800 border border-orange-300 hover:bg-orange-100 transition-colors"
                                                >
                                                    <span className="mr-1">🏖️</span> {emp.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                {unstaffedDaysCount > 0 && (
                    <p className="mt-3 text-[11px] text-red-600 font-medium">
                        * Unassigned days: {unstaffedDates.join(', ')}
                    </p>
                )}
            </div>
        );
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700"> Title </label>
                <input
                    type="text"
                    id="title"
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </div>

            {/* Work Location Type */}
            <div className="bg-gray-50 p-4 rounded-md border border-gray-100 mb-4 shadow-sm">
                <label className="block text-sm font-semibold text-gray-800 mb-3">Work Location</label>
                <div className="grid grid-cols-3 gap-3">
                    {(['OFFICE', 'FIELD', 'REMOTE'] as const).map(type => {
                        const isSelected = workLocationType === type;
                        return (
                            <label
                                key={type}
                                className={`
                                    relative flex cursor-pointer rounded-lg border p-3 shadow-sm focus:outline-none 
                                    ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-600 bg-indigo-50/50' : 'border-gray-300'}
                                    hover:bg-gray-50 transition-all
                                `}
                            >
                                <input
                                    type="radio"
                                    name="workLocationType"
                                    value={type}
                                    checked={isSelected}
                                    onChange={() => setWorkLocationType(type)}
                                    className="sr-only"
                                />
                                <div className="flex w-full flex-col text-center">
                                    <span className={`block text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-gray-900'}`}>
                                        {
                                            type === 'OFFICE' ? '🏢 Office' :
                                                type === 'FIELD' ? '🚗 Field' :
                                                    '🏠 WFH'
                                        }
                                    </span>
                                </div>
                            </label>
                        )
                    })}
                </div>

                {/* Conditional Office Dropdown */}
                {workLocationType === 'OFFICE' && (
                    <div className="mt-4 border-t pt-4">
                        <label htmlFor="officeId" className="block text-sm font-medium text-gray-700">
                            Select Office <span className="text-red-500">*</span>
                        </label>
                        {offices.length === 0 ? (
                            <p className="mt-2 text-sm text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                                ⚠️ No offices available (check Settings &gt; Offices)
                            </p>
                        ) : (
                            <select
                                id="officeId"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm appearance-none"
                                value={officeId}
                                onChange={(e) => setOfficeId(e.target.value)}
                            >
                                <option value="" disabled>Select an office...</option>
                                {offices.map((off: any) => (
                                    <option key={off.id} value={off.id}>
                                        {off.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="customerAreaId" className="block text-sm font-medium text-gray-700">
                        Customer Area
                    </label>
                    <div className="relative mt-1">
                        <select
                            id="customerAreaId"
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm bg-white appearance-none pr-8"
                            value={customerAreaId}
                            onChange={(e) => setCustomerAreaId(e.target.value)}
                        >
                            <option value="">None</option>
                            {customerAreas.map((area: any) => (
                                <option key={area.id} value={area.id}>
                                    {area.name}
                                </option>
                            ))}
                        </select>
                        {customerAreaId && (
                            <div
                                className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                                style={{ backgroundColor: customerAreas.find((a: any) => a.id === customerAreaId)?.color || 'transparent' }}
                            />
                        )}
                    </div>
                </div>

                <div>
                    <label htmlFor="statusId" className="block text-sm font-medium text-gray-700">
                        Status
                    </label>
                    <div className="relative mt-1">
                        <select
                            id="statusId"
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm bg-white appearance-none pr-8"
                            value={statusId}
                            onChange={(e) => setStatusId(e.target.value)}
                        >
                            <option value="">None</option>
                            {scheduleStatuses.map((status: any) => (
                                <option key={status.id} value={status.id}>
                                    {status.name}
                                </option>
                            ))}
                        </select>
                        {statusId && (
                            <div
                                className="absolute right-8 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                                style={{ backgroundColor: scheduleStatuses.find((a: any) => a.id === statusId)?.color || 'transparent' }}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2"> Work Types </label>
                {workTypes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {workTypes.map((wt: any) => {
                            const isSelected = workTypeIds.includes(wt.id);
                            return (
                                <button
                                    key={wt.id}
                                    type="button"
                                    onClick={() => {
                                        if (isSelected) {
                                            setWorkTypeIds(prev => prev.filter(id => id !== wt.id));
                                        } else {
                                            setWorkTypeIds(prev => [...prev, wt.id]);
                                        }
                                    }}
                                    className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${isSelected
                                        ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    {wt.name}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 italic">No Work Types available.</p>
                )}
            </div>

            <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700"> Description </label>
                <textarea
                    id="description"
                    rows={2}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="startTime" className="block text-sm font-medium text-gray-700"> Start Time </label>
                    <input
                        type="datetime-local"
                        id="startTime"
                        required
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={startTime}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                    />
                </div>

                <div>
                    <label htmlFor="endTime" className="block text-sm font-medium text-gray-700"> End Time </label>
                    <input
                        type="datetime-local"
                        id="endTime"
                        required
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={endTime}
                        onChange={(e) => handleEndTimeChange(e.target.value)}
                    />
                </div>
            </div>

            {error && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                    {error}
                </div>
            )}

            {renderPerDayAssignments()}

            <div className="flex justify-end space-x-3 pt-4 border-t mt-4">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                >
                    {isLoading ? 'Saving...' : schedule ? 'Update' : 'Create'}
                </button>
            </div>
        </form>
    );
}
