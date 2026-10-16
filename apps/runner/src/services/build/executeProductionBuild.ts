import {
  createHash,
} from "node:crypto";

import fs from "node:fs/promises";
import path from "node:path";

import {
  PRODUCTION_BUILD_ARTIFACT_LIMITS,
  type ProductionBuildArtifactFileV1,
  type ProductionBuildExecutionResponseV1,
  type ProductionBuildJobRequestV1,
} from "@zoeskoul/build-executor-contracts";

import {
  assertRegisteredProductionBuildFiles,
} from "@zoeskoul/build-preparation";

import {
  env,
} from "../../lib/env.js";

import {
  docker,
} from "../docker/dockerClient.js";

import {
  resolveSandboxProfile,
} from "../execution/sandboxProfile.js";

import {
  cleanupWorkspaceNow,
} from "../workspace/cleanupWorkspace.js";

import {
  createWorkspace,
} from "../workspace/createWorkspace.js";

import {
  ensureWorkspaceWritableForShellUser,
} from "../workspace/workspacePermissions.js";

import {
  resolveTrustedBuildOperation,
} from "./trustedBuildOperations.js";

type ProductionBuildStep =
  | "install"
  | "build";

export function buildProductionBuildContainerOptions(
  args: Readonly<{
    workspaceDir: string;
    command:
      readonly string[];
    step:
      ProductionBuildStep;
  }>,
) {
  const profile =
    resolveSandboxProfile(
      "build",
    );

  return {
    Image:
      profile.image,

    Cmd: [
      ...args.command,
    ],

    WorkingDir:
      "/workspace",

    User:
      profile.user,

    AttachStdout: true,
    AttachStderr: true,
    AttachStdin: false,
    Tty: false,
    OpenStdin: false,
    StdinOnce: false,

    Labels: {
      "com.zoeskoul.runner":
        "true",

      "com.zoeskoul.runner.purpose":
        "production-build",

      "com.zoeskoul.runner.profile":
        profile.id,

      "com.zoeskoul.runner.build-step":
        args.step,
    },

    Env: [
      "HOME=/tmp",
      "CI=1",
      "NPM_CONFIG_REGISTRY=https://registry.npmjs.org/",
      "npm_config_registry=https://registry.npmjs.org/",
    ],

    HostConfig: {
      Binds: [
        `${args.workspaceDir}:/workspace:rw`,
      ],

      NetworkMode:
        args.step ===
        "build"
          ? "none"
          : profile.networkMode,

      ReadonlyRootfs:
        profile.readonlyRootfs,

      Privileged:
        false,

      CapDrop: [
        ...profile.capDrop,
      ],

      SecurityOpt: [
        ...profile.securityOpt,
      ],

      Memory:
        profile.memoryBytes,

      MemorySwap:
        profile.memoryBytes,

      CpuPeriod:
        100000,

      CpuQuota:
        profile.cpuQuota,

      PidsLimit:
        profile.pidsLimit,

      Tmpfs: {
        ...profile.tmpfs,
      },
    },
  };
}

async function waitForBuildContainer(
  container: {
    wait():
      Promise<{
        StatusCode?: number;
      }>;
  },
  step:
    ProductionBuildStep,
): Promise<{
  StatusCode?: number;
}> {
  let timer:
    ReturnType<
      typeof setTimeout
    > | null =
      null;

  try {
    return await Promise.race([
      container.wait(),

      new Promise<never>(
        (
          _resolve,
          reject,
        ) => {
          timer =
            setTimeout(
              () => {
                reject(
                  new Error(
                    `Trusted production-build ${step} step exceeded ${env.buildStepTimeoutMs}ms.`,
                  ),
                );
              },

              env.buildStepTimeoutMs,
            );
        },
      ),
    ]);
  } finally {
    if (timer) {
      clearTimeout(
        timer,
      );
    }
  }
}

async function executeBuildStep(
  args: Readonly<{
    workspaceDir: string;
    command:
      readonly string[];
    step:
      ProductionBuildStep;
  }>,
): Promise<void> {
  const container =
    await docker
      .createContainer(
        buildProductionBuildContainerOptions(
          args,
        ),
      );

  try {
    await container.start();

    const result =
      await waitForBuildContainer(
        container,
        args.step,
      );

    const statusCode =
      typeof result
        .StatusCode ===
        "number"
        ? result.StatusCode
        : -1;

    if (
      statusCode !== 0
    ) {
      throw new Error(
        `Trusted production-build ${args.step} step failed with exit status ${statusCode}.`,
      );
    }
  } finally {
    await container
      .remove({
        force: true,
      })
      .catch(
        () => undefined,
      );
  }
}

function normalizedArtifactPath(
  root: string,
  absolute: string,
): string {
  const relative =
    path.relative(
      root,
      absolute,
    );

  if (
    !relative ||
    relative.startsWith(
      "..",
    ) ||
    path.isAbsolute(
      relative,
    )
  ) {
    throw new Error(
      "Trusted production build produced an unsafe artifact path.",
    );
  }

  return relative
    .split(
      path.sep,
    )
    .join("/");
}

