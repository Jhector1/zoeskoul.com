import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import {
  PROJECT_DEPENDENCY_APPROVAL_PATH,
  assertNoUntrustedInstallControls,
  verifyProjectDependencies,
} from "@zoeskoul/build-preparation";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy.js";

/** Trusted service-authenticated Runner handoff. Never accept a user's claim
 * that packages are approved: verify the server HMAC against the exact saved
 * project ID, pinned manifest, and lockfile before starting untrusted code. */
export function authorizeTanstackPreviewSource(
  request: ProductionBuildJobRequestV1,
  secret: string | undefined = process.env.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET,
): void {
  assertTanstackWorkerBuildRequest(request);
  const files = new Map<string, string>();
  for (const file of request.files) {
    if (files.has(file.path)) throw new Error("Duplicate TanStack source file path.");
    files.set(file.path, file.content);
  }
  assertNoUntrustedInstallControls(files);
  const packageJson = files.get("package.json");
  const lockfile = files.get("pnpm-lock.yaml");
  const approval = files.get(PROJECT_DEPENDENCY_APPROVAL_PATH);
  if (!packageJson || !lockfile?.trim() || !approval?.trim()) {
    throw new Error("TanStack preview requires an approved frozen dependency lock.");
  }
  verifyProjectDependencies({
    projectId: request.buildProjectId,
    packageJson,
    lockfile,
    approval,
    secret,
  });
}

/** This is not a customer rollout switch. The operator must explicitly enable
 * the isolated test runtime after Ubuntu security acceptance; disabled by default. */
export function assertTanstackPreviewStartupEnabled(
  value: string | undefined = process.env.ZOEBUILD_TANSTACK_PREVIEW_START_ENABLED,
): void {
  if (value !== "true") throw new Error("TanStack preview startup is not activated on this Runner.");
}
