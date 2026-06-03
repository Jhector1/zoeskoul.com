import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  buildCheckCliPlan,
  buildPublishCliPlan,
  assertCourseScopedPublishPlan,
} from "./curriculum-course-lib.mjs";

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");

const action = rawArgs[0];
const subjectSlug = rawArgs[1];

function parseArgs(args) {
  const positional = [];
  const flags = new Map();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const next = args[i + 1];
    const flagNeedsValue = arg === "--live-subject";

    if (flagNeedsValue) {
      if (!next || next.startsWith("--")) {
        console.error(`${arg} requires a value.`);
        process.exit(1);
      }

      flags.set(arg, next);
      i += 1;
      continue;
    }

    flags.set(arg, true);
  }

  return { positional, flags };
}

const { positional, flags } = parseArgs(rawArgs.slice(2));

const courseSlug = positional[0];

const force = flags.has("--force");
const resume = flags.has("--resume");
const forceLiveOverwrite = flags.has("--force-live-overwrite");
const liveSubjectSlugFlag = flags.get("--live-subject");

const allowedFlags = new Set([
  "--force",
  "--resume",
  "--force-live-overwrite",
  "--live-subject",
]);

for (const flag of flags.keys()) {
  if (!allowedFlags.has(flag)) {
    console.error(`Unknown flag: ${flag}`);
    process.exit(1);
  }
}

if (!action || !subjectSlug) {
  printUsage();
  process.exit(1);
}

if (positional.length > 1) {
  console.error(
      `Unexpected extra positional argument(s): ${positional.slice(1).join(" ")}`,
  );
  printUsage();
  process.exit(1);
}

const root = process.cwd();

const subjectRoot = path.join(root, "authoring", "subjects", subjectSlug);
const subjectPlanPath = path.join(subjectRoot, "subject.plan.json");
const subjectBlueprintPath = path.join(subjectRoot, "subject.blueprint.json");
const subjectValidationPath = path.join(subjectRoot, "subject.validation.json");

function printUsage() {
  console.error(`
Usage:
  pnpm curr:course -- <action> <subjectSlug> [courseSlug] [flags]

Common examples:
  pnpm curr:course -- compile sql
  pnpm curr:course -- compile sql --resume
  pnpm curr:course -- validate sql
  pnpm curr:course -- validate-spec sql
  pnpm curr:course -- publish-subject sql --force
  pnpm curr:course -- publish-auto sql --force
  pnpm curr:course -- check sql --resume

Course-specific examples:
  pnpm curr:course -- validate-course sql sql-foundations
  pnpm curr:course -- compile-course sql sql-foundations
  pnpm curr:course -- compile-course sql multi-table-sql --live-subject sql-preview
  pnpm curr:course -- compile-course sql multi-table-sql --live-subject sql --force-live-overwrite
  pnpm curr:course -- publish python python-data-functions --force
  pnpm curr:course -- publish python python-data-functions --live-subject python-v2 --force

Flags:
  --resume                 Skip topics that already have completed draft artifacts
  --force                  Allow publish/publish-auto to overwrite an existing subject release
  --live-subject <slug>    Compile/publish a course into an explicit live subject slug override
  --force-live-overwrite   Allow compile-course or publish to overwrite the configured live publish target with a non-target course

Actions:
  compile
  compile-course
  validate
  validate-course
  validate-spec
  publish
  publish-subject
  publish-auto
  critique
  critique-draft
  check
`);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Failed to read JSON: ${filePath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function assertFileExists(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`${label} not found: ${filePath}`);
    process.exit(1);
  }
}

function readSubjectPlan() {
  assertFileExists(subjectPlanPath, "Subject plan");
  return readJson(subjectPlanPath);
}

function resolvePublishTargetCourseSlug() {
  const plan = readSubjectPlan();
  const targetCourseSlug = plan?.publishTarget?.courseSlug;

  if (!targetCourseSlug || typeof targetCourseSlug !== "string") {
    console.error(`Missing publishTarget.courseSlug in ${subjectPlanPath}`);
    process.exit(1);
  }

  return targetCourseSlug;
}

function resolveConfiguredLiveSubjectSlug() {
  const plan = readSubjectPlan();
  const liveSubjectSlug = plan?.publishTarget?.liveSubjectSlug;

  if (!liveSubjectSlug || typeof liveSubjectSlug !== "string") {
    console.error(`Missing publishTarget.liveSubjectSlug in ${subjectPlanPath}`);
    process.exit(1);
  }

  return liveSubjectSlug;
}

