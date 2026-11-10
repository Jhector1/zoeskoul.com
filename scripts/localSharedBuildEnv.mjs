/**
 * Restricted, local-only build configuration bridge for the Zoéskoul Next apps.
 *
 * This is intentionally separate from the existing development launcher.
 * A local build receives only its explicitly reviewed keys from
 * .env.shared.local; CI/hosting builds never read that file.
 */
import { readFileSync, lstatSync } from "node:fs";
import { resolve, relative } from "node:path";

export const LOCAL_BUILD_SHARED_KEYS = Object.freeze({
  web: Object.freeze(["PTY_ATTACH_SECRET", "RUNNER_SHARED_SECRET"]),
  zoebuild: Object.freeze([
    "LEARNOIR_STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "ZOEBUILD_AI_CREDIT_500_TEST_PRICE_ID",
    "ZOEBUILD_AI_CREDIT_FUNDING_MODE",
    "ZOEBUILD_AI_STRIPE_PRICE_IDS",
    "ZOEBUILD_AI_STRIPE_PRODUCT_IDS",
  ]),
});

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvAssignments(content) {
  const parsed = new Map();
  for (const initial of content.split(/\r?\n/)) {
    let line = initial.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trimStart();
    const at = line.indexOf("=");
    if (at < 1) continue;
    const name = line.slice(0, at).trim();
    if (!NAME.test(name)) continue;
    if (parsed.has(name)) throw new Error(`DUPLICATE_ENV_DECLARATION:${name}`);
    let value = line.slice(at + 1).trim();
    if (value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
       (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    parsed.set(name, value);
  }
  return parsed;
}

export function isExternallyManagedBuild(baseEnv) {
  const enabled = (key) => {
    const value = baseEnv[key];
    return value !== undefined && !["", "0", "false", "no", "off"].includes(String(value).toLowerCase());
  };
  return enabled("CI") || enabled("VERCEL") || enabled("VERCEL_ENV") ||
    enabled("GITHUB_ACTIONS") || enabled("NETLIFY") || enabled("CF_PAGES") ||
    baseEnv.NODE_ENV === "production";
}

function readIfPresent(path, { privateFile = false } = {}) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("BUILD_ENV_FILE_STAT_ERROR");
  }
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("BUILD_ENV_UNSAFE_FILE_TYPE");
  if (privateFile && (stat.mode & 0o077) !== 0) throw new Error("SHARED_ENV_PERMISSIONS_TOO_BROAD");
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error("BUILD_ENV_FILE_READ_ERROR");
  }
}

export function buildLocalSharedEnv({ repositoryRoot, appRoot, baseEnv }) {
  const app = relative(resolve(repositoryRoot, "apps"), resolve(appRoot));
  if (app !== "web" && app !== "zoebuild") throw new Error("BUILD_ENV_UNREVIEWED_APP");
  const result = { ...baseEnv };
  if (isExternallyManagedBuild(baseEnv)) return result;
  const root = resolve(repositoryRoot);
  const sharedText = readIfPresent(resolve(root, ".env.shared.local"), { privateFile: true });
  if (sharedText === null) return result; // Preserve ordinary Next builds without this dev-only file.
  const shared = parseEnvAssignments(sharedText);
  const overridden = new Set();
  // The build runs in production mode. Next.js reads these env files, so a
  // specific app declaration must win over the shared development value.
  for (const filename of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const text = readIfPresent(resolve(appRoot, filename));
    if (text === null) continue;
    for (const name of parseEnvAssignments(text).keys()) overridden.add(name);
  }
  for (const name of LOCAL_BUILD_SHARED_KEYS[app]) {
    if (result[name] !== undefined || overridden.has(name)) continue;
    if (!shared.has(name)) throw new Error(`LOCAL_BUILD_SHARED_SETTING_MISSING:${name}`);
    result[name] = shared.get(name);
  }
  return result;
}
