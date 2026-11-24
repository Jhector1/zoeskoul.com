import { createHash } from "node:crypto";
import type { ProductionBuildJobRequestV1, TanstackWorkerArtifactV1 } from "@zoeskoul/build-executor-contracts";

/** Temporary operator-only lane. No new request fields or customer activation. */
export function shouldRunWorkerSmoke(request: ProductionBuildJobRequestV1, flag = process.env.ZOEBUILD_U18_PRIVATE_RUNTIME): boolean {
  if (!flag) return false;
  const snapshot = createHash("sha256").update(JSON.stringify({files:request.files,binaryFiles:request.binaryFiles ?? []}), "utf8").digest("hex");
  return flag === `cmwqiqnly0002eldlcafn1xjx:7:${snapshot}` &&
    request.buildProjectId === "cmwqiqnly0002eldlcafn1xjx" && request.sourceVersion === 7 &&
    request.stackId === "tanstack-start-v1" && request.templateId === "tanstack-start-v1";
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported Worker smoke configuration.");
  return value as Record<string, unknown>;
}
function empty(value: unknown): boolean {
  return value === null || value === undefined || value === false ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && value !== null && Object.keys(value).length === 0);
}
function assertMetadata(condition: unknown, field?: string): asserts condition {
  // Only caller-owned static field names are used; never disclose metadata values.
  if (!condition) throw new Error("Unsupported Worker smoke configuration." + (field ? ` Field: ${field}` : ""));
}

/** Wrangler's normalized binding groups may contain empty arrays rather than
 * an empty object. No nonempty binding, unknown key or nested value is allowed. */
function emptyBindingGroup(value: unknown, keys: readonly string[]): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, items]) => keys.includes(key) && Array.isArray(items) && items.length === 0);
}

/** These are compile-time JSX settings, not execution settings. They are discarded. */
function jsxIdentifier(value: unknown): boolean {
  return typeof value === "string" && value.length <= 128 && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value);
}

/** Normalized Wrangler dev options are inert metadata for an already compiled
 * artifact. Never forward them: the wrapper fixes the IP, port, persistence,
 * local-only mode and working directory independently. Reject structured options. */
function inertDevMetadata(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every(v => v === null || typeof v === "string" || typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v)));
}

/** Only this known, binding-free pilot is supported. Never pass generated config
 * to Wrangler, never forward account metadata, and never guess about bindings. */
