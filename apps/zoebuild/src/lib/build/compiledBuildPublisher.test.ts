import {
  createHash,
} from "node:crypto";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CompiledBuildPublishError,
  validateProductionBuildExecutionArtifact,
} from "./compiledBuildPublisher";

function fixture() {
  const raw = [
    {
      path:
        "assets/app.bin",
      bytes:
        Buffer.from([
          0,
          255,
          10,
        ]),
    },

    {
      path:
        "index.html",
      bytes:
        Buffer.from(
          "<h1>Hello</h1>",
          "utf8",
        ),
    },
  ].sort(
    (a, b) =>
      a.path.localeCompare(
        b.path,
      ),
  );

  const digest =
    createHash(
      "sha256",
    );

  let totalBytes = 0;

  for (
    const file of raw
  ) {
    totalBytes +=
      file.bytes.byteLength;

    digest.update(
      file.path,
      "utf8",
    );

    digest.update(
      Buffer.from([
        0,
      ]),
    );

    digest.update(
      file.bytes,
    );

    digest.update(
      Buffer.from([
        0,
      ]),
    );
  }

  return {
    ok: true as const,

    result: {
      protocolVersion:
        1 as const,

      operation:
        "production-build" as const,

      buildProjectId:
        "build_1",

      sourceVersion:
        4,

      artifact: {
        type:
          "static-directory" as const,

        outputPath:
          "dist" as const,

        totalBytes,

        sha256:
          digest.digest(
            "hex",
          ),

        files:
          raw.map(
            (file) => ({
              path:
                file.path,

              encoding:
                "base64" as const,

              data:
                file.bytes
                  .toString(
                    "base64",
                  ),
            }),
          ),
      },
    },
  };
}

describe(
  "ZoeBuild compiled artifact validation",
  () => {
    it(
      "revalidates identity, binary bytes, totals and sha256",
      () => {
        const validated =
          validateProductionBuildExecutionArtifact({
            buildProjectId:
              "build_1",

            sourceVersion:
              4,

            execution:
              fixture(),
          });

        expect(
          validated.artifactHash,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          validated.files.map(
            (file) =>
              file.path,
          ),
        ).toEqual([
          "assets/app.bin",
          "index.html",
        ]);

        expect(
          Array.from(
            validated.files[0]
              ?.bytes ??
              [],
          ),
        ).toEqual([
          0,
          255,
          10,
        ]);

        expect(
          validated.files.every(
            (file) =>
              file.bytes.buffer instanceof
              ArrayBuffer,
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects stale runner results",
      () => {
        expect(
          () =>
            validateProductionBuildExecutionArtifact({
              buildProjectId:
                "build_1",

              sourceVersion:
                5,

              execution:
                fixture(),
            }),
        ).toThrow(
          CompiledBuildPublishError,
        );
      },
    );

    it(
      "rejects path traversal before persistence",
      () => {
        const execution =
          fixture();

        const mutated = {
          ...execution,

          result: {
            ...execution.result,

            artifact: {
              ...execution
                .result
                .artifact,

              files:
                execution
                  .result
                  .artifact
                  .files
                  .map(
                    (
                      file,
                      index,
                    ) =>
                      index ===
                      0
                        ? {
                            ...file,

                            path:
                              "../escape.bin",
                          }
                        : file,
                  ),
            },
          },
        };

        expect(
          () =>
            validateProductionBuildExecutionArtifact({
              buildProjectId:
                "build_1",

              sourceVersion:
                4,

              execution:
                mutated,
            }),
        ).toThrow(
          /unsafe file path/i,
        );
      },
    );

    it(
      "rejects tampered build output hashes",
      () => {
        const execution =
          fixture();

        expect(
          () =>
            validateProductionBuildExecutionArtifact({
              buildProjectId:
                "build_1",

              sourceVersion:
                4,

              execution: {
                ...execution,

                result: {
                  ...execution.result,

                  artifact: {
                    ...execution
                      .result
                      .artifact,

                    sha256:
                      "0".repeat(
                        64,
                      ),
                  },
                },
              },
            }),
        ).toThrow(
          /hash does not match/i,
        );
      },
    );

    it(
      "requires compiled index.html",
      () => {
        const execution =
          fixture();

        const onlyBinary =
          execution
            .result
            .artifact
            .files
            .filter(
              (file) =>
                file.path !==
                "index.html",
            );

        const binaryBytes =
          Buffer.from(
            onlyBinary[0]
              ?.data ??
              "",
            "base64",
          );

        const digest =
          createHash(
            "sha256",
          );

        digest.update(
          "assets/app.bin",
          "utf8",
        );

        digest.update(
          Buffer.from([
            0,
          ]),
        );

        digest.update(
          binaryBytes,
        );

        digest.update(
          Buffer.from([
            0,
          ]),
        );

        expect(
          () =>
            validateProductionBuildExecutionArtifact({
              buildProjectId:
                "build_1",

              sourceVersion:
                4,

              execution: {
                ...execution,

                result: {
                  ...execution.result,

                  artifact: {
                    ...execution
                      .result
                      .artifact,

                    totalBytes:
                      binaryBytes
                        .byteLength,

                    sha256:
                      digest.digest(
                        "hex",
                      ),

                    files:
                      onlyBinary,
                  },
                },
              },
            }),
        ).toThrow(
          /requires index\.html/i,
        );
      },
    );
  },
);
