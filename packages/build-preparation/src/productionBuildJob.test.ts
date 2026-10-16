import type {
  ProjectSpecification,
} from "@zoeskoul/build-contracts";

import {
  materializeRegisteredBuildProject,
} from "@zoeskoul/build-materializer";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  BuildPreparationError,
  createRegisteredProductionBuildJob,
} from "./index";

const specification:
  ProjectSpecification = {
    version: 1,
    name:
      "Production build",
    projectType:
      "frontend-app",
    targets: ["web"],
    requirements: {
      backend: false,
      database: false,
      auth: false,
      storage: false,
      payments: false,
      email: false,
      commerce: false,
    },
    pages: ["Home"],
    stackId:
      "react-vite-v1",
    deployment: {
      preference:
        "static",
    },
  };

function workspaceWithLock() {
  const materialized =
    materializeRegisteredBuildProject({
      specification,
      createdAt: 1,
    });

  return {
    ...materialized.workspace,
    nodes: [
      ...materialized
        .workspace.nodes,
      {
        id:
          "pnpm-lock",
        kind:
          "file" as const,
        name:
          "pnpm-lock.yaml",
        parentId:
          null,
        content:
          "lockfileVersion: '9.0'\n",
        createdAt: 2,
        updatedAt: 2,
      },
    ],
  };
}

describe(
  "registered React production build job creation",
  () => {
    it(
      "creates a shell-free production-build request from registered source",
      () => {
        const result =
          createRegisteredProductionBuildJob({
            buildProjectId:
              "build_1",
            specification,
            workspace:
              workspaceWithLock(),
            sourceVersion: 4,
          });

        expect(
          result,
        ).toMatchObject({
          protocolVersion: 1,
          operation:
            "production-build",
          buildProjectId:
            "build_1",
          sourceVersion: 4,
          stackId:
            "react-vite-v1",
          templateId:
            "react-vite-v1",
        });

        expect(
          result.files.some(
            (file) =>
              file.path ===
              "pnpm-lock.yaml",
          ),
        ).toBe(true);

        expect(
          JSON.stringify(
            result,
          ),
        ).not.toContain(
          '"command"',
        );
      },
    );

    it(
      "refuses production build without the frozen lockfile",
      () => {
        const materialized =
          materializeRegisteredBuildProject({
            specification,
            createdAt: 1,
          });

        expect(
          () =>
            createRegisteredProductionBuildJob({
              buildProjectId:
                "build_1",
              specification,
              workspace:
                materialized.workspace,
              sourceVersion: 1,
            }),
        ).toThrow(
          BuildPreparationError,
        );
      },
    );
  },
);
