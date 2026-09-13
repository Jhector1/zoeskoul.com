/**
 * Framework-neutral learner-workspace static configuration.
 * Safe for both browser and server imports. React providers/hooks stay in appRuntime.tsx.
 */

export type LearnerWorkspaceStaticConfig = {
  appName: string;
  nodeEnv: string;
  env: Readonly<Record<string, string | undefined>>;
};

let staticConfig: LearnerWorkspaceStaticConfig = {
  appName: "app",
  nodeEnv: "development",
  env: {},
};

export function setLearnerWorkspaceStaticConfig(
  next: LearnerWorkspaceStaticConfig,
): void {
  staticConfig = {
    appName: next.appName || "app",
    nodeEnv: next.nodeEnv || "development",
    env: { ...next.env },
  };
}

export function getLearnerWorkspaceStaticConfig(): LearnerWorkspaceStaticConfig {
  return staticConfig;
}

export function getLearnerWorkspaceEnv(name: string): string | undefined {
  return staticConfig.env[name];
}
