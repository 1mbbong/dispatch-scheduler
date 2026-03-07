'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ScheduleForm } from '@/components/schedules/schedule-form';
import { VacationForm } from '@/components/vacations/vacation-form';
import { SerializedEmployeeWithStats, SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';

interface SelectionActionModalProps {
    startDate: Date;
    endDate: Date;
    employees: SerializedEmployeeWithStats[];
    onClose: () => void;
    customerAreas?: SerializedCustomerArea[];
    scheduleStatuses?: SerializedScheduleStatus[];
    workTypes?: SerializedWorkType[];
    offices?: { id: string, name: string }[];
}

export function SelectionActionModal({ startDate, endDate, employees, onClose, customerAreas = [], scheduleStatuses = [], workTypes = [], offices = [] }: SelectionActionModalProps) {
    const router = useRouter();
    const [action, setAction] = useState<'picker' | 'schedule' | 'vacation'>('picker');
    const [isDirty, setIsDirty] = useState(false);

    const requestClose = () => {
        if (isDirty) {
            if (confirm('저장되지 않은 변경사항이 있습니다. 닫으면 내용이 사라집니다. Discard 하시겠습니까?')) {
                onClose();
            }
        } else {
            onClose();
        }
    };

    const requestCloseRef = useRef(requestClose);
    useEffect(() => {
        requestCloseRef.current = requestClose;
    }, [requestClose]);

    useEffect(() => {
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
    }, []);

    const handleSuccess = () => {
        setIsDirty(false);
        onClose();
        router.refresh();
    };

    const isSingleDay = startDate.getTime() === endDate.getTime();
    const dateRangeLabel = isSingleDay
        ? format(startDate, 'MMM d, yyyy')
        : `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;

    if (action === 'schedule') {
        return (
            <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                    <div className="fixed inset-0 z-40 bg-transparent backdrop-blur-sm backdrop-brightness-90 transition-all" aria-hidden="true" onClick={requestClose}></div>
                    <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>
                    <div className="relative z-50 inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4" id="modal-title">
                                New Schedule
                            </h3>
                            <ScheduleForm
                                initialDate={startDate}
                                initialEndDate={endDate}
                                onSuccess={handleSuccess}
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
        );
    }

    if (action === 'vacation') {
        return (
            <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                    <div className="fixed inset-0 z-40 bg-transparent backdrop-blur-sm backdrop-brightness-90 transition-all" aria-hidden="true" onClick={requestClose}></div>
                    <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>
                    <div className="relative z-50 inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4" id="modal-title">
                                New Vacation
                            </h3>
                            <VacationForm
                                employees={employees}
                                initialDate={startDate}
                                initialEndDate={endDate}
                                onSuccess={handleSuccess}
                                onCancel={requestClose}
                                onDirtyChange={setIsDirty}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Picker view
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                <div className="fixed inset-0 z-40 bg-transparent backdrop-blur-sm backdrop-brightness-90 transition-all" aria-hidden="true" onClick={requestClose}></div>
                <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>
                <div className="relative z-50 inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-md sm:align-middle">
                    <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div className="sm:flex sm:items-start">
                            <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-2" id="modal-title">
                                    Create for {dateRangeLabel}
                                </h3>
                                <p className="text-sm text-gray-500 mb-6">
                                    What would you like to create for this date range?
                                </p>
                                <div className="space-y-3">
                                    <button
                                        onClick={() => setAction('schedule')}
                                        className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                                    >
                                        New Schedule
                                    </button>
                                    <button
                                        onClick={() => setAction('vacation')}
                                        className="w-full flex justify-center items-center px-4 py-2 border border-blue-200 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                                    >
                                        New Vacation
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
