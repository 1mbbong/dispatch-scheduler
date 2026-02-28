import 'server-only';

import prisma from '@/lib/db';

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
        },
        orderBy: { startTime: 'asc' },
    });

    return serialize(result);
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
        },
    });

    return result ? serialize(result) : null;
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

// ---------- Employees ----------

export async function getEmployees(tenantId: string) {
    const result = await prisma.employee.findMany({
        where: { tenantId, isActive: true },
        include: {
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

