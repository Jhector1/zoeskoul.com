import type { WorkspaceExplorerIntentV6 } from "@zoeskoul/learner-workspace/runner/runtime";

/**
 * V6 history belongs to one real Runner session, not to the publication
 * lifetime of a React callback. Readiness can toggle during reconciliation.
 */
export function planV6ExecutorHistoryPublication(
    previousSessionId: string | null,
    sessionId: string | null | undefined,
    ready: boolean,
): Readonly<{sessionId: string | null; resetHistory: boolean; acceptExecutor: boolean}> {
    if (!ready) {
        // A temporary offline state disables actions but does NOT destroy Undo.
        return {sessionId: previousSessionId, resetHistory: false, acceptExecutor: false};
    }
    if (!sessionId || typeof sessionId !== "string") {
        // Fail closed if a caller publishes an executor without an identity.
        return {sessionId: null, resetHistory: true, acceptExecutor: false};
    }
    return {sessionId, resetHistory: sessionId !== previousSessionId, acceptExecutor: true};
}

/** One accessible spinner label for the existing server-first Explorer actions. */
export function v6FileActionLabel(intent: WorkspaceExplorerIntentV6): string {
    const name = intent.path?.split("/").filter(Boolean).pop() ?? "workspace";
    switch (intent.kind) {
        case "delete_file":
        case "trash_directory": return `Deleting ${name}…`;
        case "restore_directory":
        case "restore_file": return `Restoring ${name}…`;
        case "move_directory":
        case "move_file": return `Moving or renaming ${name}…`;
        case "mkdir":
        case "create_file": return `Creating ${name}…`;
        case "rmdir": return `Removing ${name}…`;
        case "list_trash": return "Loading recovery options…";
        case "export_snapshot": return "Preparing download…";
        default: return "Updating workspace…";
    }
}
