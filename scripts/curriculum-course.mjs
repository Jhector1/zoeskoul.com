import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  buildCheckCliPlan,
  buildPublishCliPlan,
  assertCourseScopedPublishPlan,
  buildValidationBypassArgs,
} from "./curriculum-course-lib.mjs";


function __zsCourseListAiModels() {
  console.log('AI providers and models:\n\nOpenAI\n  - gpt-5-mini\n  - gpt-5.4-mini\n  - gpt-5.4-nano\n  - gpt-4o-mini\n  - gpt-4o\n  - gpt-5.5\n\nGemini\n  - gemini-2.5-flash-lite\n  - gemini-2.5-flash\n  - gemini-2.5-pro\n\nClaude\n  - claude-haiku-4-5\n  - claude-sonnet-5\n  - claude-opus-4-8\n  - claude-fable-5\n\nDeepSeek\n  - deepseek-v4-flash\n  - deepseek-v4-pro\n  - deepseek-chat        deprecated legacy alias\n  - deepseek-reasoner    deprecated legacy alias\n');
}

const __zsCourseArgsForModels = process.argv.slice(2).filter((arg) => arg !== "--");
if (__zsCourseArgsForModels[0] === "list-ai-models" || __zsCourseArgsForModels.includes("--list-ai-models")) {
  __zsCourseListAiModels();
  process.exit(0);
}

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
    const flagNeedsValue = arg === "--live-subject" || arg === "--backup-key";

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
const draftOnly = flags.has("--draft-only");
const rebuildFromDrafts = flags.has("--rebuild-from-drafts");
const upgradeDrafts = flags.has("--upgrade-drafts");
const preferCurrentDraftOutput = flags.has("--prefer-current-draft-output");
const preferReports = flags.has("--prefer-reports");
const noSyncReports = flags.has("--no-sync-reports");
const forceLiveOverwrite = flags.has("--force-live-overwrite");
const liveSubjectSlugFlag = flags.get("--live-subject");
const backupKeyFlag = flags.get("--backup-key");
const skipQualityGates = flags.has("--skip-quality-gates");
const skipSemantic = flags.has("--skip-semantic");
const skipGolden = flags.has("--skip-golden");
const unsafeSkipValidation = flags.has("--unsafe-skip-validation");

const allowedFlags = new Set([
  "--force",
  "--resume",
  "--draft-only",
  "--rebuild-from-drafts",
  "--upgrade-drafts",
  "--prefer-current-draft-output",
  "--prefer-reports",
  "--no-sync-reports",
  "--force-live-overwrite",
  "--live-subject",
  "--backup-key",
  "--skip-quality-gates",
  "--skip-semantic",
  "--skip-golden",
  "--unsafe-skip-validation",
]);

for (const flag of flags.keys()) {
  if (!allowedFlags.has(flag)) {
    console.error(`Unknown flag: ${flag}`);
    process.exit(1);
  }
}

const validationBypassRequested =
    skipQualityGates || skipSemantic || skipGolden || unsafeSkipValidation;

const validationBypassCompileActions = new Set(["compile-course", "check"]);

if (
    validationBypassRequested &&
    action &&
    !validationBypassCompileActions.has(action)
) {
  console.error(
      `Validation bypass flags are only supported for compile-course and check actions. Received action: ${action}`,
  );
  process.exit(1);
}

if (validationBypassRequested && action === "compile-course" && !draftOnly) {
  console.error(
      `Validation bypass flags require --draft-only so non-draft compile output cannot skip validation.`,
  );
  process.exit(1);
}

if (unsafeSkipValidation && !draftOnly) {
  console.error(
      `--unsafe-skip-validation requires --draft-only. This escape hatch is not allowed for non-draft compile output or publish flows.`,
  );
  process.exit(1);
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
  pnpm curr:course -- backup-draft python applied-python-projects
  pnpm curr:course -- list-backups python applied-python-projects
  pnpm curr:course -- restore-draft python applied-python-projects --backup-key <backupKey>
  pnpm curr:course -- status python python-v2

Flags:
  --resume                 Skip topics that already have completed draft artifacts
  --draft-only             Compile course output into .curriculum-drafts only
  --rebuild-from-drafts    Rebuild draft outputs without AI
  --upgrade-drafts         Reserved for schema-only draft upgrades
  --prefer-current-draft-output
                           For rebuild mode, use current .curriculum-drafts subject/messages output as source of truth
  --prefer-reports         For rebuild mode, use saved report drafts as source of truth
  --no-sync-reports        For rebuild mode, do not write rebuild-source/report snapshots
  --force                  Allow publish/publish-auto to overwrite an existing subject release
  --live-subject <slug>    Compile/publish a course into an explicit live subject slug override
  --backup-key <key>       Backup key to create, list around, or restore from
  --force-live-overwrite   Allow compile-course or publish to overwrite the configured live publish target with a non-target course
  --skip-quality-gates     Draft compile only: skip downstream quality/critique gates
  --skip-semantic          Draft compile only: skip downstream semantic validation
  --skip-golden            Draft compile only: skip downstream golden validation
  --unsafe-skip-validation Draft compile only: loud escape hatch that implies all downstream skip flags

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
  backup-draft / backup-course-draft
  list-backups / list-course-backups
  restore-draft / restore-course-draft
  status / course-status
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

function normalizeDraftLikeSlug(value) {
  return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/--draft$/, "")
      .replace(new RegExp(`^${subjectSlug}--`), "")
      .replace(/--/g, "-");
}

