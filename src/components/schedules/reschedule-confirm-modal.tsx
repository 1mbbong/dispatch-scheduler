'use client';

import { useState } from 'react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { useToast } from '@/components/ui/toast';
import { SerializedScheduleWithAssignments } from '@/types';

type StaffingChoice = 'keep' | 'reset';

interface RescheduleConfirmModalProps {
    schedule: SerializedScheduleWithAssignments;
    newStart: Date;
    newEnd: Date;
    onComplete: () => void;
    onCancel: () => void;
}

export function RescheduleConfirmModal({
    schedule,
    newStart,
    newEnd,
    onComplete,
    onCancel,
}: RescheduleConfirmModalProps) {
    const toast = useToast();
    const [isBusy, setIsBusy] = useState(false);

    const assignments = schedule.assignments ?? [];
    const assignmentCount = assignments.length;

    // ---- mutations (only called from Keep / Reset) ----

    const patchScheduleTimes = async (): Promise<boolean> => {
        const res = await fetch(`/api/schedules/${schedule.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                startTime: newStart.toISOString(),
                endTime: newEnd.toISOString(),
            }),
        });
        if (!res.ok) {
            const data = await res.json();
            toast.error(`Error: ${data.error || 'Reschedule failed'}`);
            return false;
        }
        return true;
    };

    const deleteAllAssignments = async () => {
        if (assignments.length === 0) return;
        await Promise.allSettled(
            assignments.map(a =>
                fetch(`/api/assignments/${a.id}`, { method: 'DELETE' })
            )
        );
    };

    interface ShiftResult { total: number; created: number; failed: number; rollbackFailed: number; warnings: number }

    const shiftAssignments = async (): Promise<ShiftResult> => {
        if (assignments.length === 0) return { total: 0, created: 0, failed: 0, rollbackFailed: 0, warnings: 0 };

        const deltaDays = differenceInCalendarDays(newStart, parseISO(schedule.startTime));

        // Build items with stable string-slice day math (no parseISO drift)
        type ShiftItem = { id: string; employeeId: string; oldISO: string; oldDayKey: string; newISO: string; newDayKey: string };
        const seen = new Set<string>();
        const items: ShiftItem[] = [];

        for (const a of assignments) {
            const oldDayKey = a.date.slice(0, 10); // "YYYY-MM-DD" — timezone-proof
            const [y, m, d] = oldDayKey.split('-').map(Number);
            const oldISO = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString();
            const newISO = new Date(Date.UTC(y, m - 1, d + deltaDays, 0, 0, 0, 0)).toISOString();
            const newDayKey = newISO.slice(0, 10);

            // Dedup by employeeId|newDayKey before processing
            const key = `${a.employeeId}|${newDayKey}`;
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({ id: a.id, employeeId: a.employeeId, oldISO, oldDayKey, newISO, newDayKey });
        }

        // Sort to avoid self-collision on overlapping days
        if (deltaDays > 0) {
            items.sort((a, b) => (a.oldDayKey > b.oldDayKey ? -1 : a.oldDayKey < b.oldDayKey ? 1 : 0));
        } else if (deltaDays < 0) {
            items.sort((a, b) => (a.oldDayKey < b.oldDayKey ? -1 : a.oldDayKey > b.oldDayKey ? 1 : 0));
        }

        // Per-assignment sequential shift with rollback on failure
        let created = 0;
        let failed = 0;
        let rollbackFailed = 0;
        let warningCount = 0;

        for (const item of items) {
            // a) DELETE old assignment
            await fetch(`/api/assignments/${item.id}`, { method: 'DELETE' });

            // b) POST shifted assignment
            const postRes = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduleId: schedule.id,
                    employeeId: item.employeeId,
                    date: item.newISO,
                    allowConflicts: true,
                }),
            });

            if (postRes.ok) {
                created++;
                const data = await postRes.json();
                if (Array.isArray(data.warnings)) warningCount += data.warnings.length;
            } else {
                // c) POST failed — rollback: re-create original assignment
                failed++;
                const rollbackRes = await fetch('/api/assignments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scheduleId: schedule.id,
                        employeeId: item.employeeId,
                        date: item.oldISO,
                        allowConflicts: true,
                    }),
                });
                if (!rollbackRes.ok) rollbackFailed++;
            }
        }

        return { total: items.length, created, failed, rollbackFailed, warnings: warningCount };
    };

    // ---- button handlers ----

    const handleChoice = async (choice: StaffingChoice) => {
        setIsBusy(true);
        try {
            // Step 1: PATCH schedule times
            const ok = await patchScheduleTimes();
            if (!ok) return;

            // Step 2: Handle assignments
            if (choice === 'reset') {
                await deleteAllAssignments();
                toast.success('Schedule moved. Assignments cleared.');
            } else {
                const s = await shiftAssignments();
                if (s.failed > 0 || s.rollbackFailed > 0) {
                    const parts = [`Shifted ${s.created}/${s.total}`];
                    if (s.failed > 0) parts.push(`${s.failed} failed`);
                    if (s.rollbackFailed > 0) parts.push(`${s.rollbackFailed} rollbacks failed`);
                    if (s.warnings > 0) parts.push(`${s.warnings} warnings`);
                    toast.info(`Schedule moved. ${parts.join(', ')}.`);
                } else if (s.warnings > 0) {
                    toast.info(`Schedule moved. Shifted ${s.created}/${s.total} assignments (${s.warnings} warnings).`);
                } else if (s.total > 0) {
                    toast.success(`Schedule moved. ${s.created} assignment(s) shifted.`);
                } else {
                    toast.success('Schedule moved.');
                }
            }

            onComplete();
        } catch (err: any) {
            toast.error(err.message || 'Error during reschedule');
        } finally {
            setIsBusy(false);
        }
    };

    // Cancel: pure state clear, zero mutations
    const handleCancel = () => {
        if (isBusy) return;
        onCancel();
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="a08-modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div
                    className="fixed inset-0 z-40 bg-transparent backdrop-blur-sm backdrop-brightness-90 transition-all"
                    aria-hidden="true"
                    onClick={handleCancel}
                />
                <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div className="relative z-50 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="a08-modal-title">
                            Reschedule: Staffing Decision
                        </h3>
                        <div className="mt-2 text-sm text-gray-600 space-y-3">
                            <p>Moving <strong>{schedule.title}</strong>:</p>
                            <div className="bg-gray-50 rounded p-3 border">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-gray-500 w-12">From:</span>
                                    <span className="font-medium text-red-600 line-through">
                                        {format(parseISO(schedule.startTime), 'MMM d, yyyy HH:mm')} - {format(parseISO(schedule.endTime), 'HH:mm')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 w-12">To:</span>
                                    <span className="font-medium text-green-700">
                                        {format(newStart, 'MMM d, yyyy HH:mm')} - {format(newEnd, 'HH:mm')}
                                    </span>
                                </div>
                            </div>

                            {assignmentCount > 0 ? (
                                <div className="rounded-md bg-blue-50 p-3 border border-blue-200">
                                    <p className="text-sm text-blue-800">
                                        This schedule has <strong>{assignmentCount}</strong> assignment(s).
                                        How should they be handled?
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-md bg-gray-50 p-3 border border-gray-200">
                                    <p className="text-sm text-gray-600">No assignments to move.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-gray-50 px-4 py-3 sm:px-6 border-t space-y-2">
                        {assignmentCount > 0 ? (
                            <>
                                <button
                                    type="button"
                                    data-testid="reschedule-keep"
                                    onClick={() => handleChoice('keep')}
                                    disabled={isBusy}
                                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                                >
                                    {isBusy ? 'Processing...' : 'Keep Assignees (shift dates)'}
                                </button>
                                <button
                                    type="button"
                                    data-testid="reschedule-reset"
                                    onClick={() => handleChoice('reset')}
                                    disabled={isBusy}
                                    className="w-full inline-flex justify-center rounded-md border border-red-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                                >
                                    {isBusy ? 'Processing...' : 'Reset to Unstaffed'}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                data-testid="reschedule-confirm"
                                onClick={() => handleChoice('keep')}
                                disabled={isBusy}
                                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                            >
                                {isBusy ? 'Processing...' : 'Confirm'}
                            </button>
                        )}
                        <button
                            type="button"
                            data-testid="reschedule-cancel"
                            onClick={handleCancel}
                            disabled={isBusy}
                            className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
