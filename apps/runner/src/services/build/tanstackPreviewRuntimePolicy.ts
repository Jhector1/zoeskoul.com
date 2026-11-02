import type { TanstackPreviewTransportRequest } from "./tanstackPreviewHttpBoundary.js";

/** Canonical runtime argv. No user-supplied commands, ports or environment. */
export const TANSTACK_PREVIEW_DEV_COMMAND = [
  "pnpm", "exec", "vite", "dev", "--host", "127.0.0.1", "--port", "5173", "--strictPort",
] as const;
export const TANSTACK_PREVIEW_INSTALL_COMMAND = [
  "pnpm", "install", "--frozen-lockfile", "--ignore-scripts",
] as const;
export const TANSTACK_PREVIEW_READY_TIMEOUT_MS = 60_000;
export const TANSTACK_PREVIEW_PROBE_INTERVAL_MS = 800;

/** External capability and app-local route are different trust domains. */
export function tanstackInternalPreviewPath(basePath: string, request: TanstackPreviewTransportRequest): string {
  if (!/^\/api\/build\/projects\/[A-Za-z0-9_-]+\/preview\/[A-Za-z0-9_-]+\/content\/[A-Za-z0-9_-]{32}\/$/.test(basePath)) {
    throw new Error("Invalid preview base path.");
  }
  if (!request.path.startsWith(basePath)) throw new Error("Preview capability mismatch.");
  const relative = request.path.slice(basePath.length);
  if (relative.startsWith("/") || relative.includes("#") || /[\\\u0000-\u001f\u007f]/.test(relative)) {
    throw new Error("Unsafe internal preview path.");
  }
  return relative.startsWith("?") ? `/${relative}` : `/${relative}`;
}

export function isTanstackSsrReady(response: Readonly<{
  status: number; headers: Readonly<Record<string, string>>; bodyBase64: string;
}>): boolean {
  if (response.status !== 200 || !/^text\/html(?:\s*;|$)/i.test(response.headers["content-type"] ?? "")) return false;
  if (response.bodyBase64.length > 6 * 1024 * 1024 * 4 / 3 + 16) return false;
  const body = Buffer.from(response.bodyBase64, "base64").toString("utf8");
  return /<html(?:\s|>)/i.test(body) && /<head(?:\s|>)/i.test(body) && /<body(?:\s|>)/i.test(body);
}

/** A full-stack preview may execute arbitrary user code. Fail closed on container escapes. */
export function assertTanstackSandboxOptions(options: Readonly<{
  Cmd?: readonly string[];
  User?: string;
  HostConfig?: {
    NetworkMode?: string;
    Privileged?: boolean;
    ReadonlyRootfs?: boolean;
    CpuQuota?: number;
    CpuPeriod?: number;
    CapDrop?: readonly string[];
    Memory?: number;
    MemorySwap?: number;
    PidsLimit?: number;
    Binds?: readonly string[];
    PortBindings?: unknown;
    SecurityOpt?: readonly string[];
  };
}>): void {
  const config = options.HostConfig;
  if (!config || config.NetworkMode !== "none" || config.Privileged !== false ||
      config.ReadonlyRootfs !== true ||
      !/^\d+:\d+$/.test(options.User ?? "") ||
      !Array.isArray(config.CapDrop) || !config.CapDrop.includes("ALL") ||
      !Number.isFinite(config.Memory) || (config.Memory ?? 0) <= 0 ||
      !Number.isFinite(config.PidsLimit) || (config.PidsLimit ?? 0) <= 0 ||
      !Number.isFinite(config.CpuQuota) || (config.CpuQuota ?? 0) <= 0 ||
      !Number.isFinite(config.CpuPeriod) || (config.CpuPeriod ?? 0) <= 0 ||
      config.MemorySwap !== config.Memory ||
      !Array.isArray(config.SecurityOpt) || config.SecurityOpt.length === 0 ||
      !Array.isArray(config.Binds) || config.Binds.length !== 1 ||
      !config.Binds[0].endsWith(":/workspace:rw") ||
      config.PortBindings !== undefined ||
      JSON.stringify(options.Cmd) !== JSON.stringify(TANSTACK_PREVIEW_DEV_COMMAND)) {
    throw new Error("Unsafe full-stack preview sandbox configuration.");
  }
}