function resolveRequestedCourseSlug() {
  if (courseSlug) return courseSlug;

  return resolvePublishTargetCourseSlug();
}

function resolveAuthoringCourseSlug(requestedCourseSlug) {
  if (existsSync(getCourseSpecPath(requestedCourseSlug))) {
    return requestedCourseSlug;
  }

  const configuredCourseSlug = resolvePublishTargetCourseSlug();
  const configuredLiveSubjectSlug = resolveConfiguredLiveSubjectSlug();
  const normalizedRequested = normalizeDraftLikeSlug(requestedCourseSlug);
  const normalizedLiveSubject = normalizeDraftLikeSlug(configuredLiveSubjectSlug);

  if (
      normalizedRequested === normalizedLiveSubject &&
      existsSync(getCourseSpecPath(configuredCourseSlug))
  ) {
    return configuredCourseSlug;
  }

  return requestedCourseSlug;
}

function resolveCourseSlug({ required }) {
  if (!courseSlug && required) {
    console.error(`Action "${action}" requires a courseSlug.`);
    printUsage();
    process.exit(1);
  }

  return resolveAuthoringCourseSlug(resolveRequestedCourseSlug());
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

function draftSubjectRootExists(slug) {
  return existsSync(
      path.join(root, ".curriculum-drafts", "subjects", slug),
  );
}

function resolveDraftSubjectTarget() {
  const requestedCourseSlug = resolveRequestedCourseSlug();
  const resolvedCourseSlug = resolveAuthoringCourseSlug(requestedCourseSlug);
  const configuredCourseSlug = resolvePublishTargetCourseSlug();
  const configuredLiveSubjectSlug = resolveConfiguredLiveSubjectSlug();
  const normalizedRequested = normalizeDraftLikeSlug(requestedCourseSlug);
  const normalizedLiveSubject = normalizeDraftLikeSlug(configuredLiveSubjectSlug);
  const requestedCourseExists = existsSync(getCourseSpecPath(resolvedCourseSlug));

  if (requestedCourseExists) {
    const conventionalDraftSlug = `${subjectSlug}--${requestedCourseSlug}--draft`;
    const shouldUseLiveSubjectDraft =
        resolvedCourseSlug === configuredCourseSlug &&
        !draftSubjectRootExists(conventionalDraftSlug) &&
        draftSubjectRootExists(configuredLiveSubjectSlug);

    return {
      courseSlug: resolvedCourseSlug,
      draftSubjectSlug: shouldUseLiveSubjectDraft
          ? configuredLiveSubjectSlug
          : conventionalDraftSlug,
    };
  }

  if (
      configuredCourseSlug &&
      normalizedRequested === normalizedLiveSubject &&
      existsSync(getCourseSpecPath(configuredCourseSlug))
  ) {
    return {
      courseSlug: configuredCourseSlug,
      draftSubjectSlug: configuredLiveSubjectSlug,
    };
  }

  return {
    courseSlug: requestedCourseSlug,
    draftSubjectSlug: `${subjectSlug}--${requestedCourseSlug}--draft`,
  };
}


const COURSE_LIFECYCLE_SCHEMA_VERSION = 1;

function courseLifecyclePath(resolvedCourseSlug) {
  return path.join(
      root,
      "authoring",
      "subjects",
      subjectSlug,
      "course-lifecycle",
      `${resolvedCourseSlug}.json`,
  );
}

function readCourseLifecycle(resolvedCourseSlug) {
  const filePath = courseLifecyclePath(resolvedCourseSlug);
  if (!existsSync(filePath)) return null;
  return readJson(filePath);
}

function writeCourseLifecycle(resolvedCourseSlug, value) {
  const filePath = courseLifecyclePath(resolvedCourseSlug);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function collectLifecycleFiles(basePath) {
  if (!existsSync(basePath)) return [];
  const rows = [];

  function walk(currentPath) {
    const entries = readdirSync(currentPath, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        rows.push(fullPath);
      }
    }
  }

  walk(basePath);
  return rows;
}

function snapshotCourseDraft(resolvedCourseSlug) {
  const draftSubjectSlug = `${subjectSlug}--${resolvedCourseSlug}--draft`;
  const draftRoot = path.join(root, ".curriculum-drafts", subjectSlug);
  const roots = [];

  const subjectRoot = path.join(draftRoot, "subjects", draftSubjectSlug);
  if (existsSync(subjectRoot)) {
    roots.push({ label: "subject", basePath: subjectRoot });
  }

  const messagesRoot = path.join(draftRoot, "messages");
  if (existsSync(messagesRoot)) {
    const locales = readdirSync(messagesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const locale of locales) {
      if (locale.name !== "en") continue;
      const localeRoot = path.join(messagesRoot, locale.name, "subjects", draftSubjectSlug);
      if (existsSync(localeRoot)) {
        roots.push({ label: `messages/${locale.name}`, basePath: localeRoot });
      }
    }
  }

  if (roots.length === 0) {
    return { draftSubjectSlug, currentDraftHash: null, draftFileCount: 0, lastModifiedAt: null };
  }

  const hash = createHash("sha256");
  let fileCount = 0;
  let maxMtimeMs = 0;

  for (const rootEntry of roots.sort((a, b) => a.label.localeCompare(b.label))) {
    for (const filePath of collectLifecycleFiles(rootEntry.basePath)) {
      const relativePath = path.relative(rootEntry.basePath, filePath).split(path.sep).join("/");
      const bytes = readFileSync(filePath);
      const stat = statSync(filePath);
      hash.update(rootEntry.label);
      hash.update("\\0");
      hash.update(relativePath);
      hash.update("\\0");
      hash.update(bytes);
      hash.update("\\0");
      fileCount += 1;
      maxMtimeMs = Math.max(maxMtimeMs, stat.mtimeMs);
    }
  }

  return {
    draftSubjectSlug,
    currentDraftHash: `sha256:${hash.digest("hex")}`,
    draftFileCount: fileCount,
    lastModifiedAt: maxMtimeMs > 0 ? new Date(maxMtimeMs).toISOString() : null,
  };
}

function refreshCourseLifecycle(resolvedCourseSlug, { quiet = false } = {}) {
  const snapshot = snapshotCourseDraft(resolvedCourseSlug);
  const previous = readCourseLifecycle(resolvedCourseSlug);

  if (!snapshot.currentDraftHash) {
    if (!quiet) {
      console.log(`No canonical draft artifacts found for ${subjectSlug}/${resolvedCourseSlug}.`);
      console.log(`Expected draft subject: ${snapshot.draftSubjectSlug}`);
    }
    return previous;
  }

  const draftChanged = !previous || previous.currentDraftHash !== snapshot.currentDraftHash;
  const next = {
    schemaVersion: COURSE_LIFECYCLE_SCHEMA_VERSION,
    subjectSlug,
    courseSlug: resolvedCourseSlug,
    draftSubjectSlug: snapshot.draftSubjectSlug,
    lastDraftEditedAt: draftChanged
      ? snapshot.lastModifiedAt ?? new Date().toISOString()
      : previous.lastDraftEditedAt ?? snapshot.lastModifiedAt ?? new Date().toISOString(),
    lastPublishedAt: previous?.lastPublishedAt ?? null,
    currentDraftHash: snapshot.currentDraftHash,
    lastPublishedDraftHash: previous?.lastPublishedDraftHash ?? null,
    liveSubjectSlug: previous?.liveSubjectSlug ?? null,
    hasUnpublishedChanges: previous?.lastPublishedDraftHash
      ? previous.lastPublishedDraftHash !== snapshot.currentDraftHash
      : true,
    draftFileCount: snapshot.draftFileCount,
  };

  if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) {
    const filePath = writeCourseLifecycle(resolvedCourseSlug, next);
    if (!quiet) console.log(`Updated course lifecycle metadata: ${filePath}`);
  }
  return next;
}

