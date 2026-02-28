import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@127.0.0.1:5432/dispatch_scheduler_test?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('--- SCHEDULES ---');
    console.log(JSON.stringify(await prisma.schedule.findMany({ select: { id: true, title: true, startTime: true, endTime: true } }), null, 2));
    console.log('--- ASSIGNMENTS ---');
    console.log(JSON.stringify(await prisma.assignment.findMany({ include: { schedule: { select: { title: true } } } }), null, 2));
}

main().catch(console.error).finally(async () => {
    await prisma.$disconnect();
    await pool.end();
});
