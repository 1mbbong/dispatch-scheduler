import 'dotenv/config';
import prisma from '../src/lib/db';
import { createAuditLog } from '../src/lib/audit';

async function main() {
    const tenant = await prisma.tenant.findFirst();
    const user = await prisma.user.findFirst();
    if (!tenant || !user) throw new Error("No tenant or user");

    console.log("Creating log for tenant", tenant.id);
    await createAuditLog({
        tenantId: tenant.id,
        userId: user.id,
        action: 'CREATE_SCHEDULE',
        entityType: 'SCHEDULE',
        entityId: 'test-id',
        newData: { test: "data" }
    });
    console.log("Done");

    const logs = await prisma.auditLog.findMany();
    console.log("Logs:", logs);
}

main().finally(() => prisma.$disconnect());