function normalizePublishedIdentity(value, draftSubjectSlug, liveSubjectSlug) {
  if (typeof value === "string") {
    return value.split(draftSubjectSlug).join(liveSubjectSlug);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizePublishedIdentity(item, draftSubjectSlug, liveSubjectSlug),
    );
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.split(draftSubjectSlug).join(liveSubjectSlug);
      out[normalizedKey] = normalizePublishedIdentity(
          child,
          draftSubjectSlug,
          liveSubjectSlug,
      );
    }
    return out;
  }

  return value;
}

function stableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
        Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => [key, stableJsonValue(child)]),
    );
  }

  return value;
}

function listRelativeFiles(basePath) {
  if (!existsSync(basePath)) return [];

  return collectLifecycleFiles(basePath)
      .map((filePath) => path.relative(basePath, filePath).split(path.sep).join("/"))
      .sort();
}

function canonicalPublishedSubjectRoot(resolvedLiveSubjectSlug) {
  const publishedSubjectsRoot = path.join(
      root,
      "packages",
      "curriculum-registry",
      "published",
      "subjects",
  );

  const candidates = [
    path.join(publishedSubjectsRoot, subjectSlug, resolvedLiveSubjectSlug),
    path.join(publishedSubjectsRoot, resolvedLiveSubjectSlug),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);

  const existing = candidates.filter((candidate) =>
    existsSync(path.join(candidate, "subject.manifest.json")),
  );

  if (existing.length === 1) return existing[0];

  if (existing.length === 0) {
    console.error(
        `Published subject root not found for ${subjectSlug}/${resolvedLiveSubjectSlug}.`,
    );
    console.error(`Checked:`);
    for (const candidate of candidates) {
      console.error(`  ${candidate}`);
    }
    process.exit(1);
  }

  console.error(
      `Ambiguous published subject roots for ${subjectSlug}/${resolvedLiveSubjectSlug}:`,
  );
  for (const candidate of existing) {
    console.error(`  ${candidate}`);
  }
  process.exit(1);
}

function publishedMessagesRoot() {
  return path.join(
      root,
      "packages",
      "curriculum-registry",
      "published",
      "messages",
  );
}

function draftMessageLocaleRoots(draftSubjectSlug) {
  const messagesRoot = path.join(
      root,
      ".curriculum-drafts",
      subjectSlug,
      "messages",
  );

  if (!existsSync(messagesRoot)) return new Map();

  const result = new Map();
  for (const entry of readdirSync(messagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== "en") continue;

    const subjectMessages = path.join(
        messagesRoot,
        entry.name,
        "subjects",
        draftSubjectSlug,
    );

    if (existsSync(subjectMessages)) {
      result.set(entry.name, subjectMessages);
    }
  }

  return result;
}

function publishedMessageLocaleRoots(resolvedLiveSubjectSlug) {
  const messagesRoot = publishedMessagesRoot();
  if (!existsSync(messagesRoot)) return new Map();

  const result = new Map();
  for (const entry of readdirSync(messagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name !== "en") continue;

    const subjectMessages = path.join(
        messagesRoot,
        entry.name,
        "subjects",
        subjectSlug,
        resolvedLiveSubjectSlug,
    );

    if (existsSync(subjectMessages)) {
      result.set(entry.name, subjectMessages);
    }
  }

  return result;
}

