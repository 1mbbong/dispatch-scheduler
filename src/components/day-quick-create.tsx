'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScheduleForm } from '@/components/schedules/schedule-form';
import { VacationForm } from '@/components/vacations/vacation-form';
import { SerializedEmployeeWithStats } from '@/types';

interface DayQuickCreateProps {
    initialDate: Date;
    employees: SerializedEmployeeWithStats[];
}

export function DayQuickCreate({ initialDate, employees }: DayQuickCreateProps) {
    const router = useRouter();
    const [openModal, setOpenModal] = useState<'schedule' | 'vacation' | null>(null);

    const handleSuccess = () => {
        setOpenModal(null);
        router.refresh();
    };

    return (
        <>
            <div className="flex items-center space-x-2">
                <button
                    onClick={() => setOpenModal('schedule')}
                    className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                >
                    + Schedule
                </button>
                <button
                    onClick={() => setOpenModal('vacation')}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                    + Vacation
                </button>
            </div>

            {/* Schedule Modal */}
            {openModal === 'schedule' && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setOpenModal(null)}></div>
                        <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>
                        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4" id="modal-title">
                                    New Schedule
                                </h3>
                                <ScheduleForm
                                    initialDate={initialDate}
                                    onSuccess={handleSuccess}
                                    onCancel={() => setOpenModal(null)}
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
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setOpenModal(null)}></div>
                        <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>
                        <div className="inline-block transform overflow-hidden rounded-lg bg-white text-left align-bottom shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:align-middle">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4" id="modal-title">
                                    New Vacation
                                </h3>
                                <VacationForm
                                    employees={employees}
                                    initialDate={initialDate}
                                    onSuccess={handleSuccess}
                                    onCancel={() => setOpenModal(null)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
