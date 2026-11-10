/** Human-readable, data-preserving guidance for opt-in V6 explorer failures. */
export function v6ExplorerFailureMessage(error: unknown): string {
    const possible = error && typeof error === "object" && "code" in error
        ? (error as { code?: unknown }).code : null;
    const fallback = error instanceof Error ? error.message : "Unknown workspace error";
    const parsed = typeof fallback === "string"
        ? /\b(LOCAL_DRAFT_CHANGED|LOCAL_SYNC_FAILED|CONFLICT|RECONCILIATION_REQUIRED|SESSION_NOT_READY)\b/.exec(fallback)?.[1]
        : null;
    const code = typeof possible === "string" ? possible : parsed;
    switch (code) {
        case "LOCAL_DRAFT_CHANGED":
            return "Your editor changed while syncing to the terminal. Nothing was moved or deleted. Finish editing and retry; your local draft is preserved.";
        case "LOCAL_SYNC_FAILED":
            return "The current editor changes could not be fully synchronized to the terminal. The folder operation was not attempted. Some earlier file changes may already have synced; check the terminal sync error before retrying.";
        case "CONFLICT":
            return "The file or folder changed since the editor last checked it. No newer data was overwritten. Compare the terminal contents with the editor before retrying.";
        case "RECONCILIATION_REQUIRED":
            return "The server result needs verification. No automatic retry was attempted. Reconnect the terminal workspace and check the file tree before making another change.";
        case "SESSION_NOT_READY":
            return "The terminal session is not ready for a file operation. Wait until it connects, then retry.";
        default:
            return `Workspace operation blocked: ${fallback}. Your editor changes were not discarded.`;
    }
}
