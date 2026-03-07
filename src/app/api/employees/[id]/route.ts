import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageEmployees } from '@/lib/auth';
import {
    successResponse,
    handleApiError,
    forbiddenResponse,
    notFoundResponse,
} from '@/lib/api-response';
import { updateEmployeeSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType, toAuditData } from '@/lib/audit';

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/employees/[id] - Get employee detail
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        const employee = await prisma.employee.findFirst({
            where: {
                id,
                tenantId: auth.tenantId,
            },
            include: {
                assignments: {
                    include: {
                        schedule: {
                            select: { id: true, title: true, startTime: true, endTime: true, status: true },
                        },
                    },
                    orderBy: { startTime: 'desc' },
                    take: 10,
                },
                vacations: {
                    orderBy: { startDate: 'desc' },
                    take: 5,
                },
                _count: {
                    select: {
                        assignments: true,
                        vacations: true,
                    },
                },
            },
        });

        if (!employee) {
            return notFoundResponse('Employee');
        }

        return successResponse(employee);
    } catch (error) {
        return handleApiError(error);
    }
}

// PATCH /api/employees/[id] - Update employee
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const auth = await requireAuth(request);
        const { id } = await params;

        if (!canManageEmployees(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can update employees');
        }

        const body = await request.json();
        const data = updateEmployeeSchema.parse(body);

        const existing = await prisma.employee.findFirst({
            where: { id, tenantId: auth.tenantId },
        });

        if (!existing) {
            return notFoundResponse('Employee');
        }

        const employee = await prisma.employee.update({
            where: { id },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.email !== undefined && { email: data.email }),
                ...(data.phone !== undefined && { phone: data.phone }),
                ...(data.department !== undefined && { department: data.department }),
                ...(data.team !== undefined && { team: data.team }),
                ...(data.subTeam !== undefined && { subTeam: data.subTeam }),
                ...(data.joinYear !== undefined && { joinYear: data.joinYear }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
                ...(data.customerAreaId !== undefined && { customerAreaId: data.customerAreaId }),
            },
        });

        // Audit log
        const action = data.isActive === false
            ? AuditAction.DEACTIVATE_EMPLOYEE
            : AuditAction.UPDATE_EMPLOYEE;

        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action,
            entityType: EntityType.EMPLOYEE,
            entityId: id,
            oldData: toAuditData({
                name: existing.name,
                email: existing.email,
                phone: existing.phone,
                department: existing.department,
                team: existing.team,
                subTeam: existing.subTeam,
                joinYear: existing.joinYear,
                isActive: existing.isActive,
                customerAreaId: (existing as any).customerAreaId,
            }),
            newData: toAuditData({
                name: employee.name,
                email: employee.email,
                phone: employee.phone,
                department: employee.department,
                team: employee.team,
                subTeam: employee.subTeam,
                joinYear: employee.joinYear,
                isActive: employee.isActive,
                customerAreaId: employee.customerAreaId,
            }),
        });

        return successResponse(employee);
    } catch (error) {
        return handleApiError(error);
    }
}
