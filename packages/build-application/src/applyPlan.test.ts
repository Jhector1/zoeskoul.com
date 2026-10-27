import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  ProjectSpecification,
} from "@zoeskoul/build-contracts";

import {
  BuildAccessError,
  BuildProjectDefinitionError,
  BuildSourceInputError,
  applyBuildProjectPlanCommand,
  type BuildPlanApplyPersistenceInput,
  type BuildPlanApplyWritePort,
} from "./index";

function specification(
  stackId = "react-vite-v1",
): ProjectSpecification {
  return {
    version: 1,

    name:
      "Applied project",

    projectType:
      "frontend-app",

    targets: [
      "web",
    ],

    requirements: {
      backend: false,
      database: false,
      auth: false,
      storage: false,
      payments: false,
      email: false,
      commerce: false,
    },

    pages: [
      "Home",
    ],

    stackId,

    deployment: {
      preference:
        "static",
    },
  };
}

function writer() {
  const applyOwnedBuildProjectPlan =
    vi.fn(
      async (
        input:
          BuildPlanApplyPersistenceInput,
      ) => ({
        sourceVersion:
          input.baseVersion + 1,

        changed: true,

        workspaceChanged:
          true,

        updatedAt:
          "2026-10-15T16:00:00.000Z",
      }),
    );

  const port:
    BuildPlanApplyWritePort = {
      applyOwnedBuildProjectPlan,
    };

  return {
    port,
    applyOwnedBuildProjectPlan,
  };
}

describe(
  "ZoeBuild explicit Apply Plan command",
  () => {
    it(
      "materializes the trusted stack only after authenticated explicit apply",
      async () => {
        const store =
          writer();

        await expect(
          applyBuildProjectPlanCommand({
            access: {
              userId:
                " user_1 ",

              entitlements: [],
            },

            buildProjectId:
              " build_1 ",

            baseVersion: 4,

            specification:
              specification(),

            writer:
              store.port,

            createdAt: 100,
          }),
        ).resolves.toMatchObject({
          sourceVersion: 5,
          changed: true,
          workspaceChanged: true,
        });

        expect(
          store.applyOwnedBuildProjectPlan,
        ).toHaveBeenCalledTimes(1);

        const applied =
          store
            .applyOwnedBuildProjectPlan
            .mock
            .calls[0]?.[0];

        expect(
          applied,
        ).toMatchObject({
          ownerId:
            "user_1",

          buildProjectId:
            "build_1",

          baseVersion: 4,

          stackId:
            "react-vite-v1",

          templateId:
            "react-vite-v1",
        });

        expect(
          applied?.workspace.nodes.length,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "fails before materialization persistence when authentication is missing",
      async () => {
        const store =
          writer();

        await expect(
          applyBuildProjectPlanCommand({
            access: {
              userId: null,
              entitlements: [],
            },

            buildProjectId:
              "build_1",

            baseVersion: 1,

            specification:
              specification(),

            writer:
              store.port,

            createdAt: 1,
          }),
        ).rejects.toBeInstanceOf(
          BuildAccessError,
        );

        expect(
          store.applyOwnedBuildProjectPlan,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "requires optimistic source version before persistence",
      async () => {
        const store =
          writer();

        await expect(
          applyBuildProjectPlanCommand({
            access: {
              userId:
                "user_1",

              entitlements: [],
            },

            buildProjectId:
              "build_1",

            baseVersion: 0,

            specification:
              specification(),

            writer:
              store.port,

            createdAt: 1,
          }),
        ).rejects.toBeInstanceOf(
          BuildSourceInputError,
        );

        expect(
          store.applyOwnedBuildProjectPlan,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects the retired static stack rather than recreating vanilla JS",
      async () => {
        const store = writer();
        await expect(
          applyBuildProjectPlanCommand({
            access: { userId: "user_1", entitlements: [] },
            buildProjectId: "build_1",
            baseVersion: 1,
            specification: specification("static-html-v1"),
            writer: store.port,
            createdAt: 1,
          }),
        ).rejects.toBeInstanceOf(BuildProjectDefinitionError);
        expect(store.applyOwnedBuildProjectPlan).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an unsupported stack before persistence",
      async () => {
        const store =
          writer();

        await expect(
          applyBuildProjectPlanCommand({
            access: {
              userId:
                "user_1",

              entitlements: [],
            },

            buildProjectId:
              "build_1",

            baseVersion: 1,

            specification:
              specification(
                "unknown-stack-v1",
              ),

            writer:
              store.port,

            createdAt: 1,
          }),
        ).rejects.toBeInstanceOf(
          BuildProjectDefinitionError,
        );

        expect(
          store.applyOwnedBuildProjectPlan,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
