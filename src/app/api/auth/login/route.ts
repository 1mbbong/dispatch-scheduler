import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/db';
import {
    verifyPassword,
    generateToken,
    loginSchema,
} from '@/lib/auth';
import {
    handleApiError,
    unauthorizedResponse,
} from '@/lib/api-response';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// POST /api/auth/login
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { email, password } = loginSchema.parse(body);

        // Find user (email is unique per tenant, so we need tenant context)
        // For login, we find the user by email globally first
        const user = await prisma.user.findFirst({
            where: { email, isActive: true },
            include: {
                tenant: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!user) {
            return unauthorizedResponse('Invalid email or password');
        }

        const isValid = await verifyPassword(password, user.password);
        if (!isValid) {
            return unauthorizedResponse('Invalid email or password');
        }

        const token = await generateToken({
            userId: user.id,
            tenantId: user.tenantId,
            email: user.email,
            role: user.role,
        });

        // Set HttpOnly cookie via server-side cookies() API
        const cookieStore = await cookies();
        cookieStore.set('auth_token', token, {
            httpOnly: true,
            path: '/',
            maxAge: COOKIE_MAX_AGE,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
        });

        console.log('Login successful for:', email);

        // Token kept in body for Bearer-based clients (e.g. smoke-test)
        return NextResponse.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    tenantId: user.tenantId,
                    tenantName: user.tenant.name,
                },
            },
        });
    } catch (error) {
        return handleApiError(error);
    }
}
