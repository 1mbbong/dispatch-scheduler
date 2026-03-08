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
    customerAreaId: z.string().cuid().optional().nullable(),
    statusId: z.string().cuid().optional().nullable(),
    workTypeIds: z.array(z.string().cuid()).optional(),
    workLocationType: z.enum(['OFFICE', 'FIELD', 'REMOTE']).default('FIELD'),
    officeId: z.string().cuid().optional().nullable(),
}).refine(
    (data) => data.startTime < data.endTime,
    { message: 'startTime must be before endTime' }
).superRefine((data, ctx) => {
    if (data.workLocationType === 'OFFICE' && !data.officeId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Office selection is required when work location is OFFICE.',
            path: ['officeId'],
        });
    }
});

export const updateScheduleSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional().nullable(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    status: z.enum(['ACTIVE', 'CANCELLED']).optional(), // SystemStatus
    categoryId: z.string().cuid().optional().nullable(),
    customerAreaId: z.string().cuid().optional().nullable(),
    statusId: z.string().cuid().optional().nullable(),
    workTypeIds: z.array(z.string().cuid()).optional(),
    workLocationType: z.enum(['OFFICE', 'FIELD', 'REMOTE']).optional(),
    officeId: z.string().cuid().optional().nullable(),
}).refine(
    (data) => {
        if (data.startTime && data.endTime) {
            return data.startTime < data.endTime;
        }
        return true;
    },
    { message: 'startTime must be before endTime' }
).superRefine((data, ctx) => {
    if (data.workLocationType === 'OFFICE' && !data.officeId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Office selection is required when work location is OFFICE.',
            path: ['officeId'],
        });
    }
});

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
    allowConflicts: z.boolean().optional().default(false),
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
    customerAreaId: z.string().cuid().optional().nullable(),
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
    customerAreaId: z.string().cuid().optional().nullable(),
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
// LABEL SYSTEM SCHEMAS
// ============================================

export const createCustomerAreaSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, 'Must be a valid hex color'),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

export const updateCustomerAreaSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, 'Must be a valid hex color').optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

export const createStatusSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, 'Must be a valid hex color'),
    isActive: z.boolean().optional(),
    isCanceled: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

export const updateStatusSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, 'Must be a valid hex color').optional(),
    isActive: z.boolean().optional(),
    isCanceled: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

export const createWorkTypeSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

export const updateWorkTypeSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

export const createOfficeSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
});

export const updateOfficeSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
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

export type CreateCustomerAreaInput = z.infer<typeof createCustomerAreaSchema>;
export type UpdateCustomerAreaInput = z.infer<typeof updateCustomerAreaSchema>;

export type CreateStatusInput = z.infer<typeof createStatusSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export type CreateWorkTypeInput = z.infer<typeof createWorkTypeSchema>;
export type UpdateWorkTypeInput = z.infer<typeof updateWorkTypeSchema>;

export type CreateOfficeInput = z.infer<typeof createOfficeSchema>;
export type UpdateOfficeInput = z.infer<typeof updateOfficeSchema>;
