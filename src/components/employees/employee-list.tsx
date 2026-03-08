'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SerializedEmployeeWithStats, SerializedCustomerArea } from '@/types';
import { EmployeeForm } from './employee-form';
import { useToast } from '@/components/ui/toast';
import Link from 'next/link';

interface EmployeeListProps {
    initialEmployees: SerializedEmployeeWithStats[];
    customerAreas: SerializedCustomerArea[];
    canManage: boolean;
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
}

export function EmployeeList({ initialEmployees, customerAreas, canManage, page, totalCount, totalPages }: EmployeeListProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<SerializedEmployeeWithStats | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const toast = useToast();

    const goToPage = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', String(newPage));
        router.push(`/employees?${params.toString()}`);
    };

    const handleOpenCreate = () => {
        setEditingEmployee(null);
        setIsModalOpen(true);
    };

    const handleOpenEdit = (employee: SerializedEmployeeWithStats) => {
        setEditingEmployee(employee);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingEmployee(null);
    };

    const handleSuccess = () => {
        closeModal();
        router.refresh();
    };

    const handleDelete = async (employee: SerializedEmployeeWithStats) => {
        const confirmed = window.confirm(
            `Delete "${employee.name}"?\n\nThis will deactivate the employee (soft delete). Existing schedules and assignments will be kept.`
        );
        if (!confirmed) return;

        setDeletingId(employee.id);
        try {
            const res = await fetch(`/api/employees/${employee.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false }),
            });

            if (res.status === 403) {
                toast.error('Not authorized');
                return;
            }
            if (res.status === 404) {
                toast.error('Employee not found');
                return;
            }
            if (!res.ok) {
                toast.error('Failed to delete employee');
                return;
            }

            toast.success(`"${employee.name}" deleted`);
            router.refresh();
        } catch (e) {
            console.error(e);
            toast.error('Error deleting employee');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="bg-white shadow rounded-lg overflow-hidden border">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                <h3 className="text-sm font-medium text-gray-500">
                    Total Employees: {totalCount}
                </h3>
                {canManage && (
                    <button
                        onClick={handleOpenCreate}
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-1.5 px-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                        Add Employee
                    </button>
                )}
            </div>

            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Phone
                        </th>
                        {canManage && (
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        )}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {initialEmployees.length === 0 ? (
                        <tr>
                            <td colSpan={canManage ? 4 : 3} className="px-6 py-10 text-center text-sm text-gray-500">
                                No employees found. Add one to get started.
                            </td>
                        </tr>
                    ) : (
                        initialEmployees.map((employee) => (
                            <tr key={employee.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <Link href={`/employees/${employee.id}`} className="text-indigo-600 hover:text-indigo-900 hover:underline">
                                        {employee.name}
                                    </Link>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {employee.email}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {employee.phone || '-'}
                                </td>
                                {canManage && (
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                                        <button
                                            onClick={() => handleOpenEdit(employee)}
                                            className="text-indigo-600 hover:text-indigo-900"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(employee)}
                                            disabled={deletingId === employee.id}
                                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                        >
                                            {deletingId === employee.id ? 'Deleting...' : 'Delete'}
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
                                    {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                                </h3>
                                <EmployeeForm
                                    employee={editingEmployee}
                                    customerAreas={customerAreas}
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

