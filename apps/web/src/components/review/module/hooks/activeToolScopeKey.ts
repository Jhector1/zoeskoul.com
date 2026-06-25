export function resolveActiveToolScopeKey(args: {
    activeExerciseStateKey?: string | null;
    activeCardWorkspaceExerciseKey?: string | null;
    fallbackCardScopeKey: string;
}) {
    return (
        args.activeExerciseStateKey ??
        args.activeCardWorkspaceExerciseKey ??
        args.fallbackCardScopeKey
    );
}
