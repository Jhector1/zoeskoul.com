import type { BuildStackDefinition } from "@zoeskoul/build-contracts";

/**
 * Canonical ZoeBuild V1 stack. All generated websites, applications, and
 * storefronts use TanStack Start. No static-HTML or standalone SPA fallback.
 *
 * The Worker bundle is executable server code: never publish it as static
 * assets. A trusted deployment adapter is required before live publishing.
 */
export const TANSTACK_START_STACK_V1 = {
  id: "tanstack-start-v1",
  projectTypes: ["fullstack-app"],
  targets: ["web"],
  runtimeProfileId: "build-worker-v1",
  templateId: "tanstack-start-v1",
  commands: {
    install: ["pnpm", "install", "--frozen-lockfile"],
    dev: ["pnpm", "dev", "--host", "0.0.0.0"],
    build: ["pnpm", "build"],
  },
  preview: { type: "server", port: 5173 },
  artifact: {
    type: "worker-bundle",
    outputPath: "dist/server",
    assetsPath: "dist/client",
    entrypoint: "index.js",
  },
  supportedCapabilities: ["backend", "payments", "commerce"],
  commerceRuntime: "tanstack-start",
  deploymentAdapterId: "cloudflare-workers-v1",
} as const satisfies BuildStackDefinition;

export const BUILD_STACKS_V1 = [
  TANSTACK_START_STACK_V1,
] as const satisfies readonly BuildStackDefinition[];

export function listBuildStacks(): readonly BuildStackDefinition[] {
  return BUILD_STACKS_V1;
}

export function getBuildStack(stackId: string): BuildStackDefinition | undefined {
  return BUILD_STACKS_V1.find((stack) => stack.id === stackId);
}

export function requireBuildStack(stackId: string): BuildStackDefinition {
  const stack = getBuildStack(stackId);
  if (!stack) throw new Error(`Unsupported ZoeBuild stack: ${stackId}`);
  return stack;
}
