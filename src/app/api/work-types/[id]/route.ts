import { NextRequest, NextResponse } from 'next/server';
import { requireAuthServer } from '@/lib/auth';
import prisma from '@/lib/db';
import { updateWorkTypeSchema } from '@/lib/validations';
import { createAuditLog, AuditAction, EntityType } from '@/lib/audit';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuthServer();
        const { id } = await params;
        const json = await req.json();

        const validation = updateWorkTypeSchema.safeParse(json);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        const existing = await prisma.workType.findFirst({
            where: { id, tenantId: auth.tenantId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Work Type not found' }, { status: 404 });
        }

        const updated = await prisma.workType.update({
            where: { id },
            data,
        });

        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.id,
            action: AuditAction.UPDATE_LABEL,
            entityType: EntityType.WORK_TYPE,
            entityId: id,
            oldData: existing,
            newData: updated,
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'A Work Type with this name already exists.' }, { status: 409 });
        }
        console.error('WorkTypes PATCH error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuthServer();
        const { id } = await params;

        const existing = await prisma.workType.findFirst({
            where: { id, tenantId: auth.tenantId },
        });

        if (!existing) {
            return NextResponse.json({ error: 'Work Type not found' }, { status: 404 });
        }

        let isSoftDelete = false;

        try {
            // Attempt hard delete
            const deleted = await prisma.workType.delete({
                where: { id },
            });

            await createAuditLog({
                tenantId: auth.tenantId,
                userId: auth.user.id,
                action: AuditAction.DELETE_LABEL,
                entityType: EntityType.WORK_TYPE,
                entityId: id,
                oldData: existing,
            });

            return NextResponse.json(deleted);
        } catch (deleteError: any) {
            if (deleteError.code === 'P2003') {
                isSoftDelete = true;
            } else {
                throw deleteError;
            }
        }

        if (isSoftDelete) {
            // Fallback to soft delete
            const deactivated = await prisma.workType.update({
                where: { id },
                data: { isActive: false },
            });

            await createAuditLog({
                tenantId: auth.tenantId,
                userId: auth.user.id,
                action: AuditAction.UPDATE_LABEL,
                entityType: EntityType.WORK_TYPE,
                entityId: id,
                oldData: existing,
                newData: deactivated,
            });

            return NextResponse.json(deactivated);
        }

    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('WorkTypes DELETE error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
