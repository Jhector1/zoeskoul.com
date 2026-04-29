export type ManifestIdeServicePreset = "runner" | "lesson" | "workspace";

export type ManifestIdeRunnerBackend = "auto" | "judge0" | "pty";

export type ManifestIdeServiceRequirements = {
  files?: boolean;
  terminal?: boolean;
  multiFile?: boolean;
  projectPersistence?: boolean;
  cloudProjects?: boolean;
};

export type ManifestIdeServiceConfig = {
  preset?: ManifestIdeServicePreset;
  runnerBackend?: ManifestIdeRunnerBackend;
  requires?: ManifestIdeServiceRequirements;
};

export function mergeManifestIdeServiceConfigs(
  ...configs: Array<ManifestIdeServiceConfig | null | undefined>
): ManifestIdeServiceConfig | null {
  let merged: ManifestIdeServiceConfig | null = null;

  for (const config of configs) {
    if (!config) continue;
    const previousRequires: ManifestIdeServiceRequirements = merged?.requires ?? {};

    merged = {
      ...(merged ?? {}),
      ...(config.preset ? { preset: config.preset } : {}),
      ...(config.runnerBackend ? { runnerBackend: config.runnerBackend } : {}),
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
