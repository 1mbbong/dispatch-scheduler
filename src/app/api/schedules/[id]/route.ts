import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageSchedules } from '@/lib/auth';
import {
    successResponse,
    handleApiError,
    notFoundResponse,
    forbiddenResponse,
} from '@/lib/api-response';
import { updateScheduleSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, AuditActionType, EntityType, toAuditData } from '@/lib/audit';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/schedules/[id] - Get schedule detail
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        const schedule = await prisma.schedule.findFirst({
            where: {
                id,
                tenantId: auth.tenantId, // Tenant isolation
            },
            include: {
                category: true,
                assignments: {
                    include: {
                        employee: {
                            select: { id: true, name: true, email: true, phone: true },
                        },
                    },
                },
            },
        });

        if (!schedule) {
            return notFoundResponse('Schedule');
        }

        return successResponse(schedule);
    } catch (error) {
        return handleApiError(error);
    }
}

// PATCH /api/schedules/[id] - Update schedule
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        if (!canManageSchedules(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can update schedules');
        }

        const body = await request.json();
        const data = updateScheduleSchema.parse(body);

        // Fetch existing schedule
        const existing = await prisma.schedule.findFirst({
            where: { id, tenantId: auth.tenantId },
        });

        if (!existing) {
            return notFoundResponse('Schedule');
        }

        // If time is changing, update all assignments' denormalized times
        const timeChanged =
            (data.startTime && data.startTime.getTime() !== existing.startTime.getTime()) ||
            (data.endTime && data.endTime.getTime() !== existing.endTime.getTime());

        const updatedSchedule = await prisma.$transaction(async (tx) => {
            const schedule = await tx.schedule.update({
                where: { id },
                data: {
                    ...(data.title && { title: data.title }),
                    ...(data.description !== undefined && { description: data.description }),
                    ...(data.startTime && { startTime: data.startTime }),
                    ...(data.endTime && { endTime: data.endTime }),
                    ...(data.status && { status: data.status }),
                    ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
                },
                include: {
                    category: true,
                    assignments: {
                        include: {
                            employee: {
                                select: { id: true, name: true, email: true },
                            },
                        },
                    },
                },
            });

            // Update denormalized times on assignments if schedule time changed
            if (timeChanged) {
                await tx.assignment.updateMany({
                    where: { scheduleId: id },
                    data: {
                        startTime: schedule.startTime,
                        endTime: schedule.endTime,
                    },
                });
            }

            return schedule;
        });

        // Determine audit action based on status change
        let action: AuditActionType = AuditAction.UPDATE_SCHEDULE;
        if (data.status && data.status !== existing.status) {
            action = data.status === 'CANCELLED'
                ? AuditAction.CANCEL_SCHEDULE
                : AuditAction.REACTIVATE_SCHEDULE;
        }

        // Audit log
        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action,
            entityType: EntityType.SCHEDULE,
            entityId: id,
            oldData: toAuditData({
                title: existing.title,
                description: existing.description,
                startTime: existing.startTime,
                endTime: existing.endTime,
                status: existing.status,
                categoryId: existing.categoryId,
            }),
            newData: toAuditData({
                title: updatedSchedule.title,
                description: updatedSchedule.description,
                startTime: updatedSchedule.startTime,
                endTime: updatedSchedule.endTime,
                status: updatedSchedule.status,
                categoryId: updatedSchedule.categoryId,
            }),
        });

        return successResponse(updatedSchedule);
    } catch (error) {
        return handleApiError(error);
    }
}

// DELETE /api/schedules/[id] - Cancel schedule (soft delete)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        if (!canManageSchedules(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can cancel schedules');
        }

        const existing = await prisma.schedule.findFirst({
            where: { id, tenantId: auth.tenantId },
        });

        if (!existing) {
            return notFoundResponse('Schedule');
        }

        const schedule = await prisma.schedule.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });

        // Audit log
        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action: AuditAction.CANCEL_SCHEDULE,
            entityType: EntityType.SCHEDULE,
            entityId: id,
            oldData: toAuditData({ status: existing.status }),
            newData: toAuditData({ status: schedule.status }),
        });

        return successResponse(schedule);
    } catch (error) {
        return handleApiError(error);
    }
}
