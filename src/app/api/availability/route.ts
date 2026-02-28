import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
    successResponse,
    handleApiError,
    badRequestResponse
} from '@/lib/api-response';
import { z } from 'zod';

const availabilityQuerySchema = z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
});

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth(request);
        const searchParams = Object.fromEntries(request.nextUrl.searchParams);
        
        const parsedQuery = availabilityQuerySchema.safeParse(searchParams);
        if (!parsedQuery.success) {
            return badRequestResponse('Invalid date parameters', parsedQuery.error.format());
        }

        const startDate = new Date(parsedQuery.data.startDate);
        const endDate = new Date(parsedQuery.data.endDate);

        if (startDate >= endDate) {
            return badRequestResponse('startDate must be before endDate');
        }

        // Fetch all active employees as base ground truth
        const employees = await prisma.employee.findMany({
            where: { tenantId: auth.tenantId, isActive: true },
            select: { id: true, name: true, email: true, department: true }
        });

        // 1. Fetch overlapping vacations for ALL active employees
        const vacations = await prisma.vacation.findMany({
            where: {
                employee: { tenantId: auth.tenantId, isActive: true },
                startDate: { lte: endDate },
                endDate: { gte: startDate }
            },
            select: {
                id: true,
                employeeId: true,
                startDate: true,
                endDate: true,
                reason: true
            }
        });

        // 2. Fetch overlapping active schedules for ALL active employees
        // A schedule overlaps the range if it starts before our endDate AND ends after our startDate.
        const schedules = await prisma.schedule.findMany({
            where: {
                tenantId: auth.tenantId,
                status: 'ACTIVE',
                startTime: { lt: endDate },
                endTime: { gt: startDate },
                assignments: {
                    some: { employee: { isActive: true } }
                }
            },
            include: {
                assignments: {
                    where: { employee: { isActive: true } },
                    select: { employeeId: true, date: true, startTime: true, endTime: true }
                }
            }
        });

        return successResponse({
            employees,
            vacations,
            schedules
        });
        
    } catch (error) {
        return handleApiError(error);
    }
}
