export const DEFAULT_TOPIC_TOOL_SCOPE_KEY = "topic-tool:default";

/**
 * Exercise workspaces stay isolated by their exercise state key. When no
 * exercise owns the editor, callers should provide the active card's canonical
 * card:<full-card-key> scope. The topic fallback is reserved for moments when
 * no card target can be resolved at all.
 */
export function resolveActiveToolScopeKey(args: {
    activeExerciseStateKey?: string | null;
    activeCardWorkspaceExerciseKey?: string | null;
    fallbackWorkspaceScopeKey?: string | null;
    /** @deprecated Use fallbackWorkspaceScopeKey. */
    fallbackCardScopeKey?: string | null;
}) {
    return (
        args.activeExerciseStateKey ??
        args.activeCardWorkspaceExerciseKey ??
        args.fallbackWorkspaceScopeKey ??
        args.fallbackCardScopeKey ??
        DEFAULT_TOPIC_TOOL_SCOPE_KEY
    );
}
