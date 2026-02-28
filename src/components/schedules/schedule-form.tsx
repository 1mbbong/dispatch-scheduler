'use client';

import { useState } from 'react';
import { SerializedScheduleWithAssignments } from '@/types';
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
}

export function ScheduleForm({ schedule, initialDate, initialEndDate, onSuccess, onCancel }: ScheduleFormProps) {
    const toast = useToast();
    const [title, setTitle] = useState(schedule?.title || '');
    const [description, setDescription] = useState(schedule?.description || '');
    // Provide a default empty string for UI select; cast it to undefined before sending to API if empty
    const [categoryId, setCategoryId] = useState(schedule?.categoryId || '');

    // Fetch categories and label
    const { data: categoriesData, isLoading: isCategoriesLoading } = useSWR('/api/categories', fetcher);

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
                    categoryId: categoryId === '' ? null : categoryId
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

            toast.success(schedule ? 'Schedule updated' : 'Schedule created');
            onSuccess();
        } catch (err: any) {
            setError(err.message || 'Network error');
        } finally {
            setIsLoading(false);
        }
    };

    // Render Availability Preview
    const renderAvailabilityPreview = () => {
        if (!isValidRange || !availabilityData) return null;
        if (isAvailabilityLoading) return <div className="text-sm text-gray-500 py-4">가용 인원 분석 중...</div>;

        const { employees = [], vacations = [], schedules = [] } = availabilityData;

        // Calculate days cleanly without overflow risks
        const formStart = new Date(startTime);
        const formEnd = new Date(endTime);
        // Important: eachDayOfInterval fails if end < start, but we shielded it with isValidRange.
        const days = eachDayOfInterval({ start: formStart, end: formEnd });

        return (
            <div className="mt-6 border-t pt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-4">일자별 자원 가용 현황</h3>
                <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
                    {days.map(day => {
                        const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

                        // Find status for each employee on this specific day
                        const bucketAvailable: typeof employees = [];
                        const bucketOverbooked: typeof employees = [];
                        const bucketVacation: typeof employees = [];

                        employees.forEach((emp: any) => {
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
                            const hasOverlap = schedules.some((s: any) =>
                                // Schedule itself must overlap the day
                                parseISO(s.startTime) < dayEnd && parseISO(s.endTime) > dayStart &&
                                // AND the employee must be assigned to it on THIS specific day OR the schedule is legacy (no specific date)
                                s.assignments.some((a: any) =>
                                    a.employeeId === emp.id &&
                                    (!a.date || isSameDay(parseISO(a.date), day))
                                )
                            );

                            if (hasOverlap) {
                                bucketOverbooked.push(emp);
                            } else {
                                bucketAvailable.push(emp);
                            }
                        });

                        return (
                            <div key={day.toISOString()} className="bg-gray-50 rounded-md p-3 border border-gray-100">
                                <p className="text-xs font-semibold text-gray-700 mb-2">{format(day, 'MMM d, yyyy (EEE)')}</p>

                                <div className="space-y-2">
                                    {bucketAvailable.length > 0 && (
                                        <div>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 mb-1">
                                                ✅ Available ({bucketAvailable.length})
                                            </span>
                                            <p className="text-xs text-gray-600 leading-tight">
                                                {bucketAvailable.map((e: any) => e.name).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                    {bucketOverbooked.length > 0 && (
                                        <div>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800 border border-yellow-200 mb-1">
                                                ⚠️ Overbooked ({bucketOverbooked.length})
                                            </span>
                                            <p className="text-xs text-gray-600 leading-tight">
                                                {bucketOverbooked.map((e: any) => e.name).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                    {bucketVacation.length > 0 && (
                                        <div>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800 border border-orange-200 mb-1">
                                                🏖️ Vacation ({bucketVacation.length})
                                            </span>
                                            <p className="text-xs text-gray-600 leading-tight">
                                                {bucketVacation.map((e: any) => e.name).join(', ')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
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
                    placeholder="e.g. Morning Shift"
                />
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

            <div>
                <label htmlFor="categoryId" className="block text-sm font-medium text-gray-700">
                    {isCategoriesLoading ? 'Loading...' : categoriesData?.label || 'Category'}
                </label>
                <select
                    id="categoryId"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm bg-white"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    disabled={isCategoriesLoading}
                >
                    <option value="">None</option>
                    {categoriesData?.data?.categories?.map((cat: any) => (
                        <option key={cat.id} value={cat.id}>
                            {cat.name}
                        </option>
                    ))}
                </select>
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

            {renderAvailabilityPreview()}

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
