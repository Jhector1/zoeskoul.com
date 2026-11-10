#!/usr/bin/env node
/** Launch Next.js build with only reviewed, local shared settings. */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLocalSharedEnv } from "./localSharedBuildEnv.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
if (command !== "next" || args.length !== 1 || args[0] !== "build") {
  console.error("LOCAL_BUILD_COMMAND_UNSUPPORTED");
  process.exit(2);
}

let selectedEnv;
try {
  selectedEnv = buildLocalSharedEnv({
    repositoryRoot, appRoot: process.cwd(), baseEnv: process.env,
  });
} catch (error) {
  // Only exact internally authored error codes may be emitted; never print a
  // thrown filesystem error, environment value, or potentially secret path.
  const message = String(error?.message ?? "");
  const permitted = /^(BUILD_ENV_[A-Z_]+|SHARED_ENV_PERMISSIONS_TOO_BROAD|DUPLICATE_ENV_DECLARATION:[A-Za-z_][A-Za-z0-9_]*|LOCAL_BUILD_SHARED_SETTING_MISSING:[A-Za-z_][A-Za-z0-9_]*)$/;
  console.error(permitted.test(message) ? message : "LOCAL_BUILD_ENV_PRECHECK_FAILED");
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit", env: selectedEnv, shell: process.platform === "win32",
});
child.on("error", () => {
  console.error("LOCAL_BUILD_LAUNCH_FAILED");
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
