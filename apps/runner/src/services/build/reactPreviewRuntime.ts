import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import fs from "node:fs/promises";
import path from "node:path";

import type {
  ProductionBuildJobRequestV1,
} from "@zoeskoul/build-executor-contracts";

import {
  assertRegisteredProductionBuildFiles,
  resolveRegisteredReactPreviewServerPlan,
} from "@zoeskoul/build-preparation";

import {
  env,
} from "../../lib/env.js";
import { isValidReactPreviewReadyDocument } from "./reactPreviewReadiness.js";
import { PreviewProjectDrainRegistry } from "./reactPreviewProjectDrainPolicy.js";
import { ReactPreviewMutationCoordinator, assertNotStaleReactPreviewSource } from "./reactPreviewMutationCoordinator.js";
import { fetchPersistentPreviewHttp, stopPersistentPreviewHttp } from "./reactPreviewPersistentHttp.js";

import {
  docker,
} from "../docker/dockerClient.js";

import {
  countActiveSessionsForActor,
  countActiveSessionsGlobal,
} from "../sessions/sessionStore.js";

import {
  consumeStartToken,
} from "../sessions/startRateLimit.js";

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
  buildProductionBuildContainerOptions,
} from "./executeProductionBuild.js";
import {
  assertZoeBuildPreviewCapacity,
  ZOEBUILD_MAX_CONCURRENT_PREVIEWS,
} from "./zoeBuildPreviewCapacity.js";
import {
  PreviewStartCoordinator,
  choosePreviewsToReclaim,
} from "./reactPreviewResourceAdmission.js";

import {
  REACT_VITE_V1_PREBUILT_LOCK_SHA256,
  REACT_VITE_V1_PREBUILT_ROOT,
} from "./reactVitePrebuiltDependencies.js";

const PREVIEW_IDLE_MS =
  10 * 60_000;

const PREVIEW_HARD_LIFETIME_MS =
  60 * 60_000;

const PREVIEW_CLEANUP_INTERVAL_MS =
  30_000;

const PREVIEW_RESPONSE_MAX_BYTES =
  4 * 1024 * 1024;

const PREVIEW_START_TIMEOUT_MS =
  20_000;

const PREVIEW_START_CONNECTION_GRACE_MS =
  40_000;

const INSTALL_TIMEOUT_MS =
  3 * 60_000;

type PreviewSourceFile =
  ProductionBuildJobRequestV1[
    "files"
  ][number];

type MutablePreviewRecord = {
  id: string;
  ownerKey: string;
  buildProjectId: string;
  sourceVersion: number;
  containerId: string;
  workspaceDir: string;
  port: 5173;
  basePath: string;
  sourcePaths:
    Set<string>;
  dependencyFingerprint:
    string;
  createdAt: number;
  lastActivityAt: number;
};

const projectDrains = new PreviewProjectDrainRegistry();

// Serialize preview cold starts to prevent competing requests from consuming
// the sole preview slot before an earlier request has finished creating it.
// Admission is bounded; this never raises Docker limits or changes auth.
const previewStartCoordinator = new PreviewStartCoordinator(8, 75_000);
const inFlightPreviewStarts = new Map<string, Promise<Awaited<ReturnType<typeof startReactPreviewInternal>>>>();

const previewMutationCoordinator = new ReactPreviewMutationCoordinator();

const previews =
  new Map<
    string,
    MutablePreviewRecord
  >();

const pendingPreviewStartsByActor =
  new Map<string, number>();

// Coalesce cancellation and idle cleanup; capacity remains held until removal.
const pendingPreviewDestructions =
  new Map<string, Promise<void>>();

let pendingPreviewStartsGlobal =
  0;

function currentTime() {
  return Date.now();
}

function activePreviewCountForActor(
  ownerKey: string,
) {
  let count =
    pendingPreviewStartsByActor.get(
      ownerKey,
    ) ?? 0;

  for (
    const preview of
    previews.values()
  ) {
    if (
      preview.ownerKey ===
      ownerKey
    ) {
      count += 1;
    }
  }

  return count;
}

