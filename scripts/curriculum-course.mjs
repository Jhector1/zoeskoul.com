import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2).filter((arg) => arg !== "--");

const [action, courseSlug, ...flags] = args;
const force = flags.includes("--force");
const resume = flags.includes("--resume");
if (!action || !courseSlug) {
  console.error(`
Usage:
  pnpm curr:course -- <action> <courseSlug> [flags]

Examples:
  pnpm curr:course -- compile python
  pnpm curr:course -- compile python --resume
  pnpm curr:course -- validate python
  pnpm curr:course -- publish python
  pnpm curr:course -- check python --resume
  pnpm curr:course -- publish python-v2
pnpm curr:course -- publish python-v2 --force

Flags:
 --resume    Skip topics that already have completed draft artifacts
  --force     Allow publish/publish-auto to overwrite an existing subject release
Actions:
  compile
  validate
  validate-spec
  publish
  publish-auto
  critique
  critique-draft
  check
`);
  process.exit(1);
}

const root = process.cwd();
const courseDir = path.join(root, "authoring", courseSlug);
const blueprintPath = path.join(courseDir, "course.blueprint.json");
function readBlueprint() {
  return JSON.parse(readFileSync(blueprintPath, "utf8"));
}

function assertPublishSafe() {
  const blueprint = readBlueprint();
  const subjectSlug = blueprint.subjectSlug;

  const liveManifestPath = path.join(
      root,
      "apps",
      "web",
      "src",
      "lib",
      "subjects",
      subjectSlug,
      "subject.manifest.json"
  );

  if (!force && existsSync(liveManifestPath)) {
    console.error(`
Refusing to publish because this subject release already exists:

  ${liveManifestPath}

This could overwrite an existing course release.

Use --force only if you intentionally want to replace this exact release:

  pnpm curr:course -- ${action} ${courseSlug} --force
`);
    process.exit(1);
  }
}
function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}\n`);

  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function cli(args) {
  run("node", ["packages/curriculum-cli/dist/index.js", ...args]);
}

if (!existsSync(courseDir)) {
  console.error(`Course folder not found: authoring/${courseSlug}`);
  process.exit(1);
}

if (
  ["compile", "publish", "publish-auto", "critique", "critique-draft", "check"].includes(action) &&
  !existsSync(blueprintPath)
) {
  console.error(`Blueprint not found: authoring/${courseSlug}/course.blueprint.json`);
  process.exit(1);
}

switch (action) {
  case "compile":
    cli([
      "compile-subject",
      blueprintPath,
      ...(resume ? ["--resume"] : []),
    ]);
    break;

  case "validate":
    cli(["validate", courseSlug]);
    break;

  case "validate-spec":
    cli(["validate-spec", courseSlug]);
    break;

  case "publish":
    assertPublishSafe();
    cli(["publish", blueprintPath]);
    break;

  case "publish-auto":
    assertPublishSafe();
    cli(["publish-auto", blueprintPath]);
    break;

  case "critique":
    cli(["critique-subject", blueprintPath]);
    break;

  case "critique-draft":
    cli(["critique-subject-draft", blueprintPath]);
    break;

  case "check":
    run("pnpm", ["curr:build"]);
    cli(["validate-spec", courseSlug]);
    cli([
      "compile-subject",
      blueprintPath,
      ...(resume ? ["--resume"] : []),
    ]);
    cli(["validate", courseSlug]);
    cli(["critique-subject-draft", blueprintPath]);
    run("pnpm", ["curr:test:golden"]);
    break;

  default:
    console.error(`Unknown action: ${action}`);
    process.exit(1);
}