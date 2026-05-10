import type {
    ManifestRuntimeDefaults,
    WorkspaceLanguage,
} from "@zoeskoul/curriculum-contracts";
import type { ResolvedWorkspacePolicy } from "./resolveWorkspacePolicy.js";

function toCodeLanguage(profileId: string): Exclude<WorkspaceLanguage, "sql"> | undefined {
    if (
        profileId === "python" ||
        profileId === "java" ||
        profileId === "javascript" ||
        profileId === "c" ||
        profileId === "cpp" ||
        profileId === "bash" ||
        profileId === "web"
    ) {
        return profileId;
    }

    return undefined;
}

export function workspaceToRuntimeDefaults(args: {
    policy: ResolvedWorkspacePolicy;
    profileId: string;
}): ManifestRuntimeDefaults {
    const c = args.policy.workspace.capabilities;

    if (c.sql?.queryRunner.enabled || args.profileId === "sql") {
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
        language: toCodeLanguage(args.profileId),
        supportsTerminal: c.terminal.enabled,
        supportsMultiFile: c.multiFileProjects.enabled,
        supportsFileSystem: c.filesystem.enabled,
        supportsStdInStdOut: c.stdinStdout.enabled,
        supportsPackageInstall: c.packageInstall.enabled,
    };
}