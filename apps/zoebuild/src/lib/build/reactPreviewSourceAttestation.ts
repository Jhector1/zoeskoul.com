import {
  parseTrustedBuildJobRequest,
  type ProductionBuildJobRequestV1,
} from "@zoeskoul/build-executor-contracts";

/** Compare the exact saved request contents, NOT merely its version/hash.
 * Both inputs are fully validated by the shared executor contract before any
 * comparison. File order is irrelevant, but every path and byte must match.
 */
export function matchesSavedTanstackPreviewRequest(
  submitted: unknown,
  authoritative: ProductionBuildJobRequestV1,
): boolean {
  try {
    const candidate = parseTrustedBuildJobRequest(submitted);
    const saved = parseTrustedBuildJobRequest(authoritative);
    if (candidate.operation !== "production-build" || saved.operation !== "production-build" ||
        candidate.protocolVersion !== saved.protocolVersion ||
        candidate.buildProjectId !== saved.buildProjectId ||
        candidate.sourceVersion !== saved.sourceVersion ||
        candidate.stackId !== "tanstack-start-v1" ||
        candidate.stackId !== saved.stackId ||
        candidate.templateId !== "tanstack-start-v1" ||
        candidate.templateId !== saved.templateId ||
        candidate.files.length !== saved.files.length ||
        (candidate.binaryFiles?.length ?? 0) !== (saved.binaryFiles?.length ?? 0)) return false;
    const files = new Map(saved.files.map(f => [f.path, f.content]));
    if (!candidate.files.every(f => files.has(f.path) && files.get(f.path) === f.content)) return false;
    // Identity includes the exact image bytes, not only a claimed checksum.
    // The Runner separately verifies sha256 when materializing the file.
    const binaries = new Map((saved.binaryFiles ?? []).map(file => [file.path, file]));
    return (candidate.binaryFiles ?? []).every(file => {
      const pinned = binaries.get(file.path);
      return Boolean(pinned && pinned.mimeType === file.mimeType &&
        pinned.encoding === file.encoding && pinned.sizeBytes === file.sizeBytes &&
        pinned.checksum === file.checksum && pinned.data === file.data);
    });
  } catch {
    return false;
  }
}
