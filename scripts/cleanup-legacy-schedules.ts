import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

async function main() {
    console.log('🔄 Cleaning up legacy schedules...');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        const tenants = await prisma.tenant.findMany({
            include: { scheduleStatuses: true }
        });

        let updatedCount = 0;
        for (const tenant of tenants) {
            // Find default active and canceled statuses for the tenant
            const activeStatus = tenant.scheduleStatuses.find(s => s.isCanceled === false);
            const canceledStatus = tenant.scheduleStatuses.find(s => s.isCanceled === true);

            // 1. Map legacy ACTIVE schedules missing a statusId
            if (activeStatus) {
                const res = await prisma.schedule.updateMany({
                    where: { tenantId: tenant.id, statusId: null, status: 'ACTIVE' },
                    data: { statusId: activeStatus.id }
                });
                if (res.count > 0) {
                    console.log(`  Mapped ${res.count} legacy ACTIVE schedules in tenant ${tenant.id}`);
                    updatedCount += res.count;
                }
            }

            // 2. Map legacy CANCELLED schedules missing a statusId
            if (canceledStatus) {
                const res = await prisma.schedule.updateMany({
                    where: { tenantId: tenant.id, statusId: null, status: 'CANCELLED' },
                    data: { statusId: canceledStatus.id }
                });
                if (res.count > 0) {
                    console.log(`  Mapped ${res.count} legacy CANCELLED schedules in tenant ${tenant.id}`);
                    updatedCount += res.count;
                }
            }

            // 3. Fix schedules misaligned with their actual status (e.g. status: ACTIVE but mapped to a Canceled label)
            if (activeStatus) {
                const res = await prisma.schedule.updateMany({
                    where: {
                        tenantId: tenant.id,
                        status: 'ACTIVE',
                        scheduleStatus: { isCanceled: true }
                    },
                    data: { statusId: activeStatus.id }
                });
                if (res.count > 0) {
                    console.log(`  Fixed ${res.count} misaligned ACTIVE schedules mapped to canceled status in tenant ${tenant.id}`);
                    updatedCount += res.count;
                }
            }
        }
        console.log(`✅ Cleanup complete! Updated a total of ${updatedCount} schedules.`);
    } catch (e) {
        console.error('❌ Failed to clean up legacy schedules:', e);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}
main();
