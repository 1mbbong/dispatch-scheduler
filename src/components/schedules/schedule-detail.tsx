'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SerializedScheduleWithAssignments, SerializedEmployeeWithStats } from '@/types';
import { useToast } from '@/components/ui/toast';
import { SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';
import { format, parseISO, eachDayOfInterval, isSameDay } from 'date-fns';
import { ScheduleForm } from '@/components/schedules/schedule-form';

interface ScheduleDetailProps {
    schedule: SerializedScheduleWithAssignments;
    employees: SerializedEmployeeWithStats[];
    overlappingEvents?: {
        schedules: any[];
        vacations: any[];
    };
    categoryLabel?: string;
    canManage: boolean;
    auditLogs: any[];
    customerAreas?: SerializedCustomerArea[];
    scheduleStatuses?: SerializedScheduleStatus[];
    workTypes?: SerializedWorkType[];
    offices?: { id: string, name: string }[];
}

export function ScheduleDetail({ schedule, employees, overlappingEvents, categoryLabel = 'Category', canManage, auditLogs, customerAreas = [], scheduleStatuses = [], workTypes = [], offices = [] }: ScheduleDetailProps) {
    const router = useRouter();
    const toast = useToast();
    const startTime = parseISO(schedule.startTime);
    const endTime = parseISO(schedule.endTime);
    const scheduleDays = eachDayOfInterval({ start: startTime, end: endTime });

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [error, setError] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') === 'history' ? 'HISTORY' : 'DETAILS';
    const [activeTab, setActiveTab] = useState<'DETAILS' | 'HISTORY'>(initialTab);

    const requestClose = () => {
        if (isDirty) {
            if (confirm('저장되지 않은 변경사항이 있습니다. 닫으면 내용이 사라집니다. Discard 하시겠습니까?')) {
                setIsEditModalOpen(false);
                setIsDirty(false);
            }
        } else {
            setIsEditModalOpen(false);
        }
    };

    const requestCloseRef = useRef(requestClose);
    useEffect(() => {
        requestCloseRef.current = requestClose;
    }, [requestClose]);

    useEffect(() => {
        if (!isEditModalOpen) return;

        const originalStyle = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                requestCloseRef.current();
            }
        };
        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.body.style.overflow = originalStyle;
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [isEditModalOpen]);



    const renderPerDayAssignments = () => {
        let unstaffedDaysCount = 0;
        const unstaffedDates: string[] = [];
        const vacations = overlappingEvents?.vacations || [];
        const schedules = overlappingEvents?.schedules || [];

        return (
            <div className="space-y-4">
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {scheduleDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
                        const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);

                        // Find who is assigned TODAY
                        const assignedIds = new Set(
                            schedule.assignments
                                .filter((a: any) => isSameDay(parseISO(a.date), day))
                                .map((a: any) => a.employeeId)
                        );

                        // Map of employeeId -> assignmentId for this precise date
                        const assignmentIdMap = new Map<string, string>();
                        schedule.assignments.forEach((a: any) => {
                            if (isSameDay(parseISO(a.date), day)) {
                                assignmentIdMap.set(a.employeeId, a.id);
                            }
                        });


                        if (assignedIds.size === 0) {
                            unstaffedDaysCount++;
                            unstaffedDates.push(format(day, 'MMM d'));
                        }

                        // Find status for each employee on this specific day
                        const bucketAssigned: typeof employees = [];
                        const bucketAvailable: typeof employees = [];
                        const bucketOverbooked: Array<typeof employees[0] & { conflictContext?: string }> = [];
                        const bucketVacation: typeof employees = [];

                        employees.forEach((emp: any) => {
                            if (assignedIds.has(emp.id)) {
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
                                s.id !== schedule.id &&
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
                                    {assignedIds.size === 0 && (
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
                                                    disabled={isLoading || !canManage}
                                                    onClick={() => handleToggleAssignee(emp.id, day, assignmentIdMap.get(emp.id))}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border-2 border-indigo-500 hover:bg-indigo-200 transition-colors disabled:opacity-50"
                                                >
                                                    <span className="mr-1">✓</span> {emp.name}
                                                </button>
                                            ))}

                                            {/* 2. Available */}
                                            {bucketAvailable.map((emp: any) => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    disabled={isLoading || !canManage}
                                                    onClick={() => handleToggleAssignee(emp.id, day)}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 hover:border-gray-400 transition-colors disabled:opacity-50"
                                                >
                                                    {emp.name}
                                                </button>
                                            ))}

                                            {/* 3. Overbooked */}
                                            {bucketOverbooked.map((emp: any) => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    disabled={isLoading || !canManage}
                                                    onClick={() => handleToggleAssignee(emp.id, day)}
                                                    title={emp.conflictContext}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-800 border border-yellow-300 hover:bg-yellow-100 transition-colors group relative disabled:opacity-50"
                                                >
                                                    <span className="mr-1">⚠️</span> {emp.name}
                                                    {/* Tooltip-like context on hover inside the button for larger screens */}
                                                    <span className="hidden group-hover:block absolute top-[110%] left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-sm whitespace-nowrap z-10 pointer-events-none">
                                                        {emp.conflictContext}
                                                    </span>
                                                </button>
                                            ))}

                                            {/* 4. Vacation */}
                                            {bucketVacation.map((emp: any) => (
                                                <button
                                                    key={emp.id}
                                                    type="button"
                                                    disabled={isLoading || !canManage}
                                                    onClick={() => handleToggleAssignee(emp.id, day)}
                                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-800 border border-orange-300 hover:bg-orange-100 transition-colors disabled:opacity-50"
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
                    <div className="mt-3 bg-red-50 border border-red-100 rounded-md p-3">
                        <p className="text-[12px] text-red-800 font-medium flex items-center gap-1.5">
                            <span className="text-xl">⚠️</span> {unstaffedDaysCount} unassigned day(s). Action required to satisfy coverage: {unstaffedDates.join(', ')}
                        </p>
                    </div>
                )}
            </div>
        );
    };

    const handleEditSuccess = () => {
        setIsEditModalOpen(false);
        setIsDirty(false);
        router.refresh();
    };

    const handleToggleAssignee = async (employeeId: string, day: Date, currentAssignmentId?: string) => {
        if (!canManage) return;
        setIsLoading(true);

        try {
            if (currentAssignmentId) {
                // DELETE Exact assignment ID
                const res = await fetch(`/api/assignments/${currentAssignmentId}`, { method: 'DELETE' });
                if (res.ok) {
                    toast.success('Employee unassigned');
                } else {
                    throw new Error('Failed to unassign');
                }
            } else {
                // ADD
                const y = day.getFullYear();
                const m = day.getMonth(); // 0-indexed
                const d = day.getDate();
                const utcMidnight = new Date(Date.UTC(y, m, d, 0, 0, 0, 0)).toISOString();

                const res = await fetch('/api/assignments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        scheduleId: schedule.id,
                        employeeId,
                        date: utcMidnight,
                        allowConflicts: true,
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.warnings && data.warnings.length > 0) {
                        toast.info(`⚠️ Saved with ${data.warnings.length} warnings`);
                    } else {
                        toast.success('Employee assigned');
                    }
                } else {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to assign');
                }
            }
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Error updating assignment');
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleStatus = async () => {
        const isCancelling = schedule.status === 'ACTIVE';
        const message = isCancelling
            ? 'Cancel this schedule? Assignments will be kept.'
            : 'Reactivate this schedule?';
        if (!confirm(message)) return;

        setIsTogglingStatus(true);
        try {
            const res = await fetch(`/api/schedules/${schedule.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: isCancelling ? 'CANCELLED' : 'ACTIVE' }),
            });
            if (res.ok) {
                toast.success(isCancelling ? 'Schedule cancelled' : 'Schedule reactivated');
                router.refresh();
            } else if (res.status === 403) {
                toast.error('Not authorized');
            } else {
                toast.error('Failed to update schedule status');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error updating schedule status');
        } finally {
            setIsTogglingStatus(false);
        }
    };



    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Info */}
            <div className="md:col-span-2 space-y-6">
                <div className="bg-white shadow rounded-lg p-6 border">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-gray-900">{schedule.title}</h2>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${schedule.status === 'CANCELLED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                                    }`}>
                                    {schedule.status}
                                </span>
                                {/* Render Category Badge if exists */}
                                {schedule.category && (
                                    <span
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                                        style={{
                                            backgroundColor: `${schedule.category.color}15`, // extremely light tint
                                            borderColor: `${schedule.category.color}40`,
                                            color: schedule.category.color
                                        }}
                                        title={`${categoryLabel}: ${schedule.category.name}`}
                                    >
                                        {schedule.category.name}
                                    </span>
                                )}
                            </div>
                            {schedule.description && (
                                <p className="mt-1 text-sm text-gray-500">{schedule.description}</p>
                            )}
                            <div className="mt-2 text-sm text-gray-500 space-y-1">
                                <p>Start: <span className="font-medium text-gray-900">{format(startTime, 'PPpp')}</span></p>
                                <p>End: <span className="font-medium text-gray-900">{format(endTime, 'PPpp')}</span></p>
                            </div>
                        </div>
                        {canManage && (
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                                >
                                    Edit Schedule
                                </button>
                                <button
                                    onClick={handleToggleStatus}
                                    disabled={isTogglingStatus}
                                    className={`text-sm font-medium disabled:opacity-50 ${schedule.status === 'ACTIVE'
                                        ? 'text-red-600 hover:text-red-800'
                                        : 'text-green-600 hover:text-green-800'
                                        }`}
                                >
                                    {isTogglingStatus
                                        ? 'Updating...'
                                        : schedule.status === 'ACTIVE'
                                            ? 'Cancel Schedule'
                                            : 'Reactivate'}
                                </button>
                            </div>
                        )}
                    </div>
                    {schedule.status === 'CANCELLED' && (
                        <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 p-3">
                            <p className="text-sm text-amber-800">
                                This schedule is cancelled and does not participate in conflict checks.
                            </p>
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="mt-6 border-b border-gray-200">
                        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                            <button
                                onClick={() => setActiveTab('DETAILS')}
                                className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'DETAILS'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                Assignments
                            </button>
                            <button
                                onClick={() => setActiveTab('HISTORY')}
                                className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'HISTORY'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                    }`}
                            >
                                History
                            </button>
                        </nav>
                    </div>
                </div>

                {activeTab === 'DETAILS' && (
                    <div className="bg-white shadow rounded-lg overflow-hidden border">
                        <div className="px-4 py-5 sm:px-6 flex flex-col sm:flex-row justify-between sm:items-center bg-gray-50 border-b">
                            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2 sm:mb-0">
                                Assigned Employees
                            </h3>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {schedule.assignments.length} / {employees.length} Assignments
                            </span>
                        </div>

                        <div className="p-4 sm:px-6">
                            {renderPerDayAssignments()}
                        </div>
                    </div>
                )}

                {activeTab === 'HISTORY' && (
                    <div className="bg-white shadow rounded-lg p-6 border">
                        <h3 className="text-lg font-medium text-gray-900 mb-6">Schedule History</h3>
                        {auditLogs.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">No history records found.</p>
                        ) : (
                            <div className="flow-root">
                                <ul role="list" className="-mb-8">
                                    {auditLogs.map((log, logIdx) => {
                                        const isLast = logIdx === auditLogs.length - 1;

                                        // Format action name nicely
                                        const actionName = log.action
                                            .split('_')
                                            .map((w: string) => w.charAt(0) + w.slice(1).toLowerCase())
                                            .join(' ');

                                        // Try to build a diff string
                                        let diffDesc = '';
                                        if (log.action === 'UPDATE_SCHEDULE' && log.oldData && log.newData) {
                                            const oldS = log.oldData.startTime;
                                            const newS = log.newData.startTime;
                                            const oldE = log.oldData.endTime;
                                            const newE = log.newData.endTime;

                                            const oldTitle = log.oldData.title;
                                            const newTitle = log.newData.title;

                                            const timeChanged = oldS !== newS || oldE !== newE;
                                            const titleChanged = oldTitle !== newTitle;

                                            let diffs = [];
                                            if (timeChanged) {
                                                const osFormatted = oldS ? format(parseISO(oldS), 'MMM d, HH:mm') : '?';
                                                const oeFormatted = oldE ? format(parseISO(oldE), 'HH:mm') : '?';
                                                const nsFormatted = newS ? format(parseISO(newS), 'MMM d, HH:mm') : '?';
                                                const neFormatted = newE ? format(parseISO(newE), 'HH:mm') : '?';
                                                diffs.push(`Time: ${osFormatted}-${oeFormatted} → ${nsFormatted}-${neFormatted}`);
                                            }
                                            if (titleChanged) {
                                                diffs.push(`Title: "${oldTitle}" → "${newTitle}"`);
                                            }

                                            diffDesc = diffs.join(' | ');
                                        }

                                        return (
                                            <li key={log.id}>
                                                <div className="relative pb-8">
                                                    {!isLast && (
                                                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                                                    )}
                                                    <div className="relative flex space-x-3">
                                                        <div>
                                                            <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${log.action.includes('CREATE') ? 'bg-green-500' :
                                                                log.action.includes('CANCEL') ? 'bg-red-500' :
                                                                    'bg-blue-500'
                                                                }`}>
                                                                <span className="text-white text-xs font-bold">
                                                                    {log.actor.name ? log.actor.name.charAt(0) : 'S'}
                                                                </span>
                                                            </span>
                                                        </div>
                                                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                                            <div>
                                                                <p className="text-sm text-gray-500">
                                                                    <span className="font-medium text-gray-900">{log.actor.name || 'System'}</span>
                                                                    {' '}performed{' '}
                                                                    <span className="font-medium text-gray-900">{actionName}</span>
                                                                </p>
                                                                {diffDesc && (
                                                                    <div className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-md p-2 border border-gray-100">
                                                                        {diffDesc}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="whitespace-nowrap text-right text-sm text-gray-500">
                                                                <time dateTime={log.timestamp}>{format(parseISO(log.timestamp), 'MMM d, HH:mm(ss)')}</time>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Edit Schedule Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="edit-modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 z-40 bg-transparent backdrop-blur-sm backdrop-brightness-90 transition-all" aria-hidden="true" onClick={requestClose}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="relative z-50 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="edit-modal-title">
                                    Edit Schedule
                                </h3>
                                <ScheduleForm
                                    schedule={schedule}
                                    onSuccess={handleEditSuccess}
                                    onCancel={requestClose}
                                    onDirtyChange={setIsDirty}
                                    customerAreas={customerAreas}
                                    scheduleStatuses={scheduleStatuses}
                                    workTypes={workTypes}
                                    offices={offices}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
