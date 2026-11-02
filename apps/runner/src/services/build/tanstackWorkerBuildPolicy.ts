import { parseTrustedBuildJobRequest, type ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";

export function assertTanstackWorkerBuildRequest(
  request: ProductionBuildJobRequestV1,
): void {
  const parsed = parseTrustedBuildJobRequest(request);
  if (parsed.operation !== "production-build" ||
    parsed.stackId !== "tanstack-start-v1" ||
    parsed.templateId !== "tanstack-start-v1") {
    throw new Error("TanStack Worker build requires the canonical registered stack.");
  }
  const files = new Map(request.files.map((file) => [file.path, file.content]));
  for (const required of ["package.json", "pnpm-lock.yaml", "vite.config.ts",
    "wrangler.jsonc", "src/router.tsx", "src/routes/__root.tsx"]) {
    if (!files.get(required)?.trim()) {
      throw new Error(`TanStack Worker build is missing required source: ${required}.`);
    }
  }
  let manifest: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(files.get("package.json")!);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    manifest = value as Record<string, unknown>;
  } catch { throw new Error("TanStack Worker package manifest is invalid."); }
  const scripts = manifest.scripts as Record<string, unknown> | undefined;
  if (scripts?.build !== "vite build && tsc --noEmit" ||
    manifest.packageManager !== "pnpm@10.33.0") {
    throw new Error("TanStack Worker build requires the canonical scripts and package manager.");
  }
  // Registered versions and user dependencies remain governed by canonical
  // project dependency approval before this internal operation is activated.
}
