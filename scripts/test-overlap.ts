/**
 * Test: Schedule overlap query
 *
 * Verifies that GET /api/schedules returns schedules that OVERLAP
 * the query range, not just those fully contained within it.
 *
 * Scenario:
 *   Schedule A: Mon 09:00 – Wed 17:00
 *   Query window: Tue 00:00 – Fri 23:59
 *   Expected: Schedule A is returned (it overlaps Tue–Fri)
 *
 * Run: npx tsx scripts/test-overlap.ts
 * Requires: dev server running on localhost:3000 + seeded DB
 */

const BASE_URL = 'http://localhost:3000';

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
};

function log(msg: string, type: 'info' | 'success' | 'error' = 'info') {
    const color = type === 'success' ? colors.green : type === 'error' ? colors.red : colors.cyan;
    console.log(`${color}${msg}${colors.reset}`);
}

async function request(path: string, options: RequestInit = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

async function run() {
    log('🔬 Schedule Overlap Query Test\n');

    // 1. Login
    const loginRes = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@demo.com', password: 'password123' }),
    });
    if (loginRes.status !== 200) {
        log('Login failed', 'error');
        process.exit(1);
    }
    const token = loginRes.data.data.token;
    const auth = { Authorization: `Bearer ${token}` };
    log('✅ Logged in', 'success');

    // 2. Create a schedule that spans Mon–Wed
    const mon = new Date();
    mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); // next Monday
    const monStart = new Date(mon);
    monStart.setUTCHours(9, 0, 0, 0);
    const wedEnd = new Date(mon);
    wedEnd.setDate(wedEnd.getDate() + 2); // Wednesday
    wedEnd.setUTCHours(17, 0, 0, 0);

    const createRes = await request('/api/schedules', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
            title: 'Overlap Test: Mon-Wed',
            startTime: monStart.toISOString(),
            endTime: wedEnd.toISOString(),
        }),
    });
    if (createRes.status !== 201) {
        log(`Failed to create schedule: ${createRes.status}`, 'error');
        console.log(createRes.data);
        process.exit(1);
    }
    const schedule = createRes.data;
    log(`✅ Created schedule: ${schedule.title} (${monStart.toISOString()} → ${wedEnd.toISOString()})`, 'success');

    // 3. Query with Tue–Fri window (should overlap Mon–Wed)
    const tue = new Date(mon);
    tue.setDate(tue.getDate() + 1);
    tue.setUTCHours(0, 0, 0, 0);
    const fri = new Date(mon);
    fri.setDate(fri.getDate() + 4);
    fri.setUTCHours(23, 59, 59, 999);

    log(`\n[Test 1] Query Tue-Fri, expecting Mon-Wed schedule to appear...`);
    const qRes1 = await request(
        `/api/schedules?startDate=${tue.toISOString()}&endDate=${fri.toISOString()}`,
        { headers: auth }
    );
    const found1 = qRes1.data?.data?.some((s: any) => s.id === schedule.id);
    if (found1) {
        log('✅ PASS: Schedule found in Tue–Fri query (overlap works)', 'success');
    } else {
        log('❌ FAIL: Schedule NOT found — overlap query broken!', 'error');
        console.log('Returned schedules:', qRes1.data?.data?.map((s: any) => s.title));
        process.exit(1);
    }

    // 4. Query with Thu–Fri window (should NOT overlap Mon–Wed)
    const thu = new Date(mon);
    thu.setDate(thu.getDate() + 3);
    thu.setUTCHours(0, 0, 0, 0);

    log(`\n[Test 2] Query Thu-Fri, expecting Mon-Wed schedule to NOT appear...`);
    const qRes2 = await request(
        `/api/schedules?startDate=${thu.toISOString()}&endDate=${fri.toISOString()}`,
        { headers: auth }
    );
    const found2 = qRes2.data?.data?.some((s: any) => s.id === schedule.id);
    if (!found2) {
        log('✅ PASS: Schedule correctly not found in Thu–Fri query (no overlap)', 'success');
    } else {
        log('❌ FAIL: Schedule should NOT appear in Thu–Fri query', 'error');
        process.exit(1);
    }

    // 5. Query with only startDate = Tue (endTime > Tue → Mon-Wed should appear)
    log(`\n[Test 3] Query startDate=Tue only, expecting Mon-Wed to appear...`);
    const qRes3 = await request(
        `/api/schedules?startDate=${tue.toISOString()}`,
        { headers: auth }
    );
    const found3 = qRes3.data?.data?.some((s: any) => s.id === schedule.id);
    if (found3) {
        log('✅ PASS: Schedule found with startDate-only query', 'success');
    } else {
        log('❌ FAIL: Schedule NOT found with startDate-only query', 'error');
        process.exit(1);
    }

    // 6. Cleanup: delete the test schedule
    await request(`/api/schedules/${schedule.id}`, { method: 'DELETE', headers: auth });
    log('\n🧹 Cleaned up test schedule');

    log('\n🎉 ALL OVERLAP TESTS PASSED!', 'success');
}

run().catch((err) => {
    log(`Fatal: ${err.message}`, 'error');
    process.exit(1);
});
