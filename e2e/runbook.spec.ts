import { test, expect } from '@playwright/test';

test.describe('Phase 1 Pilot Runbook Automation', () => {
    let empOverbooked: string;
    let empVacation: string;
    let empAvailable: string;
    let scheduleId: string;
    let apiContext: any; // Storing the authenticated request context

    // To avoid timezone/date boundary flakiness, use fixed UTC dates
    const ts = Date.now();
    const day1 = '2026-04-10'; // Friday
    const day2 = '2026-04-11';
    const day3 = '2026-04-12';
    const day4 = '2026-04-13';

    const utcMidnight = (dateStr: string) => `${dateStr}T00:00:00.000Z`;

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

});
