'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ScheduleForm } from '@/components/schedules/schedule-form';
import { VacationForm } from '@/components/vacations/vacation-form';
import { SerializedEmployeeWithStats, SerializedCustomerArea, SerializedScheduleStatus, SerializedWorkType } from '@/types';
import { cn } from '@/lib/utils';

interface CalendarCellQuickCreateProps {
    date: Date;
    employees: SerializedEmployeeWithStats[];
    customerAreas?: SerializedCustomerArea[];
    scheduleStatuses?: SerializedScheduleStatus[];
    workTypes?: SerializedWorkType[];
    offices?: { id: string, name: string }[];
}

export function CalendarCellQuickCreate({ date, employees, customerAreas = [], scheduleStatuses = [], workTypes = [], offices = [] }: CalendarCellQuickCreateProps) {
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [openModal, setOpenModal] = useState<'schedule' | 'vacation' | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

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

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        }
        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isMenuOpen]);

    const handleSuccess = () => {
        setOpenModal(null);
        setIsDirty(false);
        setIsMenuOpen(false);
        router.refresh(); // Refresh page data
    };

    return (
        <div
            className={`absolute top-1 right-8 transition-opacity ${isMenuOpen || openModal ? 'opacity-100 z-50' : 'opacity-0 group-hover:opacity-100 z-10'}`}
            ref={menuRef}
            onClick={(e) => e.stopPropagation()} // Prevent triggering cell click
        >
            <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full bg-white/80 backdrop-blur-sm shadow-sm border border-gray-100 transition-colors"
                title="Quick create"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                </svg>
            </button>

            {isMenuOpen && (
                <div className="absolute top-full right-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-20">
                    <button
                        onClick={() => {
                            setOpenModal('schedule');
                            setIsDirty(false);
                            setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                    >
                        New Schedule
                    </button>
                    <button
                        onClick={() => {
                            setOpenModal('vacation');
                            setIsDirty(false);
                            setIsMenuOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                    >
                        New Vacation
                    </button>
                </div>
            )}

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
                                    initialDate={date}
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
                                    initialDate={date}
                                    onSuccess={handleSuccess}
                                    onCancel={requestClose}
                                    onDirtyChange={setIsDirty}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
