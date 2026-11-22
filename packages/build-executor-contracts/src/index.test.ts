import {
  BuildExecutorContractError,
  BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES,
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
      "tanstack-start-v1",
    templateId:
      "tanstack-start-v1",
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
    it("publishes the shared bounded HTTP request limit",()=>{
      expect(BUILD_EXECUTOR_HTTP_BODY_LIMIT_BYTES).toBe(8*1024*1024);
    });
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
            "tanstack-start-v1",
          templateId:
            "tanstack-start-v1",
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
            "tanstack-start-v1",
          templateId:
            "tanstack-start-v1",
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

describe("trusted TanStack managed image transport", () => {
  const image = {
    path: "public/pilot-red.png", encoding: "base64" as const,
    data: "YWJj", mimeType: "image/png" as const,
    sizeBytes: 3, checksum: `sha256:${"a".repeat(64)}`,
  };
  it("accepts bounded image bytes on production operations without touching the text files", () => {
    const parsed = parseTrustedBuildJobRequest({...productionRequest(), binaryFiles:[image]});
    expect(parsed.operation).toBe("production-build");
    if (parsed.operation === "production-build") {
      expect(parsed.binaryFiles).toEqual([image]);
      expect(parsed.files.find(file => file.path === "public/pilot-red.png")).toBeUndefined();
    }
  });
  it("rejects image bytes in dependency bootstrap and unsafe binary capabilities", () => {
    expect(() => parseTrustedBuildJobRequest({...bootstrapRequest(),binaryFiles:[image]})).toThrow(BuildExecutorContractError);
    for (const bad of [
      {...image,path:"../escape.png"},
      {...image,path:"public/readme.ts"},
      {...image,mimeType:"image/svg+xml"},
      {...image,sizeBytes:4},
      {...image,data:"not base64"},
      {...image,checksum:"sha256:"+"x".repeat(64)},
      {...image,encoding:"utf8"},
      {...image,objectKey:"private/secret"},
    ]) expect(() => parseTrustedBuildJobRequest({...productionRequest(),binaryFiles:[bad]})).toThrow(BuildExecutorContractError);
    expect(() => parseTrustedBuildJobRequest({...productionRequest(),binaryFiles:[image,{...image,path:"PUBLIC/PILOT-RED.PNG"}]}))
      .toThrow(BuildExecutorContractError);
    expect(() => parseTrustedBuildJobRequest({...productionRequest(),files:[...productionRequest().files,{path:image.path,content:""}],binaryFiles:[image]}))
      .toThrow(BuildExecutorContractError);
  });
  it("rejects malformed transport counts and over-limit images without object access", () => {
    expect(() => parseTrustedBuildJobRequest({...productionRequest(),binaryFiles:"wrong"})).toThrow(BuildExecutorContractError);
    const tooLarge={...image,data:"AAAA".repeat(1_747_627),sizeBytes:5_242_881};
    expect(() => parseTrustedBuildJobRequest({...productionRequest(),binaryFiles:[tooLarge]})).toThrow(BuildExecutorContractError);
    expect(() => parseTrustedBuildJobRequest({...productionRequest(),binaryFiles:[image,...Array.from({length:150},(_,i)=>({...image,path:`public/image-${i}.png`}))]}))
      .toThrow(BuildExecutorContractError);
  });
});
