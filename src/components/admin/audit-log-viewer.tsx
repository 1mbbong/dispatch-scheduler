'use client';

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { format } from 'date-fns';

interface AuditLogEntry {
    id: string;
    tenantId: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldData: Record<string, unknown> | null;
    newData: Record<string, unknown> | null;
    timestamp: string;
}

interface PaginatedResponse {
    items: AuditLogEntry[];
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
}

// --------------- Sorting types ---------------

type SortField = 'timestamp' | 'action' | 'userId' | 'entityType' | 'entityId';
type SortDir = 'asc' | 'desc';

const SORTABLE_HEADERS: { field: SortField; label: string }[] = [
    { field: 'timestamp', label: 'Timestamp' },
    { field: 'action', label: 'Action' },
    { field: 'userId', label: 'Actor' },
    { field: 'entityType', label: 'Target' },
];

// --------------- Component ---------------

export function AuditLogViewer() {
    const [data, setData] = useState<PaginatedResponse | null>(null);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Sorting
    const [sortField, setSortField] = useState<SortField>('timestamp');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // Filters
    const [filterAction, setFilterAction] = useState('');
    const [filterEntityType, setFilterEntityType] = useState('');
    const [searchText, setSearchText] = useState('');

    const fetchLogs = useCallback(async (p: number) => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/audit-logs?page=${p}&pageSize=50`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin only.');
                } else {
                    setError('Failed to load audit logs.');
                }
                return;
            }
            const json = await res.json();
            setData(json);
        } catch {
            setError('Network error.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs(page);
    }, [page, fetchLogs]);

    // Reset expanded row + filters when page changes
    useEffect(() => {
        setExpandedId(null);
    }, [page]);

    const goToPage = (newPage: number) => setPage(newPage);

    // Format action for display: CANCEL_SCHEDULE → Cancel Schedule
    const formatAction = (action: string) =>
        action
            .split('_')
            .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
            .join(' ');

    // Unique values for filter dropdowns (computed from current page)
    const uniqueActions = useMemo(() => {
        if (!data) return [];
        return [...new Set(data.items.map((l) => l.action))].sort();
    }, [data]);

    const uniqueEntityTypes = useMemo(() => {
        if (!data) return [];
        return [...new Set(data.items.map((l) => l.entityType))].sort();
    }, [data]);

    // Apply filters → sort → display items
    const displayItems = useMemo(() => {
        if (!data) return [];
        let items = data.items;

        // Filter: action
        if (filterAction) {
            items = items.filter((l) => l.action === filterAction);
        }
        // Filter: entityType
        if (filterEntityType) {
            items = items.filter((l) => l.entityType === filterEntityType);
        }
        // Filter: text search (substring match across action, entityId, userId)
        if (searchText) {
            const q = searchText.toLowerCase();
            items = items.filter(
                (l) =>
                    l.action.toLowerCase().includes(q) ||
                    l.entityId.toLowerCase().includes(q) ||
                    (l.userId && l.userId.toLowerCase().includes(q))
            );
        }

        // Sort
        const sorted = [...items].sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'timestamp':
                    cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                    break;
                case 'action':
                    cmp = a.action.localeCompare(b.action);
                    break;
                case 'userId':
                    cmp = (a.userId ?? '').localeCompare(b.userId ?? '');
                    break;
                case 'entityType':
                    cmp = a.entityType.localeCompare(b.entityType);
                    break;
                case 'entityId':
                    cmp = a.entityId.localeCompare(b.entityId);
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return sorted;
    }, [data, filterAction, filterEntityType, searchText, sortField, sortDir]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir(field === 'timestamp' ? 'desc' : 'asc');
        }
    };

    const sortIndicator = (field: SortField) => {
        if (sortField !== field) return ' ↕';
        return sortDir === 'asc' ? ' ↑' : ' ↓';
    };

    // -------- Render --------

    if (isLoading && !data) {
        return (
            <div className="bg-white shadow rounded-lg border p-8 text-center text-gray-500">
                Loading audit logs…
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white shadow rounded-lg border p-8 text-center">
                <p className="text-red-600 font-medium">{error}</p>
                <button
                    onClick={() => fetchLogs(page)}
                    className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!data || data.items.length === 0) {
        return (
            <div className="bg-white shadow rounded-lg border p-8 text-center text-gray-500">
                No audit logs yet.
            </div>
        );
    }

    return (
        <div className="bg-white shadow rounded-lg overflow-hidden border">
            {/* Filters toolbar */}
            <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
                <select
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:ring-indigo-500"
                    aria-label="Filter by action"
                >
                    <option value="">All Actions</option>
                    {uniqueActions.map((a) => (
                        <option key={a} value={a}>
                            {formatAction(a)}
                        </option>
                    ))}
                </select>

                <select
                    value={filterEntityType}
                    onChange={(e) => setFilterEntityType(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:ring-indigo-500"
                    aria-label="Filter by entity type"
                >
                    <option value="">All Types</option>
                    {uniqueEntityTypes.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>

                <input
                    type="text"
                    placeholder="Search action / entity / actor…"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:ring-indigo-500 w-64"
                    aria-label="Search audit logs"
                />

                {(filterAction || filterEntityType || searchText) && (
                    <button
                        onClick={() => {
                            setFilterAction('');
                            setFilterEntityType('');
                            setSearchText('');
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                        Clear filters
                    </button>
                )}

                <span className="text-xs text-gray-400 ml-auto">
                    {displayItems.length} of {data.items.length} on this page
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {SORTABLE_HEADERS.map(({ field, label }) => (
                                <th
                                    key={field}
                                    onClick={() => handleSort(field)}
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                                >
                                    {label}
                                    <span className="text-indigo-400">{sortIndicator(field)}</span>
                                </th>
                            ))}
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Details
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {displayItems.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                                    No matching logs.
                                </td>
                            </tr>
                        ) : (
                            displayItems.map((log) => (
                                <Fragment key={log.id}>
                                    {/* Main row */}
                                    <tr
                                        className={`hover:bg-gray-50 ${expandedId === log.id ? 'bg-indigo-50/40' : ''}`}
                                    >
                                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                                            {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                                        </td>
                                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${actionBadgeColor(log.action)}`}
                                            >
                                                {formatAction(log.action)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap font-mono">
                                            {log.userId ? log.userId.slice(0, 8) + '…' : 'system'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                                            <span className="text-gray-400 text-xs">{log.entityType}</span>{' '}
                                            <span className="font-mono">{log.entityId.slice(0, 8)}…</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {log.oldData || log.newData ? (
                                                <button
                                                    onClick={() =>
                                                        setExpandedId(expandedId === log.id ? null : log.id)
                                                    }
                                                    className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                                                >
                                                    {expandedId === log.id ? 'Hide' : 'View'}
                                                </button>
                                            ) : (
                                                <span className="text-gray-300">—</span>
                                            )}
                                        </td>
                                    </tr>

                                    {/* Inline expanded detail row */}
                                    {expandedId === log.id && (
                                        <tr key={`${log.id}-detail`} className="bg-gray-50/80">
                                            <td colSpan={5} className="px-6 py-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                                    {log.oldData && (
                                                        <div>
                                                            <p className="font-medium text-gray-600 mb-1 font-sans text-sm">
                                                                Old Data
                                                            </p>
                                                            <pre className="bg-white p-3 rounded border overflow-auto max-h-40 text-gray-700">
                                                                {JSON.stringify(log.oldData, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {log.newData && (
                                                        <div>
                                                            <p className="font-medium text-gray-600 mb-1 font-sans text-sm">
                                                                New Data
                                                            </p>
                                                            <pre className="bg-white p-3 rounded border overflow-auto max-h-40 text-gray-700">
                                                                {JSON.stringify(log.newData, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
                <div className="px-4 py-3 flex items-center justify-between border-t bg-gray-50 sm:px-6">
                    <p className="text-sm text-gray-700">
                        Page <span className="font-medium">{data.page}</span> of{' '}
                        <span className="font-medium">{data.totalPages}</span>
                        {' '}({data.totalCount} total)
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
                            disabled={page >= data.totalPages}
                            className="relative inline-flex items-center px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Badge color based on action type */
function actionBadgeColor(action: string): string {
    if (action.startsWith('CREATE') || action === 'ASSIGN_EMPLOYEE') {
        return 'bg-green-100 text-green-800';
    }
    if (action.startsWith('CANCEL') || action.startsWith('DEACTIVATE') || action === 'UNASSIGN_EMPLOYEE') {
        return 'bg-red-100 text-red-800';
    }
    if (action.startsWith('UPDATE') || action.startsWith('REACTIVATE')) {
        return 'bg-blue-100 text-blue-800';
    }
    if (action.startsWith('DELETE')) {
        return 'bg-red-100 text-red-800';
    }
    return 'bg-gray-100 text-gray-800';
}
