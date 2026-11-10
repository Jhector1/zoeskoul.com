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
