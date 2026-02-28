import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';
import { z } from 'zod';

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// GET /api/audit-logs — Admin-only audit log viewer
export async function GET(request: NextRequest) {
    try {
        const auth = await requireRole(request, ['ADMIN']);

        const url = new URL(request.url);
        const { page, pageSize } = querySchema.parse({
            page: url.searchParams.get('page') ?? undefined,
            pageSize: url.searchParams.get('pageSize') ?? undefined,
        });

        const skip = (page - 1) * pageSize;
        const where = { tenantId: auth.tenantId };

        const [items, totalCount] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                skip,
                take: pageSize,
            }),
            prisma.auditLog.count({ where }),
        ]);

        return successResponse({
            items,
            page,
            pageSize,
            totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
        });
    } catch (error) {
        return handleApiError(error);
    }
}