function resolveCourseSlug({ required }) {
  if (courseSlug) return courseSlug;

  if (required) {
    console.error(`Action "${action}" requires a courseSlug.`);
    printUsage();
    process.exit(1);
  }

  return resolvePublishTargetCourseSlug();
}

function getCourseRoot(resolvedCourseSlug) {
  return path.join(subjectRoot, "courses", resolvedCourseSlug);
}

function getCourseSpecPath(resolvedCourseSlug) {
  return path.join(getCourseRoot(resolvedCourseSlug), "course.spec.json");
}

function getCourseBlueprintPath(resolvedCourseSlug) {
  return path.join(getCourseRoot(resolvedCourseSlug), "course.blueprint.json");
}
function loadEnvFiles() {
  for (const relativePath of [
    ".env",
    ".env.local",
    "apps/web/.env.local",
    "apps/runner/.env.local",
  ]) {
    const filePath = path.join(root, relativePath);

    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;

      const [, key, rawValue] = match;

      if (process.env[key]) continue;

      let value = rawValue.trim();

      if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}
function assertSubjectExists() {
  if (!existsSync(subjectRoot)) {
    console.error(`Subject folder not found: authoring/subjects/${subjectSlug}`);
    process.exit(1);
  }

  assertFileExists(subjectPlanPath, "Subject plan");
  assertFileExists(subjectBlueprintPath, "Subject blueprint");
  assertFileExists(subjectValidationPath, "Subject validation");
}

function assertCourseExists(resolvedCourseSlug) {
  const courseRoot = getCourseRoot(resolvedCourseSlug);
  const courseSpecPath = getCourseSpecPath(resolvedCourseSlug);

  if (!existsSync(courseRoot)) {
    console.error(`Course folder not found: ${courseRoot}`);
    process.exit(1);
  }

  assertFileExists(courseSpecPath, "Course spec");
}

function assertCourseBlueprintExists(resolvedCourseSlug) {
  assertFileExists(getCourseBlueprintPath(resolvedCourseSlug), "Course blueprint");
}

function assertSubjectPublishSafe() {
  const configuredLiveSubjectSlug = resolveConfiguredLiveSubjectSlug();

  const liveManifestPath = path.join(
      root,
      "apps",
      "web",
      "src",
      "lib",
      "subjects",
      configuredLiveSubjectSlug,
      "subject.manifest.json",
  );

  if (!force && existsSync(liveManifestPath)) {
    console.error(`
Refusing to publish because this live subject release already exists:

  ${liveManifestPath}

This could overwrite an existing generated subject release.

Use --force only if you intentionally want to replace this exact release:

  pnpm curr:course -- ${action} ${subjectSlug} --force
`);
    process.exit(1);
  }
}

function assertCoursePublishSafe(resolvedCourseSlug, resolvedLiveSubjectSlug) {
  const configuredTargetCourseSlug = resolvePublishTargetCourseSlug();
  const configuredLiveSubjectSlug = resolveConfiguredLiveSubjectSlug();

  const publishingConfiguredLiveSubject =
      resolvedLiveSubjectSlug === configuredLiveSubjectSlug;

  const selectedCourseIsConfiguredTarget =
      resolvedCourseSlug === configuredTargetCourseSlug;

  if (
      publishingConfiguredLiveSubject &&
      !selectedCourseIsConfiguredTarget &&
      !forceLiveOverwrite
  ) {
    console.error(`
Refusing to publish course ${subjectSlug}/${resolvedCourseSlug} to configured live subject ${configuredLiveSubjectSlug}.

That live subject is configured for:
  ${subjectSlug}/${configuredTargetCourseSlug}

Pass --live-subject <liveSubjectSlug> only if you intentionally want a real live override,
or pass --force-live-overwrite only if you intentionally want to overwrite the configured live subject with this non-target course.
`);
    process.exit(1);
  }

  const liveManifestPath = path.join(
      root,
      "apps",
      "web",
      "src",
      "lib",
      "subjects",
      resolvedLiveSubjectSlug,
      "subject.manifest.json",
  );

  if (!force && existsSync(liveManifestPath)) {
    console.error(`
Refusing to publish because this course release already exists:

  ${liveManifestPath}

Requested course:
  ${subjectSlug}/${resolvedCourseSlug}

Resolved live subject:
  ${resolvedLiveSubjectSlug}

Use --force only if you intentionally want to replace this exact release:

  pnpm curr:course -- publish ${subjectSlug} ${resolvedCourseSlug} --live-subject ${resolvedLiveSubjectSlug} --force
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

function buildCompileCourseArgs(resolvedCourseSlug) {
  return [
    "compile-course",
    subjectSlug,
    resolvedCourseSlug,
    ...(liveSubjectSlugFlag ? ["--live-subject", liveSubjectSlugFlag] : []),
    ...(resume ? ["--resume"] : []),
    ...(forceLiveOverwrite ? ["--force-live-overwrite"] : []),
  ];
}

assertSubjectExists();

switch (action) {
  case "compile": {
    cli([
      "compile-subject",
      subjectSlug,
      ...(resume ? ["--resume"] : []),
    ]);
    break;
  }

  case "compile-course": {
    const resolvedCourseSlug = resolveCourseSlug({ required: true });
    assertCourseExists(resolvedCourseSlug);
    cli(buildCompileCourseArgs(resolvedCourseSlug));
    break;
  }

  case "validate": {
    cli(["validate-subject", subjectSlug]);
    break;
  }

  case "validate-course": {
    const resolvedCourseSlug = resolveCourseSlug({ required: true });
    assertCourseExists(resolvedCourseSlug);
    cli(["validate-course", subjectSlug, resolvedCourseSlug]);
    break;
  }

  case "validate-spec": {
    cli(["validate-spec", subjectSlug]);
    break;
  }

  case "publish": {
    const resolvedCourseSlug = resolveCourseSlug({ required: true });
    assertCourseExists(resolvedCourseSlug);

    const resolvedLiveSubjectSlug =
        liveSubjectSlugFlag ?? resolveConfiguredLiveSubjectSlug();

    assertCoursePublishSafe(resolvedCourseSlug, resolvedLiveSubjectSlug);

    const cliPlan = buildPublishCliPlan({
      subjectSlug,
      courseSlug: resolvedCourseSlug,
      liveSubjectSlug: liveSubjectSlugFlag,
      force,
      forceLiveOverwrite,
    });

    assertCourseScopedPublishPlan(cliPlan, {
      subjectSlug,
      courseSlug: resolvedCourseSlug,
    });

    for (const args of cliPlan) {
      cli(args);
    }

    break;
  }
  case "publish-subject": {
    assertSubjectPublishSafe();
    cli(["publish-subject", subjectSlug]);
    break;
  }

  case "publish-auto": {
    assertSubjectPublishSafe();
    cli(["publish-auto", subjectSlug]);
    break;
  }

  case "critique": {
    const resolvedCourseSlug = resolveCourseSlug({ required: false });
    assertCourseExists(resolvedCourseSlug);
    assertCourseBlueprintExists(resolvedCourseSlug);

    cli(["critique-subject", getCourseBlueprintPath(resolvedCourseSlug)]);
    break;
  }

  case "critique-draft": {
    const resolvedCourseSlug = resolveCourseSlug({ required: false });
    assertCourseExists(resolvedCourseSlug);
    assertCourseBlueprintExists(resolvedCourseSlug);

    cli(["critique-subject-draft", getCourseBlueprintPath(resolvedCourseSlug)]);
    break;
  }
  case "draft-goldens": {
    const resolvedCourseSlug = resolveCourseSlug({ required: true });
    assertCourseExists(resolvedCourseSlug);

    loadEnvFiles();

    if (!process.env.DRAFT_SUBJECT_SLUG) {
      process.env.DRAFT_SUBJECT_SLUG = `${subjectSlug}--${resolvedCourseSlug}--draft`;
    }

    process.env.DRAFT_COURSE_SLUG = resolvedCourseSlug;

    run("pnpm", [
      "--filter",
      "@zoeskoul/curriculum-compiler",
      "exec",
      "vitest",
      "run",
      "--root",
      "../..",
      "packages/curriculum-compiler/src/validate/draftSubjectCodeInputGoldens.test.ts",
    ]);

    break;
  }
  case "check": {
    const resolvedCourseSlug = resolveCourseSlug({ required: false });
    assertCourseExists(resolvedCourseSlug);

    run("pnpm", ["curr:build"]);

    const blueprintPath = getCourseBlueprintPath(resolvedCourseSlug);
    const cliPlan = buildCheckCliPlan({
      subjectSlug,
      courseSlug: resolvedCourseSlug,
      resume,
      liveSubjectSlug: liveSubjectSlugFlag,
      forceLiveOverwrite,
      hasCourseBlueprint: existsSync(blueprintPath),
      courseBlueprintPath: blueprintPath,
    });

    for (const args of cliPlan) {
      cli(args);
    }

    run("pnpm", ["curr:test:golden"]);
    break;
  }

  default:
    console.error(`Unknown action: ${action}`);
    printUsage();
    process.exit(1);
}
