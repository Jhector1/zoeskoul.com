/** Project-owned, server-sealed dependency authorization for React/Vite builds.
 * The seal is not a user-editable approval: a shared server secret authenticates
 * the project identity, pinned dependency manifest and (after resolution) lock.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PROJECT_DEPENDENCY_APPROVAL_PATH = "zoebuild-dependency-approval.json";
const MAX_APPROVAL_BYTES = 4096;
const MAX_PACKAGES = 96;
const PINNED_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/;
const HEX = /^[a-f0-9]{64}$/;

export class ProjectDependencyApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectDependencyApprovalError";
  }
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new ProjectDependencyApprovalError("Invalid project dependency manifest.");
  }
  return value as Record<string, unknown>;
}

function pinnedDependencies(value: unknown, group: string): Record<string, string> {
  if (value === undefined) return {};
  const deps = record(value);
  const result: Record<string, string> = {};
  for (const name of Object.keys(deps).sort()) {
    const version = deps[name];
    if (!PACKAGE_NAME.test(name) || typeof version !== "string" || !PINNED_VERSION.test(version)) {
      throw new ProjectDependencyApprovalError(`${group} only permits registry packages with exact pinned versions.`);
    }
    result[name] = version;
  }
  return result;
}

/** Do not admit package-manager controls that can change the resolution policy. */
export function canonicalProjectDependencyManifest(packageJson: string): string {
  if (Buffer.byteLength(packageJson, "utf8") > 128 * 1024) {
    throw new ProjectDependencyApprovalError("Package manifest is too large.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(packageJson); } catch {
    throw new ProjectDependencyApprovalError("Invalid package.json JSON.");
  }
  const pkg = record(parsed);
  if (pkg.packageManager !== "pnpm@10.33.0") {
    throw new ProjectDependencyApprovalError("Project must use the supported pinned pnpm version.");
  }
  for (const key of ["optionalDependencies", "peerDependencies", "overrides", "resolutions", "workspaces", "pnpm", "publishConfig"]) {
    if (Object.prototype.hasOwnProperty.call(pkg, key)) {
      throw new ProjectDependencyApprovalError(`Unsupported package manager control: ${key}.`);
    }
  }
  const dependencies = pinnedDependencies(pkg.dependencies, "dependencies");
  const devDependencies = pinnedDependencies(pkg.devDependencies, "devDependencies");
  if (Object.keys(dependencies).some(name => name in devDependencies) ||
      Object.keys(dependencies).length + Object.keys(devDependencies).length > MAX_PACKAGES) {
    throw new ProjectDependencyApprovalError("Duplicate or excessive project dependencies.");
  }
  return JSON.stringify({ packageManager: pkg.packageManager, dependencies, devDependencies });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function secretValue(secret: string | undefined): string {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new ProjectDependencyApprovalError("Project dependency approval is not configured on this service.");
  }
  return secret;
}

function contentToSign(projectId: string, manifestSha256: string, lockSha256: string | null): string {
  if (!projectId || projectId.length > 128 || !HEX.test(manifestSha256) || (lockSha256 !== null && !HEX.test(lockSha256))) {
    throw new ProjectDependencyApprovalError("Invalid project dependency approval identity.");
  }
  return JSON.stringify([1, projectId, manifestSha256, lockSha256]);
}

export function sealProjectDependencies(args: Readonly<{
  projectId: string;
  packageJson: string;
  lockfile?: string;
  secret: string;
}>): string {
  const manifestSha256 = sha256(canonicalProjectDependencyManifest(args.packageJson));
  const lockSha256 = args.lockfile === undefined ? null : sha256(args.lockfile);
  const payload = contentToSign(args.projectId, manifestSha256, lockSha256);
  const signature = createHmac("sha256", secretValue(args.secret)).update(payload).digest("hex");
  return JSON.stringify({ version: 1, projectId: args.projectId, manifestSha256, lockSha256, signature }, null, 2) + "\n";
}

export function verifyProjectDependencies(args: Readonly<{
  projectId: string;
  packageJson: string;
  lockfile?: string;
  approval: string;
  secret: string | undefined;
}>): void {
  if (Buffer.byteLength(args.approval, "utf8") > MAX_APPROVAL_BYTES) {
    throw new ProjectDependencyApprovalError("Project dependency approval is too large.");
  }
  let value: unknown;
  try { value = JSON.parse(args.approval); } catch {
    throw new ProjectDependencyApprovalError("Invalid project dependency approval.");
  }
  const data = record(value);
  if (data.version !== 1 || data.projectId !== args.projectId ||
      typeof data.manifestSha256 !== "string" ||
      (data.lockSha256 !== null && typeof data.lockSha256 !== "string") ||
      typeof data.signature !== "string" || !HEX.test(data.signature)) {
    throw new ProjectDependencyApprovalError("Project dependency approval has an invalid identity or signature.");
  }
  const manifestSha256 = sha256(canonicalProjectDependencyManifest(args.packageJson));
  const lockSha256 = args.lockfile === undefined ? null : sha256(args.lockfile);
  if (manifestSha256 !== data.manifestSha256 || lockSha256 !== data.lockSha256) {
    throw new ProjectDependencyApprovalError("Project dependencies or lockfile changed after approval.");
  }
  const expected = createHmac("sha256", secretValue(args.secret))
    .update(contentToSign(args.projectId, manifestSha256, lockSha256))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(data.signature, "hex"))) {
    throw new ProjectDependencyApprovalError("Project dependency signature was not issued by ZoeBuild.");
  }
}

export function assertNoUntrustedInstallControls(files: ReadonlyMap<string, string>): void {
  const forbidden = /^(?:\.npmrc|\.pnpmfile\.cjs|pnpm-workspace\.yaml|package-lock\.json|yarn\.lock|\.yarnrc(?:\.yml)?|npm-shrinkwrap\.json)$/i;
  for (const path of files.keys()) {
    if (forbidden.test(path) || /(?:^|\/)(?:node_modules|\.pnpm|\.git)(?:\/|$)/i.test(path)) {
      throw new ProjectDependencyApprovalError("Workspace cannot override trusted dependency installation settings.");
    }
  }
}


/**
 * A persisted owner's own pinned manifest may be resolved by the trusted runner
 * even when it differs from today's starter template. This classification does
 * NOT authorize an existing unsigned lock: the bootstrap must regenerate that
 * lock scriptlessly from registry-only pinned packages. An existing approval is
 * always verified; a mismatch or forged signature is never silently repaired.
 *
 * The caller must independently enforce authenticated ownership, an exact
 * saved-source CAS version and the canonical runner/install policy.
 */
export function inspectProjectOwnedDependencyPreparation(args: Readonly<{
  projectId: string;
  files: ReadonlyMap<string, string>;
  secret: string | undefined;
}>): "resolve-lock" | "already-approved" {
  assertNoUntrustedInstallControls(args.files);
  const packageJson = args.files.get("package.json");
  if (packageJson === undefined) {
    throw new ProjectDependencyApprovalError("Project requires a root package.json.");
  }
  canonicalProjectDependencyManifest(packageJson);
  const existingLock = args.files.get("pnpm-lock.yaml");
  const approval = args.files.get(PROJECT_DEPENDENCY_APPROVAL_PATH);
  if (approval !== undefined) {
    verifyProjectDependencies({
      projectId: args.projectId,
      packageJson,
      lockfile: existingLock,
      approval,
      secret: args.secret,
    });
    if (existingLock !== undefined) return "already-approved";
  }
  // An unsigned lock is NOT considered authorized, even if its text looks
  // valid. Always resolve in the runner and seal the resulting exact bytes.
  return "resolve-lock";
}
