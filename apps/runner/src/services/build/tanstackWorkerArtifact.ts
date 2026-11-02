import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/** The generated server bundle is an executable artifact, never static hosting data. */
export const TANSTACK_WORKER_ARTIFACT_LIMITS = {
  files: 1000,
  fileBytes: 12 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
} as const;

export type TanstackWorkerArtifactV1 = Readonly<{
  type: "worker-bundle";
  serverOutputPath: "dist/server";
  assetsOutputPath: "dist/client";
  entrypoint: "index.js";
  sha256: string;
  totalBytes: number;
  files: readonly Readonly<{
    path: string;
    encoding: "base64";
    data: string;
  }>[];
}>;

function assertSafeBuildFile(relative: string): void {
  const parts = relative.split("/");
  if (!relative || parts.some((part) => !part || part === "." || part === "..") ||
    relative.includes("\\") || relative.includes("\0") ||
    parts.some((part) => /^\.env(?:\.|$)/i.test(part) ||
      /^\.dev\.vars(?:\.|$)/i.test(part))) {
    throw new Error("TanStack Worker artifact contains an unsafe path.");
  }
}

/**
 * Read a completed isolated build. Never follow symlinks or special files,
 * bound bytes before returning base64, and hash exact paths plus contents.
 * No deployment or Cloudflare account operation occurs here.
 */
export async function readTanstackWorkerArtifact(
  workspaceDir: string,
): Promise<TanstackWorkerArtifactV1> {
  const dist = path.join(workspaceDir, "dist");
  const distInfo = await fs.lstat(dist);
  if (!distInfo.isDirectory() || distInfo.isSymbolicLink()) {
    throw new Error("TanStack Worker build requires a regular dist directory.");
  }
  const collected: Array<{ path: string; data: Buffer }> = [];
  let totalBytes = 0;
  for (const output of ["server", "client"] as const) {
    const root = path.join(dist, output);
    const rootInfo = await fs.lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw new Error(`TanStack Worker build requires a regular dist/${output} directory.`);
    }
    const pending = [root];
    while (pending.length) {
      const directory = pending.pop()!;
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        const info = await fs.lstat(absolute);
        if (info.isSymbolicLink()) {
          throw new Error("TanStack Worker artifact must not include symlinks.");
        }
        if (info.isDirectory()) {
          pending.push(absolute);
          continue;
        }
        if (!info.isFile()) {
          throw new Error("TanStack Worker artifact contains an unsupported file type.");
        }
        const relative = `${output}/${path.relative(root, absolute).split(path.sep).join("/")}`;
        assertSafeBuildFile(relative);
        if (info.size > TANSTACK_WORKER_ARTIFACT_LIMITS.fileBytes ||
          totalBytes + info.size > TANSTACK_WORKER_ARTIFACT_LIMITS.totalBytes) {
          throw new Error("TanStack Worker artifact exceeds byte limits.");
        }
        if (collected.length >= TANSTACK_WORKER_ARTIFACT_LIMITS.files) {
          throw new Error("TanStack Worker artifact exceeds file-count limit.");
        }
        const data = await fs.readFile(absolute);
        if (data.byteLength !== info.size ||
          data.byteLength > TANSTACK_WORKER_ARTIFACT_LIMITS.fileBytes) {
          throw new Error("TanStack Worker artifact changed while being collected.");
        }
        totalBytes += data.byteLength;
        collected.push({ path: relative, data });
      }
    }
  }
  const serverEntry = collected.find((item) => item.path === "server/index.js");
  if (!serverEntry || !serverEntry.data.length) {
    throw new Error("TanStack Worker artifact is missing its executable server entrypoint.");
  }
  const wrangler = collected.find((item) => item.path === "server/wrangler.json");
  if (!wrangler) {
    throw new Error("TanStack Worker artifact is missing generated Wrangler metadata.");
  }
  try {
    const parsed = JSON.parse(wrangler.data.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
  } catch {
    throw new Error("TanStack Worker artifact has invalid Wrangler metadata.");
  }
  if (!collected.some((item) => item.path.startsWith("client/") && item.data.length)) {
    throw new Error("TanStack Worker artifact has no client assets.");
  }
  collected.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const hash = createHash("sha256");
  for (const item of collected) {
    hash.update(item.path, "utf8");
    hash.update("\0");
    hash.update(item.data);
    hash.update("\0");
  }
  return {
    type: "worker-bundle", serverOutputPath: "dist/server",
    assetsOutputPath: "dist/client", entrypoint: "index.js",
    sha256: hash.digest("hex"), totalBytes,
    files: collected.map((item) => ({
      path: item.path, encoding: "base64" as const, data: item.data.toString("base64"),
    })),
  };
}
