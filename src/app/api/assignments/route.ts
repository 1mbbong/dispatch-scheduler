import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, canManageSchedules } from '@/lib/auth';
import {
    createdResponse,
    handleApiError,
    forbiddenResponse,
    notFoundResponse,
    conflictResponse,
    successResponse,
} from '@/lib/api-response';
import { createAssignmentSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType, toAuditData } from '@/lib/audit';

// POST /api/assignments - Assign employee to schedule
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(request);

        if (!canManageSchedules(auth.user.role)) {
            return forbiddenResponse('Only admins and managers can assign employees');
        }

        const body = await request.json();
        const data = createAssignmentSchema.parse(body);

        // 1. Verify schedule exists and belongs to tenant
        const schedule = await prisma.schedule.findFirst({
            where: {
                id: data.scheduleId,
                tenantId: auth.tenantId,
                status: 'ACTIVE',
            },
            include: {
                customerArea: { select: { name: true } },
                office: { select: { name: true } },
            },
        });

        if (!schedule) {
            return notFoundResponse('Schedule');
        }

        // 2. Verify employee exists and belongs to tenant
        const employee = await prisma.employee.findFirst({
            where: {
                id: data.employeeId,
                tenantId: auth.tenantId,
                isActive: true,
            },
        });

        if (!employee) {
            return notFoundResponse('Employee');
        }

        // Validate that the requested date overlaps with the schedule's date range
        const requestDayStart = new Date(data.date);
        const requestDayEnd = new Date(requestDayStart.getTime() + 24 * 60 * 60 * 1000);

        if (requestDayEnd <= new Date(schedule.startTime) || requestDayStart >= new Date(schedule.endTime)) {
            return forbiddenResponse('Assignment date must fall within the schedule date range');
        }

        // Collect warnings for conflict override mode
        const warnings: Array<{
            type: 'ASSIGNMENT_CONFLICT' | 'VACATION_CONFLICT';
            employeeId: string;
            date: string;
            conflicts: Array<{
                scheduleId: string;
                scheduleTitle: string;
                startTime: string;
                endTime: string;
                workLocationType?: string;
                officeName?: string;
                customerAreaName?: string;
            }>;
        }> = [];

        // 3. Check for overlapping assignments on THIS SPECIFIC DATE
        const overlappingAssignments = await prisma.assignment.findMany({
            where: {
                employeeId: data.employeeId,
                date: requestDayStart,
                startTime: { lt: schedule.endTime },
                endTime: { gt: schedule.startTime },
                schedule: { status: 'ACTIVE' },
            },
            include: {
                schedule: {
                    select: {
                        id: true,
                        title: true,
                        tenantId: true,
                        workLocationType: true,
                        officeId: true,
                        office: { select: { name: true } },
                        customerArea: { select: { name: true } },
                    },
                },
            },
        });

        const assignmentConflicts = overlappingAssignments.filter((a) => a.schedule.tenantId === auth.tenantId);

        if (assignmentConflicts.length > 0) {
            if (!data.allowConflicts) {
                return conflictResponse(
                    'Employee has overlapping assignments on this date',
                    assignmentConflicts.map((c) => ({
                        scheduleId: c.schedule.id,
                        scheduleTitle: c.schedule.title,
                        startTime: c.startTime.toISOString(),
                        endTime: c.endTime.toISOString(),
                    })),
                    'ASSIGNMENT_CONFLICT'
                );
            }
            // Collect as warning
            warnings.push({
                type: 'ASSIGNMENT_CONFLICT',
                employeeId: data.employeeId,
                date: requestDayStart.toISOString(),
                conflicts: assignmentConflicts.map((c) => ({
                    scheduleId: c.schedule.id,
                    scheduleTitle: c.schedule.title,
                    startTime: c.startTime.toISOString(),
                    endTime: c.endTime.toISOString(),
                    workLocationType: c.schedule.workLocationType || undefined,
                    officeName: (c.schedule as any).office?.name || undefined,
                    customerAreaName: (c.schedule as any).customerArea?.name || undefined,
                })),
            });
        }

        // 4. Check for vacation conflicts on THIS SPECIFIC DATE
        const vacationConflicts = await prisma.vacation.findMany({
            where: {
                employeeId: data.employeeId,
                startDate: { lt: requestDayEnd },
                endDate: { gte: requestDayStart },
            },
        });

        if (vacationConflicts.length > 0) {
            if (!data.allowConflicts) {
                return conflictResponse(
                    'Employee is on vacation on this date',
                    vacationConflicts.map((v) => ({
                        scheduleId: data.scheduleId,
                        scheduleTitle: schedule.title,
                        startTime: v.startDate.toISOString(),
                        endTime: v.endDate.toISOString(),
                    })),
                    'VACATION_CONFLICT'
                );
            }
            // Collect as warning
            warnings.push({
                type: 'VACATION_CONFLICT',
                employeeId: data.employeeId,
                date: requestDayStart.toISOString(),
                conflicts: vacationConflicts.map((v) => ({
                    scheduleId: data.scheduleId,
                    scheduleTitle: schedule.title,
                    startTime: v.startDate.toISOString(),
                    endTime: v.endDate.toISOString(),
                })),
            });
        }

        // 5. Create assignment with the specific date
        const assignment = await prisma.assignment.create({
            data: {
                scheduleId: data.scheduleId,
                employeeId: data.employeeId,
                date: requestDayStart,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
            },
            include: {
                employee: { select: { id: true, name: true, email: true } },
                schedule: { select: { id: true, title: true } },
            },
        });

        // Audit log (enriched when conflicts were overridden)
        const auditNewData: Record<string, unknown> = toAuditData({
            scheduleId: assignment.scheduleId,
            scheduleTitle: assignment.schedule.title,
            employeeId: assignment.employeeId,
            employeeName: assignment.employee.name,
            date: assignment.date,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
        });

        if (warnings.length > 0) {
            auditNewData.conflictOverride = true;
            auditNewData.conflictWarnings = warnings;
        }

        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.userId,
            action: AuditAction.ASSIGN_EMPLOYEE,
            entityType: EntityType.ASSIGNMENT,
            entityId: assignment.id,
            newData: auditNewData,
        });

        // Return with warnings if any
        if (warnings.length > 0) {
            return createdResponse({ assignment, warnings });
        }

        return createdResponse(assignment);
    } catch (error) {
        return handleApiError(error);
    }
}

// GET /api/assignments?scheduleId=...
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth(request);
        const { searchParams } = new URL(request.url);
        const scheduleId = searchParams.get('scheduleId');

        const where: any = {
            schedule: {
                tenantId: auth.tenantId,
            },
        };

        if (scheduleId) {
            where.scheduleId = scheduleId;
        }

        const assignments = await prisma.assignment.findMany({
            where,
            include: {
                employee: { select: { id: true, name: true, email: true } },
                schedule: { select: { id: true, title: true } },
            },
            orderBy: { date: 'asc' },
        });

        return successResponse(assignments);
    } catch (error) {
        return handleApiError(error);
    }
}
