
const BASE_URL = 'http://localhost:3000';

async function request(path: string, options: RequestInit = {}) {
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            redirect: 'manual',
            ...options,
        });
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            return { status: res.status, data };
        } catch {
            return { status: res.status, data: null, text };
        }
    } catch (error: any) {
        console.error(`Network error: ${error.message}`);
        process.exit(1);
    }
}

async function verifyAuth() {
    console.log('🔍 Verifying Authentication Flow...');

    // 1. Login
    console.log('\n[1] Testing POST /api/auth/login...');
    const loginRes = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@demo.com', password: 'password123' }),
    });

    if (loginRes.status === 200 && loginRes.data.token) {
        console.log('✅ Login successful. Token received.');
    } else {
        console.error('❌ Login failed:', loginRes.status, loginRes.data);
        process.exit(1);
    }

    const token = loginRes.data.token;

    // 2. Me
    console.log('\n[2] Testing GET /api/auth/me...');
    const meRes = await request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (meRes.status === 200 && meRes.data && meRes.data.email === 'admin@demo.com') {
        console.log('✅ /api/auth/me successful. User:', meRes.data.email);
    } else {
        console.error('❌ /api/auth/me failed:', meRes);
        process.exit(1);
    }

    console.log('\n🎉 Auth Verification Complete!');
}

verifyAuth();
