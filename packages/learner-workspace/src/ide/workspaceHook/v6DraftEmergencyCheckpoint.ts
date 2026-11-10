import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";

// localStorage is strictly a small last-moment fallback. IndexedDB remains
// the authoritative durable draft store. Large drafts remain in IndexedDB.
const MAX_CHECKPOINT_LENGTH = 400_000;
export const emergencyDraftKey = (key: string) => `${key}:emergency:v1`;

export type EmergencyDraft = {
    marker: "zoelearning-emergency-v1";
    savedAt: number;
    workspace: WorkspaceStateV2;
};
export function encodeEmergencyDraft(workspace: WorkspaceStateV2, savedAt: number): string | null {
    const serialized = JSON.stringify({marker: "zoelearning-emergency-v1", savedAt, workspace});
    return serialized.length <= MAX_CHECKPOINT_LENGTH ? serialized : null;
}
export function parseEmergencyDraft(raw: string | null): EmergencyDraft | null {
    if (!raw) return null;
    try {
        const value = JSON.parse(raw);
        return value?.marker === "zoelearning-emergency-v1" &&
            Number.isSafeInteger(value.savedAt) && value.savedAt > 0 &&
            value.workspace?.version === 2 && Array.isArray(value.workspace.nodes)
            ? value as EmergencyDraft : null;
    } catch { return null; }
}
export function shouldRestoreEmergencyDraft(
    emergency: EmergencyDraft | null,
    idbSavedAt: number | null,
    idbWorkspace?: WorkspaceStateV2 | null,
): boolean {
    return !!emergency && (idbSavedAt == null || emergency.savedAt > idbSavedAt ||
        (emergency.savedAt === idbSavedAt && !!idbWorkspace &&
         JSON.stringify(emergency.workspace) !== JSON.stringify(idbWorkspace)));
}