export async function readProductionBuildArtifact(
  workspaceDir: string,
): Promise<
  Readonly<{
    type:
      "static-directory";
    outputPath:
      "dist";
    totalBytes:
      number;
    sha256:
      string;
    files:
      readonly ProductionBuildArtifactFileV1[];
  }>
> {
  const root =
    path.join(
      workspaceDir,
      "dist",
    );

  const rootStat =
    await fs.lstat(
      root,
    );

  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink()
  ) {
    throw new Error(
      "Trusted production build did not produce a regular dist directory.",
    );
  }

  const pending = [
    root,
  ];

  const rawFiles:
    Array<{
      path: string;
      bytes: Buffer;
    }> = [];

  let totalBytes = 0;

  while (
    pending.length
  ) {
    const directory =
      pending.pop();

    if (!directory) {
      break;
    }

    const entries =
      await fs.readdir(
        directory,
        {
          withFileTypes:
            true,
        },
      );

    for (
      const entry of
      entries
    ) {
      const absolute =
        path.join(
          directory,
          entry.name,
        );

      if (
        entry.isSymbolicLink()
      ) {
        throw new Error(
          "Trusted production build artifact cannot contain symbolic links.",
        );
      }

      if (
        entry.isDirectory()
      ) {
        pending.push(
          absolute,
        );

        continue;
      }

      if (
        !entry.isFile()
      ) {
        throw new Error(
          "Trusted production build artifact contains an unsupported filesystem entry.",
        );
      }

      const bytes =
        await fs.readFile(
          absolute,
        );

      if (
        bytes.byteLength >
        PRODUCTION_BUILD_ARTIFACT_LIMITS
          .fileBytes
      ) {
        throw new Error(
          "Trusted production build artifact exceeds the per-file byte limit.",
        );
      }

      totalBytes +=
        bytes.byteLength;

      if (
        totalBytes >
        PRODUCTION_BUILD_ARTIFACT_LIMITS
          .totalBytes
      ) {
        throw new Error(
          "Trusted production build artifact exceeds the total byte limit.",
        );
      }

      rawFiles.push({
        path:
          normalizedArtifactPath(
            root,
            absolute,
          ),

        bytes,
      });

      if (
        rawFiles.length >
        PRODUCTION_BUILD_ARTIFACT_LIMITS
          .files
      ) {
        throw new Error(
          "Trusted production build artifact exceeds the file-count limit.",
        );
      }
    }
  }

  rawFiles.sort(
    (a, b) =>
      a.path.localeCompare(
        b.path,
      ),
  );

  if (
    !rawFiles.some(
      (file) =>
        file.path ===
        "index.html",
    )
  ) {
    throw new Error(
      "Trusted production build artifact requires dist/index.html.",
    );
  }

  const digest =
    createHash(
      "sha256",
    );

  for (
    const file of
    rawFiles
  ) {
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
    type:
      "static-directory",

    outputPath:
      "dist",

    totalBytes,

    sha256:
      digest.digest(
        "hex",
      ),

    files:
      rawFiles.map(
        (file) => ({
          path:
            file.path,

          encoding:
            "base64" as const,

          data:
            file.bytes.toString(
              "base64",
            ),
        }),
      ),
  };
}

/**
 * Executes only the registered React/Vite production build.
 *
 * The request supplies source files and identity only. Commands, image,
 * environment, network policy, cwd, output path and Docker settings are all
 * runner-owned.
 *
 * Install and build run as two direct argv one-shot containers. No shell,
 * PTY, terminal session, or browser-provided command is involved.
 */
export async function executeProductionBuild(
  request:
    ProductionBuildJobRequestV1,
): Promise<
  ProductionBuildExecutionResponseV1
> {
  const plan =
    resolveTrustedBuildOperation(
      request,
    );

  assertRegisteredProductionBuildFiles({
    stackId:
      request.stackId,

    templateId:
      request.templateId,

    files:
      request.files,
  });

  const workspaceDir =
    await createWorkspace(
      request.files.map(
        (file) => ({
          path:
            file.path,

          content:
            file.content,
        }),
      ),
    );

  await ensureWorkspaceWritableForShellUser(
    workspaceDir,
  );

  try {
    await executeBuildStep({
      workspaceDir,

      command:
        plan.installCommand,

      step:
        "install",
    });

    await executeBuildStep({
      workspaceDir,

      command:
        plan.buildCommand,

      step:
        "build",
    });

    const artifact =
      await readProductionBuildArtifact(
        workspaceDir,
      );

    return {
      ok: true,

      result: {
        protocolVersion:
          request
            .protocolVersion,

        operation:
          "production-build",

        buildProjectId:
          request
            .buildProjectId,

        sourceVersion:
          request
            .sourceVersion,

        artifact,
      },
    };
  } finally {
    await cleanupWorkspaceNow(
      workspaceDir,
    );
  }
}
