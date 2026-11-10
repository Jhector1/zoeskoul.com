import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { assertWorkspaceRelativePath, resolveWorkspaceFileCapability } from "@zoeskoul/code-contracts";
import type { ImportedWorkspaceFile } from "@zoeskoul/learner-workspace/ide/workspaceHook/workspace.policy";
import { isWorkspaceInternalPath } from "@zoeskoul/learner-workspace/lib/projects/workspaceInternalPaths";

export type V6ImportPlan = Readonly<{
    directories: string[];
    entries: WorkspaceSyncEntry[];
}>;

/** Preflight only; the Runner performs the authoritative absent-only CAS check. */
export function planV6Import(
    files: ReadonlyArray<ImportedWorkspaceFile>,
    existing: ReadonlyArray<WorkspaceSyncEntry>,
    limits: Readonly<{maxFiles:number;maxDepth:number;maxTextBytes:number;maxBinaryBytes:number}>,
): V6ImportPlan {
    if (!files.length || files.length > limits.maxFiles) throw new Error("Import file count exceeds the workspace limit.");
    const paths = new Set(existing.map(e => e.path));
    const knownFiles = new Set(existing.filter(e=>e.kind === "file").map(e=>e.path));
    const dirs = new Set<string>();
    const entries: WorkspaceSyncEntry[] = [];
    for (const input of files) {
        const path = assertWorkspaceRelativePath(input.path);
        if (path !== input.path || isWorkspaceInternalPath(path) || paths.has(path) || dirs.has(path)) {
            throw new Error(`The import path is unsafe or already exists: ${input.path}`);
        }
        const segments = path.split("/");
        if (segments.length > limits.maxDepth) throw new Error(`Import path is too deep: ${path}`);
        const capability = resolveWorkspaceFileCapability(path);
        if (!capability) throw new Error(`Unsupported import file: ${path}`);
        const binary = input.binary;
        if (capability.storage !== (binary ? "binary" : "text")) {
            throw new Error(`Incorrect import encoding: ${path}`);
        }
        if (binary) {
            if (binary.encoding !== "base64" || binary.sizeBytes > limits.maxBinaryBytes ||
                !Number.isSafeInteger(binary.sizeBytes) || binary.sizeBytes < 0) {
                throw new Error(`Invalid binary import: ${path}`);
            }
            entries.push({kind:"file",path,encoding:"base64",data:binary.data,sizeBytes:binary.sizeBytes,mimeType:"application/octet-stream"});
        } else {
            if (new TextEncoder().encode(input.content).byteLength > limits.maxTextBytes) {
                throw new Error(`Text import is too large: ${path}`);
            }
            entries.push({kind:"file",path,content:input.content});
        }
        for (let i=1;i<segments.length;i++) {
            const dir=segments.slice(0,i).join("/");
            if (knownFiles.has(dir)) throw new Error(`A file blocks imported folder: ${dir}`);
            if (!paths.has(dir)) dirs.add(dir);
        }
        paths.add(path);
        knownFiles.add(path);
    }
    const directories=[...dirs].sort((a,b)=>a.split("/").length-b.split("/").length||a.localeCompare(b));
    return {directories,entries};
}
