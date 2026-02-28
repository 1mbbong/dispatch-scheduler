/**
 * Structured error reporting utility.
 *
 * Default: logs a JSON payload to console.error with [APP_ERROR] prefix.
 * Replace the implementation body with Sentry/LogRocket/Datadog when ready.
 *
 * NEVER logs sensitive data (JWT, DATABASE_URL, passwords).
 */

export interface ErrorContext {
    /** Current route path, e.g. /schedules/abc123 */
    pathname?: string;
    /** User ID (not email/password — keep non-sensitive) */
    userId?: string;
    /** User role for RBAC context */
    role?: string;
    /** Tenant ID for multi-tenant context */
    tenantId?: string;
    /** Next.js error digest (server-side hash) */
    digest?: string;
    /** Any additional metadata */
    extra?: Record<string, unknown>;
}

interface ErrorPayload {
    timestamp: string;
    env: string;
    name: string;
    message: string;
    stack?: string;
    context: ErrorContext;
}

/**
 * Report an error with structured context.
 *
 * Safe to call with any value as `error` (not just Error instances).
 * Wrapped in try/catch so it never throws — an error reporter that
 * itself throws would cause infinite loops in error boundaries.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
    try {
        const payload: ErrorPayload = {
            timestamp: new Date().toISOString(),
            env: process.env.NODE_ENV ?? 'unknown',
            ...normalizeError(error),
            context,
        };

        // -------------------------------------------------------
        // 🔌 Integration point: replace with Sentry.captureException(),
        //    LogRocket.captureException(), or an HTTP POST here.
        // -------------------------------------------------------
        console.error('[APP_ERROR]', JSON.stringify(payload));
    } catch {
        // Last resort — never let reporting blow up the app
        console.error('[APP_ERROR] Failed to report error:', error);
    }
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    if (typeof error === 'string') {
        return { name: 'StringError', message: error };
    }

    return {
        name: 'UnknownError',
        message: String(error),
    };
}
