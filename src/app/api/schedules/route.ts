import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageSchedules } from '@/lib/auth';
import {
    successResponse,
    createdResponse,
    handleApiError,
    forbiddenResponse,
} from '@/lib/api-response';
import { createScheduleSchema, scheduleQuerySchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType, toAuditData } from '@/lib/audit';

// GET /api/schedules - List schedules with optional date range filter
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth(request);
        const searchParams = Object.fromEntries(request.nextUrl.searchParams);
        const query = scheduleQuerySchema.parse(searchParams);

        const where = {
            tenantId: auth.tenantId, // Always filter by tenant
            ...(query.status && { status: query.status }),
            // Overlap logic: schedule.startTime < endDate AND schedule.endTime > startDate
            ...(query.startDate && query.endDate && {
                startTime: { lt: query.endDate },
                endTime: { gt: query.startDate },
            }),
            ...(query.startDate && !query.endDate && {
                endTime: { gt: query.startDate },
            }),
            ...(!query.startDate && query.endDate && {
                startTime: { lt: query.endDate },
            }),
        };

        const [schedules, total] = await Promise.all([
            prisma.schedule.findMany({
                where,
                include: {
                    category: true,
                    customerArea: true,
                    scheduleStatus: true,
                    workTypes: {
                        include: { workType: true }
                    },
                    office: true,
                    assignments: {
                        include: {
                            employee: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    },
                },
                orderBy: { startTime: 'asc' },
                skip: (query.page - 1) * query.limit,
                take: query.limit,
            }),
            prisma.schedule.count({ where }),
        ]);

        return successResponse({
            data: schedules,
            pagination: {
                page: query.page,
                limit: query.limit,
                total,
                totalPages: Math.ceil(total / query.limit),
            },
        });
    } catch (error) {
        return handleApiError(error);
    }
}

// POST /api/schedules - Create a new schedule
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(request);

        if (!canManageSchedules(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can create schedules');
        }

        const body = await request.json();
        const data = createScheduleSchema.parse(body);

        const workLocationType = data.workLocationType;
        const officeId = workLocationType === 'OFFICE' ? data.officeId : null;

        const schedule = await prisma.schedule.create({
            data: {
                tenantId: auth.tenantId,
                title: data.title,
                description: data.description,
                startTime: data.startTime,
                endTime: data.endTime,
                categoryId: data.categoryId,
                customerAreaId: data.customerAreaId,
                statusId: data.statusId,
                workLocationType,
                officeId,
                ...(data.workTypeIds && data.workTypeIds.length > 0 && {
                    workTypes: {
                        createMany: {
                            data: data.workTypeIds.map((id) => ({ workTypeId: id })),
                        }
                    }
                }),
            },
            include: {
                category: true,
                customerArea: true,
                scheduleStatus: true,
                workTypes: {
                    include: { workType: true }
                },
                office: true,
                assignments: {
                    include: {
                        employee: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
            },
        });

        // Audit log
        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action: AuditAction.CREATE_SCHEDULE,
            entityType: EntityType.SCHEDULE,
            entityId: schedule.id,
            newData: toAuditData({
                title: schedule.title,
                description: schedule.description,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                categoryId: schedule.categoryId,
                customerAreaId: schedule.customerAreaId,
                statusId: schedule.statusId,
                workTypeIds: data.workTypeIds || [],
                workLocationType: schedule.workLocationType,
                officeId: schedule.officeId,
            }),
        });

        return createdResponse(schedule);
    } catch (error) {
        return handleApiError(error);
    }
}