function removeEmptyDirectories(basePath) {
  if (!existsSync(basePath)) return;

  function visit(currentPath) {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = path.join(currentPath, entry.name);
      visit(child);
      if (existsSync(child) && readdirSync(child).length === 0) {
        rmSync(child, { recursive: true, force: true });
      }
    }
  }

  visit(basePath);
}

function pruneExtraPublishedFiles(draftRoot, publishedRoot, label) {
  if (!existsSync(draftRoot) || !existsSync(publishedRoot)) return 0;

  const expected = new Set(listRelativeFiles(draftRoot));
  let removed = 0;

  for (const relativePath of listRelativeFiles(publishedRoot)) {
    if (expected.has(relativePath)) continue;

    const target = path.join(publishedRoot, relativePath);
    rmSync(target, { force: true });
    console.log(`Pruned stale published ${label}: ${relativePath}`);
    removed += 1;
  }

  removeEmptyDirectories(publishedRoot);
  return removed;
}

function prunePublishedCourseExtras(resolvedCourseSlug, resolvedLiveSubjectSlug) {
  const draftSubjectSlug = `${subjectSlug}--${resolvedCourseSlug}--draft`;
  const draftSubjectRoot = path.join(
      root,
      ".curriculum-drafts",
      subjectSlug,
      "subjects",
      draftSubjectSlug,
  );
  const liveSubjectRoot = canonicalPublishedSubjectRoot(resolvedLiveSubjectSlug);

  let removed = pruneExtraPublishedFiles(
      draftSubjectRoot,
      liveSubjectRoot,
      "subject file",
  );

  const draftLocales = draftMessageLocaleRoots(draftSubjectSlug);
  const liveLocales = publishedMessageLocaleRoots(resolvedLiveSubjectSlug);

  for (const [locale, liveRoot] of liveLocales) {
    const draftRoot = draftLocales.get(locale);

    if (!draftRoot) {
      rmSync(liveRoot, { recursive: true, force: true });
      console.log(`Pruned stale published message locale: ${locale}`);
      removed += 1;
      continue;
    }

    removed += pruneExtraPublishedFiles(
        draftRoot,
        liveRoot,
        `message file (${locale})`,
    );
  }

  if (removed > 0) {
    console.log(`Pruned ${removed} stale published artifact(s) before parity verification.`);
  }
}

