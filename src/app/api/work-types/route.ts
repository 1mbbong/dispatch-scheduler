import { NextRequest, NextResponse } from 'next/server';
import { requireAuthServer } from '@/lib/auth';
import prisma from '@/lib/db';
import { createWorkTypeSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType } from '@/lib/audit';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuthServer();

        const workTypes = await prisma.workType.findMany({
            where: { tenantId: auth.tenantId, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        return NextResponse.json(workTypes);
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('WorkTypes GET error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuthServer();
        const json = await req.json();

        const validation = createWorkTypeSchema.safeParse(json);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        const workType = await prisma.workType.create({
            data: {
                tenantId: auth.tenantId,
                name: data.name,
                isActive: data.isActive ?? true,
                sortOrder: data.sortOrder ?? 0,
            },
        });

        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.id,
            action: AuditAction.CREATE_LABEL,
            entityType: EntityType.WORK_TYPE,
            entityId: workType.id,
            newData: workType,
        });

        return NextResponse.json(workType, { status: 201 });
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'A Work Type with this name already exists.' }, { status: 409 });
        }
        console.error('WorkTypes POST error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
