'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SerializedCustomerArea } from '@/types';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

interface FilterDefaults {
    areas?: 'ALL' | string[];
    unstaffed?: boolean;
    loc?: { office: boolean; wfh: boolean; field: boolean };
    ghosts?: boolean;
    dayCounts?: boolean;
    people?: number;
}

interface CalendarFilterProps {
    customerAreas: SerializedCustomerArea[];
    view?: 'month' | 'week' | 'day';
    role?: string;
    filterDefaults?: FilterDefaults | null;
}

export function CalendarFilter({ customerAreas, view = 'month', role, filterDefaults }: CalendarFilterProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const toast = useToast();

    const [isOpen, setIsOpen] = useState(false);
    const [showDefaultsModal, setShowDefaultsModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // --- Defaults modal state ---
    const [dAreas, setDAreas] = useState<'ALL' | string[]>(filterDefaults?.areas ?? 'ALL');
    const [dUnstaffed, setDUnstaffed] = useState(filterDefaults?.unstaffed ?? false);
    const [dLoc, setDLoc] = useState(filterDefaults?.loc ?? { office: true, wfh: true, field: true });
    const [dGhosts, setDGhosts] = useState(filterDefaults?.ghosts ?? true);
    const [dDayCounts, setDDayCounts] = useState(filterDefaults?.dayCounts ?? true);
    const [dPeople, setDPeople] = useState(filterDefaults?.people ?? 0);

    // Sync modal state when filterDefaults prop changes
    useEffect(() => {
        setDAreas(filterDefaults?.areas ?? 'ALL');
        setDUnstaffed(filterDefaults?.unstaffed ?? false);
        setDLoc(filterDefaults?.loc ?? { office: true, wfh: true, field: true });
        setDGhosts(filterDefaults?.ghosts ?? true);
        setDDayCounts(filterDefaults?.dayCounts ?? true);
        setDPeople(filterDefaults?.people ?? 0);
    }, [filterDefaults]);

    // --- Read current filter state from URL ---
    const areasParam = searchParams.get('areas');
    const selectedAreas = areasParam ? areasParam.split(',') : null;

    const unstaffed = searchParams.get('unstaffed') === '1';

    const locParam = searchParams.get('loc');
    const selectedLoc = locParam ? locParam.split(',') : null;

    const showGhosts = searchParams.get('ghosts') !== '0';
    const showDayCounts = searchParams.get('dayCounts') !== '0';

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

    // Scroll lock for defaults modal
    useEffect(() => {
        if (!showDefaultsModal) return;
        const orig = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = orig; };
    }, [showDefaultsModal]);

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
            const newSel = allLocTypes.filter(l => l !== loc);
            updateParam('loc', newSel.join(','));
        } else {
            if (selectedLoc.includes(loc)) {
                const newSel = selectedLoc.filter(l => l !== loc);
                if (newSel.length === 0) {
                    updateParam('loc', 'none');
                } else if (newSel.length === allLocTypes.length) {
                    updateParam('loc', null);
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

    // --- Defaults modal handlers ---
    const handleDefaultsClick = () => {
        setIsOpen(false);
        if (role !== 'ADMIN') {
            toast.error('Admin만 설정 가능');
            return;
        }
        setShowDefaultsModal(true);
    };

    const handleSaveDefaults = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/tenant/filter-defaults', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    areas: dAreas,
                    unstaffed: dUnstaffed,
                    loc: dLoc,
                    ghosts: dGhosts,
                    dayCounts: dDayCounts,
                    people: dPeople,
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                toast.error(data.error || 'Failed to save defaults');
                return;
            }
            toast.success('기본 필터 저장 완료');
            setShowDefaultsModal(false);
            router.refresh();
        } catch (err: any) {
            toast.error(err.message || 'Network error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleDArea = (id: string) => {
        if (dAreas === 'ALL') {
            setDAreas([id]);
        } else {
            if (dAreas.includes(id)) {
                const next = dAreas.filter(a => a !== id);
                setDAreas(next.length === 0 ? 'ALL' : next);
            } else {
                setDAreas([...dAreas, id]);
            }
        }
    };

    return (
        <>
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
                                        <label key={area.id} className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                            <input type="checkbox" checked={selected} onChange={() => toggleArea(area.id)} className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                                            <div className="ml-2 flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ backgroundColor: area.color || '#4f46e5' }} />
                                                <span className="text-xs font-medium text-gray-700 truncate">{area.name}</span>
                                            </div>
                                        </label>
                                    );
                                })}
                                <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer border-t border-gray-50 mt-0.5">
                                    <input type="checkbox" checked={isAllAreas || (selectedAreas !== null && selectedAreas.includes('unassigned'))} onChange={() => toggleArea('unassigned')} className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
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
                                <input type="checkbox" checked={unstaffed} onChange={() => updateParam('unstaffed', unstaffed ? null : '1')} className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
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
                                        <input type="checkbox" checked={isLocSelected(key)} onChange={() => toggleLoc(key)} className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                                        <span className="text-xs font-medium text-gray-700">{label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Section D: Display */}
                        <div className="p-2 border-b border-gray-100">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 block mb-1">Display</span>
                            {view === 'month' && (
                                <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                    <input type="checkbox" checked={showGhosts} onChange={() => updateParam('ghosts', showGhosts ? '0' : null)} className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                                    <span className="ml-2 text-xs font-medium text-gray-700">Show rescheduled ghosts</span>
                                </label>
                            )}
                            {(view === 'month' || view === 'week') && (
                                <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                    <input type="checkbox" checked={showDayCounts} onChange={() => updateParam('dayCounts', showDayCounts ? '0' : null)} className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                                    <span className="ml-2 text-xs font-medium text-gray-700">Show day counts</span>
                                </label>
                            )}
                            {view === 'day' && (
                                <span className="text-[10px] text-gray-400 italic px-2">No display toggles for Day view</span>
                            )}
                        </div>

                        {/* Section E: Defaults button */}
                        <div className="p-2">
                            <button
                                onClick={handleDefaultsClick}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded border border-gray-200 transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Set Defaults
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Defaults Settings Modal */}
            {showDefaultsModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 z-40 bg-transparent backdrop-blur-sm backdrop-brightness-90 transition-all" onClick={() => !isSaving && setShowDefaultsModal(false)} />
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="relative z-50 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
                            <div className="bg-white px-5 pt-5 pb-4">
                                <h3 className="text-base font-semibold text-gray-900 mb-4">Filter Defaults</h3>
                                <p className="text-xs text-gray-500 mb-4">Set tenant-wide default filters applied when no URL params are present.</p>

                                {/* Default: Areas */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Customer Areas</span>
                                        <div className="space-x-2">
                                            <button onClick={() => setDAreas('ALL')} className={cn("text-[10px] font-medium", dAreas === 'ALL' ? 'text-indigo-700' : 'text-gray-500 hover:text-indigo-600')}>All</button>
                                            <span className="text-gray-300">|</span>
                                            <button onClick={() => setDAreas([])} className="text-[10px] text-gray-500 hover:text-gray-700 font-medium">None</button>
                                        </div>
                                    </div>
                                    <div className="max-h-32 overflow-y-auto border rounded p-1">
                                        {customerAreas.map(area => (
                                            <label key={area.id} className="flex items-center px-2 py-1 hover:bg-gray-50 rounded cursor-pointer">
                                                <input type="checkbox" checked={dAreas === 'ALL' || (Array.isArray(dAreas) && dAreas.includes(area.id))} onChange={() => toggleDArea(area.id)} className="h-3 w-3 text-indigo-600 border-gray-300 rounded" />
                                                <div className="ml-2 flex items-center gap-1">
                                                    <span className="w-2 h-2 rounded-full border border-black/10" style={{ backgroundColor: area.color || '#4f46e5' }} />
                                                    <span className="text-[11px] text-gray-700 truncate">{area.name}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Default: Unstaffed */}
                                <div className="mb-4">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Staffing</span>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={dUnstaffed} onChange={e => setDUnstaffed(e.target.checked)} className="h-3.5 w-3.5 text-indigo-600 border-gray-300 rounded" />
                                        <span className="text-xs text-gray-700">Unstaffed only by default</span>
                                    </label>
                                </div>

                                {/* Default: Location */}
                                <div className="mb-4">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Work Location</span>
                                    <div className="flex gap-3">
                                        {[
                                            { key: 'office' as const, label: '🏢 Office' },
                                            { key: 'wfh' as const, label: '🏠 WFH' },
                                            { key: 'field' as const, label: '🚗 Field' },
                                        ].map(({ key, label }) => (
                                            <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                                                <input type="checkbox" checked={dLoc[key]} onChange={e => setDLoc(prev => ({ ...prev, [key]: e.target.checked }))} className="h-3.5 w-3.5 text-indigo-600 border-gray-300 rounded" />
                                                <span className="text-xs text-gray-700">{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Default: Display */}
                                <div>
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Display (Month view)</span>
                                    <div className="space-y-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={dGhosts} onChange={e => setDGhosts(e.target.checked)} className="h-3.5 w-3.5 text-indigo-600 border-gray-300 rounded" />
                                            <span className="text-xs text-gray-700">Show rescheduled ghosts</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={dDayCounts} onChange={e => setDDayCounts(e.target.checked)} className="h-3.5 w-3.5 text-indigo-600 border-gray-300 rounded" />
                                            <span className="text-xs text-gray-700">Show day counts</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Default: People Visibility */}
                                <div>
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">People Visibility</span>
                                    <div className="flex gap-3">
                                        {[0, 1, 2].map(level => (
                                            <label key={level} className="flex items-center gap-1.5 cursor-pointer">
                                                <input type="radio" name="dPeople" checked={dPeople === level} onChange={() => setDPeople(level)} className="h-3.5 w-3.5 text-indigo-600 border-gray-300" />
                                                <span className="text-xs text-gray-700">{level === 0 ? '0 — Off' : level === 1 ? '1 — Names' : '2 — Full'}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 px-5 py-3 flex justify-end gap-2 border-t">
                                <button onClick={() => !isSaving && setShowDefaultsModal(false)} disabled={isSaving} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                                <button onClick={handleSaveDefaults} disabled={isSaving} className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                                    {isSaving ? 'Saving...' : 'Save Defaults'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
