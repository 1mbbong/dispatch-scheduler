'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SerializedCustomerArea } from '@/types';
import { cn } from '@/lib/utils';

interface CalendarFilterProps {
    customerAreas: SerializedCustomerArea[];
    /** Which view is active — controls which display toggles are shown */
    view?: 'month' | 'week' | 'day';
}

export function CalendarFilter({ customerAreas, view = 'month' }: CalendarFilterProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // --- Read current filter state from URL ---
    const areasParam = searchParams.get('areas');
    const selectedAreas = areasParam ? areasParam.split(',') : null; // null = All

    const unstaffed = searchParams.get('unstaffed') === '1';

    const locParam = searchParams.get('loc');
    const selectedLoc = locParam ? locParam.split(',') : null; // null = All

    const showGhosts = searchParams.get('ghosts') !== '0';
    const showDayCounts = searchParams.get('dayCounts') !== '0';

    // Count active filters (non-default)
    const activeCount = [
        selectedAreas !== null ? 1 : 0,
        unstaffed ? 1 : 0,
        selectedLoc !== null ? 1 : 0,
        !showGhosts ? 1 : 0,
        !showDayCounts ? 1 : 0,
    ].reduce((a, b) => a + b, 0);

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

    // --- URL update helper ---
    const updateParam = (key: string, value: string | null) => {
        const params = new URLSearchParams(searchParams);
        if (value === null) {
            params.delete(key);
        } else {
            params.set(key, value);
        }
        router.push(`${pathname}?${params.toString()}`);
    };

    // --- Area helpers ---
    const toggleArea = (id: string) => {
        let newSelection: string[];
        if (selectedAreas === null) {
            newSelection = [id];
        } else {
            if (selectedAreas.includes(id)) {
                newSelection = selectedAreas.filter(k => k !== id);
            } else {
                newSelection = [...selectedAreas, id];
            }
        }
        updateParam('areas', newSelection.length === 0 ? 'none' : newSelection.join(','));
    };

    const setAllAreas = () => updateParam('areas', null);
    const setNoneAreas = () => updateParam('areas', 'none');

    // --- Location helpers ---
    const allLocTypes = ['office', 'wfh', 'field'] as const;

    const toggleLoc = (loc: string) => {
        if (selectedLoc === null) {
            // All selected → uncheck one = keep the other two
            const newSel = allLocTypes.filter(l => l !== loc);
            updateParam('loc', newSel.join(','));
        } else {
            if (selectedLoc.includes(loc)) {
                const newSel = selectedLoc.filter(l => l !== loc);
                if (newSel.length === 0) {
                    updateParam('loc', 'none');
                } else if (newSel.length === allLocTypes.length) {
                    updateParam('loc', null); // all = remove param
                } else {
                    updateParam('loc', newSel.join(','));
                }
            } else {
                const newSel = [...selectedLoc, loc];
                if (newSel.length === allLocTypes.length) {
                    updateParam('loc', null);
                } else {
                    updateParam('loc', newSel.join(','));
                }
            }
        }
    };

    const isLocSelected = (loc: string) => selectedLoc === null || selectedLoc.includes(loc);

    const isAllAreas = selectedAreas === null;

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border shadow-sm transition-colors",
                    activeCount > 0 ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
                )}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                    {/* Section A: Customer Areas */}
                    <div className="p-2 border-b border-gray-100">
                        <div className="flex items-center justify-between px-1 mb-1">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Customer Areas</span>
                            <div className="space-x-2">
                                <button onClick={setAllAreas} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">All</button>
                                <span className="text-gray-300">|</span>
                                <button onClick={setNoneAreas} className="text-[10px] text-gray-500 hover:text-gray-700 font-medium">None</button>
                            </div>
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                            {customerAreas.map(area => {
                                const selected = isAllAreas || (selectedAreas !== null && selectedAreas.includes(area.id));
                                return (
                                    <label
                                        key={area.id}
                                        className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleArea(area.id)}
                                            className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                        />
                                        <div className="ml-2 flex items-center gap-1.5">
                                            <span
                                                className="w-2.5 h-2.5 rounded-full border border-black/10"
                                                style={{ backgroundColor: area.color || '#4f46e5' }}
                                            />
                                            <span className="text-xs font-medium text-gray-700 truncate">{area.name}</span>
                                        </div>
                                    </label>
                                );
                            })}
                            <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer border-t border-gray-50 mt-0.5">
                                <input
                                    type="checkbox"
                                    checked={isAllAreas || (selectedAreas !== null && selectedAreas.includes('unassigned'))}
                                    onChange={() => toggleArea('unassigned')}
                                    className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <div className="ml-2 flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full border border-dashed border-gray-400 bg-gray-100" />
                                    <span className="text-xs font-medium text-gray-500 italic truncate">Unassigned</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Section B: Staffing */}
                    <div className="p-2 border-b border-gray-100">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 block mb-1">Staffing</span>
                        <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                            <input
                                type="checkbox"
                                checked={unstaffed}
                                onChange={() => updateParam('unstaffed', unstaffed ? null : '1')}
                                className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <span className="ml-2 text-xs font-medium text-gray-700">Unstaffed only</span>
                        </label>
                    </div>

                    {/* Section C: Work Location */}
                    <div className="p-2 border-b border-gray-100">
                        <div className="flex items-center justify-between px-1 mb-1">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Work Location</span>
                            {selectedLoc !== null && (
                                <button onClick={() => updateParam('loc', null)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">All</button>
                            )}
                        </div>
                        <div className="flex items-center gap-3 px-2 py-1">
                            {[
                                { key: 'office', label: '🏢 Office' },
                                { key: 'wfh', label: '🏠 WFH' },
                                { key: 'field', label: '🚗 Field' },
                            ].map(({ key, label }) => (
                                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isLocSelected(key)}
                                        onChange={() => toggleLoc(key)}
                                        className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <span className="text-xs font-medium text-gray-700">{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Section D: Display */}
                    <div className="p-2">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 block mb-1">Display</span>
                        {view === 'month' && (
                            <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showGhosts}
                                    onChange={() => updateParam('ghosts', showGhosts ? '0' : null)}
                                    className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <span className="ml-2 text-xs font-medium text-gray-700">Show rescheduled ghosts</span>
                            </label>
                        )}
                        {(view === 'month' || view === 'week') && (
                            <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showDayCounts}
                                    onChange={() => updateParam('dayCounts', showDayCounts ? '0' : null)}
                                    className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <span className="ml-2 text-xs font-medium text-gray-700">Show day counts</span>
                            </label>
                        )}
                        {view === 'day' && (
                            <span className="text-[10px] text-gray-400 italic px-2">No display toggles for Day view</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