function reservePreviewCapacity(
  ownerKey: string,
) {
  const actorTotal =
    countActiveSessionsForActor(
      ownerKey,
    ) +
    activePreviewCountForActor(
      ownerKey,
    );

  if (
    actorTotal >=
    env.maxConcurrentPerActor
  ) {
    throw new Error(
      `Too many active sessions. Limit is ${env.maxConcurrentPerActor} per user.`,
    );
  }

  const globalTotal =
    countActiveSessionsGlobal() +
    previews.size +
    pendingPreviewStartsGlobal;

  if (
    globalTotal >=
    env.maxConcurrentGlobal
  ) {
    throw new Error(
      `Runner is busy. Global active session limit is ${env.maxConcurrentGlobal}.`,
    );
  }

  // Reserve no more than one ZoeBuild preview across pending and live states.
  // Each existing preview remains counted until its Docker cleanup finishes.
  assertZoeBuildPreviewCapacity(
    previews.size,
    pendingPreviewStartsGlobal,
  );

  pendingPreviewStartsByActor.set(
    ownerKey,
    (
      pendingPreviewStartsByActor.get(
        ownerKey,
      ) ?? 0
    ) + 1,
  );

  pendingPreviewStartsGlobal +=
    1;

  let released =
    false;

  return () => {
    if (released) {
      return;
    }

    released =
      true;

    const current =
      pendingPreviewStartsByActor.get(
        ownerKey,
      ) ?? 0;

    if (
      current <= 1
    ) {
      pendingPreviewStartsByActor.delete(
        ownerKey,
      );
    } else {
      pendingPreviewStartsByActor.set(
        ownerKey,
        current - 1,
      );
    }

    pendingPreviewStartsGlobal =
      Math.max(
        0,
        pendingPreviewStartsGlobal - 1,
      );
  };
}

/** Reclaim warm previews when another project actually needs the scarce slot.
 * Same-owner other-project previews can yield immediately. Other users'
 * recently accessed previews are protected from eviction.
 * Deletion remains owner-scoped and each Docker removal is verified.
 */
async function reclaimPreviewCapacity(ownerKey: string, buildProjectId: string): Promise<void> {
  await runReactPreviewCleanupSweep();
  const needsSlot = () =>
    previews.size + pendingPreviewStartsGlobal >= ZOEBUILD_MAX_CONCURRENT_PREVIEWS ||
    countActiveSessionsGlobal() + previews.size + pendingPreviewStartsGlobal >= env.maxConcurrentGlobal ||
    countActiveSessionsForActor(ownerKey) + activePreviewCountForActor(ownerKey) >= env.maxConcurrentPerActor;

  if (!needsSlot()) return;
  for (const record of choosePreviewsToReclaim(
    [...previews.values()], ownerKey, buildProjectId, currentTime(), 45_000,
  )) {
    if (!needsSlot()) break;
    await destroyPreview(record);
  }
}

function safePreviewBasePath(
  buildProjectId: string,
  previewId: string,
  publicAccessKey: string,
) {
  if (
    !/^[A-Za-z0-9_-]{32}$/.test(
      publicAccessKey,
    )
  ) {
    throw new Error(
      "Invalid preview capability.",
    );
  }

  return (
    `/api/build/projects/${encodeURIComponent(
      buildProjectId,
    )}` +
    `/preview/${encodeURIComponent(
      previewId,
    )}` +
    `/content/${encodeURIComponent(
      publicAccessKey,
    )}/`
  );
}

function sourceFileBytes(
  file:
    PreviewSourceFile,
): Buffer {
  const candidate =
    file as unknown as {
      content?: string;
      data?: string;
    };

  if (
    typeof candidate.content ===
    "string"
  ) {
    return Buffer.from(
      candidate.content,
      "utf8",
    );
  }

  if (
    typeof candidate.data ===
    "string"
  ) {
    return Buffer.from(
      candidate.data,
      "base64",
    );
  }

  throw new Error(
    "Trusted preview source file is invalid.",
  );
}

function dependencyFingerprint(
  files:
    readonly PreviewSourceFile[],
) {
  const digest =
    createHash(
      "sha256",
    );

  const dependencyFiles =
    [...files]
      .filter(
        (file) =>
          file.path ===
            "package.json" ||
          file.path ===
            "pnpm-lock.yaml",
      )
      .sort(
        (left, right) =>
          left.path.localeCompare(
            right.path,
          ),
      );

  for (
    const file of
    dependencyFiles
  ) {
    digest.update(
      file.path,
      "utf8",
    );

    digest.update(
      "\0",
      "utf8",
    );

    digest.update(
      sourceFileBytes(
        file,
      ),
    );

    digest.update(
      "\0",
      "utf8",
    );
  }

  return digest.digest(
    "hex",
  );
}

function requireOwnedPreview(
  previewId: string,
  ownerKey: string,
) {
  const preview =
    previews.get(
      previewId,
    );

  if (!preview) {
    throw new Error(
      "Preview not found.",
    );
  }

  if (
    preview.ownerKey !==
    ownerKey
  ) {
    throw new Error(
      "Forbidden.",
    );
  }

  preview.lastActivityAt =
    currentTime();

  return preview;
}

