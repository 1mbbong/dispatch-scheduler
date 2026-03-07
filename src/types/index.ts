// Re-export types from db (Prisma types)
export type {
    Schedule,
    Assignment,
    Employee,
    Vacation,
    Role,
    Category,
    CustomerArea,
    ScheduleStatus,
    WorkType
} from '@/lib/db';

// ============================================
// API RESPONSE TYPES
// ============================================
import type { Schedule, Assignment, Employee, Vacation, Role, Category, CustomerArea, ScheduleStatus, WorkType } from '@/lib/db';

// Schedule with assignments included
export interface ScheduleWithAssignments extends Schedule {
    assignments: (Assignment & {
        employee: Pick<Employee, 'id' | 'name' | 'email'>;
    })[];
}

// Employee with assignment count
export interface EmployeeWithStats extends Employee {
    _count?: {
        assignments: number;
        vacations: number;
    };
}

// Vacation with employee info
export interface VacationWithEmployee extends Vacation {
    employee: Pick<Employee, 'id' | 'name'>;
}

// ============================================
// SERIALIZED TYPES (Server→Client, Date→string)
// ============================================
// When Server Components pass Prisma data to Client Components,
// Date objects are serialized to ISO strings via JSON.
// These types reflect that serialized shape.

/** Recursively convert Date fields to string */
type Serialized<T> =
    T extends Date ? string :
    T extends Array<infer U> ? Serialized<U>[] :
    T extends object ? { [K in keyof T]: Serialized<T[K]> } :
    T;

export type SerializedSchedule = Serialized<Schedule>;
export type SerializedAssignment = Serialized<Assignment>;
export type SerializedEmployee = Serialized<Employee>;
export type SerializedVacation = Serialized<Vacation>;
export type SerializedCustomerArea = Serialized<CustomerArea>;
export type SerializedScheduleStatus = Serialized<ScheduleStatus>;
export type SerializedWorkType = Serialized<WorkType>;

/** Schedule with nested assignments+employee, all dates serialized */
export type SerializedScheduleWithAssignments = Serialized<
    Schedule & {
        assignments: (Assignment & { employee: Employee })[];
        category?: Category | null;
        customerArea?: CustomerArea | null;
        scheduleStatus?: ScheduleStatus | null;
        workTypes?: ({ workType: WorkType })[];
    }
>;

/** Vacation with nested employee, all dates serialized */
export type SerializedVacationWithEmployee = Serialized<
    Vacation & { employee: Employee }
>;

/** Employee with _count, all dates serialized */
export type SerializedEmployeeWithStats = Serialized<
    Employee & { _count?: { assignments: number; vacations: number } }
>;

// ============================================
// CALENDAR VIEW TYPES
// ============================================

export interface CalendarSchedule {
    id: string;
    title: string;
    description: string | null;
    startTime: string; // ISO string
    endTime: string; // ISO string
    status: 'ACTIVE' | 'CANCELLED';
    assignedEmployees: {
        id: string;
        name: string;
    }[];
}

export interface CalendarDay {
    date: string; // YYYY-MM-DD
    schedules: CalendarSchedule[];
}

// ============================================
// CONFLICT TYPES
// ============================================

export interface AssignmentConflict {
    scheduleId: string;
    scheduleTitle: string;
    startTime: string;
    endTime: string;
}

export interface VacationConflict {
    vacationId: string;
    startDate: string;
    endDate: string;
    reason: string | null;
}

// ============================================
// AUTH TYPES (UI)
// ============================================

export interface CurrentUser {
    id: string;
    email: string;
    name: string;
    role: Role;
    tenantId: string;
    tenantName: string;
}

// ============================================
// UI TERMINOLOGY MAPPING
// ============================================

// Internal -> UI terminology (for i18n layer)
export const UI_TERMS = {
    tenant: 'Workspace',
    tenants: 'Workspaces',
    tenantId: 'Workspace ID',
    tenantName: 'Workspace Name',
    tenantSettings: 'Workspace Settings',
    tenantMembers: 'Workspace Members',
} as const;
