import { NextRequest, NextResponse } from 'next/server';
import { requireAuthServer } from '@/lib/auth';
import prisma from '@/lib/db';
import { createOfficeSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType } from '@/lib/audit';

export async function GET(req: NextRequest) {
    try {
        const auth = await requireAuthServer();
        const searchParams = req.nextUrl.searchParams;
        const includeInactive = searchParams.get('includeInactive') === 'true';

        const { getOffices } = await import('@/lib/queries');
        const offices = await getOffices(auth.tenantId, includeInactive);

        return NextResponse.json(offices);
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Offices GET error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuthServer();
        const json = await req.json();

        const validation = createOfficeSchema.safeParse(json);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        const office = await prisma.office.create({
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
            entityType: 'OFFICE' as any,
            entityId: office.id,
            newData: office,
        });

        return NextResponse.json(office, { status: 201 });
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'An Office with this name already exists.' }, { status: 409 });
        }
        console.error('Offices POST error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
