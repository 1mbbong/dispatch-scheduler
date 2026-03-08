'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PASTEL_PALETTE } from '@/lib/palette';

type LabelType = 'CUSTOMER_AREA' | 'SCHEDULE_STATUS' | 'WORK_TYPE' | 'OFFICE';

interface BaseLabel {
    id: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
}

interface ColorLabel extends BaseLabel {
    color: string;
    isCanceled?: boolean;
}

interface LabelManagerProps {
    initialCustomerAreas: ColorLabel[];
    initialStatuses: ColorLabel[];
    initialWorkTypes: BaseLabel[];
    initialOffices: BaseLabel[];
}

export function LabelManager({
    initialCustomerAreas,
    initialStatuses,
    initialWorkTypes,
    initialOffices
}: LabelManagerProps) {
    const router = useRouter();

    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Editing State Trackers
    const [editingType, setEditingType] = useState<LabelType | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form States
    const [name, setName] = useState('');
    const [color, setColor] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [isCanceled, setIsCanceled] = useState(false);
    const [sortOrder, setSortOrder] = useState<number>(0);

    const startNew = (type: LabelType) => {
        setEditingType(type);
        setEditingId(null);
        setName('');
        setColor((type !== 'WORK_TYPE' && type !== 'OFFICE') ? PASTEL_PALETTE[0] : '');
        setIsActive(true);
        setIsCanceled(false);
        setSortOrder(0);
        setError(null);
    };

    const startEdit = (type: LabelType, item: BaseLabel | ColorLabel) => {
        setEditingType(type);
        setEditingId(item.id);
        setName(item.name);
        setColor('color' in item ? item.color : '');
        setIsActive(item.isActive);
        setIsCanceled('isCanceled' in item ? !!item.isCanceled : false);
        setSortOrder(item.sortOrder);
        setError(null);
    };

    const cancelEdit = () => {
        setEditingType(null);
        setEditingId(null);
        setError(null);
    };

    const getApiUrl = (type: LabelType, id: string | null = null) => {
        let base = '';
        if (type === 'CUSTOMER_AREA') base = '/api/customer-areas';
        if (type === 'SCHEDULE_STATUS') base = '/api/statuses';
        if (type === 'WORK_TYPE') base = '/api/work-types';
        if (type === 'OFFICE') base = '/api/offices';
        return id ? `${base}/${id}` : base;
    };

    const saveLabel = async () => {
        if (!editingType || !name.trim()) {
            setError('Name is required');
            return;
        }

        setLoading(true);
        setError(null);

        const url = getApiUrl(editingType, editingId);
        const method = editingId ? 'PATCH' : 'POST';

        const payload: any = {
            name: name.trim(),
            isActive,
            sortOrder,
        };
        if (editingType !== 'WORK_TYPE' && editingType !== 'OFFICE') {
            payload.color = color;
        }
        if (editingType === 'SCHEDULE_STATUS') {
            payload.isCanceled = isCanceled;
        }

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const data = await res.json();
                if (res.status === 409) {
                    setError('A label with this name already exists.');
                } else {
                    setError(data.error || 'Failed to save label');
                }
                setLoading(false);
                return;
            }

            cancelEdit();
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const deleteLabel = async (type: LabelType, id: string) => {
        if (!confirm('Are you sure you want to delete this label? If it is currently heavily used, the system will gracefully disable it instead to prevent errors.')) return;

        setLoading(true);
        setError(null);

        try {
            const url = getApiUrl(type, id);
            const res = await fetch(url, { method: 'DELETE' });

            if (!res.ok) {
                setError('Failed to delete label.');
                setLoading(false);
                return;
            }
            // Deactivated or deleted (L2 logic falls back to deactivated softly)
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const renderPaletteRow = () => (
        <div className="flex flex-wrap gap-2 mb-4">
            {PASTEL_PALETTE.map((swatch) => (
                <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    className={`h-8 w-8 rounded-full border-2 focus:outline-none transition-all ${color === swatch ? 'border-gray-900 shadow-sm scale-110' : 'border-transparent hover:scale-105'
                        }`}
                    style={{ backgroundColor: swatch }}
                    title={swatch}
                />
            ))}
        </div>
    );

    const renderTable = (type: LabelType, items: (BaseLabel | ColorLabel)[], title: string, hasColor: boolean) => {
        const isCurrentlyEditingType = editingType === type;
        return (
            <div className="mb-10 bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                    {!isCurrentlyEditingType && (
                        <button
                            onClick={() => startNew(type)}
                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-700 transition"
                        >
                            + Add New
                        </button>
                    )}
                </div>

                {isCurrentlyEditingType && (
                    <div className="p-5 border-b border-gray-200 bg-blue-50/50">
                        <h3 className="font-semibold text-gray-800 mb-4">{editingId ? 'Edit' : 'Create'} Label</h3>
                        {error && <div className="mb-4 text-sm text-red-600 font-medium bg-red-50 p-3 rounded-md border border-red-100">{error}</div>}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Label Name"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                                <input
                                    type="number"
                                    value={sortOrder}
                                    onChange={(e) => setSortOrder(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                        </div>

                        {hasColor && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                                {renderPaletteRow()}
                            </div>
                        )}

                        <div className="flex flex-col gap-4 mb-6">
                            <div className="flex items-center">
                                <input
                                    id="active-checkbox"
                                    type="checkbox"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor="active-checkbox" className="ml-2 block text-sm text-gray-900">
                                    Active (visible in selectors)
                                </label>
                            </div>

                            {type === 'SCHEDULE_STATUS' && (
                                <div className="flex items-start">
                                    <div className="flex items-center h-5">
                                        <input
                                            id="canceled-checkbox"
                                            type="checkbox"
                                            checked={isCanceled}
                                            onChange={(e) => setIsCanceled(e.target.checked)}
                                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                        />
                                    </div>
                                    <div className="ml-2 text-sm">
                                        <label htmlFor="canceled-checkbox" className="font-medium text-gray-900">
                                            취소 상태 (Cancel Status)
                                        </label>
                                        <p className="text-gray-500 text-xs mt-0.5">
                                            취소 상태 일정은 캘린더에서 흐리게 표시됩니다.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={cancelEdit}
                                disabled={loading}
                                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveLabel}
                                disabled={loading || !name.trim()}
                                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                )}

                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white">
                        <tr>
                            {hasColor && <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Color</th>}
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Order</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Status</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={hasColor ? 5 : 4} className="px-6 py-6 text-center text-gray-500 text-sm italic">
                                    No labels found.
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => (
                                <tr key={item.id} className={!item.isActive ? 'bg-gray-50/50 opacity-60' : 'hover:bg-gray-50'}>
                                    {hasColor && (
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div
                                                className="h-6 w-6 rounded border border-black/10 shadow-sm"
                                                style={{ backgroundColor: 'color' in item ? item.color : '#e5e7eb' }}
                                            />
                                        </td>
                                    )}
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {item.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {item.sortOrder}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {item.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => startEdit(type, item)}
                                            disabled={loading}
                                            className="text-indigo-600 hover:text-indigo-900 mr-4 disabled:opacity-50"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => deleteLabel(type, item.id)}
                                            disabled={loading}
                                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div>
            {renderTable('CUSTOMER_AREA', initialCustomerAreas, 'Customer Areas', true)}
            {renderTable('SCHEDULE_STATUS', initialStatuses, 'Schedule Statuses', true)}
            {renderTable('OFFICE', initialOffices, 'Offices', false)}
            {renderTable('WORK_TYPE', initialWorkTypes, 'Work Types', false)}
        </div>
    );
}
