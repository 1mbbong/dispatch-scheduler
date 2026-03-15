# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

ORDI is a multi-tenant dispatch scheduler MVP. It manages schedules, employees, assignments, and vacations with RBAC, conflict detection, and audit logging.

## Commands

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run lint             # ESLint
npm run lint:self-fetch  # Check no fetch('/api/...') in server components
npm run ci:check         # CI gate: lint:self-fetch + build (must stay green)

# Database
npx prisma migrate dev   # Run migrations
npx prisma db seed       # Seed demo data (admin@demo.com / member@demo.com, password123)

# Runbook (E2E smoke test)
npm run runbook          # Sets up test DB + runs Playwright runbook spec
```

## Architecture

**Framework**: Next.js 16 App Router with TypeScript. All dates are stored as UTC.

### Data flow pattern

Server Components fetch data by calling functions from `src/lib/queries.ts` directly (Prisma). They **must never** call `fetch('/api/...')` — this is enforced by `npm run lint:self-fetch`. Client Components use SWR for mutations and reads that need reactivity.

API routes (`src/app/api/`) handle all mutations (POST/PATCH/DELETE). Every mutation route must:
1. Call `requireAuth(request)` (or `requireRole`) from `src/lib/auth.ts`
2. Scope all Prisma queries by `auth.tenantId`
3. Call `createAuditLog()` from `src/lib/audit.ts` after the mutation

### Key lib files

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | JWT via `jose`, RBAC helpers (`canManage*`, `isAdmin`), `requireAuth`, `requireAuthServer` (for Server Components), `requireRole` |
| `src/lib/db.ts` | Prisma client singleton |
| `src/lib/queries.ts` | Server-only data access layer (`import 'server-only'`). All Prisma reads for Server Components. Includes `serialize()` that converts Dates → ISO strings |
| `src/lib/audit.ts` | `createAuditLog()`, `AuditAction` enum, `EntityType` enum |
| `src/lib/validations.ts` | All Zod schemas for request bodies |
| `src/lib/api-response.ts` | Standardized response helpers: `successResponse`, `conflictResponse` (409), `forbiddenResponse` (403), `handleApiError` |
| `src/lib/env.ts` | `getRequiredEnv()` — fails fast if required env vars are missing |

### Auth & Multi-tenancy

- Auth token stored as `auth_token` HttpOnly cookie (JWT signed with `jose`)
- `src/middleware.ts` verifies the token on every request and passes `x-user-id`, `x-tenant-id`, `x-user-role` headers to downstream API routes
- Every query/mutation is scoped by `tenantId` extracted from `auth.tenantId` — never from client input
- Roles: `ADMIN`, `MANAGER`, `MEMBER`. MEMBER is read-only.

### Conflict detection (409)

`POST /api/assignments` checks both:
- Schedule overlap: other ACTIVE schedules where the employee is already assigned in the same time window
- Vacation conflict: employee has a vacation record overlapping the schedule dates

Returns a structured `ConflictError` body with `code: 'ASSIGNMENT_CONFLICT'` or `'VACATION_CONFLICT'` and a `conflicts` array for UI display.

### Non-negotiable guardrails

1. **Tenant isolation** — every Prisma query must include `tenantId` from `auth.tenantId`
2. **Conflict blocking** — assignment overlap + vacation conflict checks must remain in `POST /api/assignments`
3. **Audit log completeness** — `createAuditLog()` must be called in all 8 mutation routes (schedules: create/update/delete; assignments: assign/unassign; employees: create/update; vacations: create)
4. **No server self-fetch** — Server Components use `queries.ts`, never `fetch('/api/...')`
5. **CI green** — `npm run ci:check` must pass before merging

### Schema summary (Prisma)

Core models: `Tenant`, `User` (auth accounts), `Employee` (staff), `Schedule`, `Assignment` (employee ↔ schedule, per-date), `Vacation`, `AuditLog`.

Label/config models: `CustomerArea`, `ScheduleStatus`, `WorkType`, `Office` — all tenant-scoped with `isActive` + `sortOrder`.

`Assignment` denormalizes `startTime`/`endTime` from the parent `Schedule` for fast overlap index queries.

### Serialization pattern

`queries.ts` exports a `serialize<T>()` helper that deep-converts `Date` objects to ISO strings. All query functions run their result through `serialize()` before returning, so Server Components receive `string` timestamps instead of `Date` objects. The `Serialized<T>` mapped type in `queries.ts` reflects this at compile time. Use `SerializedScheduleWithAssignments` from `src/types/` for schedule data with assignments.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `JWT_EXPIRES_IN` | — | Token lifetime, default `7d` |

## Operating rules (must follow)
- Work one ticket at a time: finish current ticket fully before starting the next.
- PR size guardrail: ≤ 6 files per PR. If it exceeds, split into A-xx-a / A-xx-b.
- Runbook quality gate: `npm run runbook --repeat-each=3` must be 3 consecutive green runs before merge.
- Weekday order is fixed everywhere: Sun→Sat.
- Do not claim "done" until: real UI verified + `npm run ci:check` + `npm run runbook --repeat-each=3`.