function compareParityTree(args) {
  const {
    draftRoot,
    publishedRoot,
    draftSubjectSlug,
    liveSubjectSlug,
    label,
  } = args;

  if (!existsSync(draftRoot)) {
    return [`${label}: draft root missing: ${draftRoot}`];
  }

  if (!existsSync(publishedRoot)) {
    return [`${label}: published root missing: ${publishedRoot}`];
  }

  const draftFiles = listRelativeFiles(draftRoot);
  const liveFiles = listRelativeFiles(publishedRoot);
  const draftSet = new Set(draftFiles);
  const liveSet = new Set(liveFiles);
  const issues = [];

  for (const relativePath of draftFiles) {
    if (!liveSet.has(relativePath)) {
      issues.push(`${label}: missing published file ${relativePath}`);
    }
  }

  for (const relativePath of liveFiles) {
    if (!draftSet.has(relativePath)) {
      issues.push(`${label}: stale published file ${relativePath}`);
    }
  }

  for (const relativePath of draftFiles) {
    if (!liveSet.has(relativePath)) continue;

    const draftPath = path.join(draftRoot, relativePath);
    const livePath = path.join(publishedRoot, relativePath);

    if (relativePath.endsWith(".json")) {
      let draftJson;
      let liveJson;

      try {
        draftJson = readJson(draftPath);
      } catch (error) {
        issues.push(
            `${label}: invalid draft JSON ${relativePath}: ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
        continue;
      }

      try {
        liveJson = readJson(livePath);
      } catch (error) {
        issues.push(
            `${label}: invalid published JSON ${relativePath}: ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
        continue;
      }

      const normalizedDraft = stableJsonValue(
          normalizePublishedIdentity(
              draftJson,
              draftSubjectSlug,
              liveSubjectSlug,
          ),
      );
      const normalizedLive = stableJsonValue(liveJson);

      if (JSON.stringify(normalizedDraft) !== JSON.stringify(normalizedLive)) {
        issues.push(`${label}: content mismatch ${relativePath}`);
      }
      continue;
    }

    const draftRaw = readFileSync(draftPath, "utf8")
        .split(draftSubjectSlug)
        .join(liveSubjectSlug);
    const liveRaw = readFileSync(livePath, "utf8");

    if (draftRaw !== liveRaw) {
      issues.push(`${label}: content mismatch ${relativePath}`);
    }
  }

  return issues;
}

function assertDraftPublishedParity(resolvedCourseSlug, resolvedLiveSubjectSlug) {
  const draftSubjectSlug = `${subjectSlug}--${resolvedCourseSlug}--draft`;
  const draftSubjectRoot = path.join(
      root,
      ".curriculum-drafts",
      subjectSlug,
      "subjects",
      draftSubjectSlug,
  );
  const liveSubjectRoot = canonicalPublishedSubjectRoot(resolvedLiveSubjectSlug);

  const issues = compareParityTree({
    draftRoot: draftSubjectRoot,
    publishedRoot: liveSubjectRoot,
    draftSubjectSlug,
    liveSubjectSlug: resolvedLiveSubjectSlug,
    label: "subject",
  });

  const draftLocales = draftMessageLocaleRoots(draftSubjectSlug);
  const liveLocales = publishedMessageLocaleRoots(resolvedLiveSubjectSlug);

  const localeNames = Array.from(
      new Set([...draftLocales.keys(), ...liveLocales.keys()]),
  ).sort();

  for (const locale of localeNames) {
    const draftRoot = draftLocales.get(locale);
    const liveRoot = liveLocales.get(locale);

    if (!draftRoot) {
      issues.push(`messages/${locale}: locale exists only in published output`);
      continue;
    }

    if (!liveRoot) {
      issues.push(`messages/${locale}: locale exists only in draft output`);
      continue;
    }

    issues.push(
        ...compareParityTree({
          draftRoot,
          publishedRoot: liveRoot,
          draftSubjectSlug,
          liveSubjectSlug: resolvedLiveSubjectSlug,
          label: `messages/${locale}`,
        }),
    );
  }

  if (issues.length > 0) {
    console.error("");
    console.error(
        `Draft → published parity FAILED for ${subjectSlug}/${resolvedCourseSlug} -> ${resolvedLiveSubjectSlug}.`,
    );
    console.error(
        `Allowed difference: draft subject identity "${draftSubjectSlug}" -> "${resolvedLiveSubjectSlug}" only.`,
    );
    for (const issue of issues.slice(0, 80)) {
      console.error(`  - ${issue}`);
    }
    if (issues.length > 80) {
      console.error(`  - ... ${issues.length - 80} additional issue(s)`);
    }
    console.error("");
    console.error(
        `Publish lifecycle metadata was NOT advanced. Fix the publisher/output and publish again.`,
    );
    process.exit(1);
  }

  console.log(
      `Draft → published parity PASS for ${subjectSlug}/${resolvedCourseSlug} -> ${resolvedLiveSubjectSlug}`,
  );
}

function recordCoursePublished(resolvedCourseSlug, resolvedLiveSubjectSlug) {
  const refreshed = refreshCourseLifecycle(resolvedCourseSlug, { quiet: true });
  if (!refreshed?.currentDraftHash) {
    console.error(`Cannot record publish lifecycle for ${subjectSlug}/${resolvedCourseSlug}: draft artifacts are missing.`);
    process.exit(1);
  }

  const next = {
    ...refreshed,
    lastPublishedAt: new Date().toISOString(),
    lastPublishedDraftHash: refreshed.currentDraftHash,
    liveSubjectSlug: resolvedLiveSubjectSlug,
    hasUnpublishedChanges: false,
  };
  const filePath = writeCourseLifecycle(resolvedCourseSlug, next);
  console.log(`Recorded course publish lifecycle: ${filePath}`);
}

function printCourseLifecycle(resolvedCourseSlug) {
  const value = refreshCourseLifecycle(resolvedCourseSlug, { quiet: true });
  const snapshot = snapshotCourseDraft(resolvedCourseSlug);
  console.log(`Course lifecycle: ${subjectSlug}/${resolvedCourseSlug}`);
  console.log(`  draftSubjectSlug: ${snapshot.draftSubjectSlug}`);
  if (!value || !snapshot.currentDraftHash) {
    console.log("  draft: missing");
    return;
  }
  console.log(`  lastDraftEditedAt: ${value.lastDraftEditedAt ?? "unknown"}`);
  console.log(`  lastPublishedAt: ${value.lastPublishedAt ?? "never"}`);
  console.log(`  currentDraftHash: ${value.currentDraftHash}`);
  console.log(`  lastPublishedDraftHash: ${value.lastPublishedDraftHash ?? "never"}`);
  console.log(`  liveSubjectSlug: ${value.liveSubjectSlug ?? "never"}`);
  console.log(`  hasUnpublishedChanges: ${value.hasUnpublishedChanges ? "yes" : "no"}`);
  console.log(`  draftFileCount: ${value.draftFileCount ?? 0}`);
}

function timestampBackupSuffix() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function slugSafe(value) {
  return String(value ?? "")
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");
}


function listDirectoryNames(dirPath) {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
}

function tryReadJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function rewriteSubjectSlugDeep(value, fromSubjectSlug, toSubjectSlug) {
  if (!fromSubjectSlug || !toSubjectSlug || fromSubjectSlug === toSubjectSlug) {
    return value;
  }

  if (typeof value === "string") {
    return value.split(fromSubjectSlug).join(toSubjectSlug);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
        rewriteSubjectSlugDeep(item, fromSubjectSlug, toSubjectSlug),
    );
  }

  if (value && typeof value === "object") {
    const next = {};
    for (const [key, childValue] of Object.entries(value)) {
      const nextKey = key.split(fromSubjectSlug).join(toSubjectSlug);
      next[nextKey] = rewriteSubjectSlugDeep(
          childValue,
          fromSubjectSlug,
          toSubjectSlug,
      );
    }
    return next;
  }

  return value;
}

function maybeRewriteJsonRaw(raw, fromSubjectSlug, toSubjectSlug) {
  if (!fromSubjectSlug || !toSubjectSlug || fromSubjectSlug === toSubjectSlug) {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw);
    return `${JSON.stringify(
        rewriteSubjectSlugDeep(parsed, fromSubjectSlug, toSubjectSlug),
        null,
        2,
    )}\n`;
  } catch {
    return raw.split(fromSubjectSlug).join(toSubjectSlug);
  }
}

