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
    if (typeof window === "undefined") return null;

    const key = String(ownerKey ?? "").trim();
    if (!key) return null;

    try {
        const raw = window.localStorage.getItem(reviewWorkspaceDraftKey(key));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<ReviewWorkspaceDraft>;

        if (!isWorkspaceState(parsed.workspace)) return null;

        const savedAt = Number(parsed.savedAt ?? 0);

        return {
            savedAt: Number.isFinite(savedAt) ? savedAt : 0,
            workspace: parsed.workspace,
        };
    } catch {
        return null;
    }
}

export function writeReviewWorkspaceDraft(
    ownerKey: string | null | undefined,
    workspace: WorkspaceStateV2 | null,
) {
    if (typeof window === "undefined") return;

    const key = String(ownerKey ?? "").trim();

    if (!key || !workspace || !isWorkspaceState(workspace)) return;

    try {
        window.localStorage.setItem(
            reviewWorkspaceDraftKey(key),
            JSON.stringify({
                savedAt: Date.now(),
                workspace,
            } satisfies ReviewWorkspaceDraft),
        );
    } catch {
        // Best effort only. Runtime/progress persistence remains canonical.
    }
}

export function clearReviewWorkspaceDrafts(
    shouldClear?: (ownerKey: string, storageKey: string) => boolean,
) {
    if (typeof window === "undefined") return;

    try {
        for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
            const storageKey = window.localStorage.key(i);

            if (!storageKey?.startsWith(REVIEW_WORKSPACE_DRAFT_PREFIX)) {
                continue;
            }

            const ownerKey = storageKey.slice(REVIEW_WORKSPACE_DRAFT_PREFIX.length);

            if (!shouldClear || shouldClear(ownerKey, storageKey)) {
                window.localStorage.removeItem(storageKey);
            }
        }
    } catch {
        // Reset is still valid even if localStorage cleanup is unavailable.
    }
}