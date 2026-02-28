import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// POST /api/auth/logout — always succeeds (even if token is expired/missing)
export async function POST() {
    const cookieStore = await cookies();
    cookieStore.set('auth_token', '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
    });

    return NextResponse.json({ success: true });
}
