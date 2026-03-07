import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageEmployees } from '@/lib/auth';
import {
    successResponse,
    createdResponse,
    handleApiError,
    forbiddenResponse,
} from '@/lib/api-response';
import { createEmployeeSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType, toAuditData } from '@/lib/audit';
import { z } from 'zod';

const employeeQuerySchema = z.object({
    isActive: z.enum(['true', 'false']).optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// GET /api/employees - List employees
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth(request);
        const searchParams = Object.fromEntries(request.nextUrl.searchParams);
        const query = employeeQuerySchema.parse(searchParams);

        const where = {
            tenantId: auth.tenantId,
            ...(query.isActive !== undefined && {
                isActive: query.isActive === 'true'
            }),
            ...(query.search && {
                OR: [
                    { name: { contains: query.search, mode: 'insensitive' as const } },
                    { email: { contains: query.search, mode: 'insensitive' as const } },
                ],
            }),
        };

        const [employees, total] = await Promise.all([
            prisma.employee.findMany({
                where,
                include: {
                    _count: {
                        select: {
                            assignments: true,
                            vacations: true,
                        },
                    },
                },
                orderBy: { name: 'asc' },
                skip: (query.page - 1) * query.limit,
                take: query.limit,
            }),
            prisma.employee.count({ where }),
        ]);

        return successResponse({
            data: employees,
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

// POST /api/employees - Create employee
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(request);

        if (!canManageEmployees(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can create employees');
        }

        const body = await request.json();
        const data = createEmployeeSchema.parse(body);

        const employee = await prisma.employee.create({
            data: {
                tenantId: auth.tenantId,
                name: data.name,
                email: data.email,
                phone: data.phone,
                department: data.department,
                team: data.team,
                subTeam: data.subTeam,
                joinYear: data.joinYear,
                customerAreaId: data.customerAreaId,
            },
        });

        // Audit log
        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action: AuditAction.CREATE_EMPLOYEE,
            entityType: EntityType.EMPLOYEE,
            entityId: employee.id,
            newData: toAuditData({
                name: employee.name,
                email: employee.email,
                phone: employee.phone,
                department: employee.department,
                team: employee.team,
                subTeam: employee.subTeam,
                joinYear: employee.joinYear,
                customerAreaId: employee.customerAreaId,
            }),
        });

        return createdResponse(employee);
    } catch (error) {
        return handleApiError(error);
    }
}
