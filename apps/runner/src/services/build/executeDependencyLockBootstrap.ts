import fs from "node:fs/promises";
import path from "node:path";

import type {
  DependencyLockBootstrapExecutionResponseV1,
  DependencyLockBootstrapJobRequestV1,
} from "@zoeskoul/build-executor-contracts";
import { assertRegisteredDependencyBootstrapFiles } from "@zoeskoul/build-preparation";

import { docker } from "../docker/dockerClient.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { resolveTrustedBuildOperation } from "./trustedBuildOperations.js";
import { trustedRuntimeCommandEnv } from "./runtimeCommandEnv.js";

const MAX_LOCKFILE_BYTES = 2 * 1024 * 1024;
const BOOTSTRAP_TIMEOUT_MS = 120_000;

export type DependencyLockBootstrapContainerOptions = ReturnType<
  typeof buildDependencyLockBootstrapContainerOptions
>;

export function buildDependencyLockBootstrapContainerOptions(args: Readonly<{
  workspaceDir: string;
  command: readonly string[];
}>) {
  const sandboxProfile = resolveSandboxProfile("build-bootstrap");

  return {
    Image: sandboxProfile.image,
    Cmd: [...args.command],
    WorkingDir: "/workspace",
    User: sandboxProfile.user,
    AttachStdout: true,
    AttachStderr: true,
    AttachStdin: false,
    Tty: false,
    OpenStdin: false,
    StdinOnce: false,
    Labels: {
      "com.zoeskoul.runner": "true",
      "com.zoeskoul.runner.purpose": "build-bootstrap",
      "com.zoeskoul.runner.profile": sandboxProfile.id,
    },
    Env: [
      trustedRuntimeCommandEnv(args.command),
      "HOME=/tmp",
      "CI=1",
      "NPM_CONFIG_REGISTRY=https://registry.npmjs.org/",
      "npm_config_registry=https://registry.npmjs.org/",
    ],
    HostConfig: {
      Binds: [`${args.workspaceDir}:/workspace:rw`],
      NetworkMode: sandboxProfile.networkMode,
      ReadonlyRootfs: sandboxProfile.readonlyRootfs,
      Privileged: false,
      CapDrop: [...sandboxProfile.capDrop],
      SecurityOpt: [...sandboxProfile.securityOpt],
      Memory: sandboxProfile.memoryBytes,
      MemorySwap: sandboxProfile.memoryBytes,
      CpuPeriod: 100000,
      CpuQuota: sandboxProfile.cpuQuota,
      PidsLimit: sandboxProfile.pidsLimit,
      Tmpfs: { ...sandboxProfile.tmpfs },
    },
  };
}

async function waitForBootstrapContainer(
  container: { wait(): Promise<{ StatusCode?: number }> },
): Promise<{ StatusCode?: number }> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      container.wait(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `Trusted Build dependency-lock bootstrap exceeded ${BOOTSTRAP_TIMEOUT_MS}ms.`,
            ),
          );
        }, BOOTSTRAP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readLockfile(workspaceDir: string): Promise<string> {
  const lockfilePath = path.join(workspaceDir, "pnpm-lock.yaml");
  const stat = await fs.lstat(lockfilePath);

  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Trusted Build bootstrap did not produce a regular pnpm-lock.yaml.");
  }

  if (stat.size <= 0 || stat.size > MAX_LOCKFILE_BYTES) {
    throw new Error(
      `Trusted Build bootstrap lockfile size is invalid: ${stat.size} bytes.`,
    );
  }

  const content = await fs.readFile(lockfilePath, "utf8");
  if (!content.trim()) {
    throw new Error("Trusted Build bootstrap produced an empty pnpm-lock.yaml.");
  }

  return content;
}

/**
 * Execute the single trusted V300J Build operation.
 *
 * The request cannot supply argv, shell, image, cwd, env, network mode, Docker
 * settings, or output paths. Those are all resolved inside the runner.
 *
 * This is a one-shot non-interactive container. It is intentionally separate
 * from PTY/session creation and from the still-disabled generic Build sandbox.
 */
export async function executeDependencyLockBootstrap(
  request: DependencyLockBootstrapJobRequestV1,
): Promise<DependencyLockBootstrapExecutionResponseV1> {
  const plan = resolveTrustedBuildOperation(request);

  assertRegisteredDependencyBootstrapFiles({
    stackId: request.stackId,
    templateId: request.templateId,
    buildProjectId: request.buildProjectId,
    files: request.files,
  });

  const workspaceDir = await createWorkspace(
    request.files.map((file) => ({
      path: file.path,
      content: file.content,
    })),
  );

  let container: Awaited<ReturnType<typeof docker.createContainer>> | null =
    null;

  try {
    await ensureWorkspaceWritableForShellUser(workspaceDir);
    container = await docker.createContainer(
      buildDependencyLockBootstrapContainerOptions({
        workspaceDir,
        command: plan.command,
      }),
    );

    await container.start();
    const waitResult = await waitForBootstrapContainer(container);
    const statusCode =
      typeof waitResult.StatusCode === "number"
        ? waitResult.StatusCode
        : -1;

    if (statusCode !== 0) {
      throw new Error(
        `Trusted Build dependency-lock bootstrap failed with exit status ${statusCode}.`,
      );
    }

    const content = await readLockfile(workspaceDir);

    return {
      ok: true,
      result: {
        protocolVersion: request.protocolVersion,
        operation: "dependency-lock-bootstrap",
        buildProjectId: request.buildProjectId,
        sourceVersion: request.sourceVersion,
        output: {
          path: "pnpm-lock.yaml",
          content,
        },
      },
    };
  } finally {
    if (container) {
      await container.remove({ force: true }).catch(() => undefined);
    }

    await fs.rm(workspaceDir, {
      recursive: true,
      force: true,
    });
  }
}
