import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getRequiredEnv } from './env';

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

const connectionString = getRequiredEnv('DATABASE_URL');

// Initialize Prisma Client with Postgres Adapter
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export default prisma;

// Re-export Prisma types for convenience
export type {
    Tenant,
    User,
    Employee,
    Schedule,
    Assignment,
    Vacation,
    AuditLog,
    Role,
    Category,
    ScheduleStatus
} from '@prisma/client';
