import prisma from './db';
import { Prisma } from '@prisma/client';

// ============================================
// AUDIT LOG ACTIONS
// ============================================

export const AuditAction = {
    // Schedule actions
    CREATE_SCHEDULE: 'CREATE_SCHEDULE',
    UPDATE_SCHEDULE: 'UPDATE_SCHEDULE',
    CANCEL_SCHEDULE: 'CANCEL_SCHEDULE',
    REACTIVATE_SCHEDULE: 'REACTIVATE_SCHEDULE',

    // Assignment actions
    ASSIGN_EMPLOYEE: 'ASSIGN_EMPLOYEE',
    UNASSIGN_EMPLOYEE: 'UNASSIGN_EMPLOYEE',

    // Vacation actions
    CREATE_VACATION: 'CREATE_VACATION',
    UPDATE_VACATION: 'UPDATE_VACATION',
    DELETE_VACATION: 'DELETE_VACATION',

    // Employee actions
    CREATE_EMPLOYEE: 'CREATE_EMPLOYEE',
    UPDATE_EMPLOYEE: 'UPDATE_EMPLOYEE',
    DEACTIVATE_EMPLOYEE: 'DEACTIVATE_EMPLOYEE',

    // Label actions
    CREATE_LABEL: 'CREATE_LABEL',
    UPDATE_LABEL: 'UPDATE_LABEL',
    DELETE_LABEL: 'DELETE_LABEL',
} as const;

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];

export const EntityType = {
    SCHEDULE: 'SCHEDULE',
    ASSIGNMENT: 'ASSIGNMENT',
    VACATION: 'VACATION',
    EMPLOYEE: 'EMPLOYEE',
    CUSTOMER_AREA: 'CUSTOMER_AREA',
    SCHEDULE_STATUS: 'SCHEDULE_STATUS',
    WORK_TYPE: 'WORK_TYPE',
} as const;

export type EntityTypeValue = typeof EntityType[keyof typeof EntityType];

// ============================================
// AUDIT LOG CREATION
// ============================================

interface CreateAuditLogParams {
    tenantId: string;
    userId: string | null;
    action: AuditActionType;
    entityType: EntityTypeValue;
    entityId: string;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
}

export async function createAuditLog({
    tenantId,
    userId,
    action,
    entityType,
    entityId,
    oldData = null,
    newData = null,
}: CreateAuditLogParams): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                tenantId,
                userId,
                action,
                entityType,
                entityId,
                oldData: oldData === null
                    ? Prisma.DbNull
                    : (oldData as Prisma.InputJsonValue),
                newData: newData === null
                    ? Prisma.DbNull
                    : (newData as Prisma.InputJsonValue),
            },
        });
    } catch (error) {
        // Log error but don't fail the main operation
        console.error('Failed to create audit log:', error);
    }
}

// ============================================
// HELPER FOR SAFE JSON SERIALIZATION
// ============================================

export function toAuditData<T extends Record<string, unknown>>(
    data: T
): Record<string, unknown> {
    // Convert Date objects to ISO strings for JSON storage
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
        if (value instanceof Date) {
            result[key] = value.toISOString();
        } else if (value === undefined) {
            // Skip undefined values
            continue;
        } else {
            result[key] = value;
        }
    }

    return result;
}

// ============================================
// BATCH AUDIT LOGGING
// ============================================

export async function createAuditLogBatch(
    logs: CreateAuditLogParams[]
): Promise<void> {
    try {
        await prisma.auditLog.createMany({
            data: logs.map((log) => ({
                tenantId: log.tenantId,
                userId: log.userId,
                action: log.action,
                entityType: log.entityType,
                entityId: log.entityId,
                oldData: log.oldData === null
                    ? Prisma.DbNull
                    : (log.oldData as Prisma.InputJsonValue),
                newData: log.newData === null
                    ? Prisma.DbNull
                    : (log.newData as Prisma.InputJsonValue),
            })),
        });
    } catch (error) {
        console.error('Failed to create audit logs batch:', error);
    }
}
