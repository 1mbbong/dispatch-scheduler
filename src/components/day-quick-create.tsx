'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ScheduleForm } from '@/components/schedules/schedule-form';
import { VacationForm } from '@/components/vacations/vacation-form';
import { SerializedEmployeeWithStats, SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';

interface DayQuickCreateProps {
    initialDate: Date;
    employees: SerializedEmployeeWithStats[];
    customerAreas?: SerializedCustomerArea[];
    scheduleStatuses?: SerializedScheduleStatus[];
    workTypes?: SerializedWorkType[];
    offices?: { id: string, name: string }[];
}

export function DayQuickCreate({ initialDate, employees, customerAreas = [], scheduleStatuses = [], workTypes = [], offices = [] }: DayQuickCreateProps) {
    const router = useRouter();
    const [openModal, setOpenModal] = useState<'schedule' | 'vacation' | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    const requestClose = () => {
        if (isDirty) {
            if (confirm('저장되지 않은 변경사항이 있습니다. 닫으면 내용이 사라집니다. Discard 하시겠습니까?')) {
                setOpenModal(null);
                setIsDirty(false);
            }
        } else {
            setOpenModal(null);
        }
    };

    const requestCloseRef = useRef(requestClose);
    useEffect(() => {
        requestCloseRef.current = requestClose;
    }, [requestClose]);

    useEffect(() => {
        if (!openModal) return;

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
    }, [openModal]);

    const handleSuccess = () => {
        setOpenModal(null);
        setIsDirty(false);
        router.refresh();
    };

    return (
        <>
            <div className="flex items-center space-x-2">
                <button
                    onClick={() => {
                        setOpenModal('schedule');
                        setIsDirty(false);
                    }}
                    className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                >
                    + Schedule
                </button>
                <button
                    onClick={() => {
                        setOpenModal('vacation');
                        setIsDirty(false);
                    }}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                    + Vacation
                </button>
            </div>

            {/* Schedule Modal */}
            {openModal === 'schedule' && (
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
                                    initialDate={initialDate}
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
            )}

            {/* Vacation Modal */}
            {openModal === 'vacation' && (
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
                                    initialDate={initialDate}
                                    onSuccess={handleSuccess}
                                    onCancel={requestClose}
                                    onDirtyChange={setIsDirty}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
