import { execSync } from 'child_process';
import path from 'path';

const TEST_DB_URL = 'postgresql://postgres:postgrespassword@127.0.0.1:5432/dispatch_scheduler_test?schema=public';

async function setupTestDb() {
    console.log('🔄 Setting up Test Database...');

    // Set the environment variable for Prisma commands in this process
    process.env.DATABASE_URL = TEST_DB_URL;

    try {
        console.log('📦 Pushing Prisma schema to test DB (force-reset)...');
        execSync('npx prisma db push --force-reset --accept-data-loss', {
            stdio: 'inherit',
            env: { ...process.env, DATABASE_URL: TEST_DB_URL }
        });

        console.log('🌱 Seeding test DB...');
        execSync('tsx prisma/seed.ts', {
            stdio: 'inherit',
            env: { ...process.env, DATABASE_URL: TEST_DB_URL }
        });

        console.log('✅ Test database is ready!');
    } catch (error) {
        console.error('❌ Failed to setup test database:', error);
        process.exit(1);
    }
}

setupTestDb();
