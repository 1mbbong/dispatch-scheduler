import { SerializedScheduleStatus, SerializedWorkType } from '@/types';

export function isCancelledStatus(status?: SerializedScheduleStatus | null | any): boolean {
    return status?.isCanceled === true;
}
