import { test, expect } from '@playwright/test';

test.describe('Phase 1 Pilot Runbook Automation', () => {
    let empOverbooked: string;
    let empVacation: string;
    let empAvailable: string;
    let scheduleId: string;
    let apiContext: any; // Storing the authenticated request context

    // --- Label IDs for Tests 5-7 ---
    let areaAId: string;
    let areaBId: string;
    let statusId: string;
    let wtId1: string;
    let wtId2: string;
    let cancelStatusId: string;
    let filterSchedATitle: string;
    let filterSchedBTitle: string;

    // To avoid timezone/date boundary flakiness, use fixed UTC dates
    const ts = Date.now();
    const day1 = '2026-04-10'; // Friday
    const day2 = '2026-04-11';
    const day3 = '2026-04-12';
    const day4 = '2026-04-13';

    const utcMidnight = (dateStr: string) => `${dateStr}T00:00:00.000Z`;

    // --- Idempotent entity creation helpers ---
    // POST, if 409 → GET list and find by name
    async function getOrCreate(
        ctx: any,
        postUrl: string,
        getUrl: string,
        data: Record<string, any>,
        nameField = 'name'
    ): Promise<any> {
        const res = await ctx.post(postUrl, { data });
        if (res.ok()) return await res.json();
        if (res.status() === 409) {
            const list = await ctx.get(getUrl);
            const items = await list.json();
            const found = items.find((i: any) => i[nameField] === data[nameField]);
            if (found) return found;
        }
        throw new Error(`getOrCreate failed for ${postUrl}: ${res.status()}`);
    }

    // Find schedule by title via list GET with date range
    async function findScheduleByTitle(ctx: any, title: string, startDate: string, endDate: string): Promise<any> {
        const res = await ctx.get(`/api/schedules?startDate=${startDate}&endDate=${endDate}&limit=100`);
        expect(res.ok()).toBeTruthy();
        const body = await res.json();
        const schedules = body.data || body;
        const found = schedules.find((s: any) => s.title === title);
        expect(found).toBeTruthy();
        return found;
    }

    test.beforeAll(async ({ playwright }) => {
        // Create a shared API context that persists cookies between tests
        apiContext = await playwright.request.newContext({
            baseURL: 'http://127.0.0.1:3001'
        });

        // We assume the DB has been seeded with admin@demo.com via `setup-test-db.ts`
        const loginRes = await apiContext.post('/api/auth/login', {
            data: {
                email: 'admin@demo.com',
                password: 'password123',
            },
            headers: { 'Content-Type': 'application/json' }
        });
        expect(loginRes.ok()).toBeTruthy();

        // Create dedicated test employees natively for isolated runbook tests
        const createEmp = async (name: string) => {
            const res = await apiContext.post('/api/employees', {
                data: { name, phone: '010-0000-0000' }
            });
            return (await res.json()).id;
        };

        empOverbooked = await createEmp(`RUNBOOK_OVERBOOKED_${ts}`);
        empVacation = await createEmp(`RUNBOOK_VACATION_${ts}`);
        empAvailable = await createEmp(`RUNBOOK_AVAILABLE_${ts}`);

        // Create a base schedule for tests (short window on day1)
        const schedRes = await apiContext.post('/api/schedules', {
            data: {
                title: `RUNBOOK-Base-${ts}`,
                // Broad enough to cover the default 09:00 local form time (00:00 UTC)
                startTime: `${day1}T00:00:00.000Z`,
                endTime: `${day1}T12:00:00.000Z`,
                categoryId: null,
            }
        });
        expect(schedRes.ok()).toBeTruthy();
        scheduleId = (await schedRes.json()).id;

        // --- Label entities (idempotent: POST, if 409 → GET + find by name) ---
        const areaA = await getOrCreate(apiContext,
            '/api/customer-areas', '/api/customer-areas',
            { name: `RUNBOOK_AREA_A_${ts}`, color: '#3b82f6' }
        );
        areaAId = areaA.id;

        const areaB = await getOrCreate(apiContext,
            '/api/customer-areas', '/api/customer-areas',
            { name: `RUNBOOK_AREA_B_${ts}`, color: '#ef4444' }
        );
        areaBId = areaB.id;

        const status = await getOrCreate(apiContext,
            '/api/statuses', '/api/statuses',
            { name: `RUNBOOK_STATUS_${ts}`, color: '#22c55e', isCanceled: false }
        );
        statusId = status.id;

        const wt1 = await getOrCreate(apiContext,
            '/api/work-types', '/api/work-types',
            { name: `RUNBOOK_WT1_${ts}` }
        );
        wtId1 = wt1.id;

        const wt2 = await getOrCreate(apiContext,
            '/api/work-types', '/api/work-types',
            { name: `RUNBOOK_WT2_${ts}` }
        );
        wtId2 = wt2.id;

        const cancelStatus = await getOrCreate(apiContext,
            '/api/statuses', '/api/statuses',
            { name: `RUNBOOK_CANCEL_${ts}`, color: '#ff0000', isCanceled: true }
        );
        cancelStatusId = cancelStatus.id;

        // Create two schedules on day4 for area filter test
        filterSchedATitle = `RUNBOOK_AREA_A_SCHED_${ts}`;
        filterSchedBTitle = `RUNBOOK_AREA_B_SCHED_${ts}`;

        await apiContext.post('/api/schedules', {
            data: {
                title: filterSchedATitle,
                startTime: `${day4}T08:00:00.000Z`,
                endTime: `${day4}T10:00:00.000Z`,
                customerAreaId: areaAId,
            }
        });

        await apiContext.post('/api/schedules', {
            data: {
                title: filterSchedBTitle,
                startTime: `${day4}T08:00:00.000Z`,
                endTime: `${day4}T10:00:00.000Z`,
                customerAreaId: areaBId,
            }
        });
    });

    // 1) Assignment overlap -> must return 409
    test('Assignment overlap must return 409', async () => {
        // First assignment on "day1"
        const assignRes1 = await apiContext.post('/api/assignments', {
            data: {
                scheduleId,
                employeeId: empOverbooked,
                date: utcMidnight(day1),
            }
        });
        expect(assignRes1.ok()).toBeTruthy();

        // Try to assign the same employee to the same schedule on the same day
        const assignRes2 = await apiContext.post('/api/assignments', {
            data: {
                scheduleId,
                employeeId: empOverbooked,
                date: utcMidnight(day1),
            }
        });

        // Should return 409 Conflict based on business rules
        expect(assignRes2.status()).toBe(409);
        const errorJson = await assignRes2.json();
        expect(errorJson.error).toContain('overlap');
    });

    // 2) Vacation overlap -> must return 409
    test('Vacation overlap must return 409', async () => {
        // Create a vacation for day1
        const vacRes = await apiContext.post('/api/vacations', {
            data: {
                employeeId: empVacation,
                startDate: utcMidnight(day1),
                endDate: utcMidnight(day1),
                reason: `RUNBOOK-Test-Vacation-${ts}`
            }
        });
        expect(vacRes.ok()).toBeTruthy();

        // Try to assign to the schedule on day1
        const assignRes = await apiContext.post('/api/assignments', {
            data: {
                scheduleId,
                employeeId: empVacation,
                date: utcMidnight(day1),
            }
        });

        // Should return 409 Conflict due to vacation
        expect(assignRes.status()).toBe(409);
        const errorJson = await assignRes.json();
        expect(errorJson.error.toLowerCase()).toContain('vacation');
    });

    // 3) Per-day assignment -> assigning one day must not affect other days
    test('Per-day assignment: assigning one day must not affect other days', async () => {
        // Let's create a *new* schedule spanning multi days
        const schedRes = await apiContext.post('/api/schedules', {
            data: {
                title: `RUNBOOK-Multi-${ts}`,
                startTime: `${day1}T10:00:00.000Z`,
                endTime: `${day4}T15:00:00.000Z`,
            }
        });
        const newScheduleId = (await schedRes.json()).id;

        // Assign to day3 only using the empOverbooked
        const assignRes = await apiContext.post('/api/assignments', {
            data: {
                scheduleId: newScheduleId,
                employeeId: empOverbooked,
                date: utcMidnight(day3),
            }
        });
        expect(assignRes.ok()).toBeTruthy();

        // Verify through the API that they are only assigned on day3
        const getAssigns = await apiContext.get(`/api/assignments?scheduleId=${newScheduleId}`);
        const assignments = await getAssigns.json();

        expect(assignments.length).toBe(1);

        // The midnight UTC form of day3
        const assignedDateUtc = new Date(assignments[0].date).toISOString();
        expect(assignedDateUtc).toBe(utcMidnight(day3));
    });

    // 4) Availability grouping -> verify UI deterministically via Day View
    test('Availability grouping UI validation', async ({ page }) => {
        // 1. Force the OVERBOOKED employee to be explicitly busy ALL DAY on day1
        // so any schedule drawn between 00:00 - 23:59 triggers an overlap conflict in the UI.
        const allDaySchedRes = await apiContext.post('/api/schedules', {
            data: {
                title: `RUNBOOK-AllDayBusy-${ts}`,
                startTime: `${day1}T00:00:00.000Z`,
                endTime: `${day2}T00:00:00.000Z`, // full 24h block
                categoryId: null,
            }
        });
        const outBusyId = (await allDaySchedRes.json()).id;

        await apiContext.post('/api/assignments', {
            data: {
                scheduleId: outBusyId,
                employeeId: empOverbooked,
                date: utcMidnight(day1),
            }
        });

        // 2. Login via UI for the frontend test
        await page.goto('/login');
        await page.fill('input[name="email"]', 'admin@demo.com');
        await page.fill('input[name="password"]', 'password123');
        await page.click('button[type="submit"]');

        // Wait for redirect to calendar
        await page.waitForURL('**/calendar/week**');

        // 3. Navigate directly to a specific Day View avoiding week-starts-on index drifts
        await page.goto(`/calendar/day?date=${day1}`);
        await page.waitForSelector(`text=RUNBOOK-AllDayBusy-${ts}`);

        // Click the deterministic fixed header '+ Schedule' button
        await page.click('button:has-text("+ Schedule")');

        // Let SWR fetch and render
        await page.waitForSelector('form');

        // Force explicit time overlaps to trigger the UI availability buckets SWR checks
        // Force explicit time overlaps using Playwright's native date input handling or simple evaluate
        await page.locator('#startTime').fill(`${day1}T09:00`);
        await page.locator('#endTime').fill(`${day1}T10:00`);
        await page.waitForTimeout(2000); // Allow SWR query to settle

        const form = page.locator('form');

        // Verify Available bucket natively includes RUNBOOK_AVAILABLE
        await expect(form).toContainText('Available', { timeout: 10000 });
        await expect(form).toContainText(`RUNBOOK_AVAILABLE_${ts}`, { timeout: 10000 });

        // Verify Overbooked bucket exactly registers the full-day overlap logic
        await expect(form).toContainText('Overbooked', { timeout: 10000 });
        await expect(form).toContainText(`RUNBOOK_OVERBOOKED_${ts}`, { timeout: 10000 });

        // Verify Vacation bucket natively captures the day1 vacation from Test 2
        await expect(form).toContainText('Vacation', { timeout: 10000 });
        await expect(form).toContainText(`RUNBOOK_VACATION_${ts}`, { timeout: 10000 });
    });

    // 5) Labels persistence — customerArea, status, workTypes round-trip
    test('Labels persistence: customerArea, status, workTypes', async () => {
        const title = `RUNBOOK-Labels-${ts}`;

        // Create schedule with all label relations
        const createRes = await apiContext.post('/api/schedules', {
            data: {
                title,
                startTime: `${day2}T08:00:00.000Z`,
                endTime: `${day2}T12:00:00.000Z`,
                customerAreaId: areaAId,
                statusId,
                workTypeIds: [wtId1, wtId2],
            }
        });
        expect(createRes.ok()).toBeTruthy();

        // Fetch back via list GET and find by title (don't assume GET /[id] shape)
        const schedule = await findScheduleByTitle(apiContext, title, `${day2}T00:00:00.000Z`, `${day2}T23:59:59.000Z`);

        // Assert label relations persisted
        expect(schedule.customerArea).toBeTruthy();
        expect(schedule.customerArea.id).toBe(areaAId);

        expect(schedule.scheduleStatus).toBeTruthy();
        expect(schedule.scheduleStatus.id).toBe(statusId);

        expect(schedule.workTypes).toBeTruthy();
        const wtIds = schedule.workTypes.map((wt: any) => wt.workType.id);
        expect(wtIds).toContain(wtId1);
        expect(wtIds).toContain(wtId2);
    });

    // 6) Cancel flag — isCanceled persisted on schedule status
    test('Cancel flag: isCanceled status persisted on schedule', async () => {
        const title = `RUNBOOK-Canceled-${ts}`;

        const createRes = await apiContext.post('/api/schedules', {
            data: {
                title,
                startTime: `${day3}T06:00:00.000Z`,
                endTime: `${day3}T10:00:00.000Z`,
                statusId: cancelStatusId,
            }
        });
        expect(createRes.ok()).toBeTruthy();

        // Fetch via list GET and verify isCanceled
        const schedule = await findScheduleByTitle(apiContext, title, `${day3}T00:00:00.000Z`, `${day3}T23:59:59.000Z`);

        expect(schedule.scheduleStatus).toBeTruthy();
        expect(schedule.scheduleStatus.isCanceled).toBe(true);
    });

    // 7) Customer Area filter — ?areas= on /calendar/day
    test('Customer Area filter: ?areas= shows only matching schedules', async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[name="email"]', 'admin@demo.com');
        await page.fill('input[name="password"]', 'password123');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/calendar/week**');

        // Navigate to day view with area filter for areaA only
        await page.goto(`/calendar/day?date=${day4}&areas=${areaAId}`);
        await page.waitForLoadState('networkidle');

        // Schedule A should be visible and Schedule B should NOT
        await expect(page.locator('body')).toContainText(filterSchedATitle, { timeout: 10000 });
        await expect(page.locator('body')).not.toContainText(filterSchedBTitle, { timeout: 5000 });
    });

    // 8) Office CRUD lifecycle — create, duplicate 409, delete
    test('Office CRUD: create, duplicate 409, delete verified via list', async () => {
        const officeName = `RUNBOOK_OFFICE_${ts}`;

        // Create
        const createRes = await apiContext.post('/api/offices', {
            data: { name: officeName, sortOrder: 0, isActive: true }
        });
        expect(createRes.status()).toBe(201);
        const created = await createRes.json();
        const officeId = created.id;
        expect(officeId).toBeTruthy();

        // Duplicate → 409
        const dupRes = await apiContext.post('/api/offices', {
            data: { name: officeName, sortOrder: 0, isActive: true }
        });
        expect(dupRes.status()).toBe(409);

        // Delete
        const deleteRes = await apiContext.delete(`/api/offices/${officeId}`);
        expect(deleteRes.ok()).toBeTruthy();

        // Verify via GET: office should be either gone or isActive=false
        const listRes = await apiContext.get('/api/offices?includeInactive=true');
        const offices = await listRes.json();
        const found = offices.find((o: any) => o.id === officeId);
        // If hard-deleted, not in list. If soft-deleted, isActive=false.
        if (found) {
            expect(found.isActive).toBe(false);
        }
        // Either way: it must NOT appear in active-only list
        const activeRes = await apiContext.get('/api/offices');
        const activeOffices = await activeRes.json();
        const foundActive = activeOffices.find((o: any) => o.id === officeId);
        expect(foundActive).toBeFalsy();
    });

    // 9) O3 Work Location: OFFICE→REMOTE clears officeId
    test('O3 Work Location: OFFICE persists officeId, REMOTE clears it', async () => {
        // Pick an active office from seed
        const officesRes = await apiContext.get('/api/offices');
        const officesList = await officesRes.json();
        expect(officesList.length).toBeGreaterThanOrEqual(1);
        const pickedOffice = officesList[0];

        const title = `RUNBOOK_O3_OFFICE_${ts}`;

        // Create schedule as OFFICE with officeId
        const createRes = await apiContext.post('/api/schedules', {
            data: {
                title,
                startTime: `${day2}T14:00:00.000Z`,
                endTime: `${day2}T18:00:00.000Z`,
                workLocationType: 'OFFICE',
                officeId: pickedOffice.id,
            }
        });
        expect(createRes.ok()).toBeTruthy();

        // Verify OFFICE + officeId persisted
        const created = await findScheduleByTitle(apiContext, title, `${day2}T00:00:00.000Z`, `${day2}T23:59:59.000Z`);
        expect(created.workLocationType).toBe('OFFICE');
        expect(created.officeId ?? created.office?.id).toBe(pickedOffice.id);

        // PATCH to REMOTE (should clear officeId)
        const patchRes = await apiContext.patch(`/api/schedules/${created.id}`, {
            data: { workLocationType: 'REMOTE' }
        });
        expect(patchRes.ok()).toBeTruthy();

        // Verify REMOTE + officeId null
        const updated = await findScheduleByTitle(apiContext, title, `${day2}T00:00:00.000Z`, `${day2}T23:59:59.000Z`);
        expect(updated.workLocationType).toBe('REMOTE');
        // officeId must be null (cleared by server)
        const updatedOfficeId = updated.officeId ?? updated.office?.id ?? null;
        expect(updatedOfficeId).toBeNull();
    });

});