function copyTreeWithSubjectRewrite(sourcePath, targetPath, fromSubjectSlug, toSubjectSlug) {
  if (!existsSync(sourcePath)) return false;

  const sourceStats = statSync(sourcePath);
  if (sourceStats.isDirectory()) {
    mkdirSync(targetPath, { recursive: true });
    for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
      copyTreeWithSubjectRewrite(
          path.join(sourcePath, entry.name),
          path.join(targetPath, entry.name),
          fromSubjectSlug,
          toSubjectSlug,
      );
    }
    return true;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });

  if (sourcePath.endsWith(".json")) {
    const raw = readFileSync(sourcePath, "utf8");
    writeFileSync(
        targetPath,
        maybeRewriteJsonRaw(raw, fromSubjectSlug, toSubjectSlug),
    );
  } else {
    writeFileSync(targetPath, readFileSync(sourcePath));
  }

  return true;
}

function inferBackupCreatedAt(backupKey) {
  const courseStyle = backupKey.match(/(\d{4}-\d{2}-\d{2})--(\d{2}-\d{2}-\d{2})$/);
  if (courseStyle) return `${courseStyle[1]}T${courseStyle[2].replace(/-/g, ":")}Z`;

  const isoStyle = backupKey.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  if (isoStyle) return `${isoStyle[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3")}Z`;

  return "unknown";
}

function backupRoot() {
  return path.join(root, ".curriculum-backups", subjectSlug);
}

function courseDraftPaths(draftSubjectSlug) {
  return {
    subject: path.join(root, ".curriculum-drafts", subjectSlug, "subjects", draftSubjectSlug),
    messages: path.join(root, ".curriculum-drafts", subjectSlug, "messages", "en", "subjects", draftSubjectSlug),
    reports: path.join(root, ".curriculum-drafts", subjectSlug, "reports", draftSubjectSlug),
  };
}

function courseBackupPaths(backupKey) {
  const backupBase = path.join(backupRoot(), backupKey);
  return {
    base: backupBase,
    manifest: path.join(backupBase, "backup.manifest.json"),
    subject: path.join(backupBase, "subjects"),
    messages: path.join(backupBase, "messages", "en", "subjects"),
    reports: path.join(backupBase, "reports"),
  };
}

function hasAnyDraftArtifact(paths) {
  return existsSync(paths.subject) || existsSync(paths.messages) || existsSync(paths.reports);
}

function assertReadableBackupKey(value) {
  const key = slugSafe(value);
  if (!key) {
    console.error("--backup-key must be a non-empty filesystem-safe value.");
    process.exit(1);
  }
  if (key !== value) {
    console.error(`Unsafe --backup-key: ${value}`);
    console.error(`Use a filesystem-safe key such as: ${key}`);
    process.exit(1);
  }
  return key;
}

function resolveBackupKey(
    resolvedCourseSlug,
    draftSubjectSlug,
    purpose,
    { ignoreBackupKeyFlag = false } = {},
) {
  if (!ignoreBackupKeyFlag && backupKeyFlag) return assertReadableBackupKey(backupKeyFlag);
  if (purpose === "restore") {
    console.error("restore-draft requires --backup-key <backupKey>.");
    process.exit(1);
  }
  return slugSafe(`${resolvedCourseSlug}--${draftSubjectSlug}--${timestampBackupSuffix()}`);
}

function backupCurrentDraft({
  reason = "manual",
  backupKeyOverride = null,
  ignoreBackupKeyFlag = false,
} = {}) {
  const target = resolveDraftSubjectTarget();
  const resolvedCourseSlug = target.courseSlug;
  assertCourseExists(resolvedCourseSlug);

  const draftPaths = courseDraftPaths(target.draftSubjectSlug);
  if (!hasAnyDraftArtifact(draftPaths)) {
    console.error(`No draft artifacts found for ${subjectSlug}/${resolvedCourseSlug}.`);
    console.error(`Expected one of:`);
    console.error(`  ${draftPaths.subject}`);
    console.error(`  ${draftPaths.messages}`);
    console.error(`  ${draftPaths.reports}`);
    process.exit(1);
  }

  const backupKey = backupKeyOverride
      ? assertReadableBackupKey(backupKeyOverride)
      : resolveBackupKey(resolvedCourseSlug, target.draftSubjectSlug, "backup", {
        ignoreBackupKeyFlag,
      });
  const backupPaths = courseBackupPaths(backupKey);

  if (existsSync(backupPaths.base)) {
    console.error(`Backup already exists: ${backupPaths.base}`);
    console.error(`Use a different --backup-key.`);
    process.exit(1);
  }

  mkdirSync(backupPaths.base, { recursive: true });

  if (existsSync(draftPaths.subject)) {
    mkdirSync(backupPaths.subject, { recursive: true });
    cpSync(draftPaths.subject, path.join(backupPaths.subject, target.draftSubjectSlug), { recursive: true });
  }
  if (existsSync(draftPaths.messages)) {
    mkdirSync(backupPaths.messages, { recursive: true });
    cpSync(draftPaths.messages, path.join(backupPaths.messages, target.draftSubjectSlug), { recursive: true });
  }
  if (existsSync(draftPaths.reports)) {
    mkdirSync(backupPaths.reports, { recursive: true });
    cpSync(draftPaths.reports, path.join(backupPaths.reports, target.draftSubjectSlug), { recursive: true });
  }

  writeFileSync(
      backupPaths.manifest,
      JSON.stringify(
          {
            kind: "course-draft-backup",
            reason,
            createdAt: new Date().toISOString(),
            subjectSlug,
            courseSlug: resolvedCourseSlug,
            draftSubjectSlug: target.draftSubjectSlug,
            backupKey,
          },
          null,
          2,
      ) + "\n",
  );

  console.log(`Backed up draft ${subjectSlug}/${resolvedCourseSlug}`);
  console.log(`Draft subject: ${target.draftSubjectSlug}`);
  console.log(`Backup key: ${backupKey}`);
  console.log(`Backup path: ${backupPaths.base}`);
  return { backupKey, backupPath: backupPaths.base };
}

