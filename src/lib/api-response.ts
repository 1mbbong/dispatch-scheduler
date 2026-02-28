import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError } from './auth';

// ============================================
// ERROR TYPES
// ============================================

export interface ApiError {
    error: string;
    code: string;
    details?: unknown;
}

export interface ConflictError extends ApiError {
    code: 'ASSIGNMENT_CONFLICT' | 'VACATION_CONFLICT';
    conflicts: Array<{
        scheduleId?: string;
        scheduleTitle?: string;
        startTime: string;
        endTime: string;
    }>;
}

// ============================================
// SUCCESS RESPONSES
// ============================================

export function successResponse<T>(data: T, status = 200): NextResponse {
    return NextResponse.json(data, { status });
}

export function createdResponse<T>(data: T): NextResponse {
    return NextResponse.json(data, { status: 201 });
}

export function noContentResponse(): NextResponse {
    return new NextResponse(null, { status: 204 });
}

// ============================================
// ERROR RESPONSES
// ============================================

export function errorResponse(
    message: string,
    code: string,
    status: number,
    details?: unknown
): NextResponse {
    const body: ApiError = { error: message, code };
    if (details !== undefined) {
        body.details = details;
    }
    return NextResponse.json(body, { status });
}

export function badRequestResponse(message: string, details?: unknown): NextResponse {
    return errorResponse(message, 'BAD_REQUEST', 400, details);
}

export function unauthorizedResponse(message = 'Authentication required'): NextResponse {
    return errorResponse(message, 'UNAUTHORIZED', 401);
}

export function forbiddenResponse(message = 'Insufficient permissions'): NextResponse {
    return errorResponse(message, 'FORBIDDEN', 403);
}

export function notFoundResponse(resource = 'Resource'): NextResponse {
    return errorResponse(`${resource} not found`, 'NOT_FOUND', 404);
}

export function conflictResponse(
    message: string,
    conflicts: ConflictError['conflicts'],
    code: ConflictError['code'] = 'ASSIGNMENT_CONFLICT'
): NextResponse {
    const body: ConflictError = {
        error: message,
        code,
        conflicts,
    };
    return NextResponse.json(body, { status: 409 });
}

export function internalErrorResponse(message = 'Internal server error'): NextResponse {
    return errorResponse(message, 'INTERNAL_ERROR', 500);
}

// ============================================
// ERROR HANDLER
// ============================================

export function handleApiError(error: unknown): NextResponse {
    console.error('API Error:', error);

    if (error instanceof AuthError) {
        switch (error.code) {
            case 'UNAUTHORIZED':
            case 'INVALID_TOKEN':
                return unauthorizedResponse(error.message);
            case 'FORBIDDEN':
                return forbiddenResponse(error.message);
        }
    }

    if (error instanceof ZodError) {
        return badRequestResponse('Validation failed', error.issues);
    }

    if (error instanceof Error) {
        // Check for Prisma errors
        if (error.message.includes('Unique constraint')) {
            return errorResponse('Resource already exists', 'CONFLICT', 409);
        }
        if (error.message.includes('Record to update not found')) {
            return notFoundResponse();
        }
    }

    return internalErrorResponse();
}
