'use client';

import { useState, useEffect } from 'react';
import { SerializedEmployeeWithStats } from '@/types';
import { useToast } from '@/components/ui/toast';

interface VacationFormProps {
    employees: SerializedEmployeeWithStats[];
    initialDate?: Date;
    initialEndDate?: Date;
    onSuccess: () => void;
    onCancel: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

export function VacationForm({ employees, initialDate, initialEndDate, onSuccess, onCancel, onDirtyChange }: VacationFormProps) {
    const toast = useToast();
    const [employeeId, setEmployeeId] = useState('');

    // Pre-fill dates from initialDate if provided (YYYY-MM-DD format for input[type=date])
    const defaultStartDateStr = initialDate
        ? `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}-${String(initialDate.getDate()).padStart(2, '0')}`
        : '';

    const endDateToUse = initialEndDate || initialDate;
    const defaultEndDateStr = endDateToUse
        ? `${endDateToUse.getFullYear()}-${String(endDateToUse.getMonth() + 1).padStart(2, '0')}-${String(endDateToUse.getDate()).padStart(2, '0')}`
        : '';

    const [startDate, setStartDate] = useState(defaultStartDateStr);
    const [endDate, setEndDate] = useState(defaultEndDateStr);
    const [reason, setReason] = useState('');

    useEffect(() => {
        const isCurrentlyDirty =
            employeeId !== '' ||
            startDate !== defaultStartDateStr ||
            endDate !== defaultEndDateStr ||
            reason !== '';
        onDirtyChange?.(isCurrentlyDirty);
    }, [employeeId, startDate, endDate, reason, defaultStartDateStr, defaultEndDateStr, onDirtyChange]);

    // Handle Start Date Change: Auto-fix End Date if needed
    const handleStartDateChange = (newStart: string) => {
        setStartDate(newStart);
        if (newStart && endDate && newStart > endDate) {
            setEndDate(newStart);
        }
    };

    // Calculate Duration
    let durationText = '';
    if (startDate && endDate && startDate <= endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
        durationText = `Duration: ${diffDays} day(s)`;
    }

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const isSubmitDisabled = isLoading || !employeeId || !startDate || !endDate;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Convert dates to ISO (start of day / end of day could be handled by API or here)
        // For simplicity, we send inputs as is (YYYY-MM-DD) and API expects ISO.
        // We should append time to ensure correct parsing.
        // UTC: YYYY-MM-DDT00:00:00Z...
        // Actually, input type='date' gives local date string.
        // API expects full ISO.
        // Let's create date objects and ISO stringify them.

        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            // Set end to end of day? Vacation typically inclusive.
            // API logic handles date math? "Schedules API uses ... conflict detection".
            // Let's just send what user picked.

            const res = await fetch('/api/vacations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId,
                    startDate: start.toISOString(),
                    endDate: end.toISOString(),
                    reason
                }),
            });

            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Operation failed');
            }

            toast.success('Vacation created');
            onSuccess();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label htmlFor="employee" className="block text-sm font-medium text-gray-700"> Employee </label>
                <select
                    id="employee"
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm bg-white"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                >
                    <option value="">Select an employee</option>
                    {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700"> Start Date </label>
                    <input
                        type="date"
                        id="startDate"
                        required
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={startDate}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                    />
                </div>

                <div>
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700"> End Date </label>
                    <input
                        type="date"
                        id="endDate"
                        required
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                    {durationText && (
                        <p className="mt-1 text-xs text-gray-500">{durationText}</p>
                    )}
                </div>
            </div>

            <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700"> Reason </label>
                <textarea
                    id="reason"
                    required
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                />
            </div>

            {error && (
                <div className="text-sm text-red-600">
                    {error}
                </div>
            )}

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
                    disabled={isSubmitDisabled}
                    className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    );
}
