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
        // Capabilities do not decide presentation. A terminal + filesystem can
        // be Linux terminal-only or Git editor + terminal. The profile or
        // authored IDE policy owns layoutMode.
        requires,
    };
}