function safeWorkspacePath(
  workspaceDir: string,
  relPath: string,
) {
  if (
    relPath ===
      "node_modules" ||
    relPath.startsWith(
      "node_modules/",
    )
  ) {
    throw new Error(
      "Preview source cannot write node_modules.",
    );
  }

  const root =
    path.resolve(
      workspaceDir,
    );

  const absolute =
    path.resolve(
      root,
      relPath,
    );

  if (
    absolute !== root &&
    !absolute.startsWith(
      `${root}${path.sep}`,
    )
  ) {
    throw new Error(
      "Unsafe preview source path.",
    );
  }

  return absolute;
}

async function syncPreviewSourceFiles(
  record:
    MutablePreviewRecord,
  files:
    readonly PreviewSourceFile[],
) {
  const nextFingerprint =
    dependencyFingerprint(
      files,
    );

  if (
    nextFingerprint !==
    record.dependencyFingerprint
  ) {
    throw new Error(
      "Preview dependencies changed. Restart the preview.",
    );
  }

  const nextPaths =
    new Set(
      files.map(
        (file) =>
          file.path,
      ),
    );

  for (
    const oldPath of
    record.sourcePaths
  ) {
    if (
      nextPaths.has(
        oldPath,
      )
    ) {
      continue;
    }

    await fs.rm(
      safeWorkspacePath(
        record.workspaceDir,
        oldPath,
      ),
      {
        force: true,
      },
    );
  }

  for (
    const file of
    files
  ) {
    const absolute =
      safeWorkspacePath(
        record.workspaceDir,
        file.path,
      );

    const nextBytes = sourceFileBytes(file);
    const currentBytes = await fs.readFile(absolute).catch(() => null);
    if (currentBytes && currentBytes.equals(nextBytes)) {
      continue;
    }

    await fs.mkdir(
      path.dirname(
        absolute,
      ),
      {
        recursive: true,
      },
    );

    await fs.writeFile(
      absolute,
      sourceFileBytes(
        file,
      ),
    );
  }

  record.sourcePaths =
    nextPaths;

  await ensureWorkspaceWritableForShellUser(
    record.workspaceDir,
  );
}

