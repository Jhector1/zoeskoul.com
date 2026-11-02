import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { parseTrustedBuildJobRequest } from "@zoeskoul/build-executor-contracts";
import { assertNoUntrustedInstallControls, canonicalProjectDependencyManifest } from "@zoeskoul/build-preparation";

/** This is an operator maintenance test, NEVER a new preview admission route. */
export function assertOperatorCanaryEnvironment(values: NodeJS.ProcessEnv): void {
  if (values.RUNNER_EXECUTION_POOL !== "zoebuild" ||
      values.ZOEBUILD_P3B3_OPERATOR_CANARY !== "I_ACKNOWLEDGE_MAINTENANCE" ||
      values.ZOEBUILD_TANSTACK_PREVIEW_START_ENABLED === "true") {
    throw new Error("P3B3 canary requires isolated ZoeBuild maintenance mode with customer startup disabled.");
  }
  if (typeof values.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET !== "string" ||
      Buffer.byteLength(values.ZOEBUILD_DEPENDENCY_APPROVAL_SECRET, "utf8") < 32) {
    throw new Error("P3B3 requires the existing Runner dependency approval secret.");
  }
  if (!/^ghcr\.io\/[^\s]+\/zoeskoul-runtime@sha256:[0-9a-f]{64}$/.test(values.RUNNER_IMAGE ?? "")) {
    throw new Error("P3B3 requires an immutable ZoeBuild Runtime image.");
  }
}

const PINNED_DEPENDENCIES = {
  dependencies: {
    "@tanstack/react-router": "1.170.46",
    "@tanstack/react-start": "1.169.4",
    react: "19.2.3",
    "react-dom": "19.2.3",
  },
  devDependencies: {
    "@cloudflare/vite-plugin": "1.64.0",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.4",
    typescript: "6.0.3",
    vite: "8.1.5",
    wrangler: "4.156.1",
  },
} as const;

const REQUIRED_FILES = [
  "package.json", "vite.config.ts", "wrangler.jsonc", "tsconfig.json",
  "src/router.tsx", "src/routes/__root.tsx", "src/routes/index.tsx",
  "src/routes/about.tsx", "src/routes/api.health.ts",
  "src/functions/siteInfo.functions.ts", "src/server/siteInfo.server.ts",
] as const;

export type CanaryFile = Readonly<{ path: string; content: string }>;

export function validateOperatorCanarySource(value: unknown): CanaryFile[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid canary source bundle.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "files,format,templateId" ||
      input.format !== 1 || input.templateId !== "tanstack-start-v1") {
    throw new Error("Unsupported canary source bundle.");
  }
  const parsed = parseTrustedBuildJobRequest({
    protocolVersion: 1, operation: "production-build", buildProjectId: "canary-source-validation",
    sourceVersion: 1, stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
    files: [...(Array.isArray(input.files) ? input.files : []) , {path:"pnpm-lock.yaml",content:"canary-validation"}],
  });
  const files = parsed.files.filter(file => file.path !== "pnpm-lock.yaml");
  const values = new Map(files.map(file => [file.path, file.content]));
  if (values.has("pnpm-lock.yaml") || values.has("zoebuild-dependency-approval.json") ||
      files.length !== values.size) throw new Error("Canary source must not supply its own lock or approval.");
  assertNoUntrustedInstallControls(values);
  for (const required of REQUIRED_FILES) {
    if (!values.get(required)?.trim()) throw new Error(`Missing canonical canary file: ${required}`);
  }
  const packageJson = values.get("package.json")!;
  const actual = JSON.parse(canonicalProjectDependencyManifest(packageJson)) as Record<string, unknown>;
  const stable = (obj: Record<string, unknown>) => JSON.stringify(Object.entries(obj).sort(([a],[b]) => a.localeCompare(b)));
  for (const key of ["dependencies", "devDependencies"] as const) {
    if (stable((actual[key] ?? {}) as Record<string, unknown>) !== stable(PINNED_DEPENDENCIES[key])) {
      throw new Error(`P3B3 source does not use the reviewed canonical ${key}.`);
    }
  }
  // Server functions, SSR and health route must be present in the reference source.
  if (!values.get("src/functions/siteInfo.functions.ts")!.includes("createServerFn") ||
      !values.get("src/routes/api.health.ts")!.includes("GET:")) {
    throw new Error("P3B3 source is missing the expected server-side canary operations.");
  }
  return files;
}

export function canaryBuildRequest(projectId: string, files: CanaryFile[]): ProductionBuildJobRequestV1 {
  const value = parseTrustedBuildJobRequest({
    protocolVersion:1, operation:"production-build", buildProjectId: projectId,
    sourceVersion:1, stackId:"tanstack-start-v1", templateId:"tanstack-start-v1", files,
  });
  if (value.operation !== "production-build") throw new Error("Incorrect canary operation.");
  return value;
}
