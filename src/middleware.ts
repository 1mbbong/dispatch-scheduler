import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

// Paths that don't require authentication
const publicPaths = ['/login', '/register', '/api/auth/login', '/api/auth/register', '/api/auth/logout'];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Skip public paths
    if (publicPaths.some((path) => pathname.startsWith(path))) {
        return NextResponse.next();
    }

    console.log(`Middleware checking: ${pathname}. Cookie: ${request.cookies.get('auth_token')?.value ? 'Present' : 'Missing'}`);

    // Check for auth token in cookies
    let token = request.cookies.get('auth_token')?.value;

    // Check for auth token in headers (Bearer)
    if (!token) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }

    // If no token, redirect to login for pages, or return 401 for API
    if (!token) {
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(url);
    }

    // Verify token
    const payload = await verifyToken(token);
    if (!payload) {
        console.log(`Middleware: Token verification failed for ${pathname}`);

        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'Invalid Token' }, { status: 401 });
        }

        // If invalid token, clear it and redirect to login
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('auth_token');
        return response;
    }
    console.log(`Middleware: Auth success for ${pathname} (Tenant: ${payload.tenantId})`);

    // Add user info to headers for API routes (optional, but good practice)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId);
    requestHeaders.set('x-tenant-id', payload.tenantId);
    requestHeaders.set('x-user-role', payload.role);

    return NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
