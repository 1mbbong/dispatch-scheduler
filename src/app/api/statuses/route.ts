import { NextRequest, NextResponse } from 'next/server';
import { requireAuthServer } from '@/lib/auth';
import prisma from '@/lib/db';
import { createStatusSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType } from '@/lib/audit';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuthServer();

        const statuses = await prisma.scheduleStatus.findMany({
            where: { tenantId: auth.tenantId, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        return NextResponse.json(statuses);
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Statuses GET error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuthServer();
        const json = await req.json();

        const validation = createStatusSchema.safeParse(json);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        const statusLabel = await prisma.scheduleStatus.create({
            data: {
                tenantId: auth.tenantId,
                name: data.name,
                color: data.color,
                isActive: data.isActive ?? true,
                isCanceled: data.isCanceled ?? false,
                sortOrder: data.sortOrder ?? 0,
            },
        });

        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.id,
            action: AuditAction.CREATE_LABEL,
            entityType: EntityType.SCHEDULE_STATUS,
            entityId: statusLabel.id,
            newData: statusLabel,
        });

        return NextResponse.json(statusLabel, { status: 201 });
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'A Schedule Status with this name already exists.' }, { status: 409 });
        }
        console.error('Statuses POST error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
