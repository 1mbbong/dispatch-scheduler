import { isCancelledStatus } from '@/lib/labels';

export function getDnDEligibility(
    schedule: any,
    canManage: boolean,
    block?: { isGhost?: boolean; isPreview?: boolean }
): { draggable: boolean; reason?: string } {
    if (!canManage) {
        return { draggable: false, reason: "권한이 없어 일정을 이동할 수 없습니다. (Admin/Manager만 가능)" };
    }
    if (schedule.id === '__preview__' || block?.isPreview) {
        return { draggable: false, reason: "미리보기 블록은 이동할 수 없습니다." };
    }
    if (block?.isGhost) {
        return { draggable: false, reason: "이 블록은 변경 이력 표시용(ghost)입니다. 원본은 History에서 확인하세요." };
    }
    if (isCancelledStatus(schedule.scheduleStatus)) {
        return { draggable: false, reason: "취소된 일정은 이동할 수 없습니다. (취소 해제 후 이동)" };
    }
    return { draggable: true };
}
