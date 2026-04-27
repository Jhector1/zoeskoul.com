import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const [action, courseSlug] = args;
if (!action || !courseSlug) {
  console.error(`
Usage:
  pnpm curr:course -- <action> <courseSlug>

Examples:
  pnpm curr:course -- compile python-for-beginners
  pnpm curr:course -- validate python-for-beginners
  pnpm curr:course -- publish python-for-beginners
  pnpm curr:course -- check python-for-beginners

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
    cli(["compile-subject", blueprintPath]);
    break;

  case "validate":
    cli(["validate", courseSlug]);
    break;

  case "validate-spec":
    cli(["validate-spec", courseSlug]);
    break;

  case "publish":
    cli(["publish", blueprintPath]);
    break;

  case "publish-auto":
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
    cli(["compile-subject", blueprintPath]);
    cli(["validate", courseSlug]);
    cli(["critique-subject-draft", blueprintPath]);
    run("pnpm", ["curr:test:golden"]);
    break;

  default:
    console.error(`Unknown action: ${action}`);
    process.exit(1);
}