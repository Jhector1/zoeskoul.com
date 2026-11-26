import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type VerityResult =
  | { status: "ok"; tree: { digest: string; bytes: number; files: number } }
  | { status: "unsupported" }
  | { status: "invalid"; code?: string };

const run = promisify(execFile);
// The existing Runner Dockerfile installs Python 3 and COPYs the repo into
// /app. -I isolates interpreter imports; -B avoids writable bytecode caches.
const HELPER = "/app/apps/runner/src/services/build/previewDependencyVerity.py";

export async function attestVerityTree(root: string, key: string,
  mode: "seal" | "verify"): Promise<VerityResult> {
  if (process.platform !== "linux") return { status: mode === "seal" ? "unsupported" : "invalid" };
  try {
    const { stdout } = await run("/usr/bin/python3", ["-I", "-B", HELPER, mode, root, key], {
      env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" },
      timeout: 600_000, killSignal: "SIGKILL", maxBuffer: 4096,
    });
    const parsed = JSON.parse(stdout) as VerityResult;
    if (parsed.status === "unsupported" && mode === "seal") return parsed;
    if (parsed.status === "ok" && /^[a-f0-9]{64}$/.test(parsed.tree.digest) &&
        typeof parsed.tree.digest === "string" &&
        Number.isSafeInteger(parsed.tree.bytes) && parsed.tree.bytes >= 0 && parsed.tree.bytes <= 640 * 1024 * 1024 &&
        Number.isSafeInteger(parsed.tree.files) && parsed.tree.files >= 0 && parsed.tree.files <= 60_000) return parsed;
  } catch (error: unknown) {
    // The helper exits nonzero on failure. Retain only a bounded diagnostic
    // code from its JSON output; never print subprocess stderr or paths.
    if (typeof error === "object" && error !== null && "stdout" in error &&
        typeof error.stdout === "string" && error.stdout.length <= 4096) {
      try {
        const failure = JSON.parse(error.stdout);
        if (failure?.status === "invalid" && typeof failure.code === "string" &&
            /^(?:KERNEL_[A-Z0-9_]{1,24}|INTEGRITY_CHECK_FAILED)$/.test(failure.code))
          return { status: "invalid", code: failure.code };
      } catch { /* Malformed output remains invalid. */ }
    }
  }
  return { status: "invalid" };
}
