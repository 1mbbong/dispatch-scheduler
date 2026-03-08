import 'server-only';

import prisma from '@/lib/db';
import { SerializedScheduleWithAssignments } from '@/types';

// ============================================
// Server-only data access layer.
// Direct Prisma queries for Server Components.
// API routes (POST/PATCH/DELETE) are NOT affected.
// ============================================

// ---------- Pagination ----------

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Parse & clamp pagination params from URL searchParams. */
export function parsePagination(params: { page?: string; pageSize?: string }) {
    const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, parseInt(params.pageSize ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
    );
    return { page, pageSize, skip: (page - 1) * pageSize };
}

export interface PaginatedResult<T> {
    items: T[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
// ---------- Serialization ----------

/**
 * Recursively convert all Date instances to ISO strings.
 * Prisma returns Date objects, but Client Components receive
 * serialized JSON (via RSC wire format) which turns Dates into
 * strings anyway — however the *type* is still `Date` at compile
 * time, causing confusion. This helper makes the conversion
 * explicit and type-safe.
 */
type Serialized<T> =
    T extends Date ? string :
    T extends Array<infer U> ? Serialized<U>[] :
    T extends object ? { [K in keyof T]: Serialized<T[K]> } :
    T;

function serialize<T>(obj: T): Serialized<T> {
    return JSON.parse(JSON.stringify(obj, (_key, value) => {
        // Date.prototype.toJSON already returns ISO string,
        // so JSON.stringify handles it, but we rely on the
        // Serialized<T> type to make downstream usage safe.
        return value;
    }));
}

// ---------- Schedules ----------

interface GetSchedulesOptions {
    startDate?: Date;
    endDate?: Date;
    status?: 'ACTIVE' | 'CANCELLED';
}

export async function getSchedules(tenantId: string, opts: GetSchedulesOptions = {}) {
    const where = {
        tenantId,
        ...(opts.status && { status: opts.status }),
        // Ticket #2 overlap logic: schedule.startTime < endDate AND schedule.endTime > startDate
        ...(opts.startDate && opts.endDate && {
            startTime: { lt: opts.endDate },
            endTime: { gt: opts.startDate },
        }),
        ...(opts.startDate && !opts.endDate && {
            endTime: { gt: opts.startDate },
        }),
        ...(!opts.startDate && opts.endDate && {
            startTime: { lt: opts.endDate },
        }),
    };

    const result = await prisma.schedule.findMany({
        where,
        include: {
            assignments: {
                include: { employee: true },
            },
            customerArea: true,
            scheduleStatus: true,
            workTypes: { include: { workType: true } },
        },
        orderBy: { startTime: 'asc' },
    });

    // Explicitly cast to SerializedScheduleWithAssignments[] because Prisma's nested generic
    // types inside include {} are too deep to be perfectly inferred by the mapped type.
    return serialize(result) as unknown as SerializedScheduleWithAssignments[];
}

export async function getScheduleById(tenantId: string, id: string) {
    const result = await prisma.schedule.findFirst({
        where: {
            id,
            tenantId,
        },
        include: {
            assignments: {
                include: { employee: true },
            },
            customerArea: true,
            scheduleStatus: true,
            workTypes: { include: { workType: true } },
        },
    });

    return (result ? serialize(result) : null) as unknown as SerializedScheduleWithAssignments | null;
}

export async function getOverlappingEmployeeEvents(
    tenantId: string,
    employeeIds: string[],
    startDate: Date,
    endDate: Date,
    currentScheduleId: string
) {
    if (employeeIds.length === 0) return { schedules: [], vacations: [] };

    // Fetch overlapping active schedules for these employees (excluding current schedule)
    const schedules = await prisma.schedule.findMany({
        where: {
            tenantId,
            id: { not: currentScheduleId },
            status: 'ACTIVE',
            startTime: { lt: endDate },
            endTime: { gt: startDate },
            assignments: {
                some: { employeeId: { in: employeeIds } }
            }
        },
        include: {
            assignments: {
                where: { employeeId: { in: employeeIds } },
                select: { employeeId: true }
            }
        }
    });

    // Fetch overlapping vacations for these employees
    const vacations = await prisma.vacation.findMany({
        where: {
            employeeId: { in: employeeIds },
            startDate: { lte: endDate },
            endDate: { gte: startDate }
        },
        select: {
            id: true,
            employeeId: true,
            startDate: true,
            endDate: true
        }
    });

    return serialize({ schedules, vacations });
}

export async function getScheduleAuditLogs(tenantId: string, scheduleId: string) {
    const logs = await prisma.auditLog.findMany({
        where: {
            tenantId,
            entityType: 'SCHEDULE',
            entityId: scheduleId
        },
        orderBy: {
            timestamp: 'asc' // Oldest first: "initial → changes → current"
        }
    });

    // Extract unique user IDs locally (fast enough, avoid complex JOINs if userId is not strictly FK'd)
    const userIds = Array.from(new Set(logs.map(log => log.userId).filter(Boolean))) as string[];

    let usersMap: Record<string, { name: string, email: string }> = {};
    if (userIds.length > 0) {
        const users = await prisma.user.findMany({
            where: {
                id: { in: userIds },
                tenantId
            },
            select: {
                id: true,
                name: true,
                email: true
            }
        });
        usersMap = users.reduce((acc, user) => {
            acc[user.id] = { name: user.name, email: user.email };
            return acc;
        }, {} as Record<string, { name: string, email: string }>);
    }

    // Attach user information to logs
    const mappedLogs = logs.map(log => {
        let actor = { name: 'System', email: '' }; // Default
        if (log.userId && usersMap[log.userId]) {
            actor = usersMap[log.userId];
        }
        return {
            ...log,
            actor
        };
    });

    return serialize(mappedLogs);
}

export async function getLatestRescheduleSnapshots(tenantId: string, scheduleIds: string[]) {
    if (scheduleIds.length === 0) return {};

    // For MVP efficiency without raw SQL lateral joins, pull ALL schedule-related audit logs for these IDs 
    // ordered by newest first, then manually reduce to the first one that changed times.
    const logs = await prisma.auditLog.findMany({
        where: {
            tenantId,
            entityType: 'SCHEDULE',
            entityId: { in: scheduleIds }
        },
        orderBy: {
            timestamp: 'desc'
        }
    });

    const snapshots: Record<string, { prevStartTime: string, prevEndTime: string }> = {};

    for (const log of logs) {
        const id = log.entityId;
        if (snapshots[id]) continue; // Already found the latest time change for this schedule

        const oldD = log.oldData as any;
        const newD = log.newData as any;

        if (oldD && newD && (oldD.startTime !== newD.startTime || oldD.endTime !== newD.endTime)) {
            snapshots[id] = {
                prevStartTime: oldD.startTime,
                prevEndTime: oldD.endTime
            };
        }
    }

    return serialize(snapshots);
}

// ---------- Employees ----------

export async function getEmployees(tenantId: string) {
    const result = await prisma.employee.findMany({
        where: { tenantId, isActive: true },
        include: {
            customerArea: true,
            _count: {
                select: {
                    assignments: true,
                    vacations: true,
                },
            },
        },
        orderBy: { name: 'asc' },
    });

    return serialize(result);
}

export async function getEmployeesPaginated(
    tenantId: string,
    pagination: { page?: string; pageSize?: string },
) {
    const { page, pageSize, skip } = parsePagination(pagination);
    const where = { tenantId, isActive: true };

    const [items, totalCount] = await Promise.all([
        prisma.employee.findMany({
            where,
            include: {
                customerArea: true,
                _count: { select: { assignments: true, vacations: true } },
            },
            orderBy: { name: 'asc' },
            skip,
            take: pageSize,
        }),
        prisma.employee.count({ where }),
    ]);

    return {
        items: serialize(items),
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
    };
}

// ---------- Vacations ----------

export async function getVacations(
    tenantId: string,
    opts: { startDate?: Date; endDate?: Date } = {}
) {
    const where: any = {
        employee: {
            tenantId, // Tenant isolation via employee relation
        },
    };

    if (opts.startDate && opts.endDate) {
        where.startDate = { lt: opts.endDate };
        where.endDate = { gt: opts.startDate };
    } else if (opts.startDate) {
        where.endDate = { gt: opts.startDate };
    } else if (opts.endDate) {
        where.startDate = { lt: opts.endDate };
    }

    const result = await prisma.vacation.findMany({
        where,
        include: {
            employee: true,
        },
        orderBy: { startDate: 'asc' },
    });

    return serialize(result);
}

export async function getVacationsPaginated(
    tenantId: string,
    pagination: { page?: string; pageSize?: string },
) {
    const { page, pageSize, skip } = parsePagination(pagination);
    const where = { employee: { tenantId } };

    const [items, totalCount] = await Promise.all([
        prisma.vacation.findMany({
            where,
            include: { employee: true },
            orderBy: { startDate: 'asc' },
            skip,
            take: pageSize,
        }),
        prisma.vacation.count({ where }),
    ]);

    return {
        items: serialize(items),
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
    };
}

// ---------- Dashboard ----------

export async function getDashboardStats(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const weekFromNow = new Date(todayStart);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    // Today's schedules (overlap with today, limit 10)
    const todaySchedules = await prisma.schedule.findMany({
        where: {
            tenantId,
            status: 'ACTIVE',
            startTime: { lt: todayEnd },
            endTime: { gt: todayStart },
        },
        include: {
            assignments: { include: { employee: true } },
        },
        orderBy: { startTime: 'asc' },
        take: 10,
    });

    // Unassigned count: ACTIVE schedules with zero assignments
    const unassignedCount = await prisma.schedule.count({
        where: {
            tenantId,
            status: 'ACTIVE',
            assignments: { none: {} },
        },
    });

    // Total active schedules
    const totalActiveSchedules = await prisma.schedule.count({
        where: { tenantId, status: 'ACTIVE' },
    });

    // Upcoming vacations (next 7 days)
    const upcomingVacations = await prisma.vacation.findMany({
        where: {
            employee: { tenantId },
            endDate: { gte: todayStart },
            startDate: { lte: weekFromNow },
        },
        include: { employee: true },
        orderBy: { startDate: 'asc' },
        take: 10,
    });

    // Total employees
    const totalEmployees = await prisma.employee.count({
        where: { tenantId, isActive: true },
    });

    return serialize({
        todaySchedules,
        unassignedCount,
        totalActiveSchedules,
        upcomingVacations,
        totalEmployees,
    });
}

// ---------- Labels (L1/L2) ----------

export async function getCustomerAreas(tenantId: string, includeInactive = false) {
    const where = {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
    };

    const result = await prisma.customerArea.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return serialize(result);
}

export async function getScheduleStatuses(tenantId: string, includeInactive = false) {
    const where = {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
    };

    const result = await prisma.scheduleStatus.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return serialize(result);
}

export async function getWorkTypes(tenantId: string, includeInactive = false) {
    const where = {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
    };

    const result = await prisma.workType.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return serialize(result);
}

export async function getOffices(tenantId: string, includeInactive = false) {
    const where = {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
    };

    const result = await prisma.office.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return serialize(result);
}

// ---------- Availability ----------

export async function getAvailabilitySummary(
    tenantId: string,
    targetDate: Date,
    selectedAreas: string[] | null
) {
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    const employeeWhere: any = {
        tenantId,
        isActive: true,
    };

    if (selectedAreas !== null) {
        const hasUnassigned = selectedAreas.includes('unassigned');
        const customIds = selectedAreas.filter((id) => id !== 'unassigned');

        if (hasUnassigned && customIds.length > 0) {
            employeeWhere.OR = [
                { customerAreaId: { in: customIds } },
                { customerAreaId: null },
            ];
        } else if (hasUnassigned) {
            employeeWhere.customerAreaId = null;
        } else if (customIds.length > 0) {
            employeeWhere.customerAreaId = { in: customIds };
        } else {
            return { totalEmployees: 0, vacationCount: 0, overbookedCount: 0, availableCount: 0 };
        }
    }

    const employees = await prisma.employee.findMany({
        where: employeeWhere,
        select: { id: true },
    });

    const employeeIds = employees.map((e) => e.id);

    if (employeeIds.length === 0) {
        return { totalEmployees: 0, vacationCount: 0, overbookedCount: 0, availableCount: 0 };
    }

    const vacations = await prisma.vacation.findMany({
        where: {
            employeeId: { in: employeeIds },
            startDate: { lte: endDate },
            endDate: { gte: startDate },
        },
        select: { employeeId: true },
    });
    const vacationEmployeeIds = new Set(vacations.map((v) => v.employeeId));

    const overlappingSchedules = await prisma.assignment.findMany({
        where: {
            employeeId: { in: employeeIds },
            schedule: {
                tenantId,
                status: 'ACTIVE',
                startTime: { lt: endDate },
                endTime: { gt: startDate },
            },
        },
        select: { employeeId: true },
    });
    const scheduledEmployeeIds = new Set(overlappingSchedules.map((a) => a.employeeId));

    const totalEmployees = employeeIds.length;
    const vacationCount = vacationEmployeeIds.size;
    const overbookedCount = scheduledEmployeeIds.size;

    const unavailableSet = new Set([...vacationEmployeeIds, ...scheduledEmployeeIds]);
    const availableCount = totalEmployees - unavailableSet.size;

    return {
        totalEmployees,
        vacationCount,
        overbookedCount,
        availableCount,
    };
}

// ---------- Filter Defaults ----------

export interface FilterDefaults {
    areas?: 'ALL' | string[];
    unstaffed?: boolean;
    loc?: { office: boolean; wfh: boolean; field: boolean };
    ghosts?: boolean;
    dayCounts?: boolean;
}

export async function getFilterDefaults(tenantId: string): Promise<FilterDefaults | null> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { filterDefaults: true },
    });
    return (tenant?.filterDefaults as FilterDefaults) ?? null;
}
