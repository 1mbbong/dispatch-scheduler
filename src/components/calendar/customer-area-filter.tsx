'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SerializedCustomerArea } from '@/types';
import { cn } from '@/lib/utils';

interface CustomerAreaFilterProps {
    customerAreas: SerializedCustomerArea[];
}

export function CustomerAreaFilter({ customerAreas }: CustomerAreaFilterProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const areasParam = searchParams.get('areas');
    const selectedKeys = areasParam ? areasParam.split(',') : null; // null means 'All'

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const toggleArea = (id: string) => {
        let newSelection: string[];
        if (selectedKeys === null) {
            // "All" to specific selection -> select everything except clicked (unchecking) or just start fresh?
            // Starting fresh by selecting just what was clicked is easier mental model.
            // Wait, if it was 'All' and they click one, usually it means they only want that ONE.
            newSelection = [id];
        } else {
            if (selectedKeys.includes(id)) {
                newSelection = selectedKeys.filter(k => k !== id);
            } else {
                newSelection = [...selectedKeys, id];
            }
        }

        updateUrl(newSelection);
    };

    const setAll = () => {
        updateUrl(null);
    };

    const setNone = () => {
        updateUrl([]);
    };

    const updateUrl = (selection: string[] | null) => {
        const params = new URLSearchParams(searchParams);
        if (selection === null) {
            params.delete('areas');
        } else if (selection.length === 0) {
            params.set('areas', 'none'); // 'none' keyword to represent empty selection since omitted means All
        } else {
            params.set('areas', selection.join(','));
        }
        router.push(`${pathname}?${params.toString()}`);
    };

    const isAll = selectedKeys === null;

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border shadow-sm transition-colors",
                    isAll ? "bg-white text-gray-700 hover:bg-gray-50 border-gray-300" : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                )}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {isAll ? 'All Areas' : `Filtered (${selectedKeys?.length === 0 ? 'None' : selectedKeys?.length})`}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    <div className="p-2 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filter Areas</span>
                        <div className="space-x-2">
                            <button onClick={setAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">All</button>
                            <span className="text-gray-300">|</span>
                            <button onClick={setNone} className="text-xs text-gray-500 hover:text-gray-700 font-medium">None</button>
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {customerAreas.map(area => {
                            const selected = isAll || (selectedKeys !== null && selectedKeys.includes(area.id));
                            return (
                                <label
                                    key={area.id}
                                    className="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer group"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => toggleArea(area.id)}
                                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <div className="ml-3 flex items-center gap-2">
                                        <span
                                            className="w-3 h-3 rounded-full border border-black/10"
                                            style={{ backgroundColor: area.color || '#4f46e5' }}
                                        />
                                        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 truncate">
                                            {area.name}
                                        </span>
                                    </div>
                                </label>
                            );
                        })}
                        {/* Unassigned toggle */}
                        <label className="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer group border-t border-gray-50 mt-1">
                            <input
                                type="checkbox"
                                checked={isAll || (selectedKeys !== null && selectedKeys.includes('unassigned'))}
                                onChange={() => toggleArea('unassigned')}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <div className="ml-3 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full border border-dashed border-gray-400 bg-gray-100" />
                                <span className="text-sm font-medium text-gray-500 italic truncate">
                                    Unassigned
                                </span>
                            </div>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}
