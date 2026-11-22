import type { BuildExecutorTextFile, ProductionBuildJobRequestV1 } from "./index";

/**
 * A side-effect-free contract for a FUTURE separate, owner-authenticated
 * development preview. It does not grant an update capability. The runtime
 * must separately verify actor/project ownership, saved-source CAS, signed
 * dependency approval, sandbox liveness and sequential file writes.
 *
 * Current previews are immutable. Passing "immutable" must never authorize
 * in-place changes, even if the source change would otherwise be eligible.
 */
export type TanstackPreviewLeaseMode = "immutable" | "development";
export type TanstackPreviewTransitionReason =
  | "unchanged"
  | "unsaved_source"
  | "wrong_project"
  | "invalid_revision"
  | "invalid_files"
  | "dependencies_changed"
  | "protected_files_changed"
  | "immutable_lease"
  | "eligible_source_change"
  | "eligible_public_asset_change";
export type TanstackPreviewTransition = Readonly<{
  action: "hold" | "unchanged" | "restart" | "reject" | "live_candidate";
  reason: TanstackPreviewTransitionReason;
  /** These are only proposed paths, NOT authorization to write to disk. */
  changedPaths: readonly string[];
}>;

const INTEGRITY_FILES = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "zoebuild-dependency-approval.json",
]);
const SOURCE_RESTART_ROOTS = [
  "node_modules/", ".git/", ".zoebuild/", "dist/", "build/",
  "public/", "scripts/", "server/", "src/server/", "src/api/",
];
const SOURCE_RESTART_NAMES = new Set([
  "vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs",
  "app.config.ts", "tsconfig.json", "postcss.config.js", "postcss.config.cjs",
  "tailwind.config.ts", "tailwind.config.js", "pnpm-workspace.yaml",
  ".npmrc", ".env", ".env.local",
]);

function validPath(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && path.length <= 512 &&
    !path.startsWith("/") && !path.includes("\\") && !path.includes("\0") &&
    path.split("/").every(part => part !== "" && part !== "." && part !== "..");
}

function fileMap(files: readonly BuildExecutorTextFile[]): Map<string,string> | null {
  if (!Array.isArray(files) || files.length > 300) return null;
  const map = new Map<string,string>();
  const keys = new Set<string>();
  for (const file of files) {
    if (!file || !validPath(file.path) || typeof file.content !== "string") return null;
    const key = file.path.toLowerCase();
    if (keys.has(key)) return null;
    keys.add(key);
    map.set(file.path,file.content);
  }
  return map;
}

export function isTanstackLiveSourcePath(path: string): boolean {
  if (!validPath(path)) return false;
  if (SOURCE_RESTART_NAMES.has(path) || SOURCE_RESTART_ROOTS.some(root => path.startsWith(root)))
    return false;
  // Phase 1: deliberately bounded to ordinary application source. Changing
  // configuration, generated output or dependency identity always restarts.
  // The canonical TanStack template imports this root stylesheet.
  if (path === "src/styles.css") return true;
  return /^src\/(?:routes|components|hooks|styles|lib)\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:tsx?|jsx?|css|scss)$/.test(path);
}

/** Images in public/ are inert, cacheable static bytes. This is only a path
 * classification, never authorization to write a file. The Runner re-verifies
 * metadata, SHA-256, sandbox identity, and the current DB source version. */
export function isTanstackLivePublicImagePath(candidate: string): boolean {
  return validPath(candidate) && candidate.startsWith("public/") &&
    /^public\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp|avif)$/i.test(candidate);
}

/** Pure classification; never call this instead of trusted request validation. */
export function classifyTanstackPreviewTransition(input: Readonly<{
  mode: TanstackPreviewLeaseMode;
  previous: ProductionBuildJobRequestV1;
  next: ProductionBuildJobRequestV1;
  hasUnsavedChanges?: boolean;
}>): TanstackPreviewTransition {
  const result = (
    action: TanstackPreviewTransition["action"],
    reason: TanstackPreviewTransitionReason,
    changedPaths: readonly string[] = [],
  ): TanstackPreviewTransition => ({ action, reason, changedPaths });

  if (input.hasUnsavedChanges) return result("hold", "unsaved_source");
  const {previous, next} = input;
  if (previous.buildProjectId !== next.buildProjectId ||
      previous.stackId !== "tanstack-start-v1" || next.stackId !== previous.stackId ||
      previous.templateId !== "tanstack-start-v1" || next.templateId !== previous.templateId ||
      previous.operation !== "production-build" || next.operation !== "production-build")
    return result("reject", "wrong_project");
  if (!Number.isSafeInteger(previous.sourceVersion) || previous.sourceVersion < 1 ||
      !Number.isSafeInteger(next.sourceVersion) || next.sourceVersion < previous.sourceVersion)
    return result("reject", "invalid_revision");
  const oldFiles = fileMap(previous.files);
  const newFiles = fileMap(next.files);
  if (!oldFiles || !newFiles) return result("reject", "invalid_files");
  const paths = new Set([...oldFiles.keys(), ...newFiles.keys()]);
  const changes = [...paths].filter(path => oldFiles.get(path) !== newFiles.get(path)).sort();
  // Every binary in the saved executor request was validated by the trusted
  // protocol parser. Recheck path identity here before proposing a live change.
  const oldBinaries = new Map((previous.binaryFiles ?? []).map(file => [file.path, file]));
  const newBinaries = new Map((next.binaryFiles ?? []).map(file => [file.path, file]));
  const binaryKeys = [...oldBinaries.keys(), ...newBinaries.keys()];
  const binaryCaseKeys = new Set(binaryKeys.map(p => p.toLowerCase()));
  if (oldBinaries.size !== (previous.binaryFiles ?? []).length ||
      newBinaries.size !== (next.binaryFiles ?? []).length ||
      new Set([...oldBinaries.keys()].map(p => p.toLowerCase())).size !== oldBinaries.size ||
      new Set([...newBinaries.keys()].map(p => p.toLowerCase())).size !== newBinaries.size ||
      binaryKeys.some(p => !validPath(p)) ||
      [...oldBinaries.keys()].some(p => [...newBinaries.keys()].some(q => q !== p && q.toLowerCase() === p.toLowerCase())) ||
      [...binaryCaseKeys].some(p => [...oldFiles.keys(), ...newFiles.keys()].some(t => t.toLowerCase() === p)))
    return result("reject", "invalid_files");
  const binaryChanges = [...new Set(binaryKeys)]
    .filter(p => JSON.stringify(oldBinaries.get(p)) !== JSON.stringify(newBinaries.get(p)))
    .sort();
  changes.push(...binaryChanges);
  changes.sort();
  if (next.sourceVersion === previous.sourceVersion) {
    return changes.length ? result("reject", "invalid_revision") : result("unchanged", "unchanged");
  }
  if (changes.some(path => INTEGRITY_FILES.has(path)))
    return result("restart", "dependencies_changed", changes);
  // The suspended writer admits at most 32 atomic changes per transaction.
  // Larger legitimate revisions use normal replacement rather than risking
  // partial workspace writes followed by quarantine.
  if (changes.length > 32) return result("restart", "protected_files_changed", changes);
  if (changes.some(path => !isTanstackLiveSourcePath(path) &&
      !(binaryChanges.includes(path) && isTanstackLivePublicImagePath(path))))
    return result("restart", "protected_files_changed", changes);
  if (input.mode !== "development")
    return result("restart", "immutable_lease", changes);
  if (!changes.length)
    return result("restart", "immutable_lease", changes);
  return result("live_candidate", binaryChanges.length
    ? "eligible_public_asset_change" : "eligible_source_change", changes);
}
