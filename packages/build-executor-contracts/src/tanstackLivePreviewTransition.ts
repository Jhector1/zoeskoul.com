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
  | "eligible_source_change";
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

/** Public image assets may use the suspended live-image writer. Other
 * binaries and configuration remain restart-only. Private R2 media entries
 * never acquire this path: they are not application source. */
export function isTanstackLiveBinaryPath(candidate: string): boolean {
  if (!validPath(candidate)) return false;
  const pieces = candidate.split("/");
  if (pieces[0] !== "public" || pieces.length < 2 ||
      pieces.slice(1).some(part => part.startsWith(".") || part.trim() !== part ||
        !/^[A-Za-z0-9_. \u00a0\u202f-]+$/.test(part)))
    return false;
  return /\.(?:png|jpe?g|webp|avif)$/i.test(pieces.at(-1)!);
}

/** Root image names use the same bounded extension/character policy. The
 * suspended writer must verify the exact prior authoritative snapshot before
 * any image mutation, including delete, move, replacement and creation. */
export function tanstackLiveRootImageMimeType(candidate: string): string | null {
  if (!validPath(candidate) || candidate.includes("/") || candidate.startsWith(".") ||
      candidate.trim() !== candidate || !/^[A-Za-z0-9_. \u00a0\u202f-]+$/.test(candidate)) return null;
  const extension = /\.[^.]+$/.exec(candidate)?.[0]?.toLowerCase();
  switch (extension) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".avif": return "image/avif";
    default: return null;
  }
}

/** Pure classification; never call this instead of trusted request validation. */
export function classifyTanstackPreviewTransition(input: Readonly<{
  mode: TanstackPreviewLeaseMode;
  previous: ProductionBuildJobRequestV1;
  next: ProductionBuildJobRequestV1;
  hasUnsavedChanges?: boolean;
  /** Runner-side opt-in only; default false. Not a source authorization. */
  allowBinaryLive?: boolean;
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
  // Binary changes use only the separately opted-in, suspended binary writer.
  // Root and public images require prior snapshot verification in the writer.
  const oldBinaries = new Map((previous.binaryFiles ?? []).map(file => [file.path, file]));
  const newBinaries = new Map((next.binaryFiles ?? []).map(file => [file.path, file]));
  const binaryChanges = [...new Set([...oldBinaries.keys(), ...newBinaries.keys()])]
    .filter(path => JSON.stringify(oldBinaries.get(path)) !== JSON.stringify(newBinaries.get(path)))
    .sort();
  changes.push(...binaryChanges);
  changes.sort();
  if (next.sourceVersion === previous.sourceVersion) {
    return changes.length ? result("reject", "invalid_revision") : result("unchanged", "unchanged");
  }
  if (changes.length > 32)
    return result("restart", "protected_files_changed", changes);
  if (changes.some(path => INTEGRITY_FILES.has(path)))
    return result("restart", "dependencies_changed", changes);
  // A path must be binary in the saved snapshots, not a text-to-binary
  // conversion. Protected and non-public nested source paths stay restart-only.
  const eligibleBinary = (path: string) => {
    const rootMime = tanstackLiveRootImageMimeType(path);
    if (!isTanstackLiveBinaryPath(path) && rootMime === null) return false;
    if (oldFiles.has(path) || newFiles.has(path)) return false;
    return rootMime === null || [oldBinaries.get(path), newBinaries.get(path)]
      .every(file => !file || file.mimeType === rootMime);
  };
  // The writer rejects case-insensitive collisions across changed paths. Do
  // not send a binary case-only rename into a transaction that will quarantine.
  const binaryCaseCollision = binaryChanges.length !== new Set(binaryChanges.map(path => path.toLowerCase())).size;
  if ((binaryChanges.length > 0 && !input.allowBinaryLive) || binaryCaseCollision ||
      binaryChanges.some(path => !eligibleBinary(path)) ||
      changes.some(path => !binaryChanges.includes(path) && !isTanstackLiveSourcePath(path)))
    return result("restart", "protected_files_changed", changes);
  if (input.mode !== "development")
    return result("restart", "immutable_lease", changes);
  if (!changes.length)
    return result("restart", "immutable_lease", changes);
  return result("live_candidate", "eligible_source_change", changes);
}
