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
  assertRegisteredProductionBuildFiles,
} from "./index";

const specification:
  ProjectSpecification = {
    version: 1,
    name:
      "Runner production policy",
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

function files() {
  const materialized =
    materializeRegisteredBuildProject({
      specification,
      createdAt: 1,
    });

  const byId =
    new Map(
      materialized
        .workspace.nodes
        .map(
          (node) => [
            node.id,
            node,
          ],
        ),
    );

  const pathOf = (
    id: string,
  ): string => {
    const node =
      byId.get(id);

    if (!node) {
      throw new Error(
        `missing node ${id}`,
      );
    }

    return node.parentId
      ? `${pathOf(
          node.parentId,
        )}/${node.name}`
      : node.name;
  };

  return [
    ...materialized
      .workspace.nodes.flatMap(
        (node) =>
          node.kind ===
          "file"
            ? [
                {
                  path:
                    pathOf(
                      node.id,
                    ),
                  content:
                    node.content,
                },
              ]
            : [],
      ),
    {
      path:
        "pnpm-lock.yaml",
      content:
        "lockfileVersion: '9.0'\n",
    },
  ];
}

describe(
  "runner-side production build policy",
  () => {
    it(
      "accepts the registered React source with a lockfile",
      () => {
        expect(
          () =>
            assertRegisteredProductionBuildFiles({
              stackId:
                "react-vite-v1",
              templateId:
                "react-vite-v1",
              files:
                files(),
            }),
        ).not.toThrow();
      },
    );

    it(
      "rejects dependency mutation even with a lockfile",
      () => {
        const mutated =
          files().map(
            (file) => {
              if (
                file.path !==
                "package.json"
              ) {
                return file;
              }

              const parsed =
                JSON.parse(
                  file.content,
                ) as
                  Record<
                    string,
                    unknown
                  >;

              parsed.dependencies = {
                ...(
                  parsed.dependencies as
                    Record<
                      string,
                      string
                    >
                ),
                "left-pad":
                  "1.3.0",
              };

              return {
                ...file,
                content:
                  `${JSON.stringify(
                    parsed,
                    null,
                    2,
                  )}\n`,
              };
            },
          );

        expect(
          () =>
            assertRegisteredProductionBuildFiles({
              stackId:
                "react-vite-v1",
              templateId:
                "react-vite-v1",
              files:
                mutated,
            }),
        ).toThrow(
          BuildPreparationError,
        );
      },
    );

    it(
      "rejects an unregistered stack",
      () => {
        expect(
          () =>
            assertRegisteredProductionBuildFiles({
              stackId:
                "static-html-v1",
              templateId:
                "static-html-v1",
              files:
                files(),
            }),
        ).toThrow(
          BuildPreparationError,
        );
      },
    );
  },
);
