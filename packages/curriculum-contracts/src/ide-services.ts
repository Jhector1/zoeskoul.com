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
