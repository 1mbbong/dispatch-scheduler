import { existsSync } from 'fs';

const BASE_URL = 'http://localhost:3000';

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
};

function log(msg: string, type: 'info' | 'success' | 'error' = 'info') {
    const color = type === 'success' ? colors.green
        : type === 'error' ? colors.red
            : colors.cyan;
    console.log(`${color}${msg}${colors.reset}`);
}

async function request(path: string, options: RequestInit = {}) {
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });
        let data;
        try {
            data = await res.json();
        } catch {
            const text = await res.text().catch(() => '');
            // log(`Failed to parse JSON. Status: ${res.status}. Text: ${text}`, 'error');
            data = null;
            // Return text in data for debugging if needed, or just keep null and handle caller
            // Better: attach text
            return {
                status: res.status,
                data: null,
                text,
                headers: Object.fromEntries(res.headers.entries())
            };
        }
        return {
            status: res.status,
            data,
            text: null,
            headers: Object.fromEntries(res.headers.entries())
        };
    } catch (error) {
        log(`Network error: ${(error as Error).message}`, 'error');
        process.exit(1);
    }
}

async function runTests() {
    log('🔥 Starting API Smoke Tests...');

    // 1. Login
    log('\n[1] Testing Auth (Login)...');
    const loginRes = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@demo.com', password: 'password123' }),
    });

    if (loginRes.status !== 200) {
        log(`Login failed: ${loginRes.status}`, 'error');
        console.log(loginRes.data);
        process.exit(1);
    }

    const token = loginRes.data.data.token;
    const authHeaders = { Authorization: `Bearer ${token}` };
    log('✅ Login successful', 'success');

    // 2. Get Employees
    log('\n[2] Testing Employees (List & Pick One)...');
    const empRes = await request('/api/employees', { headers: authHeaders });

    if (empRes.status !== 200 || !empRes.data || !empRes.data.data) {
        log(`Failed to fetch employees. Status: ${empRes.status}`, 'error');
        if (empRes.text) console.log('Response text:', empRes.text);
        if (empRes.data) console.log('Response data:', empRes.data);
        process.exit(1);
    }

    // API returns { data: [], pagination: {...} }
    const employeesList = empRes.data.data;
    let employee = employeesList.find((e: any) => e.name === 'Test Worker') || employeesList[0];

    if (!employee) {
        log('No employees found. Creating a test employee...', 'info');
        const createRes = await request('/api/employees', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                name: 'Test Worker',
                email: 'testworker@demo.com',
                phone: '123-456-7890'
            })
        });

        if (createRes.status !== 201) {
            log(`Failed to create test employee. Status: ${createRes.status}`, 'error');
            console.log(createRes.data);
            process.exit(1);
        }
        employee = createRes.data.data; // Created response usually returns { success: true, data: employee }
    }
    log(`✅ Found/Created employee: ${employee.name} (${employee.id})`, 'success');

    // 3. Create Schedule
    log('\n[3] Testing Schedule Creation...');
    // Tomorrow 9am - 1pm UTC
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const start1 = new Date(tomorrow); start1.setUTCHours(9, 0, 0, 0);
    const end1 = new Date(tomorrow); end1.setUTCHours(13, 0, 0, 0);

    const schedRes = await request('/api/schedules', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            title: 'Smoke Test Shift',
            startTime: start1.toISOString(),
            endTime: end1.toISOString(),
        }),
    });

    if (schedRes.status !== 201) {
        log('Failed to create schedule', 'error');
        console.log(schedRes.data);
        process.exit(1);
    }
    const schedule1 = schedRes.data;
    log(`✅ Created schedule: ${schedule1.title}`, 'success');

    // 4. Assign Employee
    log('\n[4] Testing Assignment (Success Case)...');
    const assignRes = await request('/api/assignments', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            scheduleId: schedule1.id,
            employeeId: employee.id,
        }),
    });

    if (assignRes.status !== 201) {
        log('Failed to assign employee', 'error');
        console.log(assignRes.data);
        process.exit(1);
    }
    log('✅ Assignment successful', 'success');

    // 5. Overlap Conflict Test
    log('\n[5] Testing Assignment Conflict (Overlap)...');
    // Overlapping shift: 11am - 3pm (overlaps 9am-1pm)
    const start2 = new Date(tomorrow); start2.setUTCHours(11, 0, 0, 0);
    const end2 = new Date(tomorrow); end2.setUTCHours(15, 0, 0, 0);

    const sched2Res = await request('/api/schedules', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            title: 'Overlap Shift',
            startTime: start2.toISOString(),
            endTime: end2.toISOString(),
        }),
    });
    const schedule2 = sched2Res.data;

    const conflictRes = await request('/api/assignments', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            scheduleId: schedule2.id,
            employeeId: employee.id,
        }),
    });

    if (conflictRes.status === 409 && conflictRes.data.code === 'ASSIGNMENT_CONFLICT') {
        log('✅ Conflict correctly detected!', 'success');
    } else {
        log(`❌ Failed to detect conflict. Status: ${conflictRes.status}`, 'error');
        console.log(conflictRes.data);
        process.exit(1);
    }

    // 6. Create Vacation
    log('\n[6] Testing Vacation Creation...');
    // Vacation next week
    const nextWeek = new Date(tomorrow);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const vacStart = new Date(nextWeek); vacStart.setUTCHours(0, 0, 0, 0);
    const vacEnd = new Date(nextWeek); vacEnd.setUTCHours(23, 59, 59, 999);

    const vacRes = await request('/api/vacations', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            employeeId: employee.id,
            startDate: vacStart.toISOString(),
            endDate: vacEnd.toISOString(),
            reason: 'Smoke Test Vacation',
        }),
    });

    if (vacRes.status !== 201) {
        log('Failed to create vacation', 'error');
        process.exit(1);
    }
    const vacation = vacRes.data;
    log(`✅ Created vacation: ${vacation.reason}`, 'success');

    // 7. Vacation Conflict Test
    log('\n[7] Testing Vacation Conflict...');
    const start3 = new Date(vacStart); start3.setUTCHours(10, 0, 0, 0);
    const end3 = new Date(vacStart); end3.setUTCHours(14, 0, 0, 0);

    const sched3Res = await request('/api/schedules', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            title: 'Vacation Shift',
            startTime: start3.toISOString(),
            endTime: end3.toISOString(),
        }),
    });
    const schedule3 = sched3Res.data;

    const vacConflictRes = await request('/api/assignments', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            scheduleId: schedule3.id,
            employeeId: employee.id,
        }),
    });

    if (vacConflictRes.status === 409 && vacConflictRes.data.code === 'VACATION_CONFLICT') {
        log('✅ Vacation conflict correctly detected!', 'success');
    } else {
        log(`❌ Failed to detect vacation conflict. Status: ${vacConflictRes.status}`, 'error');
        console.log(vacConflictRes.data);
        process.exit(1);
    }

    // 8. Delete Vacation and Retry
    log('\n[8] Testing Vacation Delete & Re-assign...');
    const delRes = await request(`/api/vacations/${vacation.id}`, {
        method: 'DELETE',
        headers: authHeaders,
    });

    if (delRes.status !== 204) {
        log('Failed to delete vacation', 'error');
        process.exit(1);
    }
    log('✅ Vacation deleted', 'success');

    const reassignRes = await request('/api/assignments', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
            scheduleId: schedule3.id,
            employeeId: employee.id,
        }),
    });

    if (reassignRes.status === 201) {
        log('✅ Assignment successful after vacation deletion', 'success');
    } else {
        log(`❌ Failed to assign after vacation delete. Status: ${reassignRes.status}`, 'error');
        console.log(reassignRes.data);
        process.exit(1);
    }

    log('\n🎉 ALL SMOKE TESTS PASSED!', 'success');
}

// Simple retry logic to wait for server
async function waitForServer(attempts = 10, delay = 2000) {
    for (let i = 0; i < attempts; i++) {
        try {
            await fetch(BASE_URL);
            return true;
        } catch {
            log(`Waiting for server... (${i + 1}/${attempts})`, 'info');
            await new Promise(r => setTimeout(r, delay));
        }
    }
    return false;
}

(async () => {
    if (await waitForServer()) {
        await runTests();
    } else {
        log('❌ Server not accessible at localhost:3000', 'error');
        process.exit(1);
    }
})();
