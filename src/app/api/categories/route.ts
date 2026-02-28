import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

// GET /api/categories - List categories for the tenant
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth(request);

        const categories = await prisma.category.findMany({
            where: {
                tenantId: auth.tenantId,
            },
            orderBy: {
                name: 'asc',
            },
        });

        // Also fetch the tenant's categoryLabel setting to dynamically rename "Category" in the UI
        const tenant = await prisma.tenant.findUnique({
            where: { id: auth.tenantId },
            select: { categoryLabel: true },
        });

        return successResponse({
            categories,
            label: tenant?.categoryLabel || 'Category',
        });
    } catch (error) {
        return handleApiError(error);
    }
}
