import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageVacations } from '@/lib/auth';
import {
    successResponse,
    createdResponse,
    handleApiError,
    forbiddenResponse,
    notFoundResponse,
} from '@/lib/api-response';
import { createVacationSchema, vacationQuerySchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType, toAuditData } from '@/lib/audit';

// GET /api/vacations - List vacations
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth(request);
        const searchParams = Object.fromEntries(request.nextUrl.searchParams);
        const query = vacationQuerySchema.parse(searchParams);

        const where = {
            employee: {
                tenantId: auth.tenantId, // Tenant isolation via employee
            },
            ...(query.employeeId && { employeeId: query.employeeId }),
            ...(query.startDate && query.endDate && {
                startDate: { gte: query.startDate },
                endDate: { lte: query.endDate },
            }),
        };

        const [vacations, total] = await Promise.all([
            prisma.vacation.findMany({
                where,
                include: {
                    employee: {
                        select: { id: true, name: true },
                    },
                },
                orderBy: { startDate: 'asc' },
                skip: (query.page - 1) * query.limit,
                take: query.limit,
            }),
            prisma.vacation.count({ where }),
        ]);

        return successResponse({
            data: vacations,
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

// POST /api/vacations - Create vacation
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(request);

        if (!canManageVacations(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can create vacations');
        }

        const body = await request.json();
        const data = createVacationSchema.parse(body);

        // Verify employee belongs to tenant
        const employee = await prisma.employee.findFirst({
            where: {
                id: data.employeeId,
                tenantId: auth.tenantId,
            },
        });

        if (!employee) {
            return notFoundResponse('Employee');
        }

        const vacation = await prisma.vacation.create({
            data: {
                employeeId: data.employeeId,
                startDate: data.startDate,
                endDate: data.endDate,
                reason: data.reason,
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
            action: AuditAction.CREATE_VACATION,
            entityType: EntityType.VACATION,
            entityId: vacation.id,
            newData: toAuditData({
                employeeId: vacation.employeeId,
                employeeName: vacation.employee.name,
                startDate: vacation.startDate,
                endDate: vacation.endDate,
                reason: vacation.reason,
            }),
        });

        return createdResponse(vacation);
    } catch (error) {
        return handleApiError(error);
    }
}
