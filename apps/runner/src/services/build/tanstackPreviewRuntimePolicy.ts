import type { TanstackPreviewTransportRequest } from "./tanstackPreviewHttpBoundary.js";

/** Canonical runtime argv. No user-supplied commands, ports or environment. */
export const TANSTACK_PREVIEW_DEV_COMMAND = [
  "pnpm", "exec", "vite", "dev", "--host", "127.0.0.1", "--port", "5173", "--strictPort",
] as const;
export const TANSTACK_PREVIEW_INSTALL_COMMAND = [
  "pnpm", "install", "--frozen-lockfile", "--ignore-scripts",
] as const;
/** Only Runner-minted browser capability URLs may become Vite's public base.
 * Never accept a base from application source or an HTTP request parameter. */
export function tanstackPreviewDevCommand(basePath: string): readonly string[] {
  if (!/^\/api\/build\/projects\/[A-Za-z0-9_-]+\/preview\/preview_[a-f0-9-]+\/content\/[A-Za-z0-9_-]{32}\/$/.test(basePath)) {
    throw new Error("Invalid TanStack Vite public base.");
  }
  return [...TANSTACK_PREVIEW_DEV_COMMAND, "--base", basePath];
}

export const TANSTACK_PREVIEW_READY_TIMEOUT_MS = 60_000;
export const TANSTACK_PREVIEW_PROBE_INTERVAL_MS = 800;

/** External capability and app-local route are different trust domains. */
export function tanstackInternalPreviewPath(basePath: string, request: TanstackPreviewTransportRequest): string {
  if (!/^\/api\/build\/projects\/[A-Za-z0-9_-]+\/preview\/[A-Za-z0-9_-]+\/content\/[A-Za-z0-9_-]{32}\/$/.test(basePath)) {
    throw new Error("Invalid preview base path.");
  }
  if (!request.path.startsWith(basePath)) throw new Error("Preview capability mismatch.");
  // Vite is launched under this exact public base and strips it internally.
  // Do not strip here: /@id, /src and generated TanStack modules must all
  // have one consistent URL from browser through gateway to Vite.
  const relative = request.path.slice(basePath.length);
  if (relative.startsWith("/") || relative.includes("#") || /[\\\u0000-\u001f\u007f]/.test(relative)) {
    throw new Error("Unsafe internal preview path.");
  }
  return request.path;
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
  Env?: readonly string[];
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
    Tmpfs?: Readonly<Record<string, string>>;
    PortBindings?: unknown;
    SecurityOpt?: readonly string[];
  };
}>): void {
  const config = options.HostConfig;
  const dependencyBind = config?.Binds?.[1] ?? "";
  const cachedDependencies = dependencyBind !== "";
  const dependencyBindSafe = /^\/[^\r\n:]*\/\.zoebuild-preview-dependency-layers-v1\/[a-f0-9]{64}\/node_modules:\/workspace\/node_modules:ro$/.test(dependencyBind);
  const [sandboxUid, sandboxGid] = (options.User ?? "").split(":");
  const viteCacheSafe = config?.Tmpfs?.["/workspace/node_modules/.vite"] ===
      `rw,noexec,nosuid,nodev,size=64m,uid=${sandboxUid},gid=${sandboxGid},mode=0700` &&
    config?.Tmpfs?.["/workspace/node_modules/.vite-temp"] ===
      `rw,noexec,nosuid,nodev,size=16m,uid=${sandboxUid},gid=${sandboxGid},mode=0700`;
  const basePath = options.Cmd?.[TANSTACK_PREVIEW_DEV_COMMAND.length + 1] ?? "";
  const baseIsValid = (() => {
    try { return JSON.stringify(options.Cmd) === JSON.stringify(tanstackPreviewDevCommand(basePath)); }
    catch { return false; }
  })();
  if (!config || !baseIsValid ||
      !options.Env ||
      options.Env.filter(value => value.startsWith("ZOEBUILD_PREVIEW_BASE_PATH=")).length !== 1 ||
      !options.Env.includes(`ZOEBUILD_PREVIEW_BASE_PATH=${basePath}`) || config.NetworkMode !== "none" || config.Privileged !== false ||
      config.ReadonlyRootfs !== true ||
      !/^\d+:\d+$/.test(options.User ?? "") ||
      !Array.isArray(config.CapDrop) || !config.CapDrop.includes("ALL") ||
      !Number.isFinite(config.Memory) || (config.Memory ?? 0) <= 0 ||
      !Number.isFinite(config.PidsLimit) || (config.PidsLimit ?? 0) <= 0 ||
      !Number.isFinite(config.CpuQuota) || (config.CpuQuota ?? 0) <= 0 ||
      !Number.isFinite(config.CpuPeriod) || (config.CpuPeriod ?? 0) <= 0 ||
      config.MemorySwap !== config.Memory ||
      !Array.isArray(config.SecurityOpt) || config.SecurityOpt.length === 0 ||
      !Array.isArray(config.Binds) ||
      (config.Binds.length !== 1 && config.Binds.length !== 2) ||
      !/^\/[^\r\n:]+:\/workspace:rw$/.test(config.Binds[0]) ||
      (cachedDependencies && (!dependencyBindSafe || !viteCacheSafe)) ||
      (!cachedDependencies &&
        (config.Tmpfs?.["/workspace/node_modules/.vite"] !== undefined ||
         config.Tmpfs?.["/workspace/node_modules/.vite-temp"] !== undefined)) ||
      config.PortBindings !== undefined) {
    throw new Error("Unsafe full-stack preview sandbox configuration.");
  }
}
