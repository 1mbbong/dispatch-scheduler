import { NextRequest, NextResponse } from 'next/server';
import { requireAuthServer } from '@/lib/auth';
import prisma from '@/lib/db';
import { updateOfficeSchema } from '@/lib/validations';
import { createAuditLog, AuditAction } from '@/lib/audit';

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuthServer();
        const { id } = await params;
        const json = await req.json();

        const validation = updateOfficeSchema.safeParse(json);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.format() }, { status: 400 });
        }

        const data = validation.data;

        const existing = await prisma.office.findUnique({
            where: { id },
        });

        if (!existing || existing.tenantId !== auth.tenantId) {
            return NextResponse.json({ error: 'Not Found' }, { status: 404 });
        }

        const updated = await prisma.office.update({
            where: { id },
            data,
        });

        await createAuditLog({
            tenantId: auth.tenantId,
            userId: auth.user.id,
            action: AuditAction.UPDATE_LABEL,
            entityType: 'OFFICE' as any,
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
            return NextResponse.json({ error: 'An Office with this name already exists.' }, { status: 409 });
        }
        console.error('Offices PATCH error:', error);
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

        const existing = await prisma.office.findUnique({
            where: { id },
        });

        if (!existing || existing.tenantId !== auth.tenantId) {
            return NextResponse.json({ error: 'Not Found' }, { status: 404 });
        }

        try {
            await prisma.office.delete({
                where: { id },
            });

            await createAuditLog({
                tenantId: auth.tenantId,
                userId: auth.user.id,
                action: AuditAction.DELETE_LABEL,
                entityType: 'OFFICE' as any,
                entityId: id,
                oldData: existing,
            });

            return NextResponse.json({ deleted: true });
        } catch (error: any) {
            if (error.code === 'P2003') {
                const softDeleted = await prisma.office.update({
                    where: { id },
                    data: { isActive: false },
                });

                await createAuditLog({
                    tenantId: auth.tenantId,
                    userId: auth.user.id,
                    action: AuditAction.UPDATE_LABEL,
                    entityType: 'OFFICE' as any,
                    entityId: id,
                    oldData: existing,
                    newData: softDeleted,
                });

                return NextResponse.json({
                    softDeleted: true,
                    message: 'Office is in use and was deactivated instead of deleted.'
                });
            }
            throw error;
        }
    } catch (error: any) {
        if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.error('Offices DELETE error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
