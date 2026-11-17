/** Dedicated rootless, disposable administrative sandbox — never a host bind. */
import type Docker from "dockerode";
import { AdminGrantError } from "./learningAdminGrant.js";

export const adminHostConfig = {
  NetworkMode: "none",
  ReadonlyRootfs: false, // Only container-local overlay; useradd modifies its private /etc.
  CapDrop: ["ALL"],
  CapAdd: ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"],
  Memory: 192 * 1024 * 1024,
  MemorySwap: 192 * 1024 * 1024,
  CpuPeriod: 100000,
  CpuQuota: 50000,
  PidsLimit: 48,
  AutoRemove: true,
  // Intentional: do not set no-new-privileges for this isolated setuid lab.
  // It cannot be used on the ordinary Learning profile.
  Tmpfs: {
    "/tmp": "rw,nodev,nosuid,size=8m,mode=1777",
  },
};

/** Production root labs have NO network until a separately enforced egress
 * boundary exists. The default Docker bridge is NOT a tenant firewall.
 * A deliberately acknowledged development-only override preserves supervised
 * apt/curl testing on a dedicated rootless VM, never production readiness. */
export function adminLabNetworkMode(
  configuration: NodeJS.ProcessEnv = process.env,
): "none" | "bridge" {
  const tier = configuration.ZOESKOUL_LEARNING_ADMIN_LAB_DEPLOYMENT_MODE ?? "production";
  if (tier !== "production" && tier !== "development") {
    throw new AdminGrantError(503, "Invalid administrator lab deployment mode.");
  }
  const outbound = configuration.ZOESKOUL_LEARNING_ADMIN_LAB_OUTBOUND_NETWORK;
  if (outbound === undefined || outbound === "false") return "none";
  if (outbound !== "true") {
    throw new AdminGrantError(503, "Invalid administrator lab network setting.");
  }
  if (tier !== "development" ||
      configuration.ZOESKOUL_LEARNING_ADMIN_LAB_DEV_BRIDGE_ACK !== "UNFILTERED_DEV_BRIDGE_ONLY") {
    throw new AdminGrantError(503, "Unfiltered bridge networking is forbidden for production administrator labs.");
  }
  return "bridge";
}

export function adminHostConfigForLab() {
  return { ...adminHostConfig, NetworkMode: adminLabNetworkMode() };
}

/** A bounded per-file limit for apt package indexes in the disposable admin lab.
 * Ordinary learner sessions keep their existing workspace-derived hard limit.
 * This does not increase workspace tmpfs, cgroup memory, or host access. */
export function adminLabFileWriteLimitBytes(
  labMode: "standard" | "admin",
  standardWorkspaceLimitBytes: number,
): number {
  return labMode === "admin" ? 64 * 1024 * 1024 : standardWorkspaceLimitBytes;
}

export async function verifyAdminSandboxImage(client: Docker, image: string) {
  const info = await client.info();
  const opts = (info.SecurityOptions ?? []).map(String);
  if (!opts.includes("name=rootless") ||
      !info.DockerRootDir || info.DockerRootDir === "/var/lib/docker") {
    throw new AdminGrantError(503, "Admin labs require a verified rootless Docker executor.");
  }
  const inspect = await client.getImage(image).inspect();
  if (inspect.Id !== image || inspect.Config?.Labels?.["com.zoeskoul.learning.admin-lab"] !== "true") {
    throw new AdminGrantError(503, "Untrusted administrative lab image.");
  }
  return true;
}