export function workerSmokeConfig(artifact: TanstackWorkerArtifactV1) {
  const file = artifact.files.find(f => f.path === "server/wrangler.json");
  assertMetadata(file);
  const meta = record(JSON.parse(Buffer.from(file.data, "base64").toString("utf8")));
  assertMetadata(meta.main === "index.js" || meta.main === "./index.js");
  assertMetadata(meta.compatibility_date === "2026-10-01");
  assertMetadata(JSON.stringify(meta.compatibility_flags) === '["nodejs_compat"]');
  const assets = record(meta.assets);
  assertMetadata(assets.directory === "../client" || assets.directory === "../client/");
  for (const [key, value] of Object.entries(assets)) {
    if (key === "directory") continue;
    if (key === "html_handling" && value === "auto-trailing-slash") continue;
    if (key === "not_found_handling" && value === "none") continue;
    assertMetadata(empty(value));
  }
  for (const [key, value] of Object.entries(meta)) {
    if (["main", "compatibility_date", "compatibility_flags", "assets"].includes(key)) continue;
    if (["$schema", "name", "configPath", "userConfigPath", "topLevelName", "legacy_env", "send_metrics", "upload_source_maps", "workers_dev", "preview_urls", "keep_vars", "preserve_file_names", "find_additional_modules", "no_bundle", "minify", "first_party"].includes(key)) continue;
    // The Vite plugin emits normalized defaults even for binding-free sites.
    // Keep the existing reconstructed config; none of these values is forwarded.
    if (key === "jsx_factory" || key === "jsx_fragment") {
      assertMetadata(empty(value) || jsxIdentifier(value), key === "jsx_factory" ? "jsx_factory" : "jsx_fragment");
      continue;
    }
    if (key === "durable_objects") {
      assertMetadata(empty(value) || emptyBindingGroup(value, ["bindings"]), "durable_objects");
      continue;
    }
    if (key === "queues") {
      assertMetadata(empty(value) || emptyBindingGroup(value, ["producers", "consumers"]), "queues");
      continue;
    }
    if (key === "logfwdr") {
      assertMetadata(empty(value) || emptyBindingGroup(value, ["bindings"]), "logfwdr");
      continue;
    }
    if (key === "python_modules") {
      // Wrangler emits this default bundling exclusion even for JavaScript Workers.
      // It is inert here: the trusted no-bundle configuration never forwards it.
      const python = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : undefined;
      const defaultExclusion = python !== undefined && Object.keys(python).length === 1 &&
        Array.isArray(python.exclude) && python.exclude.length === 1 && python.exclude[0] === "**/*.pyc";
      assertMetadata(empty(value) || emptyBindingGroup(value, ["exclude"]) || defaultExclusion, "python_modules");
      continue;
    }
    if (key === "dev") {
      assertMetadata(empty(value) || inertDevMetadata(value), "dev");
      continue;
    }
    if (key === "base_dir" && (value === "." || value === "./")) continue;
    if (key === "rules" && Array.isArray(value) && value.every(rule => {
      const v = record(rule);
      return v.type === "ESModule" && Array.isArray(v.globs) &&
        v.globs.every(g => typeof g === "string" && ["**/*.js", "**/*.mjs", "**/*"].includes(g)) &&
        Object.keys(v).every(k => ["type", "globs", "fallthrough"].includes(k));
    })) continue;
    assertMetadata(empty(value));
  }
  return {
    name: "zoebuild-u18-offline-smoke", main: "/workspace/dist/server/index.js",
    compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"],
    assets: {directory: "/workspace/dist/client"}, no_bundle: true,
    find_additional_modules: true, base_dir: "/workspace/dist/server",
    rules: [{type:"ESModule", globs:["**/*.js", "**/*.mjs"], fallthrough:true}],
    send_metrics: false,
  };
}

/** The wrapper executes INSIDE the sandbox. A private tmp config avoids the
 * source tree's .wrangler redirects, dotenv files and project scripts. */
const WRAPPER = `
const fs = require('node:fs');
const cp = require('node:child_process');
const dir = fs.mkdtempSync('/tmp/zoe-u18-');
process.chdir(dir);
fs.writeFileSync('wrangler.json', process.argv[1], {flag:'wx',mode:0o600});
const child = cp.spawn(process.execPath, ['/workspace/node_modules/wrangler/bin/wrangler.js',
  'dev','--config',dir+'/wrangler.json','--local','--no-bundle','--ip','127.0.0.1',
  '--port','5173','--persist-to',dir+'/state'], {stdio:'inherit',cwd:dir});
child.on('error',()=>{process.exitCode=1});
child.on('exit',code=>{process.exitCode=code===0?0:1});
`;
export function workerSmokeCommand(artifact: TanstackWorkerArtifactV1): readonly string[] {
  return ["node", "-e", WRAPPER, JSON.stringify(workerSmokeConfig(artifact))];
}

export function selectWorkerSmokeAssets(artifact: TanstackWorkerArtifactV1, html: string) {
  const candidates = artifact.files.filter(f => /^client\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:m?js|css)$/.test(f.path) &&
    !f.path.split("/").some(p => p === "." || p === "..") &&
    (html.includes('"/'+f.path.slice(7)+'"') || html.includes("'/"+f.path.slice(7)+"'")));
  const js = candidates.find(f => /\.m?js$/.test(f.path));
  const css = candidates.find(f => /\.css$/.test(f.path));
  if (!js || !css) throw new Error("Missing referenced compiled smoke assets.");
  return [js,css] as const;
}
