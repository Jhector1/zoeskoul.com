import type { BuildStackDefinition } from "@zoeskoul/build-contracts";

/**
 * Canonical supported-stack catalog for ZoeBuild.
 *
 * IDs in this registry are ZoeBuild domain IDs, not vendor IDs. In
 * particular, deploymentAdapterId names a logical deployment capability;
 * Cloudflare, another vendor, or a self-hosted implementation can satisfy the
 * adapter later without changing project specifications.
 */

export const STATIC_HTML_STACK_V1 = {
  id: "static-html-v1",
  projectTypes: ["static-site"],
  targets: ["web"],
  runtimeProfileId: "build-static-v1",
  templateId: "static-html-v1",
  commands: {
    // Empty argv means the template itself is the publishable static artifact.
    build: [],
  },
  preview: { type: "static" },
  artifact: {
    type: "static-directory",
    outputPath: ".",
  },
  supportedCapabilities: [],
  deploymentAdapterId: "static-assets-v1",
} as const satisfies BuildStackDefinition;

export const REACT_VITE_STACK_V1 = {
  id: "react-vite-v1",
  projectTypes: ["static-site", "frontend-app"],
  targets: ["web"],
  runtimeProfileId: "build-node-v1",
  templateId: "react-vite-v1",
  commands: {
    install: ["pnpm", "install", "--frozen-lockfile"],
    dev: ["pnpm", "dev", "--host", "0.0.0.0"],
    build: ["pnpm", "build"],
  },
  preview: { type: "server", port: 5173 },
  artifact: {
    type: "static-directory",
    outputPath: "dist",
  },
  supportedCapabilities: [],
  deploymentAdapterId: "static-assets-v1",
} as const satisfies BuildStackDefinition;

export const COMMERCE_STOREFRONT_STACK_V1 = {
  id: "commerce-storefront-v1",
  projectTypes: ["frontend-app"],
  targets: ["web"],

  // The generated storefront itself is static.
  // Catalog/cart/checkout are delegated to the managed
  // commerce provider instead of requiring ZoeBuild to
  // operate a customer database or payment backend.
  runtimeProfileId: "build-static-v1",

  templateId: "commerce-storefront-v1",

  commands: {
    build: [],
  },

  preview: {
    type: "static",
  },

  artifact: {
    type: "static-directory",
    outputPath: ".",
  },

  supportedCapabilities: [
    "payments",
    "commerce",
  ],

  deploymentAdapterId:
    "static-assets-v1",
} as const satisfies BuildStackDefinition;


export const BUILD_STACKS_V1 = [
  COMMERCE_STOREFRONT_STACK_V1,
  STATIC_HTML_STACK_V1,
  REACT_VITE_STACK_V1,
] as const satisfies readonly BuildStackDefinition[];

function assertUniqueStackIds(
  stacks: readonly BuildStackDefinition[],
): void {
  const seen = new Set<string>();
  for (const stack of stacks) {
    if (seen.has(stack.id)) {
      throw new Error(`Duplicate ZoeBuild stack id: ${stack.id}`);
    }
    seen.add(stack.id);
  }
}

assertUniqueStackIds(BUILD_STACKS_V1);

export function listBuildStacks(): readonly BuildStackDefinition[] {
  return BUILD_STACKS_V1;
}

export function getBuildStack(
  stackId: string,
): BuildStackDefinition | undefined {
  return BUILD_STACKS_V1.find((stack) => stack.id === stackId);
}

export function requireBuildStack(stackId: string): BuildStackDefinition {
  const stack = getBuildStack(stackId);
  if (!stack) {
    throw new Error(`Unsupported ZoeBuild stack: ${stackId}`);
  }
  return stack;
}
