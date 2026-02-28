import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageVacations } from '@/lib/auth';
import {
    successResponse,
    handleApiError,
    forbiddenResponse,
    notFoundResponse,
    noContentResponse,
} from '@/lib/api-response';
import { updateVacationSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType, toAuditData } from '@/lib/audit';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/vacations/[id] - Get vacation detail
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        const vacation = await prisma.vacation.findFirst({
            where: {
                id,
                employee: {
                    tenantId: auth.tenantId,
                },
            },
            include: {
                employee: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        if (!vacation) {
            return notFoundResponse('Vacation');
        }

        return successResponse(vacation);
    } catch (error) {
        return handleApiError(error);
    }
}

// PATCH /api/vacations/[id] - Update vacation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        if (!canManageVacations(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can update vacations');
        }

        const body = await request.json();
        const data = updateVacationSchema.parse(body);

        // Verify vacation belongs to tenant
        const existing = await prisma.vacation.findFirst({
            where: {
                id,
                employee: {
                    tenantId: auth.tenantId,
                },
            },
            include: {
                employee: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!existing) {
            return notFoundResponse('Vacation');
        }

        const vacation = await prisma.vacation.update({
            where: { id },
            data: {
                ...(data.startDate && { startDate: data.startDate }),
                ...(data.endDate && { endDate: data.endDate }),
                ...(data.reason !== undefined && { reason: data.reason }),
            },
            include: {
                employee: {
                    select: { id: true, name: true },
                },
            },
        });

        // Audit log
        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action: AuditAction.UPDATE_VACATION,
            entityType: EntityType.VACATION,
            entityId: id,
            oldData: toAuditData({
                startDate: existing.startDate,
                endDate: existing.endDate,
                reason: existing.reason,
            }),
            newData: toAuditData({
                startDate: vacation.startDate,
                endDate: vacation.endDate,
                reason: vacation.reason,
            }),
        });

        return successResponse(vacation);
    } catch (error) {
        return handleApiError(error);
    }
}

// DELETE /api/vacations/[id] - Delete vacation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        if (!canManageVacations(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can delete vacations');
        }

        const existing = await prisma.vacation.findFirst({
            where: {
                id,
                employee: {
                    tenantId: auth.tenantId,
                },
            },
            include: {
                employee: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!existing) {
            return notFoundResponse('Vacation');
        }

        await prisma.vacation.delete({
            where: { id },
        });

        // Audit log
        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action: AuditAction.DELETE_VACATION,
            entityType: EntityType.VACATION,
            entityId: id,
            oldData: toAuditData({
                employeeId: existing.employeeId,
                employeeName: existing.employee.name,
                startDate: existing.startDate,
                endDate: existing.endDate,
                reason: existing.reason,
            }),
        });

        return noContentResponse();
    } catch (error) {
        return handleApiError(error);
    }
}
