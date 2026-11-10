import type { WorkspaceSyncEntry } from "@zoeskoul/code-contracts";
import { workspaceSyncEntriesEqual } from "@zoeskoul/learner-workspace/lib/projects/workspaceSyncEntries";

/**
 * Structural V6 imports use one acknowledged Runner snapshot per file. React's
 * state commit may lag the acknowledgement. Do not begin the next CAS mutation
 * until the browser has adopted EXACTLY that snapshot. Never repush/retry a
 * mutation to resolve a mismatch; preserve both copies and report a failure.
 */
export async function waitForV6ImportView(args: {
    verified: readonly WorkspaceSyncEntry[];
    readView: () => WorkspaceSyncEntry[];
    sameSession: () => boolean;
    pause?: () => Promise<void>;
    maxChecks?: number;
}): Promise<void> {
    const maxChecks = args.maxChecks ?? 80;
    const pause = args.pause ?? (() => new Promise<void>(resolve => setTimeout(resolve, 25)));
    for (let attempt = 0; attempt < maxChecks; attempt++) {
        if (!args.sameSession()) throw new Error("Terminal session changed while importing; no further files were written.");
        if (workspaceSyncEntriesEqual(args.readView(), [...args.verified])) return;
        await pause();
    }
    throw new Error("Explorer did not acknowledge the Runner snapshot. Import paused to protect local and terminal changes; refresh/reconcile before continuing.");
}
