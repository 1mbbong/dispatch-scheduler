'use client';

import { useState } from 'react';
import { SerializedEmployeeWithStats, SerializedCustomerArea } from '@/types';
import { useToast } from '@/components/ui/toast';

interface EmployeeFormProps {
    employee?: SerializedEmployeeWithStats | null | any;
    customerAreas: SerializedCustomerArea[];
    onSuccess: () => void;
    onCancel: () => void;
}

export function EmployeeForm({ employee, customerAreas, onSuccess, onCancel }: EmployeeFormProps) {
    const toast = useToast();
    const [name, setName] = useState(employee?.name || '');
    const [email, setEmail] = useState(employee?.email || '');
    const [phone, setPhone] = useState(employee?.phone || '');
    const [customerAreaId, setCustomerAreaId] = useState(employee?.customerAreaId || '');
    const [department, setDepartment] = useState(employee?.department || '');
    const [team, setTeam] = useState(employee?.team || '');
    const [subTeam, setSubTeam] = useState(employee?.subTeam || '');
    const [joinYear, setJoinYear] = useState<string | number>(employee?.joinYear || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const url = employee
                ? `/api/employees/${employee.id}`
                : '/api/employees';

            const method = employee ? 'PATCH' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email,
                    phone,
                    customerAreaId: customerAreaId || null,
                    department,
                    team,
                    subTeam,
                    joinYear: joinYear ? Number(joinYear) : null
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

            toast.success(employee ? 'Employee updated' : 'Employee added');
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
                <label htmlFor="name" className="block text-sm font-medium text-gray-700"> Name </label>
                <input
                    type="text"
                    id="name"
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>

            <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700"> Email </label>
                <input
                    type="email"
                    id="email"
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>

            <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700"> Phone </label>
                <input
                    type="tel"
                    id="phone"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                />
            </div>

            <div>
                <label htmlFor="customerAreaId" className="block text-sm font-medium text-gray-700"> Customer Area <span className="text-gray-400 font-normal">(Optional)</span></label>
                <select
                    id="customerAreaId"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                    value={customerAreaId}
                    onChange={(e) => setCustomerAreaId(e.target.value)}
                >
                    <option value="">-- No Customer Area --</option>
                    {customerAreas.map(ca => (
                        <option key={ca.id} value={ca.id}>
                            {ca.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="department" className="block text-sm font-medium text-gray-700"> Department </label>
                    <input
                        type="text"
                        id="department"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="e.g. Engineering"
                    />
                </div>
                <div>
                    <label htmlFor="team" className="block text-sm font-medium text-gray-700"> Team </label>
                    <input
                        type="text"
                        id="team"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={team}
                        onChange={(e) => setTeam(e.target.value)}
                        placeholder="e.g. Frontend"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="subTeam" className="block text-sm font-medium text-gray-700"> Sub-Team <span className="text-gray-400 font-normal">(Optional)</span></label>
                    <input
                        type="text"
                        id="subTeam"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={subTeam}
                        onChange={(e) => setSubTeam(e.target.value)}
                        placeholder="e.g. Core UI"
                    />
                </div>
                <div>
                    <label htmlFor="joinYear" className="block text-sm font-medium text-gray-700"> Join Year <span className="text-gray-400 font-normal">(Optional)</span></label>
                    <input
                        type="number"
                        id="joinYear"
                        min="1900"
                        max="2100"
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
                        value={joinYear}
                        onChange={(e) => setJoinYear(e.target.value)}
                        placeholder="e.g. 2024"
                    />
                </div>
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
                    disabled={isLoading}
                    className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                >
                    {isLoading ? 'Saving...' : 'Save'}
                </button>
            </div>
        </form>
    );
}
