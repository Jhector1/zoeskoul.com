import { createHash } from "node:crypto";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { PROJECT_DEPENDENCY_APPROVAL_PATH } from "@zoeskoul/build-preparation";
import { docker } from "../docker/dockerClient.js";
import { resolveSandboxProfile } from "../execution/sandboxProfile.js";

const IMMUTABLE_IMAGE_ID = /^sha256:[a-f0-9]{64}$/;

export type TanstackPreviewIdentity = Readonly<{
  sourceFingerprint: string;
  dependencyFingerprint: string;
  runtimeImageId: string;
  fingerprint: string;
}>;

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalFiles(request: ProductionBuildJobRequestV1) {
  return [...request.files]
    .map(file => [file.path, file.content] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

/** Exact server-owned preview identity. The browser cannot choose any field.
 * Source and dependency hashes are content based; the runtime is the Docker
 * daemon's immutable image ID rather than a mutable deployment tag.
 */
export function createTanstackPreviewIdentity(
  request: ProductionBuildJobRequestV1,
  runtimeImageId: string,
): TanstackPreviewIdentity {
  if (!IMMUTABLE_IMAGE_ID.test(runtimeImageId)) {
    throw new Error("TanStack preview runtime image is not immutable.");
  }
  const files = canonicalFiles(request);
  const dependencies = files.filter(([pathname]) =>
    pathname === "package.json" ||
    pathname === "pnpm-lock.yaml" ||
    pathname === PROJECT_DEPENDENCY_APPROVAL_PATH);
  if (dependencies.length !== 3) {
    throw new Error("TanStack preview dependency identity is incomplete.");
  }
  const sourceFingerprint = hash(files);
  const dependencyFingerprint = hash(dependencies);
  return {
    sourceFingerprint,
    dependencyFingerprint,
    runtimeImageId,
    fingerprint: hash([
      "tanstack-preview-identity-v1",
      request.stackId,
      request.templateId,
      sourceFingerprint,
      dependencyFingerprint,
      runtimeImageId,
    ]),
  };
}

export async function resolveTanstackPreviewIdentity(
  request: ProductionBuildJobRequestV1,
): Promise<TanstackPreviewIdentity> {
  const configuredImage = resolveSandboxProfile("build-preview-install").image;
  const runtimeImage = resolveSandboxProfile("build").image;
  if (configuredImage !== runtimeImage) {
    throw new Error("TanStack preview install and runtime images differ.");
  }
  const inspected = await docker.getImage(configuredImage).inspect();
  const runtimeImageId = typeof inspected.Id === "string" ? inspected.Id : "";
  return createTanstackPreviewIdentity(request, runtimeImageId);
}
