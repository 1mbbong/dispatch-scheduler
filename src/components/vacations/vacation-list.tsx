'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SerializedVacationWithEmployee, SerializedEmployeeWithStats } from '@/types';
import { VacationForm } from './vacation-form';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/components/ui/toast';

interface VacationListProps {
    initialVacations: SerializedVacationWithEmployee[];
    employees: SerializedEmployeeWithStats[];
    canManage: boolean;
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
}

export function VacationList({ initialVacations, employees, canManage, page, totalCount, totalPages }: VacationListProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();

    const goToPage = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', String(newPage));
        router.push(`/vacations?${params.toString()}`);
    };

    const handleOpenCreate = () => {
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
    };

    const handleSuccess = () => {
        closeModal();
        router.refresh();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this vacation?')) return;

        try {
            const res = await fetch(`/api/vacations/${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                toast.success('Vacation deleted');
                router.refresh();
            } else {
                toast.error('Failed to delete vacation');
            }
        } catch (e) {
            console.error(e);
            toast.error('Error deleting vacation');
        }
    };

    return (
        <div className="bg-white shadow rounded-lg overflow-hidden border">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="text-sm font-medium text-gray-500">
                    Total Vacations: {totalCount}
                </h3>
                {canManage && (
                    <button
                        onClick={handleOpenCreate}
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-1.5 px-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        Add Vacation
                    </button>
                )}
            </div>

            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Employee
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Start Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            End Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Reason
                        </th>
                        {canManage && (
                            <th scope="col" className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {initialVacations.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-500">
                                No vacations found.
                            </td>
                        </tr>
                    ) : (
                        initialVacations.map((vacation) => (
                            <tr key={vacation.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {vacation.employee.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {format(parseISO(vacation.startDate), 'MMM d, yyyy')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {format(parseISO(vacation.endDate), 'MMM d, yyyy')}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {vacation.reason}
                                </td>
                                {canManage && (
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleDelete(vacation.id)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="px-4 py-3 flex items-center justify-between border-t bg-gray-50 sm:px-6">
                    <p className="text-sm text-gray-700">
                        Page <span className="font-medium">{page}</span> of{' '}
                        <span className="font-medium">{totalPages}</span>
                        {' '}({totalCount} total)
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                            className="relative inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages}
                            className="relative inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={closeModal}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
                                    Add New Vacation
                                </h3>
                                <VacationForm
                                    employees={employees}
                                    onSuccess={handleSuccess}
                                    onCancel={closeModal}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
