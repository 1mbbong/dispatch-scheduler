import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

// Initialize Prisma Client with Postgres Adapter
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL is missing in .env');
    process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    let tenant = await prisma.tenant.findFirst({
        where: { name: 'Demo Workspace' },
    });

    if (tenant) {
        console.log(`✅ Demo Workspace already exists. (ID: ${tenant.id})`);
    } else {
        console.log('🌱 Creating Demo Workspace...');
        tenant = await prisma.tenant.create({
            data: {
                name: 'Demo Workspace',
                categoryLabel: '사업부', // Demo label representing the original request
            },
        });
        console.log(`✅ Created Demo Workspace. (ID: ${tenant.id})`);
    }

    const hashedPassword = await bcrypt.hash('password123', 12);

    console.log('🌱 Syncing demo users...');

    // Admin User
    const adminEmail = 'admin@demo.com';
    const adminUser = await prisma.user.upsert({
        where: {
            tenantId_email: {
                tenantId: tenant.id,
                email: adminEmail,
            }
        },
        update: {}, // Do not overwrite anything (especially password) if exists
        create: {
            tenantId: tenant.id,
            email: adminEmail,
            name: 'Admin User',
            password: hashedPassword,
            role: 'ADMIN',
        },
    });
    console.log(`   Admin (${adminEmail}): ${adminUser.createdAt < new Date(Date.now() - 1000) ? 'Already existed' : 'Created'}`);

    // Member User
    const memberEmail = 'member@demo.com';
    const memberUser = await prisma.user.upsert({
        where: {
            tenantId_email: {
                tenantId: tenant.id,
                email: memberEmail,
            }
        },
        update: {}, // Do not overwrite anything if exists
        create: {
            tenantId: tenant.id,
            email: memberEmail,
            name: 'Member User',
            password: hashedPassword,
            role: 'MEMBER',
        },
    });
    console.log(`   Member (${memberEmail}): ${memberUser.createdAt < new Date(Date.now() - 1000) ? 'Already existed' : 'Created'}`);

    console.log('🌱 Syncing sample employees...');
    const employeesToSeed = [
        { name: 'John Doe', email: 'john@demo.com', phone: '010-1234-5678' },
        { name: 'Jane Smith', email: 'jane@demo.com', phone: '010-9876-5432' },
        { name: 'Test Worker', email: 'test@demo.com', phone: '010-1111-2222' },
    ];

    let createdEmployees = 0;
    let existingEmployees = 0;

    for (const emp of employeesToSeed) {
        // Employee has no unique constraint except ID, so we use findFirst by name within tenant
        const existingEmp = await prisma.employee.findFirst({
            where: {
                tenantId: tenant.id,
                name: emp.name,
            }
        });

        if (existingEmp) {
            existingEmployees++;
        } else {
            await prisma.employee.create({
                data: {
                    tenantId: tenant.id,
                    ...emp,
                }
            });
            createdEmployees++;
        }
    }

    console.log(`   Employees: ${createdEmployees} created, ${existingEmployees} already existed.`);

    console.log('🌱 Syncing categories...');
    const categoriesToSeed = [
        { name: '사업1본부', color: '#EF4444' }, // red-500
        { name: '사업2본부', color: '#3B82F6' }, // blue-500
        { name: '인사/총무팀', color: '#10B981' }, // emerald-500
    ];

    let createdCategories = 0;
    for (const cat of categoriesToSeed) {
        const existingCat = await prisma.category.findUnique({
            where: {
                tenantId_name: {
                    tenantId: tenant.id,
                    name: cat.name,
                }
            }
        });

        if (!existingCat) {
            await prisma.category.create({
                data: {
                    tenantId: tenant.id,
                    name: cat.name,
                    color: cat.color,
                }
            });
            createdCategories++;
        }
    }
    console.log(`   Categories: ${createdCategories} new categories planted.`);

    console.log('✅ Seed complete!');
    console.log(`   Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`   Admin:  ${adminEmail} / password123`);
    console.log(`   Member: ${memberEmail} / password123`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
        await pool.end();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        await pool.end();
        process.exit(1);
    });
