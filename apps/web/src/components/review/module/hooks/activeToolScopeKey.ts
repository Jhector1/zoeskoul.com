export const DEFAULT_TOPIC_TOOL_SCOPE_KEY = "topic-tool:default";

/**
 * Exercise workspaces stay isolated by their exercise state key. When no
 * exercise owns the editor, every card in the current topic shares one
 * profile-backed default workspace. Hiding the rail therefore never destroys
 * or replaces the learner's default editor state.
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
