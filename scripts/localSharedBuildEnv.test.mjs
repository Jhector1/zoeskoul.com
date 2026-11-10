import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildLocalSharedEnv, isExternallyManagedBuild, LOCAL_BUILD_SHARED_KEYS,
} from "./localSharedBuildEnv.mjs";

function fixture(run) {
  const root = mkdtempSync(resolve(tmpdir(), "zoeskoul-buildenv-"));
  mkdirSync(resolve(root, "apps/web"), { recursive: true });
  mkdirSync(resolve(root, "apps/zoebuild"), { recursive: true });
  const contents = Array.from(new Set(Object.values(LOCAL_BUILD_SHARED_KEYS).flat()))
    .map(name => `${name}='shared-placeholder'`).join("\n") + "\nOTHER_UNRELATED_SECRET=must-not-inject\n";
  writeFileSync(resolve(root, ".env.shared.local"), contents, { mode: 0o600 });
  chmodSync(resolve(root, ".env.shared.local"), 0o600);
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const select = (root, app, env = {}) => buildLocalSharedEnv({
  repositoryRoot: root, appRoot: resolve(root, `apps/${app}`), baseEnv: env,
});

test("Web receives only its two PTY/Runner secrets; no unrelated shared keys", () => fixture(root => {
  const selected = select(root, "web");
  assert.deepEqual(Object.keys(selected).sort(), [...LOCAL_BUILD_SHARED_KEYS.web].sort());
  assert.equal(selected.PTY_ATTACH_SECRET, "shared-placeholder");
}));

test("ZoeBuild receives only its six platform billing keys", () => fixture(root => {
  const selected = select(root, "zoebuild");
  assert.deepEqual(Object.keys(selected).sort(), [...LOCAL_BUILD_SHARED_KEYS.zoebuild].sort());
}));

test("Explicit shell variables override shared values", () => fixture(root => {
  const selected = select(root, "web", { PTY_ATTACH_SECRET: "shell-secret" });
  assert.equal(selected.PTY_ATTACH_SECRET, "shell-secret");
  assert.equal(selected.RUNNER_SHARED_SECRET, "shared-placeholder");
}));

test("Next app env files take precedence over shared development values", () => fixture(root => {
  writeFileSync(resolve(root, "apps/web/.env.production.local"), "PTY_ATTACH_SECRET='production-placeholder'\n");
  const selected = select(root, "web");
  assert.equal(selected.PTY_ATTACH_SECRET, undefined);
  assert.equal(selected.RUNNER_SHARED_SECRET, "shared-placeholder");
}));

test("CI and hosting builds never load the shared env file", () => fixture(root => {
  const path = resolve(root, ".env.shared.local");
  chmodSync(path, 0o644); // would reject if read
  for (const env of [{ CI: "true" }, { VERCEL_ENV: "production" },
    { GITHUB_ACTIONS: "true" }, { NODE_ENV: "production" }]) {
    assert.deepEqual(select(root, "zoebuild", env), env);
  }
  assert.equal(isExternallyManagedBuild({ CI: "false" }), false);
}));

test("Unsafe shared permissions fail closed for local builds", () => fixture(root => {
  chmodSync(resolve(root, ".env.shared.local"), 0o644);
  assert.throws(() => select(root, "web"), /SHARED_ENV_PERMISSIONS_TOO_BROAD/);
}));

test("Unknown app cannot receive shared configuration", () => fixture(root => {
  mkdirSync(resolve(root, "apps/other"));
  assert.throws(() => select(root, "other"), /BUILD_ENV_UNREVIEWED_APP/);
}));

test("Missing eligible shared key fails closed rather than reading other secrets", () => fixture(root => {
  writeFileSync(resolve(root, ".env.shared.local"), "PTY_ATTACH_SECRET=test\n", { mode: 0o600 });
  assert.throws(() => select(root, "web"), /LOCAL_BUILD_SHARED_SETTING_MISSING:RUNNER_SHARED_SECRET/);
}));

test("Existing app-local duplicate remains authoritative before cleanup", () => fixture(root => {
  writeFileSync(resolve(root, "apps/zoebuild/.env.local"), "STRIPE_WEBHOOK_SECRET='app-placeholder'\n");
  const selected = select(root, "zoebuild");
  assert.equal(selected.STRIPE_WEBHOOK_SECRET, undefined);
}));
