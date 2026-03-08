import { NextRequest, NextResponse } from 'next/server';
import { requireAuthServer } from '@/lib/auth';
import prisma from '@/lib/db';
import { createCustomerAreaSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType } from '@/lib/audit';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuthServer();

        const customerAreas = await prisma.customerArea.findMany({
            where: { tenantId: auth.tenantId, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        return NextResponse.json(customerAreas);
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('CustomerAreas GET error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuthServer();
        const json = await req.json();

        const validation = createCustomerAreaSchema.safeParse(json);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        // Create CustomerArea, catch unique constraint violation
        const customerArea = await prisma.customerArea.create({
            data: {
                tenantId: auth.tenantId,
                name: data.name,
                color: data.color,
                isActive: data.isActive ?? true,
                sortOrder: data.sortOrder ?? 0,
            },
        });

        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.id,
            action: AuditAction.CREATE_LABEL,
            entityType: EntityType.CUSTOMER_AREA,
            entityId: customerArea.id,
            newData: customerArea,
        });

        return NextResponse.json(customerArea, { status: 201 });
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'A Customer Area with this name already exists.' }, { status: 409 });
        }
        console.error('CustomerAreas POST error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
