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

export const WORKER_REFERENCE_PROJECT = "zoebuild-u18-reference-fixture";
export const WORKER_REFERENCE_ACTOR = "operator:zoebuild-u18-reference-v1";
const REFERENCE_SNAPSHOT = "c75b365c27563a8e69b3d1991a6b3314a6ffd98b45ec4bf306514f54d696f978";
export const WORKER_REFERENCE_FLAG = `${WORKER_REFERENCE_PROJECT}:1:${REFERENCE_SNAPSHOT}`;
/** Separate opt-in; the managed-asset pilot gate above is unchanged. */
export function shouldRunReferenceWorkerSmoke(request: ProductionBuildJobRequestV1,
  flag = process.env.ZOEBUILD_U18_REFERENCE_RUNTIME): boolean {
  if (flag !== WORKER_REFERENCE_FLAG || request.buildProjectId !== WORKER_REFERENCE_PROJECT ||
      request.protocolVersion !== 1 || request.operation !== "production-build" || request.sourceVersion !== 1 ||
      request.stackId !== "tanstack-start-v1" || request.templateId !== "tanstack-start-v1" ||
      request.files.length !== 17 || (request.binaryFiles ?? []).length !== 0) return false;
  return createHash("sha256").update(JSON.stringify({files:request.files,binaryFiles:[]}), "utf8").digest("hex") === REFERENCE_SNAPSHOT;
}
/** The globally authenticated service route additionally requires a direct
 * loopback operator connection, not Express's proxy-derived req.ip. */
export function referenceOperatorAllowed(actor: unknown, peer: unknown, forwarded: boolean,
  pool = process.env.RUNNER_EXECUTION_POOL): boolean {
  return pool === "zoebuild" && actor === WORKER_REFERENCE_ACTOR && !forwarded &&
    (peer === "127.0.0.1" || peer === "::ffff:127.0.0.1" || peer === "::1");
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
function assertMetadata(condition: unknown): asserts condition {
  if (!condition) throw new Error("Unsupported Worker smoke configuration.");
}

// Temporary compatibility exception for the byte-identical U18F4 artifact.
// The generated config is never passed to Wrangler. Only the named metadata
// below may be discarded, and binding envelopes must still be empty.
const U18_F4_ARTIFACT_SHA = "28bd98025eccd22a4126029fbcce7862e2885629a4a9e71b3efd8723ca40eeba";
const U18_F4_CONFIG_SHA = "e37546e223b2027e31ac1fd7b42170c1851a8f1b172b4f1e3ed5d41433dd669d";

export function isObservedU18GeneratedConfig(artifactSha: string, bytes: Buffer): boolean {
  return artifactSha === U18_F4_ARTIFACT_SHA && bytes.byteLength === 1298 &&
    createHash("sha256").update(bytes).digest("hex") === U18_F4_CONFIG_SHA;
}

/** Validate exact empty binding envelopes, never recursively waive unknown keys. */
function emptyBindingEnvelope(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === keys.length && keys.every(k =>
    Object.prototype.hasOwnProperty.call(v, k) && Array.isArray(v[k]) && v[k].length === 0);
}

export function isDiscardableU18GeneratedMetadata(key: string, value: unknown, observed: boolean): boolean {
  if (!observed) return false;
  switch (key) {
    case "jsx_factory": return value === "React.createElement";
    case "jsx_fragment": return value === "React.Fragment";
    case "durable_objects": return emptyBindingEnvelope(value, ["bindings"]);
    case "queues": return emptyBindingEnvelope(value, ["producers", "consumers"]);
    case "logfwdr": return emptyBindingEnvelope(value, ["bindings"]);
    // Python module discovery and dev settings are ignored, not executed or
    // forwarded. Only permit these objects on the observed exact byte digest.
    case "python_modules": return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1;
    case "dev": return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 5;
    default: return false;
  }
}

/** Only this known, binding-free pilot is supported. Never pass generated config
 * to Wrangler, never forward account metadata, and never guess about bindings. */
export function workerSmokeConfig(artifact: TanstackWorkerArtifactV1, reference = false) {
  const file = artifact.files.find(f => f.path === "server/wrangler.json");
  assertMetadata(file);
  const bytes = Buffer.from(file.data, "base64");
  const observed = isObservedU18GeneratedConfig(artifact.sha256, bytes);
  const meta = record(JSON.parse(bytes.toString("utf8")));
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
    if (key === "base_dir" && (value === "." || value === "./")) continue;
    if (key === "rules" && Array.isArray(value) && value.every(rule => {
      const v = record(rule);
      return v.type === "ESModule" && Array.isArray(v.globs) &&
        v.globs.every(g => typeof g === "string" && ["**/*.js", "**/*.mjs", "**/*"].includes(g)) &&
        Object.keys(v).every(k => ["type", "globs", "fallthrough"].includes(k));
    })) continue;
    // The exact frozen reference source and dependency lock are authorized before
    // compilation. Its generated metadata may vary by workspace path. Discard
    // only the same enumerated shapes; never forward them or waive unknown
    // nonempty bindings. The original digest-bound exception is unchanged.
    if (isDiscardableU18GeneratedMetadata(key, value, observed || reference)) continue;
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
export function workerSmokeCommand(artifact: TanstackWorkerArtifactV1, reference = false): readonly string[] {
  return ["node", "-e", WRAPPER, JSON.stringify(workerSmokeConfig(artifact, reference))];
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
