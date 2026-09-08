import type { WorkspaceStateV2 } from "@/components/ide/types";

export type ReviewWorkspaceDraft = {
    savedAt: number;
    workspace: WorkspaceStateV2;
};

const REVIEW_WORKSPACE_DRAFT_PREFIX = "zoe:review-workspace-draft:";

export function reviewWorkspaceDraftKey(ownerKey: string) {
    return `${REVIEW_WORKSPACE_DRAFT_PREFIX}${ownerKey}`;
}

export function isWorkspaceState(value: unknown): value is WorkspaceStateV2 {
    return Boolean(
        value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes),
    );
}

export function readReviewWorkspaceDraft(
    ownerKey: string | null | undefined,
): ReviewWorkspaceDraft | null {
    void ownerKey;

    // Review/Practice learner workspace persistence is server-backed only.
    // Browser-local draft restoration is deliberately disabled.
    return null;
}

export function writeReviewWorkspaceDraft(
    ownerKey: string | null | undefined,
    workspace: WorkspaceStateV2 | null,
) {
    void ownerKey;
    void workspace;

    // Deliberate no-op. The canonical persistence owner is server/runtime state.
}

export function clearReviewWorkspaceDraft(
    ownerKey: string | null | undefined,
) {
    void ownerKey;

    // No browser-local Review/Practice draft exists when persistence is off.
}

export function clearReviewWorkspaceDrafts(
    shouldClear?: (ownerKey: string, storageKey: string) => boolean,
) {
    void shouldClear;

    // No browser-local Review/Practice drafts are persisted.
}