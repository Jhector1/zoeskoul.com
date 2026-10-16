import type {
  DependencyLockBootstrapJobRequestV1,
  ProductionBuildJobRequestV1,
} from "@zoeskoul/build-executor-contracts";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveTrustedBuildOperation,
} from "./trustedBuildOperations.js";

function bootstrapRequest(
  overrides:
    Partial<
      DependencyLockBootstrapJobRequestV1
    > = {},
):
  DependencyLockBootstrapJobRequestV1 {
  return {
    protocolVersion: 1,
    operation:
      "dependency-lock-bootstrap",
    buildProjectId:
      "build_1",
    sourceVersion: 1,
    stackId:
      "react-vite-v1",
    templateId:
      "react-vite-v1",
    files: [
      {
        path:
          "package.json",
        content: "{}",
      },
    ],
    ...overrides,
  };
}

function productionRequest(
  overrides:
    Partial<
      ProductionBuildJobRequestV1
    > = {},
):
  ProductionBuildJobRequestV1 {
  return {
    protocolVersion: 1,
    operation:
      "production-build",
    buildProjectId:
      "build_1",
    sourceVersion: 2,
    stackId:
      "react-vite-v1",
    templateId:
      "react-vite-v1",
    files: [
      {
        path:
          "package.json",
        content: "{}",
      },
      {
        path:
          "pnpm-lock.yaml",
        content:
          "lockfileVersion: '9.0'",
      },
    ],
    ...overrides,
  };
}

describe(
  "runner trusted Build operation registry",
  () => {
    it(
      "owns the exact bootstrap command and output",
      () => {
        expect(
          resolveTrustedBuildOperation(
            bootstrapRequest(),
          ),
        ).toEqual({
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
        });
      },
    );

    it(
      "owns the exact frozen install, build, and dist output for React production",
      () => {
        expect(
          resolveTrustedBuildOperation(
            productionRequest(),
          ),
        ).toEqual({
          operation:
            "production-build",
          executorProfileId:
            "build-production-react-vite-v1",
          installCommand: [
            "pnpm",
            "install",
            "--frozen-lockfile",
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
        });
      },
    );

    it(
      "fails closed for an unregistered stack binding",
      () => {
        expect(
          () =>
            resolveTrustedBuildOperation(
              productionRequest({
                stackId:
                  "static-html-v1",
              }),
            ),
        ).toThrow(
          /only registered for react-vite-v1/i,
        );
      },
    );
  },
);
