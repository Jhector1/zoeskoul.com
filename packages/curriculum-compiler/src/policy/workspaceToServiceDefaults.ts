import type { ManifestIdeServiceConfig } from "@zoeskoul/curriculum-contracts";
import type { ResolvedWorkspacePolicy } from "./resolveWorkspacePolicy.js";

export function workspaceToServiceDefaults(args: {
    policy: ResolvedWorkspacePolicy;
}): ManifestIdeServiceConfig | null {
    const c = args.policy.workspace.capabilities;

    const requires = {
        files: c.filesystem.enabled,
        multiFile: c.multiFileProjects.enabled,
        terminal: c.terminal.enabled,
    };

    if (!requires.files && !requires.multiFile && !requires.terminal) {
        return null;
    }

    return {
        ...(requires.terminal ? { runnerBackend: "pty" as const } : {}),
        ...(requires.terminal && requires.files
            ? { layoutMode: "terminal_workspace" as const }
            : {}),
        requires,
    };
}
