export type ManifestIdeServicePreset = "runner" | "lesson" | "workspace";

export type ManifestIdeRunnerBackend = "auto" | "judge0" | "pty";

export type ManifestIdeLayoutMode = "default" | "terminal_workspace";

export type ManifestIdeServiceRequirements = {
  files?: boolean;
  terminal?: boolean;
  multiFile?: boolean;
  projectPersistence?: boolean;
  cloudProjects?: boolean;
};

export type ManifestTerminalBootstrap = {
  /**
   * Absolute repository paths, or an explicitly supported trailing `/*`
   * workspace scope, that an isolated learner terminal may trust before
   * accepting input. These commands are runtime infrastructure and must never
   * appear in learner instructions or terminal history.
   */
  gitSafeDirectories?: string[];

  /**
   * Workspace-relative internal script that materializes the deterministic
   * starting state after the editor files have been synchronized. The script
   * is platform infrastructure, not a learner command.
   */
  setupScriptPath?: string;

  /**
   * Stable opaque identity for the authored starting state. It participates in
   * the PTY lease key so a changed setup recipe cannot reuse a stale session.
   */
  workspaceStateKey?: string;
};


export const DEFAULT_TERMINAL_SETUP_SCRIPT_PATH = ".zoeskoul/setup.sh";

export type ManifestTerminalBootstrapFile = {
  kind?: "file" | "directory";
  path?: string;
  name?: string;
  content?: unknown;
  language?: unknown;
  readOnly?: unknown;
};

function normalizeTerminalBootstrapFilePath(file: ManifestTerminalBootstrapFile) {
  return String(file.path ?? file.name ?? "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "")
    .trim();
}

function stableTerminalBootstrapHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

/**
 * Completes terminal bootstrap metadata from the authored workspace itself.
 *
 * Draft rebuilds and older manifests can legitimately carry the hidden setup
 * file before they carry the newer bootstrap fields. Treat the conventional
 * `.zoeskoul/setup.sh` file as the durable source of truth, and derive the
 * state key from the hidden setup recipe so stale PTY leases cannot be reused
 * after the authored repository state changes. Visible learner edits therefore
 * never rotate the lease or rerun destructive setup.
 */
export function deriveManifestTerminalBootstrap(args: {
  bootstrap?: ManifestTerminalBootstrap | null;
  terminalCwd?: string | null;
  files?: ManifestTerminalBootstrapFile[] | null;
}): ManifestTerminalBootstrap | undefined {
  const files = (args.files ?? [])
    .filter((file) => file?.kind !== "directory")
    .map((file) => ({
      path: normalizeTerminalBootstrapFilePath(file),
      content: String(file?.content ?? ""),
      language: String(file?.language ?? ""),
      readOnly: file?.readOnly === true,
    }))
    .filter((file) => Boolean(file.path))
    .sort((left, right) => left.path.localeCompare(right.path));

  const explicit = mergeManifestTerminalBootstraps(args.bootstrap);
  const setupScriptPath =
    String(explicit?.setupScriptPath ?? "").trim() ||
    (files.some((file) => file.path === DEFAULT_TERMINAL_SETUP_SCRIPT_PATH)
      ? DEFAULT_TERMINAL_SETUP_SCRIPT_PATH
      : "");

  if (!setupScriptPath) return explicit;

  const existingStateKey = String(explicit?.workspaceStateKey ?? "").trim();
  const setupFile = files.find((file) => file.path === setupScriptPath);
  const gitBootstrap = (explicit?.gitSafeDirectories ?? []).length > 0;
  const derivedStateKey = `${gitBootstrap ? "git-state-v1" : "workspace-state-v1"}-${stableTerminalBootstrapHash(
    JSON.stringify({
      terminalCwd: String(args.terminalCwd ?? "/workspace").trim() || "/workspace",
      setupScriptPath,
      setupFile: setupFile
        ? {
            content: setupFile.content,
            language: setupFile.language,
            readOnly: setupFile.readOnly,
          }
        : null,
    }),
  )}`;
  const workspaceStateKey = setupFile
    ? derivedStateKey
    : existingStateKey || derivedStateKey;

  return mergeManifestTerminalBootstraps(explicit, {
    setupScriptPath,
    workspaceStateKey,
  });
}

export type ManifestIdeServiceConfig = {
  preset?: ManifestIdeServicePreset;
  runnerBackend?: ManifestIdeRunnerBackend;
  layoutMode?: ManifestIdeLayoutMode;
  requires?: ManifestIdeServiceRequirements;
  terminalBootstrap?: ManifestTerminalBootstrap;
};

export function mergeManifestTerminalBootstraps(
  ...bootstraps: Array<ManifestTerminalBootstrap | null | undefined>
): ManifestTerminalBootstrap | undefined {
  const gitSafeDirectories = Array.from(
    new Set(
      bootstraps
        .flatMap((bootstrap) => bootstrap?.gitSafeDirectories ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
  let setupScriptPath: string | undefined;
  let workspaceStateKey: string | undefined;

  for (const bootstrap of bootstraps) {
    const nextSetupScriptPath = String(bootstrap?.setupScriptPath ?? "").trim();
    const nextWorkspaceStateKey = String(bootstrap?.workspaceStateKey ?? "").trim();

    if (nextSetupScriptPath) setupScriptPath = nextSetupScriptPath;
    if (nextWorkspaceStateKey) workspaceStateKey = nextWorkspaceStateKey;
  }

  if (
    gitSafeDirectories.length === 0 &&
    !setupScriptPath &&
    !workspaceStateKey
  ) {
    return undefined;
  }

  return {
    ...(gitSafeDirectories.length > 0 ? { gitSafeDirectories } : {}),
    ...(setupScriptPath ? { setupScriptPath } : {}),
    ...(workspaceStateKey ? { workspaceStateKey } : {}),
  };
}

export function mergeManifestIdeServiceConfigs(
  ...configs: Array<ManifestIdeServiceConfig | null | undefined>
): ManifestIdeServiceConfig | null {
  let merged: ManifestIdeServiceConfig | null = null;

  for (const config of configs) {
    if (!config) continue;
    const previousRequires: ManifestIdeServiceRequirements = merged?.requires ?? {};
    const terminalBootstrap = mergeManifestTerminalBootstraps(
      merged?.terminalBootstrap,
      config.terminalBootstrap,
    );

    merged = {
      ...(merged ?? {}),
      ...(config.preset ? { preset: config.preset } : {}),
      ...(config.runnerBackend ? { runnerBackend: config.runnerBackend } : {}),
      ...(config.layoutMode ? { layoutMode: config.layoutMode } : {}),
      ...(terminalBootstrap ? { terminalBootstrap } : {}),
      requires: {
        ...previousRequires,
        ...(config.requires ?? {})
      }
    };
  }

  if (!merged) return null;

  if (!Object.keys(merged.requires ?? {}).length) {
    delete merged.requires;
  }

  return merged;
}
