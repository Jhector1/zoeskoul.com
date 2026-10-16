import { env } from "../../lib/env.js";

export const SANDBOX_PURPOSES = ["learn", "build", "build-bootstrap"] as const;
export type SandboxPurpose = (typeof SANDBOX_PURPOSES)[number];

export type SandboxProfile = Readonly<{
  id: string;
  image: string;
  user: string;
  networkMode: string;
  readonlyRootfs: true;
  capDrop: readonly ["ALL"];
  securityOpt: readonly ["no-new-privileges:true"];
  memoryBytes: number;
  cpuQuota: number;
  pidsLimit: number;
  tmpfs: Readonly<Record<string, string>>;
}>;

function learningProfile(): SandboxProfile {
  return {
    id: "learn-default-v1",
    image: env.runnerImage,
    user: `${env.execUid}:${env.execGid}`,
    networkMode: env.childNetwork,
    readonlyRootfs: true,
    capDrop: ["ALL"],
    securityOpt: ["no-new-privileges:true"],
    memoryBytes: env.memoryLimitBytes,
    cpuQuota: env.cpuQuota,
    pidsLimit: env.pidsLimit,
    tmpfs: {
      "/tmp": "rw,noexec,nosuid,size=64m",
      "/run": "rw,noexec,nosuid,size=16m",
    },
  };
}

function buildBootstrapProfile(): SandboxProfile {
  const base = learningProfile();

  return {
    ...base,
    id: "build-dependency-lock-bootstrap-v1",
    networkMode: "bridge",
    memoryBytes: Math.min(base.memoryBytes, 384 * 1024 * 1024),
    cpuQuota: Math.min(base.cpuQuota, 100000),
    pidsLimit: Math.min(base.pidsLimit, 96),
  };
}

function productionBuildProfile(): SandboxProfile {
  const base =
    learningProfile();

  return {
    ...base,
    id:
      "build-production-react-vite-v1",

    // Dependency installation needs registry access. The request cannot select
    // or override this policy.
    networkMode:
      "bridge",

    memoryBytes:
      env.buildMemoryLimitBytes,

    cpuQuota:
      env.buildCpuQuota,

    pidsLimit:
      env.buildPidsLimit,

    tmpfs: {
      ...base.tmpfs,
      "/tmp": "rw,noexec,nosuid,size=256m",
    },};
}

/**
 * Central runtime-policy boundary. Build execution intentionally fails closed
 * until a dedicated build profile is configured and validated; it must never
 * inherit broader privileges by accident.
 */
export function resolveSandboxProfile(purpose: SandboxPurpose): SandboxProfile {
  if (purpose === "learn") return learningProfile();
  if (purpose === "build-bootstrap") return buildBootstrapProfile();
  if (purpose === "build") return productionBuildProfile();

  throw new Error(
    "Sandbox profile is not configured.",
  );
}
