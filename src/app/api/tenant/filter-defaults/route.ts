import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { z } from 'zod';

const filterDefaultsSchema = z.object({
    areas: z.union([z.literal('ALL'), z.array(z.string())]).optional(),
    unstaffed: z.boolean().optional(),
    loc: z.object({
        office: z.boolean(),
        wfh: z.boolean(),
        field: z.boolean(),
    }).optional(),
    ghosts: z.boolean().optional(),
    dayCounts: z.boolean().optional(),
}).strict();

// GET /api/tenant/filter-defaults — any authenticated user
export async function GET(request: NextRequest) {
    let auth;
    try {
        auth = await requireAuth(request);
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: auth.tenantId },
        select: { filterDefaults: true },
    });

    return NextResponse.json(tenant?.filterDefaults ?? null);
}

// PATCH /api/tenant/filter-defaults — ADMIN only
export async function PATCH(request: NextRequest) {
    let auth;
    try {
        auth = await requireAuth(request);
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (auth.user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 422 });
    }

    const parsed = filterDefaultsSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation failed', details: parsed.error.flatten() },
            { status: 422 }
        );
    }

    // Read old defaults for audit diff
    const oldTenant = await prisma.tenant.findUnique({
        where: { id: auth.tenantId },
        select: { filterDefaults: true },
    });

    const updated = await prisma.tenant.update({
        where: { id: auth.tenantId },
        data: { filterDefaults: parsed.data as any },
        select: { filterDefaults: true },
    });

    // Audit log
    await createAuditLog({
        tenantId: auth.tenantId,
        userId: auth.user.userId,
        action: 'UPDATE_FILTER_DEFAULTS',
        entityType: 'TENANT',
        entityId: auth.tenantId,
        oldData: oldTenant?.filterDefaults as Record<string, any> | null,
        newData: updated.filterDefaults as Record<string, any>,
    });

    return NextResponse.json(updated.filterDefaults);
}