function describeBackupEntry(backupKey, target, resolvedCourseSlug) {
  const backupPaths = courseBackupPaths(backupKey);
  const manifest = tryReadJson(backupPaths.manifest);

  if (manifest) {
    if (manifest.subjectSlug !== subjectSlug) return null;
    if (manifest.courseSlug !== resolvedCourseSlug) return null;

    return {
      key: backupKey,
      format: manifest.kind ?? "course-draft-backup",
      createdAt: manifest.createdAt ?? inferBackupCreatedAt(backupKey),
      reason: manifest.reason ?? "unknown",
      sourceSubjectSlug: manifest.draftSubjectSlug,
      courseSlug: manifest.courseSlug,
      hasManifest: true,
      backupPaths,
    };
  }

  const subjectDirs = listDirectoryNames(backupPaths.subject);
  const messageDirs = listDirectoryNames(backupPaths.messages);
  const availableSubjectSlugs = Array.from(new Set([...subjectDirs, ...messageDirs]));

  if (availableSubjectSlugs.length === 0) return null;

  const configuredLiveSubjectSlug = resolveConfiguredLiveSubjectSlug();
  const sourceSubjectSlug =
      availableSubjectSlugs.includes(target.draftSubjectSlug)
          ? target.draftSubjectSlug
          : availableSubjectSlugs.includes(configuredLiveSubjectSlug)
              ? configuredLiveSubjectSlug
              : availableSubjectSlugs[0];

  return {
    key: backupKey,
    format: "legacy-publish-backup",
    createdAt: inferBackupCreatedAt(backupKey),
    reason: "legacy/no-manifest",
    sourceSubjectSlug,
    courseSlug: backupKey.startsWith(`${resolvedCourseSlug}--`)
        ? resolvedCourseSlug
        : "unknown legacy course",
    hasManifest: false,
    backupPaths,
  };
}

function listCourseBackups() {
  const target = resolveDraftSubjectTarget();
  const resolvedCourseSlug = target.courseSlug;
  assertCourseExists(resolvedCourseSlug);

  const base = backupRoot();
  if (!existsSync(base)) {
    console.log(`No backups found for ${subjectSlug}/${resolvedCourseSlug}.`);
    return;
  }

  const rows = [];
  for (const entry of readdirSync(base)) {
    const backupBase = path.join(base, entry);
    if (!statSync(backupBase).isDirectory()) continue;

    const descriptor = describeBackupEntry(entry, target, resolvedCourseSlug);
    if (!descriptor) continue;
    rows.push(descriptor);
  }

  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  if (rows.length === 0) {
    console.log(`No backups found for ${subjectSlug}/${resolvedCourseSlug}.`);
    console.log(`Backup folder exists, but no recognizable backup snapshots were found at:`);
    console.log(`  ${base}`);
    return;
  }

  console.log(`Backups for ${subjectSlug}/${resolvedCourseSlug}:`);
  for (const row of rows) {
    console.log(`- ${row.key}`);
    console.log(`  createdAt: ${row.createdAt}`);
    console.log(`  reason: ${row.reason}`);
    console.log(`  format: ${row.format}`);
    console.log(`  sourceSubjectSlug: ${row.sourceSubjectSlug}`);
    if (!row.hasManifest) {
      console.log(`  note: legacy backup has no course manifest; verify the key before restore`);
    }
  }
}

