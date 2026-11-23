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

/** Only verified, public image assets may use the suspended live-image writer.
 * Other binaries and all configuration remain restart-only. Private R2 media
 * library entries never acquire this path: they are not application source. */
export function isTanstackLiveBinaryPath(candidate: string): boolean {
  if (!validPath(candidate)) return false;
  const pieces = candidate.split("/");
  if (pieces[0] !== "public" || pieces.length < 2 ||
      pieces.slice(1).some(part => part.startsWith(".") || !/^[A-Za-z0-9_.-]+$/.test(part)))
    return false;
  return /\.(?:png|jpe?g|webp|avif)$/i.test(pieces.at(-1)!);
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
  // Binary data changes never use the text-only suspended/HMR writer. They
  // force an immutable restart with a newly checked source fingerprint.
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
  // Binary writes are explicitly opt-in and independently gated by the
  // privileged paused-container writer. All non-public images restart.
  if ((binaryChanges.length > 0 && !input.allowBinaryLive) ||
      binaryChanges.some(path => !isTanstackLiveBinaryPath(path)) ||
      changes.some(path => !binaryChanges.includes(path) && !isTanstackLiveSourcePath(path)))
    return result("restart", "protected_files_changed", changes);
  if (input.mode !== "development")
    return result("restart", "immutable_lease", changes);
  if (!changes.length)
    return result("restart", "immutable_lease", changes);
  return result("live_candidate", "eligible_source_change", changes);
}
