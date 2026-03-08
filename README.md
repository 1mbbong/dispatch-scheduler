# ORDI

> Multi-tenant dispatch scheduler MVP — manage schedules, employees, assignments, and vacations with RBAC, conflict detection, and audit logging.

## Key Capabilities

- **Schedules** — CRUD with calendar views (week / month)
- **Assignments** — Assign employees to schedules with overlap + vacation conflict blocking (409)
- **Employees** — CRUD with soft delete (isActive flag)
- **Vacations** — CRUD with conflict detection against assignments
- **Dashboard** — Today's schedules, upcoming vacations, employee stats
- **RBAC** — ADMIN / MANAGER / MEMBER roles (UI gating + server-side 403)
- **Audit Logs** — All mutations recorded with actor, before/after snapshots
- **Multi-tenant** — Strict `tenantId` scoping on every query and mutation

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Framework | Next.js 16 (App Router)             |
| Language  | TypeScript                          |
| Styling   | Tailwind CSS 4                      |
| Database  | PostgreSQL + Prisma 7 (pg adapter)  |
| Auth      | JWT (HttpOnly cookies) via jose     |
| Validation| Zod                                 |

---

## Quickstart

### Requirements

- Node.js ≥ 20
- PostgreSQL running locally (or reachable connection string)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable       | Required | Description                              |
|----------------|----------|------------------------------------------|
| `DATABASE_URL` | ✅       | PostgreSQL connection string              |
| `JWT_SECRET`   | ✅       | Secret key for JWT signing — change this! |
| `JWT_EXPIRES_IN` | —      | Token lifetime (default: `7d`)           |
| `NODE_ENV`     | —        | `development` or `production`            |

> The app fails fast with a clear error if required env vars are missing. See `src/lib/env.ts`.

### 3. Database setup

```bash
# Run migrations
npx prisma migrate dev

# Seed demo data
npx prisma db seed
```

### 4. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Demo Accounts (post-seed)

| Role   | Email              | Password      | Permissions                           |
|--------|--------------------|---------------|---------------------------------------|
| ADMIN  | admin@demo.com     | password123   | Full access (CRUD all entities)       |
| MEMBER | member@demo.com    | password123   | Read-only (cannot create/edit/delete) |

**MEMBER restrictions**: Cannot manage employees, schedules, assignments, or vacations. The UI hides action buttons and the API returns 403 for unauthorized mutations.

3 sample employees are also created: John Doe, Jane Smith, Test Worker.

---

## Guardrails (Non-negotiables)

These rules must be preserved across all changes:

| # | Guardrail | How it's enforced |
|---|-----------|-------------------|
| 1 | **Tenant isolation** | Every query/mutation scoped by `auth.tenantId` |
| 2 | **Overlap/vacation conflict blocking** | `POST /api/assignments` checks schedule overlap + vacation conflicts → returns structured 409 |
| 3 | **Audit log reliability** | `createAuditLog()` called in all 8 mutation routes |
| 4 | **No server self-fetch (GET)** | Server Components use `queries.ts` (direct Prisma), never `fetch('/api/...')` |
| 5 | **CI green** | `npm run ci:check` must pass (`lint:self-fetch` + `next build`) |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/
│   │   ├── assignments/    # POST (assign), DELETE (unassign)
│   │   ├── auth/           # login, logout, register, me
│   │   ├── employees/      # CRUD + soft delete via PATCH
│   │   ├── schedules/      # CRUD
│   │   └── vacations/      # CRUD
│   ├── calendar/           # Week and month views
│   ├── employees/          # Employee list page
│   ├── login/              # Login page
│   ├── schedules/[id]/     # Schedule detail page
│   └── vacations/          # Vacation list page
│
├── components/
│   ├── dashboard/          # Dashboard widgets
│   ├── employees/          # employee-list, employee-form
│   ├── schedules/          # schedule-detail, schedule-form
│   ├── vacations/          # vacation-list, vacation-form
│   ├── ui/                 # Toast notification system
│   ├── main-nav.tsx        # Global navigation
│   ├── week-view.tsx       # Calendar week view
│   └── month-view.tsx      # Calendar month view
│
├── lib/
│   ├── env.ts              # getRequiredEnv() — fail-fast env checks
│   ├── auth.ts             # JWT, RBAC (canManage*), requireAuth
│   ├── db.ts               # Prisma client singleton
│   ├── queries.ts          # Server-side Prisma queries (no self-fetch)
│   ├── validations.ts      # Zod schemas (13 schemas)
│   ├── audit.ts            # Audit log helpers + action/entity enums
│   ├── api-response.ts     # Standardized API response helpers (409, 403, etc.)
│   └── utils.ts            # Shared utilities
│
├── types/                  # Serialized TypeScript interfaces
└── middleware.ts           # Auth cookie → redirect for protected routes
```

---

## Scripts

| Command                  | Description                                       |
|--------------------------|---------------------------------------------------|
| `npm run dev`            | Start dev server                                  |
| `npm run build`          | Production build                                  |
| `npm start`              | Start production server                           |
| `npm run lint`           | Run ESLint                                        |
| `npm run lint:self-fetch`| Check no `fetch('/api/...')` in server components  |
| `npm run ci:check`       | CI guard: lint:self-fetch + build                 |

---

## Audit-Logged Mutation Routes

All 8 mutation routes record changes via `createAuditLog()`:

1. `POST /api/schedules` — CREATE_SCHEDULE
2. `PATCH /api/schedules/[id]` — UPDATE_SCHEDULE
3. `DELETE /api/schedules/[id]` — DELETE_SCHEDULE
4. `POST /api/assignments` — ASSIGN_EMPLOYEE
5. `DELETE /api/assignments/[id]` — UNASSIGN_EMPLOYEE
6. `POST /api/employees` — CREATE_EMPLOYEE
7. `PATCH /api/employees/[id]` — UPDATE_EMPLOYEE / DEACTIVATE_EMPLOYEE
8. `POST /api/vacations` — CREATE_VACATION

---

## Solo Pilot Runbook

Operational guide for the solo-pilot phase. Run these scenarios daily and log any issues before inviting more users.

### Daily Smoke Scenarios (7 flows)

Run through each flow at least once per session:

| # | Scenario | What to verify |
|---|----------|----------------|
| 1 | **Login / Logout** | Admin login → nav shows all links + "Audit Logs". Member login → "Audit Logs" hidden. Logout → redirects to `/login`. |
| 2 | **Schedule CRUD** | Create → appears in week/month views. Edit (title, time). Cancel (`CANCELLED`) → greyed out. Reactivate (`ACTIVE`) → restored. |
| 3 | **Assignment (normal)** | Open schedule detail → assign an available employee → assignment appears in schedule. Unassign → removed. |
| 4 | **Conflict flows** | Assign employee with overlapping schedule → 409 toast + inline conflict panel. Assign employee on vacation → 409 toast with vacation conflict. |
| 5 | **Employee soft delete** | Deactivate employee → `isActive = false`. Navigate to schedule detail that had the employee → detail page not broken. |
| 6 | **Vacation create** | Create vacation for an employee → vacation list updated. Attempt assignment during vacation period → 409. |
| 7 | **Audit Viewer** | Navigate to `/admin/audit` as ADMIN → recent actions listed. Verify tenant scope (no cross-tenant rows). Confirm action types match mutations performed. |

### Bug Capture Template

When you encounter a bug, copy this template and fill it in:

```
### Bug Report

**Steps to reproduce:**
1.
2.
3.

**Expected:** (what should happen)

**Actual:** (what actually happened)

**[APP_ERROR] JSON (if any):**
(paste from browser console — errors are logged as structured JSON with `[APP_ERROR]` prefix)

**Audit log row:**
- Timestamp:
- Action:
- Entity:

**URL (pathname):**

**Additional notes:**
```

### Ready to Invite Others — 90% Gate

Before inviting more users, ensure operational confidence:

- **Target**: 7 scenarios × 30 daily runs = 210 scenario-runs
- **Gate**: ≥ 189 passes (90%) with **0 critical issues** (data loss, auth bypass, tenant leak)
- **Tracking**: Log each session's pass/fail counts. Any critical issue resets the counter.

> A "critical issue" is any bug involving: incorrect tenant data, auth bypass, data loss, or unrecoverable state.

---

## License

Private — not licensed for redistribution.