function restoreDraftFromBackup() {
  const target = resolveDraftSubjectTarget();
  const resolvedCourseSlug = target.courseSlug;
  assertCourseExists(resolvedCourseSlug);

  const backupKey = resolveBackupKey(resolvedCourseSlug, target.draftSubjectSlug, "restore");
  const descriptor = describeBackupEntry(backupKey, target, resolvedCourseSlug);

  if (!descriptor) {
    const backupPaths = courseBackupPaths(backupKey);
    console.error(`Backup not found or not recognizable: ${backupPaths.base}`);
    console.error(`Run: pnpm curr:course -- list-backups ${subjectSlug} ${resolvedCourseSlug}`);
    process.exit(1);
  }

  const backupPaths = descriptor.backupPaths;
  const sourceSubjectSlug = descriptor.sourceSubjectSlug;
  const sourcePaths = {
    subject: path.join(backupPaths.subject, sourceSubjectSlug),
    messages: path.join(backupPaths.messages, sourceSubjectSlug),
    reports: path.join(backupPaths.reports, sourceSubjectSlug),
  };
  const targetPaths = courseDraftPaths(target.draftSubjectSlug);

  if (!hasAnyDraftArtifact(sourcePaths)) {
    console.error(`Backup ${backupKey} has no draft/live artifacts to restore.`);
    console.error(`Expected one of:`);
    console.error(`  ${sourcePaths.subject}`);
    console.error(`  ${sourcePaths.messages}`);
    console.error(`  ${sourcePaths.reports}`);
    process.exit(1);
  }

  if (hasAnyDraftArtifact(targetPaths)) {
    if (!force) {
      console.error(`Refusing to overwrite existing draft for ${subjectSlug}/${resolvedCourseSlug}.`);
      console.error(`Existing draft subject: ${target.draftSubjectSlug}`);
      console.error(`Use --force to first back up the current draft, then restore this backup:`);
      console.error(`  pnpm curr:course -- restore-draft ${subjectSlug} ${resolvedCourseSlug} --backup-key ${backupKey} --force`);
      process.exit(1);
    }

    backupCurrentDraft({
      reason: `pre-restore:${backupKey}`,
      ignoreBackupKeyFlag: true,
    });
  }

  for (const targetPath of [targetPaths.subject, targetPaths.messages, targetPaths.reports]) {
    if (existsSync(targetPath)) rmSync(targetPath, { recursive: true, force: true });
  }

  copyTreeWithSubjectRewrite(
      sourcePaths.subject,
      targetPaths.subject,
      sourceSubjectSlug,
      target.draftSubjectSlug,
  );
  copyTreeWithSubjectRewrite(
      sourcePaths.messages,
      targetPaths.messages,
      sourceSubjectSlug,
      target.draftSubjectSlug,
  );
  copyTreeWithSubjectRewrite(
      sourcePaths.reports,
      targetPaths.reports,
      sourceSubjectSlug,
      target.draftSubjectSlug,
  );

  console.log(`Restored backup ${backupKey} into draft ${subjectSlug}/${resolvedCourseSlug}.`);
  console.log(`Source subject: ${sourceSubjectSlug}`);
  console.log(`Draft subject: ${target.draftSubjectSlug}`);
  if (!descriptor.hasManifest) {
    console.log(`Note: restored from legacy publish backup and rewrote subject slug to draft slug.`);
  }
  refreshCourseLifecycle(resolvedCourseSlug);
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
      "packages",
      "curriculum-registry",
      "published",
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
      "packages",
      "curriculum-registry",
      "published",
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

function getValidationBypassArgs() {
  return buildValidationBypassArgs({
    skipQualityGates,
    skipSemantic,
    skipGolden,
    unsafeSkipValidation,
  });
}

function shouldSkipDraftGoldens() {
  return skipGolden || unsafeSkipValidation;
}

function runDraftGoldensForCourse() {
  const draftGoldensTarget = resolveDraftSubjectTarget();
  const resolvedCourseSlug = draftGoldensTarget.courseSlug;
  assertCourseExists(resolvedCourseSlug);

  loadEnvFiles();

  if (!process.env.DRAFT_SUBJECT_SLUG) {
    process.env.DRAFT_SUBJECT_SLUG = draftGoldensTarget.draftSubjectSlug;
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
}

function buildCompileCourseArgs(resolvedCourseSlug) {
  const shouldUseDraftOnly = draftOnly || rebuildFromDrafts || upgradeDrafts;

  return [
    "compile-course",
    subjectSlug,
    resolvedCourseSlug,
    ...(liveSubjectSlugFlag ? ["--live-subject", liveSubjectSlugFlag] : []),
    ...(resume ? ["--resume"] : []),
    ...(shouldUseDraftOnly ? ["--draft-only"] : []),
    ...(rebuildFromDrafts ? ["--rebuild-from-drafts"] : []),
    ...(upgradeDrafts ? ["--upgrade-drafts"] : []),
    ...(preferCurrentDraftOutput ? ["--prefer-current-draft-output"] : []),
    ...(preferReports ? ["--prefer-reports"] : []),
    ...(noSyncReports ? ["--no-sync-reports"] : []),
    ...(forceLiveOverwrite ? ["--force-live-overwrite"] : []),
    ...getValidationBypassArgs(),
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
    refreshCourseLifecycle(resolvedCourseSlug);
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
    const draftSubjectTarget = resolveDraftSubjectTarget();

    const resolvedLiveSubjectSlug =
        liveSubjectSlugFlag ?? resolveConfiguredLiveSubjectSlug();

    assertCoursePublishSafe(resolvedCourseSlug, resolvedLiveSubjectSlug);

    if (!process.env.DRAFT_SUBJECT_SLUG) {
      process.env.DRAFT_SUBJECT_SLUG = draftSubjectTarget.draftSubjectSlug;
    }

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

    prunePublishedCourseExtras(resolvedCourseSlug, resolvedLiveSubjectSlug);
    assertDraftPublishedParity(resolvedCourseSlug, resolvedLiveSubjectSlug);
    recordCoursePublished(resolvedCourseSlug, resolvedLiveSubjectSlug);
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
    runDraftGoldensForCourse();
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
      skipQualityGates,
      skipSemantic,
      skipGolden,
      unsafeSkipValidation,
      hasCourseBlueprint: existsSync(blueprintPath),
      courseBlueprintPath: blueprintPath,
    });

    for (const args of cliPlan) {
      cli(args);
    }

    if (shouldSkipDraftGoldens()) {
      console.warn(
          "⚠️  Skipping post-compile draft golden validation because --skip-golden or --unsafe-skip-validation was provided.",
      );
    } else {
      runDraftGoldensForCourse();
    }
    refreshCourseLifecycle(resolvedCourseSlug);
    break;
  }

  case "status":
  case "course-status": {
    const resolvedCourseSlug = resolveCourseSlug({ required: true });
    printCourseLifecycle(resolvedCourseSlug);
    break;
  }

  case "backup-draft":
  case "backup-course-draft": {
    backupCurrentDraft({ reason: "manual" });
    break;
  }

  case "list-backups":
  case "list-course-backups": {
    listCourseBackups();
    break;
  }

  case "restore-draft":
  case "restore-course-draft": {
    restoreDraftFromBackup();
    break;
  }

  default:
    console.error(`Unknown action: ${action}`);
    printUsage();
    process.exit(1);
}
