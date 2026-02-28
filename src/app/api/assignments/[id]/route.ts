import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageSchedules } from '@/lib/auth';
import {
    successResponse,
    handleApiError,
    forbiddenResponse,
    notFoundResponse,
} from '@/lib/api-response';
import { createAuditLog, AuditAction, EntityType, toAuditData } from '@/lib/audit';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// DELETE /api/assignments/[id] - Unassign employee from schedule
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        if (!canManageSchedules(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can unassign employees');
        }

        // Find assignment and verify tenant ownership via schedule
        const assignment = await prisma.assignment.findFirst({
            where: { id },
            include: {
                schedule: {
                    select: { id: true, title: true, tenantId: true },
                },
                employee: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!assignment || assignment.schedule.tenantId !== auth.tenantId) {
            return notFoundResponse('Assignment');
        }

        await prisma.assignment.delete({
            where: { id },
        });

        // Audit log
        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action: AuditAction.UNASSIGN_EMPLOYEE,
            entityType: EntityType.ASSIGNMENT,
            entityId: id,
            oldData: toAuditData({
                scheduleId: assignment.scheduleId,
                scheduleTitle: assignment.schedule.title,
                employeeId: assignment.employeeId,
                employeeName: assignment.employee.name,
                startTime: assignment.startTime,
                endTime: assignment.endTime,
            }),
        });

        return successResponse({ success: true });
    } catch (error) {
        return handleApiError(error);
    }
}
