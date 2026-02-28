'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SerializedScheduleWithAssignments, SerializedEmployeeWithStats } from '@/types';
import { format, parseISO, eachDayOfInterval, isSameDay } from 'date-fns';
import { ScheduleForm } from '@/components/schedules/schedule-form';
import { useToast } from '@/components/ui/toast';

interface ScheduleDetailProps {
    schedule: SerializedScheduleWithAssignments;
    employees: SerializedEmployeeWithStats[];
    overlappingEvents?: {
        schedules: any[];
        vacations: any[];
    };
    categoryLabel?: string;
    canManage: boolean;
}

export function ScheduleDetail({ schedule, employees, overlappingEvents, categoryLabel = 'Category', canManage }: ScheduleDetailProps) {
    const router = useRouter();
    const toast = useToast();
    const startTime = parseISO(schedule.startTime);
    const endTime = parseISO(schedule.endTime);
    const scheduleDays = eachDayOfInterval({ start: startTime, end: endTime });

    const [isAssigning, setIsAssigning] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [selectedDate, setSelectedDate] = useState<string>(scheduleDays[0].toISOString());
    const [error, setError] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);

    // Filter out already assigned employees FOR THE SELECTED DATE
    const assignedEmployeeIdsForSelectedDate = new Set(
        schedule.assignments
            .filter((a: any) => isSameDay(parseISO(a.date), parseISO(selectedDate)))
            .map((a: any) => a.employeeId)
    );
    const unassignedEmployees = employees.filter(e => !assignedEmployeeIdsForSelectedDate.has(e.id));

    // Helper to check if an employee has a conflict on a specific day
    const getEmployeeHintsForDay = (employeeId: string, day: Date) => {
        let hasVacation = false;
        let hasOverlap = false;

        if (overlappingEvents) {
            // Check vacations
            hasVacation = overlappingEvents.vacations.some(v => 
                v.employeeId === employeeId && 
                parseISO(v.startDate) <= day && 
                parseISO(v.endDate) >= day
            );
            
            // Check other schedules
            const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
            const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);
            hasOverlap = overlappingEvents.schedules.some(s => 
                s.assignments.some((a: any) => a.employeeId === employeeId) &&
                parseISO(s.startTime) < dayEnd &&
                parseISO(s.endTime) > dayStart
            );
        }

        return { hasVacation, hasOverlap };
    };

    // Group unassigned employees by availability for the currently selected date
    const selectedDateObj = parseISO(selectedDate);
    const bucketAvailable: SerializedEmployeeWithStats[] = [];
    const bucketOverbooked: SerializedEmployeeWithStats[] = [];
    const bucketVacation: SerializedEmployeeWithStats[] = [];

    unassignedEmployees.forEach(emp => {
        const { hasVacation, hasOverlap } = getEmployeeHintsForDay(emp.id, selectedDateObj);
        if (hasVacation) {
            bucketVacation.push(emp);
        } else if (hasOverlap) {
            bucketOverbooked.push(emp);
        } else {
            bucketAvailable.push(emp);
        }
    });

    // Parse 409 conflict response into a single user-friendly toast message.
    // Strategy: show up to 2 conflict items + "and X more" to avoid toast spam.
    const formatConflictToast = (data: any): string => {
        try {
            const isVacation = data.code === 'VACATION_CONFLICT';
            const headline = isVacation
                ? '🏖️ Vacation conflict'
                : '⚠️ Schedule conflict';

            const conflicts: any[] = data.conflicts ?? [];
            if (conflicts.length === 0) {
                return `${headline}: ${data.error || 'Overlap detected'}`;
            }

            const lines = conflicts.slice(0, 2).map((c: any) => {
                const start = c.startTime ? format(parseISO(c.startTime), 'MMM d HH:mm') : '?';
                const end = c.endTime ? format(parseISO(c.endTime), 'HH:mm') : '?';
                const title = isVacation ? 'Vacation' : (c.scheduleTitle || 'Unknown');
                return `• ${title} (${start}–${end})`;
            });

            const remaining = conflicts.length - 2;
            if (remaining > 0) {
                lines.push(`  ...and ${remaining} more`);
            }

            return `${headline}\n${lines.join('\n')}`;
        } catch {
            // Fallback for unexpected payload shapes
            return 'Conflict detected. Please review schedule/vacation overlaps.';
        }
    };

    const handleEditSuccess = () => {
        setIsEditModalOpen(false);
        router.refresh();
    };

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployeeId) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scheduleId: schedule.id,
                    employeeId: selectedEmployeeId,
                    date: selectedDate,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                // Handle Conflict Error specifically
                if (res.status === 409) {
                    setError(data); // Store for inline display
                    toast.error(formatConflictToast(data));
                } else {
                    throw new Error(data.error || 'Failed to assign employee');
                }
            } else {
                setIsAssigning(false);
                setSelectedEmployeeId('');
                toast.success('Employee assigned successfully');
                router.refresh();
            }
        } catch (err: any) {
            setError({ error: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnassign = async (assignmentId: string) => {
        if (!confirm('Unassign this employee?')) return;

        try {
            const res = await fetch(`/api/assignments/${assignmentId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                toast.success('Employee unassigned');
                router.refresh();
            } else {
                toast.error('Failed to unassign employee');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error unassigning employee');
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
                </div>

                {/* Assignments List */}
                <div className="bg-white shadow rounded-lg overflow-hidden border">
                    <div className="px-4 py-5 sm:px-6 flex justify-between items-center bg-gray-50">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                            Assigned Employees
                        </h3>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {schedule.assignments.length} / {employees.length}
                        </span>
                    </div>

                    {schedule.assignments.length === 0 ? (
                        <div className="px-4 py-8 text-sm text-gray-500 text-center border-t">No employees assigned yet.</div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {scheduleDays.map((day, idx) => (
                                <div key={day.toISOString()}>
                                    {scheduleDays.length > 1 && (
                                        <div className="bg-gray-100 px-4 py-2 border-t border-b text-sm font-semibold text-gray-700">
                                            {format(day, 'MMM d (EEE)')}
                                        </div>
                                    )}
                                    <ul className="divide-y divide-gray-100">
                                        {schedule.assignments
                                            .filter((a: any) => isSameDay(parseISO(a.date), day))
                                            .map((assignment) => {
                                            const { hasVacation, hasOverlap } = getEmployeeHintsForDay(assignment.employeeId, day);
                                            
                                            // Ensure assignment.employee exists
                                            const emp = assignment.employee;
                                            
                                            return (
                                                <li key={`${day.toISOString()}-${assignment.id}`} className="px-4 py-4 flex items-center justify-between hover:bg-gray-50">
                                                    <div className="flex items-center">
                                                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold mr-3">
                                                            {emp?.name ? emp.name.charAt(0) : '?'}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap text-xs md:text-sm">
                                                                <p className="font-medium text-gray-900">
                                                                    {emp ? emp.name : 'Unknown Employee'}
                                                                </p>
                                                                {!emp ? (
                                                                    <span title="Employee record not found" className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-red-100 text-red-800 cursor-help">
                                                                        (Unknown)
                                                                    </span>
                                                                ) : !emp.isActive ? (
                                                                    <span title="Inactive — cannot be assigned" className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-800 cursor-help">
                                                                        (Inactive)
                                                                    </span>
                                                                ) : null}
                                                                
                                                                {/* Hints */}
                                                                {hasVacation && (
                                                                    <span title="On vacation this day" className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-orange-100 text-orange-800 border border-orange-200 cursor-help">
                                                                        🏖️ Vacation
                                                                    </span>
                                                                )}
                                                                {hasOverlap && (
                                                                    <span title="Assigned to another schedule this day" className="inline-flex items-center px-2 py-0.5 rounded font-medium bg-yellow-100 text-yellow-800 border border-yellow-200 cursor-help">
                                                                        ⚠️ Overbooked
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-gray-500 mt-0.5">
                                                                {!emp
                                                                    ? 'Employee record not found'
                                                                    : !emp.isActive
                                                                        ? `${emp.email || 'No email'} (Inactive)`
                                                                        : (emp.email || 'No email')
                                                                }
                                                            </p>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Allow unassigning any individual day assignment */}
                                                    {canManage && (
                                                        <button
                                                            onClick={() => handleUnassign(assignment.id)}
                                                            className="text-sm text-red-600 hover:text-red-900 whitespace-nowrap ml-4 border border-transparent hover:border-red-200 px-2 py-1 rounded transition-colors"
                                                        >
                                                            Unassign
                                                        </button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Sidebar: Add Assignment */}
            <div className="space-y-6">
                <div className="bg-white shadow rounded-lg p-6 border">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Assign Employee</h3>

                    <form onSubmit={handleAssign} className="space-y-4">
                        {scheduleDays.length > 1 && (
                            <div>
                                <label htmlFor="assignment-date" className="block text-sm font-medium text-gray-700">Select Date</label>
                                <select
                                    id="assignment-date"
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    disabled={isLoading}
                                >
                                    {scheduleDays.map(day => (
                                        <option key={day.toISOString()} value={day.toISOString()}>
                                            {format(day, 'MMM d, yyyy (EEEE)')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label htmlFor="employee" className="block text-sm font-medium text-gray-700">Select Employee</label>
                            <select
                                id="employee"
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                disabled={isLoading}
                            >
                                <option value="">Choose...</option>
                                {bucketAvailable.length > 0 && (
                                    <optgroup label={`✅ Available (${bucketAvailable.length})`}>
                                        {bucketAvailable.map((emp) => (
                                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {bucketOverbooked.length > 0 && (
                                    <optgroup label={`⚠️ Overbooked (${bucketOverbooked.length})`}>
                                        {bucketOverbooked.map((emp) => (
                                            <option key={emp.id} value={emp.id}>{emp.name} (Has conflict)</option>
                                        ))}
                                    </optgroup>
                                )}
                                {bucketVacation.length > 0 && (
                                    <optgroup label={`🏖️ Vacation (${bucketVacation.length})`}>
                                        {bucketVacation.map((emp) => (
                                            <option key={emp.id} value={emp.id}>{emp.name} (On vacation)</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        {error && (
                            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
                                <p className="font-medium">
                                    {error.code === 'VACATION_CONFLICT'
                                        ? '🏖️ Vacation Conflict'
                                        : error.code === 'ASSIGNMENT_CONFLICT'
                                            ? '⚠️ Schedule Overlap'
                                            : 'Assignment Failed'}
                                </p>
                                <p className="mt-1">{error.error}</p>
                                {error.conflicts && error.conflicts.length > 0 && (
                                    <ul className="mt-2 list-disc list-inside text-xs">
                                        {error.conflicts.map((c: any, i: number) => (
                                            <li key={i}>
                                                {error.code === 'VACATION_CONFLICT'
                                                    ? <>Vacation: </>
                                                    : <>Overlap: <b>{c.scheduleTitle || 'Unknown'}</b> — </>}
                                                {format(parseISO(c.startTime), 'MMM d, HH:mm')} – {format(parseISO(c.endTime), 'HH:mm')}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={!selectedEmployeeId || isLoading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            {isLoading ? 'Checking...' : 'Assign'}
                        </button>
                    </form>
                </div>
            </div>

            {/* Edit Schedule Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="edit-modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setIsEditModalOpen(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="edit-modal-title">
                                    Edit Schedule
                                </h3>
                                <ScheduleForm
                                    schedule={schedule}
                                    onSuccess={handleEditSuccess}
                                    onCancel={() => setIsEditModalOpen(false)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
