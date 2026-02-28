import { z } from 'zod';

// ============================================
// COMMON SCHEMAS
// ============================================

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
}).refine(
    (data) => data.startDate <= data.endDate,
    { message: 'startDate must be before or equal to endDate' }
);

// ============================================
// SCHEDULE SCHEMAS
// ============================================

export const createScheduleSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    categoryId: z.string().cuid().optional().nullable(),
}).refine(
    (data) => data.startTime < data.endTime,
    { message: 'startTime must be before endTime' }
);

export const updateScheduleSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
    categoryId: z.string().cuid().optional().nullable(),
}).refine(
    (data) => {
        if (data.startTime && data.endTime) {
            return data.startTime < data.endTime;
        }
        return true;
    },
    { message: 'startTime must be before endTime' }
);

export const scheduleQuerySchema = z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    status: z.enum(['ACTIVE', 'CANCELLED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================
// ASSIGNMENT SCHEMAS
// ============================================

export const createAssignmentSchema = z.object({
    scheduleId: z.string().cuid(),
    employeeId: z.string().cuid(),
    date: z.coerce.date(),
});

export const bulkAssignmentSchema = z.object({
    scheduleId: z.string().cuid(),
    employeeIds: z.array(z.string().cuid()).min(1),
});

// ============================================
// EMPLOYEE SCHEMAS
// ============================================

export const createEmployeeSchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    department: z.string().optional().default(''),
    team: z.string().optional().default(''),
    subTeam: z.string().max(100).optional().nullable(),
    joinYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
});

export const updateEmployeeSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    department: z.string().optional(),
    team: z.string().optional(),
    subTeam: z.string().max(100).optional().nullable(),
    joinYear: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
    isActive: z.boolean().optional(),
});

// ============================================
// VACATION SCHEMAS
// ============================================

export const createVacationSchema = z.object({
    employeeId: z.string().cuid(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().max(500).optional().nullable(),
}).refine(
    (data) => data.startDate <= data.endDate,
    { message: 'startDate must be before or equal to endDate' }
);

export const updateVacationSchema = z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    reason: z.string().max(500).optional().nullable(),
}).refine(
    (data) => {
        if (data.startDate && data.endDate) {
            return data.startDate <= data.endDate;
        }
        return true;
    },
    { message: 'startDate must be before or equal to endDate' }
);

export const vacationQuerySchema = z.object({
    employeeId: z.string().cuid().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ScheduleQueryInput = z.infer<typeof scheduleQuerySchema>;

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type BulkAssignmentInput = z.infer<typeof bulkAssignmentSchema>;

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export type CreateVacationInput = z.infer<typeof createVacationSchema>;
export type UpdateVacationInput = z.infer<typeof updateVacationSchema>;
export type VacationQueryInput = z.infer<typeof vacationQuerySchema>;
