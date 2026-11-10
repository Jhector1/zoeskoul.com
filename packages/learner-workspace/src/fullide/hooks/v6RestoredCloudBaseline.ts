import { INVALID_CLOUD_FINGERPRINT_PREFIX } from "../../projects/hooks/cloudWorkspaceFingerprint";
/**
 * Plans cloud baseline restoration after a browser refresh.
 * Only a verified cloud GET may establish an acknowledged save baseline.
 * Never infer cloud correctness from cached browser metadata alone.
 */
export type RestoredCloudBaselineDecision =
    | "clean"
    | "local-draft"
    | "conflict"
    | "unverified";

export function planRestoredCloudBaseline(args: {
    localFingerprint: string;
    cloudFingerprint: string;
    cachedVersion: number | null;
    cloudVersion: number;
}): RestoredCloudBaselineDecision {
    const {localFingerprint, cloudFingerprint, cachedVersion, cloudVersion} = args;
    if (localFingerprint.startsWith(INVALID_CLOUD_FINGERPRINT_PREFIX) ||
        cloudFingerprint.startsWith(INVALID_CLOUD_FINGERPRINT_PREFIX) ||
        localFingerprint === "null" || cloudFingerprint === "null") return "unverified";
    if (!Number.isSafeInteger(cloudVersion) || cloudVersion < 1) return "unverified";
    if (cachedVersion != null &&
        (!Number.isSafeInteger(cachedVersion) || cachedVersion < 1 || cloudVersion < cachedVersion)) {
        return "unverified";
    }
    // Even when a second tab incremented the version, identical contents
    // can be safely acknowledged without a new cloud write.
    if (localFingerprint === cloudFingerprint) return "clean";
    // A newer server revision or missing common version is not mergeable.
    if (cachedVersion == null || cloudVersion > cachedVersion) return "conflict";
    // Cached revision remains current; only the local draft has changed.
    return "local-draft";
}
