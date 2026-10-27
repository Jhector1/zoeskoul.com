import type {
  DependencyLockBootstrapJobRequestV1,
  ProductionBuildJobRequestV1,
  TrustedBuildJobRequest,
  TrustedBuildOperation,
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
      "build-production-react-vite-v1";
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
        "build",
      ];
    outputPaths:
      readonly ["dist"];
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
  if (
    request.stackId !==
      "react-vite-v1" ||
    request.templateId !==
      "react-vite-v1"
  ) {
    throw new Error(
      `Trusted ${request.operation} is only registered for react-vite-v1.`,
    );
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

  const operation:
    TrustedBuildOperation =
      request.operation;

  if (
    operation !==
    "production-build"
  ) {
    throw new Error(
      "Trusted Build operation is not registered.",
    );
  }

  return {
    operation:
      "production-build",
    executorProfileId:
      "build-production-react-vite-v1",
    installCommand: [
      "pnpm",
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
    ],
    buildCommand: [
      "pnpm",
      "build",
    ],
    outputPaths: [
      "dist",
    ],
    allowInteractive:
      false,
    allowShell:
      false,
    networkRequirement:
      "package-registry",
  };
}
