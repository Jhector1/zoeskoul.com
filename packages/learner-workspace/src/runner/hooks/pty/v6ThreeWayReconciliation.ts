import type { WorkspaceSyncEntry } from "@zoeskoul/learner-workspace/runner/runtime";
import { workspaceSyncEntryValue } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";
import { isWorkspaceInternalPath } from "@zoeskoul/learner-workspace/lib/projects/workspaceInternalPaths";

/** Pure read-only plan. No source is overwritten and no CAS revision is bypassed. */
export type V6PathResolution = Readonly<{
    path: string;
    kind: "unchanged" | "browser_only" | "runner_only" | "conflict" | "unverified";
    ancestor: WorkspaceSyncEntry | null;
    browser: WorkspaceSyncEntry | null;
    runner: WorkspaceSyncEntry | null;
}>;
const allowed = (path: string) => !isWorkspaceInternalPath(path) &&
    path.split("/").filter(Boolean).at(-1) !== ".bash_history";
const mapEntries = (items: WorkspaceSyncEntry[]) => new Map(items.filter(item => allowed(item.path)).map(item => [item.path, item]));
const equal = (a: WorkspaceSyncEntry | null, b: WorkspaceSyncEntry | null) =>
    a === b || (Boolean(a && b) && a!.kind === b!.kind && workspaceSyncEntryValue(a!) === workspaceSyncEntryValue(b!));

/**
 * Missing ancestor means UNKNOWN, not an empty file. A browser/Runner mismatch
 * must remain blocked until a trusted acknowledged ancestor is provided.
 */
export function planV6ThreeWayReconciliation(args: Readonly<{
    ancestor: WorkspaceSyncEntry[] | null;
    browser: WorkspaceSyncEntry[];
    runner: WorkspaceSyncEntry[];
}>): {safe: boolean; paths: V6PathResolution[]} {
    const browser = mapEntries(args.browser);
    const runner = mapEntries(args.runner);
    const ancestor = args.ancestor === null ? null : mapEntries(args.ancestor);
    const paths = [...new Set([...browser.keys(), ...runner.keys(), ...(ancestor?.keys() ?? [])])].sort().map(path => {
        const local = browser.get(path) ?? null;
        const remote = runner.get(path) ?? null;
        const base = ancestor?.get(path) ?? null;
        let kind: V6PathResolution["kind"];
        if (equal(local, remote)) kind = "unchanged";
        else if (!ancestor) kind = "unverified";
        else if (equal(local, base)) kind = "runner_only";
        else if (equal(remote, base)) kind = "browser_only";
        else kind = "conflict";
        return {path, kind, ancestor: base, browser: local, runner: remote};
    });
    return {safe: paths.every(p => p.kind !== "conflict" && p.kind !== "unverified"), paths};
}
