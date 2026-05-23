import type {
    ManifestRuntimeDefaults,
} from "@zoeskoul/curriculum-contracts";
import { getCurriculumProfile } from "@zoeskoul/curriculum-profiles";
import type { ResolvedWorkspacePolicy } from "./resolveWorkspacePolicy.js";

export function workspaceToRuntimeDefaults(args: {
    policy: ResolvedWorkspacePolicy;
    profileId: string;
}): ManifestRuntimeDefaults {
    const c = args.policy.workspace.capabilities;
    const profile = getCurriculumProfile(args.profileId);

    if (profile.runtimeKind === "sql") {
        return {
            kind: "sql",
            showSchema: c.sql?.schemaBrowser.enabled ?? false,
            showErd: c.sql?.erdDiagram.enabled ?? false,
            showChen: c.sql?.chenDiagram.enabled ?? false,
            supportsTerminal: c.terminal.enabled,
            supportsMultiFile: c.multiFileProjects.enabled,
            supportsFileSystem: c.filesystem.enabled,
        };
    }

    return {
        kind: "code",
        language: profile.defaultLanguage,
        supportsTerminal: c.terminal.enabled,
        supportsMultiFile: c.multiFileProjects.enabled,
        supportsFileSystem: c.filesystem.enabled,
        supportsStdInStdOut: c.stdinStdout.enabled,
        supportsPackageInstall: c.packageInstall.enabled,
    };
}
