import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import {
    hashPassword,
    generateToken,
    registerSchema,
} from '@/lib/auth';
import {
    createdResponse,
    handleApiError,
    badRequestResponse,
} from '@/lib/api-response';

// POST /api/auth/register - Register new user (creates tenant if needed)
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const data = registerSchema.parse(body);

        // If no tenantId provided, must have tenantName to create new tenant
        if (!data.tenantId && !data.tenantName) {
            return badRequestResponse('Either tenantId or tenantName is required');
        }

        let tenantId = data.tenantId;
        let tenantName = data.tenantName || '';

        // Check if email already exists
        const existingUser = await prisma.user.findFirst({
            where: { email: data.email },
        });

        if (existingUser) {
            return badRequestResponse('Email already registered');
        }

        const hashedPassword = await hashPassword(data.password);

        // Transaction: create tenant (if new) + user
        const result = await prisma.$transaction(async (tx) => {
            // Create tenant if needed
            if (!tenantId) {
                const tenant = await tx.tenant.create({
                    data: { name: tenantName },
                });
                tenantId = tenant.id;
                tenantName = tenant.name;
            } else {
                // Verify tenant exists
                const tenant = await tx.tenant.findUnique({
                    where: { id: tenantId },
                });
                if (!tenant) {
                    throw new Error('Tenant not found');
                }
                tenantName = tenant.name;
            }

            // First user in a tenant becomes ADMIN
            const userCount = await tx.user.count({
                where: { tenantId },
            });

            const user = await tx.user.create({
                data: {
                    tenantId,
                    email: data.email,
                    name: data.name,
                    password: hashedPassword,
                    role: userCount === 0 ? 'ADMIN' : 'MEMBER',
                },
            });

            return { user, tenantName };
        });

        const token = await generateToken({
            userId: result.user.id,
            tenantId: result.user.tenantId,
            email: result.user.email,
            role: result.user.role,
        });

        return createdResponse({
            token,
            user: {
                id: result.user.id,
                email: result.user.email,
                name: result.user.name,
                role: result.user.role,
                tenantId: result.user.tenantId,
                tenantName: result.tenantName,
            },
        });
    } catch (error) {
        return handleApiError(error);
    }
}
