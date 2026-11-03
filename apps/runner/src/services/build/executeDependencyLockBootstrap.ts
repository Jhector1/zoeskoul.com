import fs from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";

import type {
  DependencyLockBootstrapExecutionResponseV1,
  DependencyLockBootstrapJobRequestV1,
} from "@zoeskoul/build-executor-contracts";
import { assertRegisteredDependencyBootstrapFiles } from "@zoeskoul/build-preparation";

import { docker } from "../docker/dockerClient.js";
import { env } from "../../lib/env.js";
import { readPersistedBootstrapLock, persistBootstrapLock } from "./bootstrapPersistentLockCache.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { resolveTrustedBuildOperation } from "./trustedBuildOperations.js";
import { trustedRuntimeCommandEnv } from "./runtimeCommandEnv.js";
import { workspaceRuntimeEnvironment } from "../workspace/workspaceFilesystemPolicy.js";
import { trustedPnpmWorkspaceEnvironment } from "./trustedPnpmWorkspaceEnvironment.js";
import { bootstrapLockCacheKey, resolveBootstrapLockOnce } from "./dependencyLockBootstrapCache.js";
import { reportTrustedBuildFailure } from "./trustedBuildFailureDiagnostics.js";
import { startTrustedInstallProgressDiagnostics } from "./trustedInstallProgressDiagnostics.js";
export { classifyTrustedBuildFailure as classifyDependencyBootstrapFailure } from "./trustedBuildFailureDiagnostics.js";

const MAX_LOCKFILE_BYTES = 2 * 1024 * 1024;
const BOOTSTRAP_TIMEOUT_MS = 240_000; // bounded cold fallback; measured healthy runs exceed 100 seconds

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
      "RUNNER_EXEC_MODE=oneshot",
      ...workspaceRuntimeEnvironment(),
      ...trustedPnpmWorkspaceEnvironment(),
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

  // Cache only verified successful lockfile outputs and only for the SAME
  // owned project + exact file bytes + trusted command + runtime image.
  // No request sourceVersion in the key: history restores advance the CAS
  // token without changing the package inputs. The caller still revalidates
  // ownership and the source-version fence on every request.
  const sandboxImage = resolveSandboxProfile("build-bootstrap").image;
  // A moving :prod image tag cannot validate a persistent result. Query the
  // actual immutable image ID, as the preview installed-dependency cache does.
  // If Docker inspection fails, retain safe in-process coalescing but NEVER
  // use the on-disk cache for that request.
  const imageId = await docker.getImage(sandboxImage).inspect()
    .then(image => typeof image.Id === "string" && /^sha256:[a-f0-9]{64}$/.test(image.Id)
      ? image.Id : null)
    .catch(() => null);
  const cacheKey = bootstrapLockCacheKey({
    projectId: request.buildProjectId,
    files: request.files,
    command: plan.command,
    image: imageId ?? sandboxImage,
  });
  let persistentHit = false;
  const resolved = await resolveBootstrapLockOnce(cacheKey, async () => {
    if (imageId) {
      const persisted = await readPersistedBootstrapLock(env.workspaceRoot, cacheKey);
      if (persisted !== null) {
        persistentHit = true;
        return persisted;
      }
    }
    const startedAt = Date.now();
    const workspaceDir = await createWorkspace(
      request.files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
    );

    let container: Awaited<ReturnType<typeof docker.createContainer>> | null =
      null;
    let progressMonitor: ReturnType<typeof startTrustedInstallProgressDiagnostics> | null = null;

    try {
      // createWorkspace already normalized the initial, dependency-free tree.
      // No duplicate recursive chmod before a trusted one-shot container.
      container = await docker.createContainer(
        buildDependencyLockBootstrapContainerOptions({
          workspaceDir,
          command: plan.command,
        }),
      );

      await container.start();
      progressMonitor = startTrustedInstallProgressDiagnostics({
        container, workspaceDir, stage: "bootstrap",
      });
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
      console.info("RUNNER trusted dependency bootstrap completed", {
        elapsedMs: Date.now() - startedAt,
        lockBytes: Buffer.byteLength(content, "utf8"),
      });
      if (imageId) {
        const stored = await persistBootstrapLock(env.workspaceRoot, cacheKey, content);
        console.info("RUNNER trusted dependency bootstrap persistent cache", {
          mode: stored ? "stored" : "skipped",
        });
      }
      return content;
    } catch (error) {
      await progressMonitor?.captureFailure().catch(() => undefined);
      await reportTrustedBuildFailure({
        container, stage: "bootstrap", elapsedMs: Date.now() - startedAt,
        timedOut: error instanceof Error && error.message.includes("bootstrap exceeded"),
      }).catch(() => undefined);
      throw error;
    } finally {
      await progressMonitor?.stop().catch(() => undefined);
      if (container) {
        await container.remove({ force: true }).catch(() => undefined);
      }

      await fs.rm(workspaceDir, {
        recursive: true,
        force: true,
      });
    }
  });
  console.info("RUNNER trusted dependency bootstrap cache", {
    mode: resolved.mode === "resolved" && persistentHit ? "persistent-hit" : resolved.mode,
  });
  return {
    ok: true,
    result: {
      protocolVersion: request.protocolVersion,
      operation: "dependency-lock-bootstrap",
      buildProjectId: request.buildProjectId,
      sourceVersion: request.sourceVersion,
      output: { path: "pnpm-lock.yaml", content: resolved.lock },
    },
  };
}
