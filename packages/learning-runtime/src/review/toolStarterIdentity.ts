import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";
import type { ExerciseRuntimeState } from "./module/runtime/reviewRuntimeTypes";

/** Publish the authoritative reset into a binding that survived navigation. */
export function applyCanonicalResetToToolBinding<T extends {
    workspace?: WorkspaceStateV2 | null;
    code: string;
    stdin?: string;
    userEdited?: boolean;
    workspaceOrigin?: string;
    preferSnapshot?: boolean;
}>(binding: T, runtime: ExerciseRuntimeState | null | undefined): T {
    if (!runtime?.workspace || !(Number(runtime.workspaceApplyRevision) > 0) ||
        runtime.workspaceOrigin !== "starter" || runtime.userEdited === true) {
        return binding;
    }
    // The mounted replacement command is the incoming source. The old tool
    // registration is not a learner mutation and cannot supersede that source.
    // Once an actual edit updates the runtime to user ownership, binds flow
    // normally again (including terminal-created files).
    return {
        ...binding,
        workspace: runtime.workspace,
        code: runtime.code ?? "",
        stdin: runtime.stdin ?? "",
        userEdited: false,
        workspaceOrigin: "starter",
        preferSnapshot: true,
    };
}

/** A bound learner snapshot must never redefine the authored starter identity. */
export function resolveStarterHashForToolBind(args: {
    canonicalStarterHash?: string | null;
    snapshotOverridesSaved: boolean;
    effectiveSavedStarterHash?: string | null;
    runtimeStarterHash?: string | null;
    progressRuntimeStarterHash?: string | null;
    progressToolStarterHash?: string | null;
    currentStarterHash: string;
}) {
    const firstNonBlank = (...values: Array<string | null | undefined>) =>
        values.find(value => typeof value === "string" && value.trim());

    // Reset rebuilds starterWorkspace from the authored manifest. Rebinding
    // the persistent tool must carry that identity, not the pre-reset snapshot.
    if (args.canonicalStarterHash && args.canonicalStarterHash !== "null") {
        return args.canonicalStarterHash;
    }
    const saved = firstNonBlank(args.effectiveSavedStarterHash);
    if (saved) return saved;

    // Terminal snapshots can add files without creating a new authored starter.
    if (args.snapshotOverridesSaved) {
        return firstNonBlank(
            args.runtimeStarterHash,
            args.progressRuntimeStarterHash,
            args.progressToolStarterHash,
        ) ?? args.currentStarterHash;
    }
    return args.currentStarterHash;
}
