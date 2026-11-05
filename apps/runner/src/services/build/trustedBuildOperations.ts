import type {
  DependencyLockBootstrapJobRequestV1,
  ProductionBuildJobRequestV1,
  TrustedBuildJobRequest,
} from "@zoeskoul/build-executor-contracts";

export type DependencyLockBootstrapOperationPlan =
  Readonly<{
    operation:
      "dependency-lock-bootstrap";
    executorProfileId:
      "build-dependency-lock-bootstrap-v1";
    command:
      readonly [
        "pnpm",
        "install",
        "--lockfile-only",
        "--ignore-scripts",
      ];
    outputPaths:
      readonly [
        "pnpm-lock.yaml",
      ];
    allowInteractive:
      false;
    allowShell:
      false;
    networkRequirement:
      "package-registry";
  }>;

export type ProductionBuildOperationPlan =
  Readonly<{
    operation:
      "production-build";
    executorProfileId:
      "build-production-tanstack-worker-v1";
    installCommand:
      readonly [
        "pnpm",
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
      ];
    buildCommand:
      readonly [
        "pnpm",
        "exec",
        "vite",
        "build",
      ];
    typecheckCommand:
      readonly ["pnpm", "exec", "tsc", "--noEmit"];
    outputPaths:
      readonly ["dist/server", "dist/client"];
    allowInteractive:
      false;
    allowShell:
      false;
    networkRequirement:
      "package-registry";
  }>;

export type TrustedBuildOperationPlan =
  | DependencyLockBootstrapOperationPlan
  | ProductionBuildOperationPlan;

export function resolveTrustedBuildOperation(
  request:
    DependencyLockBootstrapJobRequestV1,
): DependencyLockBootstrapOperationPlan;

export function resolveTrustedBuildOperation(
  request:
    ProductionBuildJobRequestV1,
): ProductionBuildOperationPlan;

export function resolveTrustedBuildOperation(
  request:
    TrustedBuildJobRequest,
): TrustedBuildOperationPlan;

export function resolveTrustedBuildOperation(
  request:
    TrustedBuildJobRequest,
): TrustedBuildOperationPlan {
  // Dependency bootstrap and Worker compilation share the canonical stack.
  // Both operations are isolated; this registry performs no deployment.
  if (request.stackId !== "tanstack-start-v1" ||
      request.templateId !== "tanstack-start-v1") {
    throw new Error("Only the canonical TanStack Start stack is registered.");
  }

  if (
    request.operation ===
    "dependency-lock-bootstrap"
  ) {
    return {
      operation:
        "dependency-lock-bootstrap",
      executorProfileId:
        "build-dependency-lock-bootstrap-v1",
      command: [
        "pnpm",
        "install",
        "--lockfile-only",
        "--ignore-scripts",
      ],
      outputPaths: [
        "pnpm-lock.yaml",
      ],
      allowInteractive:
        false,
      allowShell:
        false,
      networkRequirement:
        "package-registry",
    };
  }

  if (request.operation !== "production-build") {
    throw new Error("Trusted Build operation is not registered.");
  }
  // This operation is isolated compilation only; publishing is a separate,
  // explicitly owner-authorized control-plane operation.
  return {
    operation: "production-build",
    executorProfileId: "build-production-tanstack-worker-v1",
    installCommand: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
    buildCommand: ["pnpm", "exec", "vite", "build"],
    typecheckCommand: ["pnpm", "exec", "tsc", "--noEmit"],
    outputPaths: ["dist/server", "dist/client"],
    allowInteractive: false,
    allowShell: false,
    networkRequirement: "package-registry",
  };
}
