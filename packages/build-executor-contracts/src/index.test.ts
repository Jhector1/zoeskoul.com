import {
  BuildExecutorContractError,
  parseTrustedBuildJobRequest,
} from "./index";

import {
  describe,
  expect,
  it,
} from "vitest";

function bootstrapRequest() {
  return {
    protocolVersion: 1,
    operation:
      "dependency-lock-bootstrap",
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
        content:
          '{"name":"example"}',
      },
      {
        path:
          "src/App.tsx",
        content:
          "export default function App() { return null; }",
      },
    ],
  };
}

function productionRequest() {
  return {
    ...bootstrapRequest(),
    operation:
      "production-build",
    files: [
      ...bootstrapRequest().files,
      {
        path:
          "pnpm-lock.yaml",
        content:
          "lockfileVersion: '9.0'\n",
      },
    ],
  };
}

describe(
  "trusted Build executor contract",
  () => {
    it(
      "accepts the narrow lock-bootstrap request shape",
      () => {
        expect(
          parseTrustedBuildJobRequest(
            bootstrapRequest(),
          ),
        ).toMatchObject({
          protocolVersion: 1,
          operation:
            "dependency-lock-bootstrap",
          buildProjectId:
            "build_1",
          sourceVersion: 2,
          stackId:
            "react-vite-v1",
          templateId:
            "react-vite-v1",
        });
      },
    );

    it(
      "accepts the narrow production-build request shape",
      () => {
        expect(
          parseTrustedBuildJobRequest(
            productionRequest(),
          ),
        ).toMatchObject({
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
        });
      },
    );

    it(
      "rejects command, shell, cwd, env, network, image, and argv fields for every trusted operation",
      () => {
        for (
          const base of [
            bootstrapRequest(),
            productionRequest(),
          ]
        ) {
          for (
            const key of [
              "command",
              "argv",
              "shell",
              "cwd",
              "env",
              "network",
              "image",
            ]
          ) {
            expect(
              () =>
                parseTrustedBuildJobRequest({
                  ...base,
                  [key]:
                    "not-allowed",
                }),
            ).toThrow(
              BuildExecutorContractError,
            );
          }
        }
      },
    );

    it(
      "rejects traversal and duplicate paths",
      () => {
        expect(
          () =>
            parseTrustedBuildJobRequest({
              ...bootstrapRequest(),
              files: [
                ...bootstrapRequest()
                  .files,
                {
                  path:
                    "../escape.txt",
                  content: "x",
                },
              ],
            }),
        ).toThrow(
          /unsafe executor file path/i,
        );

        expect(
          () =>
            parseTrustedBuildJobRequest({
              ...bootstrapRequest(),
              files: [
                {
                  path:
                    "package.json",
                  content: "{}",
                },
                {
                  path:
                    "PACKAGE.JSON",
                  content: "{}",
                },
              ],
            }),
        ).toThrow(
          /duplicate executor file path/i,
        );
      },
    );

    it(
      "requires opposite lockfile states for bootstrap and production build",
      () => {
        expect(
          () =>
            parseTrustedBuildJobRequest({
              ...bootstrapRequest(),
              files: [
                ...bootstrapRequest()
                  .files,
                {
                  path:
                    "pnpm-lock.yaml",
                  content:
                    "lockfileVersion: '9.0'",
                },
              ],
            }),
        ).toThrow(
          /requires pnpm-lock\.yaml to be absent/i,
        );

        expect(
          () =>
            parseTrustedBuildJobRequest({
              ...productionRequest(),
              files:
                bootstrapRequest()
                  .files,
            }),
        ).toThrow(
          /requires a non-empty pnpm-lock\.yaml/i,
        );
      },
    );
  },
);