async function waitForContainer(
  container:
    ReturnType<
      typeof docker.getContainer
    >,
  timeoutMs: number,
) {
  let timer:
    NodeJS.Timeout |
    null =
      null;

  try {
    return await Promise.race([
      container.wait(),

      new Promise<never>(
        (_resolve, reject) => {
          timer =
            setTimeout(
              () => {
                reject(
                  new Error(
                    "Trusted preview install timed out.",
                  ),
                );
              },
              timeoutMs,
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

const PREBUILT_RUNTIME_PROBE_TIMEOUT_MS =
  15_000;

let prebuiltReactViteRuntimeAvailable:
  Promise<boolean> |
  null =
    null;

function requestLockSha256(
  files:
    readonly PreviewSourceFile[],
): string | null {
  const lock =
    files.find(
      (file) =>
        file.path ===
        "pnpm-lock.yaml",
    );

  if (!lock) {
    return null;
  }

  return createHash(
    "sha256",
  )
    .update(
      sourceFileBytes(
        lock,
      ),
    )
    .digest(
      "hex",
    );
}

async function probePrebuiltReactViteRuntime(
  workspaceDir: string,
): Promise<boolean> {
  if (
    prebuiltReactViteRuntimeAvailable
  ) {
    return prebuiltReactViteRuntimeAvailable;
  }

  const probePromise =
    (async () => {
      const checkScript = [
        'const fs = require("node:fs");',
        'const root = "/opt/zoeskoul/react-vite-v1";',
        'const expected = process.argv[1];',
        'const actual = fs.readFileSync(`${root}/.lock-sha256`, "utf8").trim();',
        'if (actual !== expected) process.exit(2);',
        'fs.accessSync(`${root}/node_modules/.bin/vite`);',
        'fs.accessSync(`${root}/node_modules/.bin/tsc`);',
      ].join("");

      const options =
        buildProductionBuildContainerOptions({
          workspaceDir,
          command: [
            "node",
            "-e",
            checkScript,
            REACT_VITE_V1_PREBUILT_LOCK_SHA256,
          ],
          step:
            "build",
        });

      let container:
        Awaited<
          ReturnType<
            typeof docker.createContainer
          >
        > |
        null =
          null;

      try {
        container =
          await docker.createContainer(
            options,
          );

        await container.start();

        const result =
          await waitForContainer(
            container,
            PREBUILT_RUNTIME_PROBE_TIMEOUT_MS,
          );

        const available =
          result.StatusCode ===
          0;

        if (!available) {
          console.warn(
            "RUNNER React preview prebuilt runtime probe failed",
            {
              statusCode:
                result.StatusCode,
            },
          );
        }

        return available;
      } catch (error) {
        console.warn(
          "RUNNER React preview prebuilt runtime probe unavailable",
          {
            message:
              error instanceof Error
                ? error.message
                : String(error),
          },
        );

        return false;
      } finally {
        if (container) {
          await container
            .remove({
              force: true,
            })
            .catch(
              () => undefined,
            );
        }
      }
    })();

  prebuiltReactViteRuntimeAvailable =
    probePromise;

  const available =
    await probePromise;

  if (
    !available &&
    prebuiltReactViteRuntimeAvailable ===
      probePromise
  ) {
    // Cache successful verification, but never pin a transient cold-host probe
    // failure for the lifetime of the runner. The existing frozen-install
    // fallback remains fail-safe for this request; a later cold preview retries.
    prebuiltReactViteRuntimeAvailable =
      null;
  }

  return available;
}

async function preparePrebuiltReactViteDependencies(
  workspaceDir: string,
  files:
    readonly PreviewSourceFile[],
): Promise<boolean> {
  if (
    requestLockSha256(
      files,
    ) !==
    REACT_VITE_V1_PREBUILT_LOCK_SHA256
  ) {
    return false;
  }

  const nodeModulesPath =
    path.join(
      workspaceDir,
      "node_modules",
    );

  const existing =
    await fs
      .lstat(
        nodeModulesPath,
      )
      .catch(
        () => null,
      );

  if (existing) {
    return false;
  }

  if (
    !await probePrebuiltReactViteRuntime(
      workspaceDir,
    )
  ) {
    return false;
  }

  await fs.symlink(
    `${REACT_VITE_V1_PREBUILT_ROOT}/node_modules`,
    nodeModulesPath,
    "dir",
  );

  return true;
}

async function runInstall(
  workspaceDir: string,
  command:
    readonly string[],
) {
  const container =
    await docker.createContainer(
      buildProductionBuildContainerOptions({
        workspaceDir,
        command,
        step:
          "install",
      }),
    );

  try {
    await container.start();

    const result =
      await waitForContainer(
        container,
        INSTALL_TIMEOUT_MS,
      );

    if (
      result.StatusCode !==
      0
    ) {
      throw new Error(
        `Trusted React preview dependency install failed with exit status ${result.StatusCode}.`,
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

function normalizePreviewRequestPath(
  record:
    MutablePreviewRecord,
  input: string,
) {
  const raw =
    String(
      input ?? "",
    ).trim();

  if (
    !raw ||
    raw.length > 4096 ||
    raw.includes("\0") ||
    raw.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(
      raw,
    ) ||
    !raw.startsWith(
      record.basePath,
    )
  ) {
    throw new Error(
      "Unsafe preview request path.",
    );
  }

  return raw;
}

export async function fetchReactPreviewHttp(
  input: Readonly<{
    previewId: string;
    ownerKey: string;
    path: string;
    method:
      "GET" |
      "HEAD";
  }>,
) {
  const record =
    requireOwnedPreview(
      input.previewId,
      input.ownerKey,
    );

  const safePath =
    normalizePreviewRequestPath(
      record,
      input.path,
    );

  return fetchPersistentPreviewHttp(record.containerId, safePath, input.method);
}

/**
 * Read-only HTTP bridge for the browser-facing ZoeBuild preview proxy.
 *
 * The caller is still a service-authenticated ZoeBuild server request, but it
 * intentionally has no end-user actor cookie. Possession of the unguessable
 * capability path is the preview-content authorization boundary. Start/sync/
 * cancel remain actor-owned.
 */
export async function fetchReactPreviewHttpByCapability(
  input: Readonly<{
    previewId: string;
    path: string;
    method:
      "GET" |
      "HEAD";
  }>,
) {
  const record =
    previews.get(
      input.previewId,
    );

  if (!record) {
    throw new Error(
      "Preview not found.",
    );
  }

  // fetchReactPreviewHttp performs the canonical basePath check. basePath now
  // contains a 192-bit random capability segment, so preview id alone is not
  // sufficient to read content.
  return fetchReactPreviewHttp({
    previewId:
      input.previewId,
    ownerKey:
      record.ownerKey,
    path:
      input.path,
    method:
      input.method,
  });
}


/**
 * Resolve trusted preview identity from possession of the exact capability
 * path. The browser-supplied buildProjectId is never the authority.
 */
export function resolveReactPreviewContextByCapability(
  input: Readonly<{
    previewId: string;
    path: string;
  }>,
) {
  const record =
    previews.get(
      input.previewId,
    );

  if (!record) {
    throw new Error(
      "Preview not found.",
    );
  }

  // Reuse the same canonical basePath guard used by preview content fetches.
  normalizePreviewRequestPath(
    record,
    input.path,
  );

  record.lastActivityAt =
    currentTime();

  return {
    previewId:
      record.id,
    buildProjectId:
      record.buildProjectId,
    sourceVersion:
      record.sourceVersion,
  };
}

function isTransientPreviewStartupError(
  error: unknown,
) {
  if (!error) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  return (
    /ECONNREFUSED/i.test(message) ||
    /Connection refused/i.test(message) ||
    /ConnectionRefusedError/i.test(message)
  );
}

async function waitForPreviewReady(
  record:
    MutablePreviewRecord,
) {
  const startedAt =
    currentTime();

  const deadline =
    startedAt +
    PREVIEW_START_TIMEOUT_MS;

  const connectionGraceDeadline =
    deadline +
    PREVIEW_START_CONNECTION_GRACE_MS;

  let lastError:
    unknown =
      null;

  while (true) {
    const now =
      currentTime();

    const withinPrimaryDeadline =
      now < deadline;

    const withinConnectionGrace =
      now < connectionGraceDeadline &&
      isTransientPreviewStartupError(
        lastError,
      );

    if (
      !withinPrimaryDeadline &&
      !withinConnectionGrace
    ) {
      break;
    }

    const state =
      await docker
        .getContainer(
          record.containerId,
        )
        .inspect()
        .catch(
          () => null,
        );

    if (
      !state ||
      !state.State.Running
    ) {
      throw new Error(
        "Trusted React preview server exited before becoming ready.",
      );
    }

    try {
      const response =
        await fetchReactPreviewHttp({
          previewId:
            record.id,
          ownerKey:
            record.ownerKey,
          path:
            record.basePath,
          method:
            "GET",
        });

      if (isValidReactPreviewReadyDocument(response)) {
        console.info("RUNNER React preview readiness verified", {
          elapsedMs: currentTime() - startedAt,
          status: response.status,
        });
        return;
      }

      // Do not treat a 404, redirect or HTML error document as ready.
      // The editor and browser depend on this being a real Vite document.
      lastError = new Error(
        `Preview readiness invalid response (HTTP ${response.status}).`,
      );
    } catch (error) {
      lastError =
        error;
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          250,
        ),
    );
  }

  console.warn(
    "RUNNER React preview readiness deadline exceeded",
    {
      previewId:
        record.id,
      buildProjectId:
        record.buildProjectId,
      containerId:
        record.containerId,
      cause:
        isTransientPreviewStartupError(
          lastError,
        )
          ? "connection-refused"
          : "not-ready",
    },
  );

  throw new Error(
    "Trusted React preview server did not become ready.",
  );
}

async function destroyPreview(
  record: MutablePreviewRecord,
): Promise<void> {
  const existing = pendingPreviewDestructions.get(record.id);
  if (existing) {
    await existing;
    return;
  }

  stopPersistentPreviewHttp(record.containerId);
  // Do not drop the live-preview count before Docker removal: another start
  // must not overcommit CPU/memory while the previous container is stopping.
  const cleanup = (async () => {
    try {
      await docker.getContainer(record.containerId).remove({force: true});
    } catch (error) {
      // An already-removed container is safe, but a Docker outage must not
      // silently release the resource reservation and permit overcommit.
      if (!(typeof error === "object" && error !== null &&
            "statusCode" in error && error.statusCode === 404)) throw error;
    }
    await cleanupWorkspaceNow(record.workspaceDir);
    // The slot becomes free only after both operations succeed. On failure,
    // keep the record for the next cleanup sweep and refuse unsafe admission.
    previews.delete(record.id);
  })();

  pendingPreviewDestructions.set(record.id, cleanup);
  try {
    await cleanup;
  } finally {
    if (pendingPreviewDestructions.get(record.id) === cleanup) {
      pendingPreviewDestructions.delete(record.id);
    }
  }
}
async function reuseExistingProjectPreview(
  ownerKey: string,
  request:
    ProductionBuildJobRequestV1,
): Promise<MutablePreviewRecord | null> {
  const requestedFingerprint =
    dependencyFingerprint(
      request.files,
    );

  for (
    const preview of
    [...previews.values()]
  ) {
    if (
      preview.ownerKey !==
        ownerKey ||
      preview.buildProjectId !==
        request.buildProjectId
    ) {
      continue;
    }

    assertNotStaleReactPreviewSource(preview.sourceVersion, request.sourceVersion);
    if (
      preview.dependencyFingerprint !==
        requestedFingerprint
    ) {
      await destroyPreview(
        preview,
      );

      continue;
    }

    try {
      const state =
        await docker
          .getContainer(
            preview.containerId,
          )
          .inspect()
          .catch(
            () => null,
          );

      if (
        !state ||
        !state.State.Running
      ) {
        await destroyPreview(
          preview,
        );

        continue;
      }

      const response =
        await fetchReactPreviewHttp({
          previewId:
            preview.id,
          ownerKey,
          path:
            preview.basePath,
          method:
            "GET",
        });

      if (!isValidReactPreviewReadyDocument(response)) {
        await destroyPreview(
          preview,
        );

        continue;
      }

      await previewMutationCoordinator.run(preview.id, async () => {
        if (previews.get(preview.id) !== preview) throw new Error("Preview not found.");
        assertNotStaleReactPreviewSource(preview.sourceVersion, request.sourceVersion);
        await syncPreviewSourceFiles(preview,request.files);
        preview.sourceVersion=request.sourceVersion;
        preview.lastActivityAt=currentTime();
      });

      return preview;
    } catch (error) {
      if (error instanceof Error && error.message === "Preview source is stale.") throw error;
      await destroyPreview(preview);
    }
  }

  return null;
}

async function startReactPreviewInternal(
  input: Readonly<{
    ownerKey: string;
    request:
      ProductionBuildJobRequestV1;
  }>,
) {
  const {
    ownerKey,
    request,
  } = input;

  if (!ownerKey) {
    throw new Error(
      "Forbidden.",
    );
  }

  const plan =
    resolveRegisteredReactPreviewServerPlan({
      stackId:
        request.stackId,
      templateId:
        request.templateId,
    });

  assertRegisteredProductionBuildFiles({
    buildProjectId: request.buildProjectId,
    stackId:
      request.stackId,
    templateId:
      request.templateId,
    files:
      request.files,
  });

  consumeStartToken(
    ownerKey,
    "code",
  );

  const reusedPreview =
    await reuseExistingProjectPreview(
      ownerKey,
      request,
    );

  if (reusedPreview) {
    return {
      previewId:
        reusedPreview.id,
      buildProjectId:
        reusedPreview.buildProjectId,
      sourceVersion:
        reusedPreview.sourceVersion,
      basePath:
        reusedPreview.basePath,
      port:
        reusedPreview.port,
    };
  }

  // Reuse first; if still full, retire warm previews for a different
  // project before admission. Serial startup ensures no parallel eviction races.
  await reclaimPreviewCapacity(ownerKey, request.buildProjectId);
  const releaseCapacity =
    reservePreviewCapacity(
      ownerKey,
    );

  let workspaceDir:
    string |
    null =
      null;

  let containerId:
    string |
    null =
      null;

  const startTime = currentTime();
  const previewTimings = { workspaceMs: 0, dependenciesMs: 0, containerMs: 0, readinessMs: 0 };
  let phaseBeganAt = startTime;
  let startupStage = "workspace";
  try {
    workspaceDir =
      await createWorkspace(
        [...request.files],
      );

    await ensureWorkspaceWritableForShellUser(
      workspaceDir,
    );

    previewTimings.workspaceMs = currentTime() - phaseBeganAt;
    phaseBeganAt = currentTime();
    startupStage = "dependencies";
    const usingPrebuiltDependencies =
      await preparePrebuiltReactViteDependencies(
        workspaceDir,
        request.files,
      );

    if (!usingPrebuiltDependencies) {
      await runInstall(
        workspaceDir,
        plan.installCommand,
      );
    }

    console.log(
      "RUNNER React preview dependency mode",
      {
        buildProjectId:
          request.buildProjectId,
        mode:
          usingPrebuiltDependencies
            ? "prebuilt"
            : "frozen-install",
      },
    );

    const previewId =
      `preview_${randomUUID()}`;

    const publicAccessKey =
      randomBytes(
        24,
      ).toString(
        "base64url",
      );

    const basePath =
      safePreviewBasePath(
        request.buildProjectId,
        previewId,
        publicAccessKey,
      );

    const devCommand = [
      ...plan.devCommand,
      "--port",
      String(
        plan.port,
      ),
      "--strictPort",
      "--base",
      basePath,
    ];

    const options =
      buildProductionBuildContainerOptions({
        workspaceDir,
        command:
          devCommand,
        step:
          "build",
      });

    const viteTmpfsUser =
      /^(\d+):(\d+)$/.exec(
        options.User,
      );

    if (!viteTmpfsUser) {
      throw new Error(
        "Trusted React preview runtime user must be numeric UID:GID.",
      );
    }

    const viteTmpfsOwnership =
      `uid=${viteTmpfsUser[1]},gid=${viteTmpfsUser[2]},mode=0700`;

    previewTimings.dependenciesMs = currentTime() - phaseBeganAt;
    phaseBeganAt = currentTime();
    startupStage = "container";
    const container =
      await docker.createContainer({
        ...options,

        Labels: {
          ...options.Labels,

          "com.zoeskoul.runner.purpose":
            "react-vite-preview",

          "com.zoeskoul.runner.preview":
            previewId,
        },

        HostConfig: {
          ...options.HostConfig,

          // The immutable prebuilt node_modules layer lives on the read-only
          // runtime rootfs. Vite's transient optimizer/config caches get
          // per-preview tmpfs mounts instead of mutating that shared layer.
          Tmpfs: {
            ...options.HostConfig
              .Tmpfs,
            [`${REACT_VITE_V1_PREBUILT_ROOT}/node_modules/.vite`]:
              `rw,noexec,nosuid,size=64m,${viteTmpfsOwnership}`,
            [`${REACT_VITE_V1_PREBUILT_ROOT}/node_modules/.vite-temp`]:
              `rw,noexec,nosuid,size=32m,${viteTmpfsOwnership}`,
          },

          // No public preview port. The runner reaches Vite only through a
          // Docker exec inside this container and proxies bounded HTTP bytes.
          NetworkMode:
            "none",
        },
      });

    containerId =
      container.id;

    await container.start();

    const createdAt =
      currentTime();

    const record:
      MutablePreviewRecord = {
        id:
          previewId,
        ownerKey,
        buildProjectId:
          request.buildProjectId,
        sourceVersion:
          request.sourceVersion,
        containerId:
          container.id,
        workspaceDir,
        port:
          5173,
        basePath,
        sourcePaths:
          new Set(
            request.files.map(
              (file) =>
                file.path,
            ),
          ),
        dependencyFingerprint:
          dependencyFingerprint(
            request.files,
          ),
        createdAt,
        lastActivityAt:
          createdAt,
      };

    previews.set(
      previewId,
      record,
    );

    releaseCapacity();

    previewTimings.containerMs = currentTime() - phaseBeganAt;
    phaseBeganAt = currentTime();
    startupStage = "readiness";
    try {
      await waitForPreviewReady(
        record,
      );
    } catch (error) {
      await destroyPreview(
        record,
      );

      throw error;
    }

    previewTimings.readinessMs = currentTime() - phaseBeganAt;
    console.info("RUNNER React preview start timings", {
      ...previewTimings,
      totalMs: currentTime() - startTime,
      dependencyMode: usingPrebuiltDependencies ? "prebuilt" : "frozen-install",
    });
    return {
      previewId,
      buildProjectId:
        request.buildProjectId,
      sourceVersion:
        request.sourceVersion,
      basePath,
      port:
        5173 as const,
    };
  } catch (error) {
    // Diagnostic metadata only: no source, workspace paths, Docker logs,
    // capability tokens or secrets in structured startup events.
    console.warn("RUNNER React preview startup failed", {
      stage: startupStage,
      elapsedMs: currentTime() - startTime,
      category: startupStage === "readiness" ? "readiness" :
        startupStage === "dependencies" ? "dependencies" :
        startupStage === "container" ? "container" : "workspace",
    });
    releaseCapacity();

    if (
      containerId &&
      ![...previews.values()]
        .some(
          (preview) =>
            preview.containerId ===
            containerId,
        )
    ) {
      await docker
        .getContainer(
          containerId,
        )
        .remove({
          force: true,
        })
        .catch(
          () => undefined,
        );
    }

    if (workspaceDir) {
      await cleanupWorkspaceNow(
        workspaceDir,
      ).catch(
        () => undefined,
      );
    }

    throw error;
  }
}

/** Deduplicate identical source starts and serialize all other cold starts.
 * Never reuse a response for a different actor, project, revision, or source.
 */
export async function startReactPreview(
  input: Readonly<{ ownerKey: string; request: ProductionBuildJobRequestV1 }>,
) {
  const digest = createHash("sha256");
  digest.update(input.ownerKey);
  digest.update("\0");
  digest.update(input.request.buildProjectId);
  digest.update("\0");
  digest.update(String(input.request.sourceVersion));
  digest.update("\0");
  digest.update(String(input.request.stackId));
  digest.update("\0");
  digest.update(String(input.request.templateId));
  for (const file of input.request.files) {
    digest.update("\0");
    digest.update(file.path);
    digest.update("\0");
    digest.update(sourceFileBytes(file));
  }
  const key = digest.digest("hex");
  const existing = inFlightPreviewStarts.get(key);
  if (existing) return await existing;

  const task = previewStartCoordinator.run(async () => {
    const finish = projectDrains.beginStart(input.ownerKey, input.request.buildProjectId);
    try {
      return await startReactPreviewInternal(input);
    } finally {
      finish();
    }
  });
  inFlightPreviewStarts.set(key, task);
  try {
    return await task;
  } finally {
    if (inFlightPreviewStarts.get(key) === task) inFlightPreviewStarts.delete(key);
  }
}

/** Stop exactly this actor's previews and verify cleanup before allowing DB deletion. */
export async function drainReactPreviewsForProject(
  input: Readonly<{ ownerKey: string; buildProjectId: string }>,
) {
  const drainId = projectDrains.beginDrain(input.ownerKey, input.buildProjectId);
  let stoppedCount = 0;
  // On cleanup errors, leave the project blocked until the bounded lease expires.
  for (const preview of [...previews.values()]) {
    if (preview.ownerKey !== input.ownerKey || preview.buildProjectId !== input.buildProjectId) continue;
    await destroyPreview(preview);
    const isStillPresent = await docker.getContainer(preview.containerId)
      .inspect()
      .then(() => true, (error: unknown) => {
        if (typeof error === "object" && error !== null &&
            "statusCode" in error && error.statusCode === 404) return false;
        throw new Error("Preview container removal could not be verified.");
      });
    if (isStillPresent) throw new Error("Preview container removal could not be verified.");
    await fs.stat(preview.workspaceDir).then(
      () => { throw new Error("Preview workspace cleanup could not be verified."); },
      (error: unknown) => {
        if (typeof error === "object" && error !== null &&
            "code" in error && error.code === "ENOENT") return;
        throw new Error("Preview workspace cleanup could not be verified.");
      },
    );
    stoppedCount += 1;
  }
  return { ok: true as const, drainId, stoppedCount };
}

export function releaseReactPreviewProjectDrain(
  input: Readonly<{ ownerKey: string; buildProjectId: string; drainId: string }>,
) {
  return projectDrains.releaseDrain(input.ownerKey, input.buildProjectId, input.drainId);
}

export async function syncReactPreview(
  input: Readonly<{
    previewId: string;
    ownerKey: string;
    request: ProductionBuildJobRequestV1;
  }>,
) {
  return previewMutationCoordinator.run(input.previewId,async()=>{
    const record=requireOwnedPreview(input.previewId,input.ownerKey);
    projectDrains.assertNotDraining(input.ownerKey,input.request.buildProjectId);
    if(record.buildProjectId!==input.request.buildProjectId ||
       input.request.stackId!=="react-vite-v1" || input.request.templateId!=="react-vite-v1")
      throw new Error("Preview source identity does not match.");
    assertNotStaleReactPreviewSource(record.sourceVersion,input.request.sourceVersion);
    assertRegisteredProductionBuildFiles({buildProjectId:input.request.buildProjectId,
      stackId:input.request.stackId,templateId:input.request.templateId,files:input.request.files});
    await syncPreviewSourceFiles(record,input.request.files);
    record.sourceVersion=input.request.sourceVersion;
    record.lastActivityAt=currentTime();
    return {ok:true as const,previewId:record.id};
  });
}

export async function stopReactPreview(
  input: Readonly<{
    previewId: string;
    ownerKey: string;
  }>,
) {
  const record =
    requireOwnedPreview(
      input.previewId,
      input.ownerKey,
    );

  await destroyPreview(
    record,
  );

  return {
    ok:
      true as const,
  };
}

export async function runReactPreviewCleanupSweep(
  at =
    currentTime(),
) {
  for (
    const preview of
    [...previews.values()]
  ) {
    const idleFor =
      at -
      preview.lastActivityAt;

    const lifetime =
      at -
      preview.createdAt;

    if (
      idleFor >=
        PREVIEW_IDLE_MS ||
      lifetime >=
        PREVIEW_HARD_LIFETIME_MS
    ) {
      await destroyPreview(
        preview,
      );
    }
  }
}

const cleanupTimer =
  setInterval(
    () => {
      void runReactPreviewCleanupSweep()
        .catch(
          (error) => {
            console.error(
              "RUNNER React preview cleanup failed",
              {
                message:
                  error instanceof Error
                    ? error.message
                    : String(
                        error,
                      ),
              },
            );
          },
        );
    },
    PREVIEW_CLEANUP_INTERVAL_MS,
  );

if (
  typeof cleanupTimer.unref ===
  "function"
) {
  cleanupTimer.unref();
}

export function __resetReactPreviewsForTests() {
  previews.clear();
  inFlightPreviewStarts.clear();
  previewStartCoordinator.resetForTests();
  pendingPreviewStartsByActor.clear();
  projectDrains.reset();
  pendingPreviewStartsGlobal =
    0;
}
