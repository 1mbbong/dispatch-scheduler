import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { successResponse, handleApiError } from '@/lib/api-response';

// GET /api/auth/me - Get current user info
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth(request);

        const user = await prisma.user.findFirst({
            where: {
                id: auth.user.userId,
                tenantId: auth.tenantId,
            },
            include: {
                tenant: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!user) {
            return successResponse(null);
        }

        return successResponse({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            tenantId: user.tenantId,
            tenantName: user.tenant.name,
        });
    } catch (error) {
        return handleApiError(error);
    }
}
