import { z } from 'zod';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import type { Role } from './db';
import { getRequiredEnv } from './env';

// ============================================
// TYPES
// ============================================

export interface AuthUser {
    userId: string;
    tenantId: string;
    email: string;
    role: Role;
    // jose returns exp etc in payload, so we can allow index signature or just known fields
    [key: string]: any;
}

export interface AuthContext {
    user: AuthUser;
    tenantId: string;
}

// ============================================
// JWT CONFIG (with type guard for expiresIn)
// ============================================

const JWT_SECRET_KEY = getRequiredEnv('JWT_SECRET');
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET_KEY);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ============================================
// ZOD SCHEMAS
// ============================================

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

export const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    tenantId: z.string().optional(), // Optional for creating new tenant
    tenantName: z.string().optional(), // For new tenant creation
});

// ============================================
// PASSWORD HASHING
// ============================================

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ============================================
// JWT TOKEN MANAGEMENT
// ============================================

export async function generateToken(user: AuthUser): Promise<string> {
    return new SignJWT({
        userId: user.userId,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(JWT_EXPIRES_IN)
        .sign(SECRET_KEY);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
    try {
        const { payload } = await jwtVerify(token, SECRET_KEY);
        // Cast payload to AuthUser
        return payload as AuthUser;
    } catch (error) {
        console.error('JWT Verification Failed:', error);
        return null;
    }
}

// ============================================
// REQUEST AUTHENTICATION
// ============================================

export function extractTokenFromRequest(request: NextRequest): string | null {
    // Try Authorization header first
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Try cookie as fallback
    const token = request.cookies.get('auth_token')?.value;
    return token || null;
}

export async function getAuthFromRequest(request: NextRequest): Promise<AuthContext | null> {
    const token = extractTokenFromRequest(request);
    if (!token) return null;

    const user = await verifyToken(token);
    if (!user) return null;

    // Server-side DB check to ensure user and tenant still exist (avoids 500 for stale cookies)
    const { default: prisma } = await import('./db');
    const dbUser = await prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId, isActive: true }
    });

    if (!dbUser) return null;

    return {
        user,
        tenantId: user.tenantId,
    };
}

// ============================================
// PERMISSION CHECKS
// ============================================

export function canManageEmployees(role: Role): boolean {
    return role === 'ADMIN' || role === 'MANAGER';
}

export function canManageSchedules(role: Role): boolean {
    return role === 'ADMIN' || role === 'MANAGER';
}

export function canViewSchedules(_role: Role): boolean {
    return true; // All roles can view
}

export function canManageVacations(role: Role): boolean {
    return role === 'ADMIN' || role === 'MANAGER';
}

export function isAdmin(role: Role): boolean {
    return role === 'ADMIN';
}

// ============================================
// ERROR TYPES
// ============================================

export class AuthError extends Error {
    constructor(
        message: string,
        public code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_TOKEN' = 'UNAUTHORIZED'
    ) {
        super(message);
        this.name = 'AuthError';
    }
}

// ============================================
// MIDDLEWARE HELPER (API Routes — needs NextRequest)
// ============================================

export async function requireAuth(request: NextRequest): Promise<AuthContext> {
    const auth = await getAuthFromRequest(request);
    if (!auth) {
        throw new AuthError('Authentication required', 'UNAUTHORIZED');
    }
    return auth;
}

export async function requireRole(request: NextRequest, allowedRoles: Role[]): Promise<AuthContext> {
    const auth = await requireAuth(request);
    if (!allowedRoles.includes(auth.user.role)) {
        throw new AuthError('Insufficient permissions', 'FORBIDDEN');
    }
    return auth;
}

// ============================================
// SERVER COMPONENT AUTH (cookies-based, no NextRequest)
// ============================================

/**
 * Server Component 전용 인증 헬퍼.
 * next/headers의 cookies()에서 auth_token JWT를 읽어 verify한 뒤 AuthContext를 반환.
 * API route의 requireAuth(request)와 동일한 결과를 반환하지만, Request 객체가 불필요.
 */
export async function requireAuthServer(): Promise<AuthContext> {
    // Dynamic import to avoid pulling next/headers into API route bundles
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
        throw new AuthError('Authentication required', 'UNAUTHORIZED');
    }

    const user = await verifyToken(token);
    if (!user) {
        throw new AuthError('Invalid token', 'INVALID_TOKEN');
    }

    // Server-side DB check
    const { default: prisma } = await import('./db');
    const dbUser = await prisma.user.findFirst({
        where: { id: user.userId, tenantId: user.tenantId, isActive: true }
    });

    if (!dbUser) {
        throw new AuthError('User account removed or obsolete', 'INVALID_TOKEN');
    }

    return { user, tenantId: user.tenantId };
}
