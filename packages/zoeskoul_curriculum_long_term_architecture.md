# ZoeSkoul Long-Term Curriculum Architecture

This is a full long-term architecture scaffold for turning ZoeSkoul into a profile-driven, manifest-first, locale-aware curriculum compiler that can support SQL, Python, math, language learning, web development, and future subjects.

---

# 1. Target monorepo structure

```text
apps/
  web/
  curriculum-worker/                     # optional later

packages/
  curriculum-contracts/
    src/
      blueprint.ts
      locales.ts
      manifest.ts
      subject-manifest.ts
      plan.ts
      index.ts

  curriculum-core/
    src/
      ids.ts
      paths.ts
      slugs.ts
      invariants.ts
      messageKeys.ts
      withTopicParentContext.ts
      index.ts

  curriculum-profiles/
    src/
      types.ts
      registry.ts
      base/
        recipes/
          buildFixedTestsRecipe.ts
          buildTemplateIoRecipe.ts
        expectedExample.ts
      sql/
        index.ts
        recipes/
          buildSqlQueryRecipe.ts
      python/
        index.ts
      math/
        index.ts
      language/
        index.ts
      web/
        index.ts
      index.ts

  curriculum-runtime/
    src/
      i18n/
        resolveManifestMessages.ts
      review/
        reviewBuilders.ts
        buildReviewFromManifest.ts
      sketches/
        buildSketchesFromManifest.ts
      generator/
        buildExerciseFromManifest.ts
        buildGeneratorTopicsForModule.ts
        makeSubjectGeneratorFromManifest.ts
        resolveModuleFromTopicSlug.ts
        defineJsonTopicBundle.ts
        recipeRegistry.ts
      course/
        defineCourseFromManifest.ts
      index.ts

  curriculum-registry/
    src/
      buildArtifacts.ts
      index.ts

  curriculum-ai/
    src/
      types.ts
      providers/
        openai.ts
      prompts/
        buildPlanPrompt.ts
        buildTopicPrompt.ts
        buildTranslationPrompt.ts
      generators/
        generateCoursePlan.ts
        generateTopicPack.ts
        translateMessages.ts
      index.ts

  curriculum-compiler/
    src/
      blueprint/
        loadBlueprint.ts
      planning/
        generatePlan.ts
      compile/
        compileSubject.ts
        compileTopic.ts
      validate/
        validateBlueprint.ts
        validatePlan.ts
        validateManifestTree.ts
        validateMessages.ts
        validateLocaleParity.ts
      write/
        writeDraft.ts
        publishDraft.ts
      rebuild/
        rebuildRegistries.ts
      index.ts

  curriculum-cli/
    src/
      index.ts
      commands/
        plan.ts
        compile-subject.ts
        compile-topic.ts
        validate.ts
        publish.ts

authoring/
  sql/
    course.blueprint.json
    course.plan.json
  python/
    course.blueprint.json

.curriculum-drafts/
  subjects/
  messages/

src/
  lib/
    subjects/
      sql/
        subject.manifest.json
        topics.generated.ts
        modules/
          sql_module_1/
            reading_data_from_a_table/
              topic.bundle.json
      python/
        ...
  i18n/
    messages/
      en/
        subjects/
          sql/
            subject.json
            sql_module_1/
              reading_data_from_a_table.json
      fr/
      ht/
      es/
```

---

# 2. Core design rules

```text
manifest = curriculum truth
messages = locale copy truth
db = runtime/user/product truth
AI = authoring assistant, never source of truth
compiler = file/path owner
```

- Manifests are locale-neutral.
- Message files are locale-specific.
- `en` is canonical source locale.
- `fr`, `ht`, and `es` are translation overlays.
- AI produces structured objects.
- Compiler validates and writes files.
- Generated TS registries remain compiler/build outputs.

---

# 3. contracts

## packages/curriculum-contracts/src/locales.ts

```ts
export const LOCALES = ["en", "fr", "ht", "es"] as const;
export type LocaleCode = (typeof LOCALES)[number];

export type LocaleBuildStatus =
  | "draft"
  | "machine_translated"
  | "reviewed"
  | "published";
```

## packages/curriculum-contracts/src/blueprint.ts

```ts
import type { LocaleCode } from "./locales";

export type CourseProfileId =
  | "sql"
  | "python"
  | "math"
  | "language"
  | "web"
  | "data_science";

export type CourseBlueprint = {
  subjectSlug: string;
  profileId: CourseProfileId;
  sourceLocale: "en";
  targetLocales: LocaleCode[];
  title: string;
  description?: string;
  level: "beginner" | "intermediate" | "advanced";
  audience: string[];
  goals: string[];
  teachingStyle?: {
    tone?: string;
    quizWeight?: number;
    projectWeight?: number;
    codeInputWeight?: number;
  };
  constraints: {
    moduleCount: number;
    topicsPerModuleMin: number;
    topicsPerModuleMax: number;
  };
  seedModules?: string[];
};
```

## packages/curriculum-contracts/src/plan.ts

```ts
import type { CourseProfileId } from "./blueprint";

export type PlannedTopic = {
  topicId: string;
  order: number;
  title: string;
  summary: string;
  minutes: number;
  learningGoals: string[];
};

export type PlannedSection = {
  sectionSlug: string;
  order: number;
  title: string;
  description?: string;
  topics: PlannedTopic[];
};

export type PlannedModule = {
  moduleSlug: string;
  prefix: string;
  order: number;
  title: string;
  description?: string;
  weekStart?: number | null;
  weekEnd?: number | null;
  sections: PlannedSection[];
};

export type CoursePlan = {
  subjectSlug: string;
  profileId: CourseProfileId;
  modules: PlannedModule[];
};
```

## packages/curriculum-contracts/src/manifest.ts

```ts
export type ExerciseKind =
  | "single_choice"
  | "multi_choice"
  | "drag_reorder"
  | "fill_blank_choice"
  | "code_input";

export type SqlDialect = "sqlite" | "postgres" | "mysql" | "mssql";
export type WorkspaceLanguage = "sql" | "python" | "java" | "javascript" | "c" | "cpp" | "bash" | "web";

export type ManifestSqlRuntimeDefaults = {
  kind: "sql";
  datasetId?: string;
  fixedSqlDialect?: SqlDialect;
  resultShape?: "table";
};

export type ManifestCodeRuntimeDefaults = {
  kind: "code";
  language?: Exclude<WorkspaceLanguage, "sql">;
};

export type ManifestRuntimeDefaults =
  | ManifestSqlRuntimeDefaults
  | ManifestCodeRuntimeDefaults;

export type ManifestProjectStep = {
  id: string;
  titleKey: string;
  exerciseKey: string;
  difficulty?: "easy" | "medium" | "hard";
  preferKind?: string | null;
  seedPolicy?: "global" | "step";
  maxAttempts?: number;
};

export type ManifestCard =
  | {
      id: string;
      kind: "sketch";
      titleKey: string;
      sketchId: string;
      height?: number;
    }
  | {
      id: string;
      kind: "quiz";
      titleKey: string;
      quiz: {
        difficulty: "easy" | "medium" | "hard";
        n: number;
        allowReveal?: boolean;
        preferKind?: ExerciseKind | null;
        maxAttempts?: number;
      };
    }
  | {
      id: string;
      kind: "project";
      titleKey: string;
      project: {
        difficulty: "easy" | "medium" | "hard";
        allowReveal?: boolean;
        preferKind?: string | null;
        maxAttempts?: number;
        steps: ManifestProjectStep[];
      };
    };

export type ManifestSketch =
  | {
      id: string;
      archetype: "paragraph";
      titleKey: string;
      bodyKey: string;
      runtime?: ManifestRuntimeDefaults | null;
      images?: Array<{
        id: string;
        publicId: string;
        alt?: string;
        width?: number;
        height?: number;
      }>;
    }
  | {
      id: string;
      archetype: "image";
      titleKey: string;
      src?: string;
      publicId?: string;
      altKey?: string;
      captionKey?: string;
      runtime?: ManifestRuntimeDefaults | null;
      aspectRatio?: number;
    };

export type ManifestBaseExercise = {
  id: string;
  kind: ExerciseKind;
  purpose?: "quiz" | "project";
  weight?: number;
  messageBase: string;
};

export type ManifestSingleChoice = ManifestBaseExercise & {
  kind: "single_choice";
  optionIds: string[];
  expected: { kind: "single_choice"; optionId: string };
};

export type ManifestMultiChoice = ManifestBaseExercise & {
  kind: "multi_choice";
  optionIds: string[];
  expected: { kind: "multi_choice"; optionIds: string[] };
};

export type ManifestDragReorder = ManifestBaseExercise & {
  kind: "drag_reorder";
  tokenIds: string[];
  expected: { kind: "drag_reorder"; tokenIds: string[] };
};

export type ManifestFillBlankChoice = ManifestBaseExercise & {
  kind: "fill_blank_choice";
  choiceCount: number;
  expected: { kind: "fill_blank_choice"; value: string };
};

export type ManifestVarSpec =
  | { source: "int"; min: number; max: number }
  | { source: "pick"; from: string[] }
  | { source: "pickDifferentFromVar"; from: string[]; var: string }
  | { source: "intDifferentFromVar"; min: number; max: number; var: string };

export type ManifestComputedSpec =
  | { op: "add"; left: string; right: number }
  | { op: "sub"; left: string; right: number }
  | { op: "mul"; left: string; right: number }
  | { op: "floor_div"; left: string; right: number }
  | { op: "c_to_f_int"; left: string }
  | { op: "mul_div_floor"; left: string; right: string; divisor: number };

export type ManifestRecipe =
  | {
      type: "fixed_tests";
      tests: Array<{ stdin?: string; stdout: string; match?: "exact" | "includes" }>;
      solutionCode?: string;
    }
  | {
      type: "sql_query";
      datasetId?: string;
      solutionCode: string;
      resultShape?: "table";
      ignoreRowOrder?: boolean;
    }
  | {
      type: "template_io";
      vars: Record<string, ManifestVarSpec>;
      computed?: Record<string, ManifestComputedSpec>;
      tests: Array<{ stdinTemplate?: string; stdoutTemplate: string; match?: "exact" | "includes" }>;
      solutionTemplate?: string;
    };

export type ManifestCodeInputExpectedExample = boolean | { metaKey?: string };

export type ManifestCodeInput = ManifestBaseExercise & {
  kind: "code_input";
  language?: WorkspaceLanguage;
  fixedSqlDialect?: SqlDialect;
  recipe: ManifestRecipe;
  showExpectedExample?: ManifestCodeInputExpectedExample;
};

export type ManifestExercise =
  | ManifestSingleChoice
  | ManifestMultiChoice
  | ManifestDragReorder
  | ManifestFillBlankChoice
  | ManifestCodeInput;

export type TopicBundleManifest = {
  topicId: string;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  prefix: string;
  minutes: number;
  topic: {
    labelKey: string;
    summaryKey: string;
  };
  runtimeDefaults?: ManifestRuntimeDefaults | null;
  cards: ManifestCard[];
  sketches: ManifestSketch[];
  exercises: ManifestExercise[];
};
```

## packages/curriculum-contracts/src/subject-manifest.ts

```ts
import type { ManifestCard, ManifestExercise, ManifestRuntimeDefaults, ManifestSketch, TopicBundleManifest as BaseTopicBundleManifest } from "./manifest";

export type SubjectManifest = {
  subject: {
    slug: string;
    genKey: string;
    order: number;
    accessPolicy?: "free" | "paid";
    status?: "active" | "coming_soon" | "disabled";
    imagePublicId?: string | null;
    imageAlt?: string | null;
    titleKey: string;
    descriptionKey?: string | null;
    meta?: {
      curriculum?: {
        plannedModuleCount?: number;
        isTerminalRelease?: boolean;
        moreComingMessageKey?: string;
      };
      completionPolicy?: {
        requireAllPublishedModules?: boolean;
        rewardEnabledByDefault?: boolean;
        certificateEnabledByDefault?: boolean;
      };
    };
  };
  modules: SubjectModuleManifest[];
};

export type SubjectModuleManifest = {
  slug: string;
  prefix: string;
  order: number;
  titleKey: string;
  descriptionKey?: string | null;
  weekStart?: number | null;
  weekEnd?: number | null;
  accessOverride?: "free" | "paid" | null;
  runtimeDefaults?: ManifestRuntimeDefaults | null;
  meta?: {
    estimatedMinutes?: number;
    prereqKeys?: string[];
    outcomeKeys?: string[];
    whyKeys?: string[];
  };
  sections: SubjectSectionManifest[];
};

export type SubjectSectionManifest = {
  slug: string;
  order: number;
  titleKey: string;
  descriptionKey?: string | null;
  meta?: {
    module?: number;
    weeksKey?: string;
    bulletKeys?: string[];
  };
  topics: string[];
};

export type SlimTopicManifest = {
  topicId: string;
  minutes: number;
  topic: {
    labelKey: string;
    summaryKey: string;
  };
  runtimeDefaults?: ManifestRuntimeDefaults | null;
  cards: ManifestCard[];
  sketches: ManifestSketch[];
  exercises: ManifestExercise[];
};

export type FullTopicManifest = SlimTopicManifest & {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  prefix: string;
};

export type TopicManifestRefMap = Record<string, SlimTopicManifest>;
export type TopicBundleManifest = BaseTopicBundleManifest;
```

## packages/curriculum-contracts/src/index.ts

```ts
export * from "./blueprint";
export * from "./locales";
export * from "./manifest";
export * from "./subject-manifest";
export * from "./plan";
```

---

# 4. core

## packages/curriculum-core/src/invariants.ts

```ts
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertNonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

export function assertNoDot(value: string, label: string) {
  if (value.includes(".")) {
    throw new Error(`${label} must not contain a dot: ${value}`);
  }
}
```

## packages/curriculum-core/src/slugs.ts

```ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function topicIdFromTitle(prefix: string, title: string): string {
  return `${prefix}.${slugify(title)}`;
}
```

## packages/curriculum-core/src/ids.ts

```ts
export function buildModuleSlug(subjectSlug: string, index: number) {
  return `${subjectSlug}_module_${index}`;
}

export function buildModulePrefix(subjectSlug: string, index: number) {
  const short = subjectSlug.slice(0, 2) || subjectSlug;
  return `${short}${index}`;
}

export function buildSectionSlug(moduleIndex: number, sectionIndex: number) {
  return `section_${moduleIndex}_${sectionIndex}`;
}
```

## packages/curriculum-core/src/messageKeys.ts

```ts
export function buildSubjectTitleKey(subjectSlug: string) {
  return `subjects.${subjectSlug}.title`;
}

export function buildSubjectDescriptionKey(subjectSlug: string) {
  return `subjects.${subjectSlug}.description`;
}

export function buildModuleTitleKey(subjectSlug: string, moduleSlug: string) {
  return `modules.${subjectSlug}.${moduleSlug}.title`;
}

export function buildModuleDescriptionKey(subjectSlug: string, moduleSlug: string) {
  return `modules.${subjectSlug}.${moduleSlug}.description`;
}

export function buildSectionTitleKey(subjectSlug: string, moduleSlug: string, sectionSlug: string) {
  return `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.title`;
}

export function buildSectionDescriptionKey(subjectSlug: string, moduleSlug: string, sectionSlug: string) {
  return `sections.${subjectSlug}.${moduleSlug}.${sectionSlug}.description`;
}

export function buildTopicBaseKey(subjectSlug: string, moduleSlug: string, topicId: string) {
  return `topics.${subjectSlug}.${moduleSlug}.${topicId}`;
}

export function buildSketchBaseKey(subjectSlug: string, moduleSlug: string, topicId: string, sketchId: string) {
  return `sketches.${subjectSlug}.${moduleSlug}.${topicId}.${sketchId}`;
}
```

## packages/curriculum-core/src/paths.ts

```ts
export function getSubjectManifestPath(subjectSlug: string) {
  return `src/lib/subjects/${subjectSlug}/subject.manifest.json`;
}

export function getTopicBundlePath(subjectSlug: string, moduleSlug: string, topicId: string) {
  return `src/lib/subjects/${subjectSlug}/modules/${moduleSlug}/${topicId}/topic.bundle.json`;
}

export function getSubjectMessagesPath(locale: string, subjectSlug: string) {
  return `src/i18n/messages/${locale}/subjects/${subjectSlug}/subject.json`;
}

export function getTopicMessagesPath(locale: string, subjectSlug: string, moduleSlug: string, topicId: string) {
  return `src/i18n/messages/${locale}/subjects/${subjectSlug}/${moduleSlug}/${topicId}.json`;
}

export function getDraftSubjectManifestPath(subjectSlug: string) {
  return `.curriculum-drafts/subjects/${subjectSlug}/subject.manifest.json`;
}

export function getDraftTopicBundlePath(subjectSlug: string, moduleSlug: string, topicId: string) {
  return `.curriculum-drafts/subjects/${subjectSlug}/modules/${moduleSlug}/${topicId}/topic.bundle.json`;
}

export function getDraftTopicMessagesPath(locale: string, subjectSlug: string, moduleSlug: string, topicId: string) {
  return `.curriculum-drafts/messages/${locale}/subjects/${subjectSlug}/${moduleSlug}/${topicId}.json`;
}
```

## packages/curriculum-core/src/withTopicParentContext.ts

```ts
import type { FullTopicManifest, SlimTopicManifest } from "@zoeskoul/curriculum-contracts";
import type { ManifestRuntimeDefaults } from "@zoeskoul/curriculum-contracts";

export function withTopicParentContext(args: {
  manifest: SlimTopicManifest;
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  prefix: string;
  moduleRuntimeDefaults?: ManifestRuntimeDefaults | null;
}): FullTopicManifest {
  return {
    ...args.manifest,
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    sectionSlug: args.sectionSlug,
    prefix: args.prefix,
    runtimeDefaults: args.manifest.runtimeDefaults ?? args.moduleRuntimeDefaults ?? null,
  };
}
```

## packages/curriculum-core/src/index.ts

```ts
export * from "./ids";
export * from "./invariants";
export * from "./messageKeys";
export * from "./paths";
export * from "./slugs";
export * from "./withTopicParentContext";
```

---

# 5. profiles

## packages/curriculum-profiles/src/types.ts

```ts
import type {
  CourseProfileId,
  ManifestRuntimeDefaults,
  PlannedModule,
  TopicBundleManifest,
} from "@zoeskoul/curriculum-contracts";

export type RecipeHandler<T = any> = (
  def: any,
  args: any,
  resolved: {
    title: string;
    prompt: string;
    hint?: string;
    starterCode: string;
    help?: any;
    expectedExampleMeta?: string;
    maybeT?: (key: string) => string | undefined;
  },
) => any;

export type CourseProfile = {
  id: CourseProfileId;
  allowedExerciseKinds: string[];
  allowedRecipeTypes: string[];
  buildModuleRuntimeDefaults(module: PlannedModule): ManifestRuntimeDefaults | null;
  getRecipeRegistry(): Record<string, RecipeHandler<any>>;
  validateTopicBundle(bundle: TopicBundleManifest): string[];
};
```

## packages/curriculum-profiles/src/base/expectedExample.ts

```ts
export type CodeExpectedExample =
  | {
      kind: "terminal";
      meta?: string;
      stdin?: string;
      stdout: string;
    }
  | {
      kind: "sql_result";
      meta?: string;
      columns: string[];
      rows: Array<Array<string | number | null>>;
    };

type ResolvedRecipeContext = {
  expectedExampleMeta?: string;
  maybeT?: (key: string) => string | undefined;
};

type TestLike = {
  stdin?: string;
  stdout: string;
};

function shouldShowExpectedExample(def: any): boolean {
  return def.showExpectedExample !== false;
}

function resolveMeta(def: any, resolved: ResolvedRecipeContext): string | undefined {
  if (!shouldShowExpectedExample(def)) return undefined;

  if (typeof def.showExpectedExample === "object" && def.showExpectedExample.metaKey) {
    return resolved.maybeT?.(def.showExpectedExample.metaKey);
  }

  return resolved.expectedExampleMeta;
}

function normalizeCell(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function getBetterSqlite3(): any | null {
  if (typeof window !== "undefined") return null;
  try {
    const req = eval("require") as NodeJS.Require;
    return req("better-sqlite3");
  } catch {
    return null;
  }
}

export function buildTerminalExpectedExample(args: {
  def: any;
  resolved: ResolvedRecipeContext;
  tests: readonly TestLike[];
}): CodeExpectedExample | null {
  const { def, resolved, tests } = args;
  if (!shouldShowExpectedExample(def)) return null;
  if (!tests.length) return null;
  const first = tests[0];
  if (!first?.stdout) return null;

  const meta = resolveMeta(def, resolved);

  return {
    kind: "terminal",
    ...(meta ? { meta } : {}),
    ...(first.stdin ? { stdin: first.stdin } : {}),
    stdout: first.stdout,
  };
}

export function buildSqlExpectedExample(args: {
  def: any;
  resolved: ResolvedRecipeContext;
  schemaSql: string;
  seedSql: string;
  solutionCode: string;
  maxRows?: number;
}): CodeExpectedExample | null {
  const { def, resolved, schemaSql, seedSql, solutionCode, maxRows = 12 } = args;
  if (!shouldShowExpectedExample(def)) return null;

  const BetterSqlite3 = getBetterSqlite3();
  if (!BetterSqlite3) return null;

  const meta = resolveMeta(def, resolved);
  const db = new BetterSqlite3(":memory:");

  try {
    if (schemaSql.trim()) db.exec(schemaSql);
    if (seedSql.trim()) db.exec(seedSql);

    const stmt = db.prepare(solutionCode);
    const columns = stmt.columns().map((c: { name: string }) => c.name);
    const rawRows = stmt.all();

    const rows = rawRows.slice(0, maxRows).map((rowObj: Record<string, unknown>) =>
      columns.map((col: string) => normalizeCell(rowObj[col])),
    );

    return {
      kind: "sql_result",
      ...(meta ? { meta } : {}),
      columns,
      rows,
    };
  } finally {
    db.close();
  }
}
```

## packages/curriculum-profiles/src/base/recipes/buildFixedTestsRecipe.ts

```ts
import { buildTerminalExpectedExample } from "../expectedExample";

export const buildFixedTestsRecipe = (def: any, args: any, resolved: any) => {
  const tests = def.recipe.tests.map((t: any) => ({
    stdin: t.stdin,
    stdout: t.stdout,
    match: t.match ?? "exact",
  }));

  const expectedExample = buildTerminalExpectedExample({
    def,
    resolved,
    tests,
  });

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language: def.language ?? "python",
    starterCode: resolved.starterCode,
    help: resolved.help,
    hint: resolved.hint,
    fixedSqlDialect: def.fixedSqlDialect,
    expected: {
      kind: "code_input",
      tests,
      ...(def.recipe.solutionCode ? { solutionCode: def.recipe.solutionCode } : {}),
    },
    expectedExample,
  };
};
```

## packages/curriculum-profiles/src/base/recipes/buildTemplateIoRecipe.ts

```ts
import { buildTerminalExpectedExample } from "../expectedExample";

function resolveVar(rng: any, spec: any, current: Record<string, string | number>) {
  switch (spec.source) {
    case "int":
      return rng.int(spec.min, spec.max);
    case "pick":
      return rng.pick(spec.from);
    case "pickDifferentFromVar": {
      const avoid = String(current[spec.var] ?? "");
      let x = rng.pick(spec.from);
      for (let i = 0; i < 8 && x === avoid; i++) x = rng.pick(spec.from);
      return x;
    }
    case "intDifferentFromVar": {
      const avoid = Number(current[spec.var] ?? 0);
      let x = rng.int(spec.min, spec.max);
      for (let i = 0; i < 8 && x === avoid; i++) x = rng.int(spec.min, spec.max);
      return x;
    }
    default:
      throw new Error("Unsupported var source");
  }
}

function computeValue(spec: any, vars: Record<string, string | number>) {
  const left = Number(vars[spec.left] ?? 0);
  switch (spec.op) {
    case "add":
      return left + spec.right;
    case "sub":
      return left - spec.right;
    case "mul":
      return left * spec.right;
    case "floor_div":
      return Math.floor(left / spec.right);
    case "c_to_f_int":
      return Math.floor((left * 9) / 5 + 32);
    case "mul_div_floor":
      return Math.floor((Number(vars[spec.left] ?? 0) * Number(vars[spec.right] ?? 0)) / spec.divisor);
    default:
      throw new Error("Unsupported computed op");
  }
}

function fillTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export const buildTemplateIoRecipe = (def: any, args: any, resolved: any) => {
  const vars: Record<string, string | number> = {};

  for (const [name, spec] of Object.entries(def.recipe.vars)) {
    vars[name] = resolveVar(args.rng, spec, vars);
  }

  for (const [name, spec] of Object.entries(def.recipe.computed ?? {})) {
    vars[name] = computeValue(spec, vars);
  }

  const tests = def.recipe.tests.map((t: any) => ({
    stdin: t.stdinTemplate ? fillTemplate(t.stdinTemplate, vars) : undefined,
    stdout: fillTemplate(t.stdoutTemplate, vars),
    match: t.match ?? "exact",
  }));

  const expectedExample = buildTerminalExpectedExample({ def, resolved, tests });

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language: def.language ?? "python",
    starterCode: resolved.starterCode,
    help: resolved.help,
    hint: resolved.hint,
    fixedSqlDialect: def.fixedSqlDialect,
    expected: {
      kind: "code_input",
      tests,
      ...(def.recipe.solutionTemplate
        ? { solutionCode: fillTemplate(def.recipe.solutionTemplate, vars) }
        : {}),
    },
    expectedExample,
  };
};
```

## packages/curriculum-profiles/src/sql/recipes/buildSqlQueryRecipe.ts

```ts
import { buildSqlExpectedExample } from "../../base/expectedExample";

function buildSqlExpected(args: {
  datasetId: string;
  resultShape?: "table";
  ignoreRowOrder?: boolean;
  solutionCode: string;
}) {
  const resultShape = args.resultShape ?? "table";

  return {
    kind: "code_input",
    language: "sql",
    fixedSqlDialect: "sqlite",
    runtime: {
      kind: "sql",
      datasetId: args.datasetId,
      resultShape,
    },
    tests: [
      {
        kind: "sql",
        sqlDialect: "sqlite",
        runtime: {
          kind: "sql",
          datasetId: args.datasetId,
          resultShape,
        },
        compareTo: "solution",
        match: "table_exact",
        ignoreRowOrder: args.ignoreRowOrder ?? false,
      },
    ],
    solutionCode: args.solutionCode,
  };
}

function resolveSqlRunnerConfig(args: {
  sqlDialect: string;
  sqlDatasetId: string;
}) {
  return {
    isSql: true,
    sqlSchemaSql: process.env[`SQL_SCHEMA_${args.sqlDatasetId}`] ?? "",
    sqlSeedSql: process.env[`SQL_SEED_${args.sqlDatasetId}`] ?? "",
  };
}

export const buildSqlQueryRecipe = (def: any, args: any, resolved: any) => {
  if (!def.recipe.datasetId) {
    throw new Error(`sql_query recipe "${def.id}" is missing datasetId`);
  }

  const expected = buildSqlExpected({
    datasetId: def.recipe.datasetId,
    resultShape: def.recipe.resultShape,
    ignoreRowOrder: def.recipe.ignoreRowOrder,
    solutionCode: def.recipe.solutionCode,
  });

  const resolvedSql = resolveSqlRunnerConfig({
    sqlDialect: def.fixedSqlDialect ?? "sqlite",
    sqlDatasetId: def.recipe.datasetId,
  });

  const expectedExample =
    resolvedSql.isSql && resolvedSql.sqlSchemaSql && resolvedSql.sqlSeedSql
      ? buildSqlExpectedExample({
          def,
          resolved,
          schemaSql: resolvedSql.sqlSchemaSql,
          seedSql: resolvedSql.sqlSeedSql,
          solutionCode: def.recipe.solutionCode,
        })
      : null;

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language: def.language ?? "sql",
    starterCode: resolved.starterCode,
    help: resolved.help,
    hint: resolved.hint,
    fixedSqlDialect: def.fixedSqlDialect ?? "sqlite",
    runtime: {
      kind: "sql",
      datasetId: def.recipe.datasetId,
      resultShape: def.recipe.resultShape ?? "table",
    },
    expected,
    expectedExample,
  };
};
```

## packages/curriculum-profiles/src/sql/index.ts

```ts
import type { CourseProfile } from "../types";
import { buildSqlQueryRecipe } from "./recipes/buildSqlQueryRecipe";

export const sqlProfile: CourseProfile = {
  id: "sql",
  allowedExerciseKinds: [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
  ],
  allowedRecipeTypes: ["fixed_tests", "template_io", "sql_query"],
  buildModuleRuntimeDefaults() {
    return {
      kind: "sql",
      datasetId: "products_catalog",
      fixedSqlDialect: "sqlite",
      resultShape: "table",
    };
  },
  getRecipeRegistry() {
    return {
      sql_query: buildSqlQueryRecipe,
    };
  },
  validateTopicBundle(bundle) {
    const issues: string[] = [];
    for (const ex of bundle.exercises) {
      if (ex.kind === "code_input" && ex.recipe.type === "sql_query" && !ex.recipe.datasetId) {
        issues.push(`Exercise ${ex.id} is missing datasetId`);
      }
    }
    return issues;
  },
};
```

## packages/curriculum-profiles/src/python/index.ts

```ts
import type { CourseProfile } from "../types";

export const pythonProfile: CourseProfile = {
  id: "python",
  allowedExerciseKinds: [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
  ],
  allowedRecipeTypes: ["fixed_tests", "template_io"],
  buildModuleRuntimeDefaults() {
    return {
      kind: "code",
      language: "python",
    };
  },
  getRecipeRegistry() {
    return {};
  },
  validateTopicBundle() {
    return [];
  },
};
```

## packages/curriculum-profiles/src/math/index.ts

```ts
import type { CourseProfile } from "../types";

export const mathProfile: CourseProfile = {
  id: "math",
  allowedExerciseKinds: ["single_choice", "multi_choice", "drag_reorder", "fill_blank_choice"],
  allowedRecipeTypes: ["fixed_tests", "template_io"],
  buildModuleRuntimeDefaults() {
    return null;
  },
  getRecipeRegistry() {
    return {};
  },
  validateTopicBundle() {
    return [];
  },
};
```

## packages/curriculum-profiles/src/language/index.ts

```ts
import type { CourseProfile } from "../types";

export const languageProfile: CourseProfile = {
  id: "language",
  allowedExerciseKinds: ["single_choice", "multi_choice", "drag_reorder", "fill_blank_choice"],
  allowedRecipeTypes: ["fixed_tests", "template_io"],
  buildModuleRuntimeDefaults() {
    return null;
  },
  getRecipeRegistry() {
    return {};
  },
  validateTopicBundle() {
    return [];
  },
};
```

## packages/curriculum-profiles/src/web/index.ts

```ts
import type { CourseProfile } from "../types";

export const webProfile: CourseProfile = {
  id: "web",
  allowedExerciseKinds: [
    "single_choice",
    "multi_choice",
    "drag_reorder",
    "fill_blank_choice",
    "code_input",
  ],
  allowedRecipeTypes: ["fixed_tests", "template_io"],
  buildModuleRuntimeDefaults() {
    return {
      kind: "code",
      language: "javascript",
    };
  },
  getRecipeRegistry() {
    return {};
  },
  validateTopicBundle() {
    return [];
  },
};
```

## packages/curriculum-profiles/src/registry.ts

```ts
import type { CourseProfile, RecipeHandler } from "./types";
import { buildFixedTestsRecipe } from "./base/recipes/buildFixedTestsRecipe";
import { buildTemplateIoRecipe } from "./base/recipes/buildTemplateIoRecipe";
import { sqlProfile } from "./sql";
import { pythonProfile } from "./python";
import { mathProfile } from "./math";
import { languageProfile } from "./language";
import { webProfile } from "./web";

const profiles = [sqlProfile, pythonProfile, mathProfile, languageProfile, webProfile] satisfies CourseProfile[];

export const PROFILE_REGISTRY = Object.fromEntries(profiles.map((p) => [p.id, p])) as Record<string, CourseProfile>;

export const BASE_RECIPE_REGISTRY: Record<string, RecipeHandler<any>> = {
  fixed_tests: buildFixedTestsRecipe,
  template_io: buildTemplateIoRecipe,
};

export function getProfile(id: string): CourseProfile {
  const profile = PROFILE_REGISTRY[id];
  if (!profile) throw new Error(`Unknown course profile: ${id}`);
  return profile;
}

export function getRecipeRegistryForProfile(id: string) {
  const profile = getProfile(id);
  return {
    ...BASE_RECIPE_REGISTRY,
    ...profile.getRecipeRegistry(),
  };
}
```

## packages/curriculum-profiles/src/index.ts

```ts
export * from "./types";
export * from "./registry";
```

---

# 6. runtime

## packages/curriculum-runtime/src/i18n/resolveManifestMessages.ts

```ts
export function tag(key: string) {
  return `@:${key}`;
}

export function t(key?: string | null) {
  return key ? tag(key) : "";
}

export function resolveHelp(base: string) {
  const out: Record<string, string> = {};

  const concept = tag(`${base}.help.concept`);
  const hint1 = tag(`${base}.help.hint_1`);
  const hint2 = tag(`${base}.help.hint_2`);

  if (concept !== `${base}.help.concept`) out.concept = concept;
  if (hint1 !== `${base}.help.hint_1`) out.hint_1 = hint1;
  if (hint2 !== `${base}.help.hint_2`) out.hint_2 = hint2;

  return Object.keys(out).length ? out : undefined;
}

export function resolveOptionsByIds(base: string, ids: string[]) {
  return ids.map((id) => ({ id, text: tag(`${base}.options.${id}`) }));
}

export function resolveTokensByIds(base: string, ids: string[]) {
  return ids.map((id) => ({ id, text: tag(`${base}.tokens.${id}`) }));
}

export function resolveChoicesByCount(base: string, count: number) {
  return Array.from({ length: count }, (_, i) => tag(`${base}.choices.${i}`));
}
```

## packages/curriculum-runtime/src/review/reviewBuilders.ts

```ts
export function makeSketchCard(args: any) {
  return {
    type: "sketch",
    id: `${args.topicId}_s${args.index}`,
    title: args.title,
    sketchId: args.sketchId,
    spec: args.spec,
    height: args.height,
    props: args.props,
  };
}

export function makeQuizSpec(args: any) {
  return {
    subject: args.subject,
    module: args.module,
    section: args.section,
    topic: args.topic,
    difficulty: args.difficulty ?? "easy",
    n: args.n ?? 3,
    allowReveal: args.allowReveal ?? true,
    preferKind: args.preferKind ?? null,
    maxAttempts: args.maxAttempts ?? 10,
    runtime: args.runtime ?? null,
  };
}

export function makeQuizCard(args: any) {
  return {
    type: "quiz",
    id: `${args.topicId}_q${args.index}`,
    title: args.title,
    passScore: args.passScore ?? 0.75,
    spec: args.spec,
  };
}

export function makeProjectStep(args: any) {
  return {
    id: args.id,
    title: args.title,
    topic: args.topic,
    difficulty: args.difficulty,
    preferKind: args.preferKind ?? null,
    exerciseKey: args.exerciseKey,
    seedPolicy: args.seedPolicy,
    maxAttempts: args.maxAttempts,
    carryFromPrev: args.carryFromPrev,
  };
}

export function makeProjectSpec(args: any) {
  return {
    mode: "project",
    subject: args.subject,
    module: args.module,
    section: args.section,
    topic: args.topic,
    difficulty: args.difficulty ?? "easy",
    preferKind: args.preferKind ?? null,
    allowReveal: args.allowReveal ?? true,
    maxAttempts: args.maxAttempts ?? 10,
    steps: args.steps,
    runtime: args.runtime ?? null,
  };
}

export function makeProjectCard(args: any) {
  return {
    type: "project",
    id: `${args.topicId}_p${args.index}`,
    title: args.title,
    passScore: args.passScore ?? 0.75,
    spec: args.spec,
  };
}
```

## packages/curriculum-runtime/src/review/buildReviewFromManifest.ts

```ts
import { makeProjectCard, makeProjectSpec, makeProjectStep, makeQuizCard, makeQuizSpec, makeSketchCard } from "./reviewBuilders";
import { tag } from "../i18n/resolveManifestMessages";

export function buildReviewFromManifest(args: {
  manifest: any;
  pool: readonly { key: string; w: number; kind?: any; purpose?: any }[];
}) {
  const { manifest, pool } = args;
  const topicSlug = `${manifest.prefix}.${manifest.topicId}`;

  const topic = {
    id: manifest.topicId,
    label: tag(manifest.topic.labelKey),
    minutes: manifest.minutes,
    summary: tag(manifest.topic.summaryKey),
    meta: {
      runtimeDefaults: manifest.runtimeDefaults ?? null,
    },
    cards: manifest.cards.map((card: any, index: number) => {
      if (card.kind === "sketch") {
        return makeSketchCard({
          topicId: manifest.topicId,
          index,
          title: tag(card.titleKey),
          sketchId: `${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.${card.sketchId}`,
          height: card.height ?? 520,
        });
      }

      if (card.kind === "quiz") {
        return makeQuizCard({
          topicId: manifest.topicId,
          index,
          title: tag(card.titleKey),
          spec: makeQuizSpec({
            subject: manifest.subjectSlug,
            module: manifest.moduleSlug,
            section: manifest.sectionSlug,
            topic: topicSlug,
            difficulty: card.quiz.difficulty,
            n: card.quiz.n,
            allowReveal: card.quiz.allowReveal ?? true,
            preferKind: card.quiz.preferKind ?? null,
            maxAttempts: card.quiz.maxAttempts ?? 10,
            runtime: manifest.runtimeDefaults ?? null,
          }),
        });
      }

      if (card.kind === "project") {
        return makeProjectCard({
          topicId: manifest.topicId,
          index,
          title: tag(card.titleKey),
          spec: makeProjectSpec({
            subject: manifest.subjectSlug,
            module: manifest.moduleSlug,
            section: manifest.sectionSlug,
            topic: topicSlug,
            difficulty: card.project.difficulty,
            allowReveal: card.project.allowReveal ?? true,
            preferKind: card.project.preferKind ?? null,
            maxAttempts: card.project.maxAttempts ?? 10,
            runtime: manifest.runtimeDefaults ?? null,
            steps: card.project.steps.map((step: any) =>
              makeProjectStep({
                id: step.id,
                title: tag(step.titleKey),
                topic: topicSlug,
                difficulty: step.difficulty ?? card.project.difficulty,
                preferKind: step.preferKind ?? card.project.preferKind ?? null,
                exerciseKey: step.exerciseKey,
                seedPolicy: step.seedPolicy === "step" ? "actor" : (step.seedPolicy ?? "global"),
                maxAttempts: step.maxAttempts ?? card.project.maxAttempts ?? 10,
              }),
            ),
          }),
        });
      }

      throw new Error(`Unsupported card kind: ${card.kind}`);
    }),
  };

  const def = {
    id: manifest.topicId,
    meta: {
      label: tag(manifest.topic.labelKey),
      minutes: manifest.minutes,
      pool,
      runtimeDefaults: manifest.runtimeDefaults ?? null,
    },
  };

  return { topic, def };
}
```

## packages/curriculum-runtime/src/sketches/buildSketchesFromManifest.ts

```ts
function cloudinaryImageUrl(imagePublicId: string) {
  return `https://res.cloudinary.com/demo/image/upload/${imagePublicId}`;
}

export function buildSketchesFromManifest(manifest: any): Record<string, any> {
  const entries: Array<[string, any]> = manifest.sketches.map((sketch: any) => {
    const sketchId = `${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.${sketch.id}`;
    const runtime = sketch.runtime ?? manifest.runtimeDefaults ?? null;

    if (sketch.archetype === "image") {
      return [
        sketchId,
        {
          kind: "archetype",
          spec: {
            archetype: "image",
            specVersion: 1,
            title: `@:${sketch.titleKey}`,
            src: sketch.src ?? (sketch.publicId ? cloudinaryImageUrl(sketch.publicId) : ""),
            ...(sketch.altKey ? { alt: `@:${sketch.altKey}` } : {}),
            ...(sketch.captionKey ? { caption: `@:${sketch.captionKey}` } : {}),
            ...(sketch.aspectRatio != null ? { aspectRatio: sketch.aspectRatio } : {}),
            ...(runtime ? { runtime } : {}),
          },
        },
      ];
    }

    return [
      sketchId,
      {
        kind: "archetype",
        spec: {
          archetype: "paragraph",
          specVersion: 2,
          title: `@:${sketch.titleKey}`,
          bodyMarkdown: `@:${sketch.bodyKey}`,
          ...(runtime ? { runtime } : {}),
          ...(sketch.images?.length
            ? {
                images: Object.fromEntries(
                  sketch.images.map((img: any) => [
                    img.id,
                    {
                      src: cloudinaryImageUrl(img.publicId),
                      alt: img.alt ?? "",
                      ...(img.width != null ? { width: img.width } : {}),
                      ...(img.height != null ? { height: img.height } : {}),
                    },
                  ]),
                ),
              }
            : {}),
        },
      },
    ];
  });

  return Object.fromEntries(entries);
}
```

## packages/curriculum-runtime/src/generator/recipeRegistry.ts

```ts
import { getRecipeRegistryForProfile } from "@zoeskoul/curriculum-profiles";

export function getRecipeRegistry(profileId: string) {
  return getRecipeRegistryForProfile(profileId);
}
```

## packages/curriculum-runtime/src/generator/buildExerciseFromManifest.ts

```ts
import { getRecipeRegistry } from "./recipeRegistry";
import { resolveChoicesByCount, resolveHelp, resolveOptionsByIds, resolveTokensByIds, t } from "../i18n/resolveManifestMessages";

function maybeT(key: string): string | undefined {
  try {
    return t(key);
  } catch {
    return undefined;
  }
}

function resolveBase(messageBase: string) {
  return {
    title: t(`${messageBase}.title`),
    prompt: t(`${messageBase}.prompt`),
    hint: maybeT(`${messageBase}.hint`),
    help: resolveHelp(messageBase),
    starterCode: maybeT(`${messageBase}.starterCode`) ?? "",
    template: maybeT(`${messageBase}.template`) ?? "",
    expectedExampleMeta: maybeT(`${messageBase}.expectedExampleMeta`),
    maybeT,
  };
}

function buildCodeInput(def: any, args: any, profileId: string) {
  const resolved = resolveBase(def.messageBase);
  const recipeHandler = getRecipeRegistry(profileId)[def.recipe.type];

  if (!recipeHandler) {
    throw new Error(`Unknown recipe type "${def.recipe.type}" for "${def.id}"`);
  }

  return recipeHandler(def, args, resolved);
}

export function buildExerciseFromManifest(def: any, args: any, profileId: string) {
  const resolved = resolveBase(def.messageBase);

  switch (def.kind) {
    case "single_choice":
      return {
        kind: "single_choice",
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        options: resolveOptionsByIds(def.messageBase, def.optionIds),
        answerOptionId: def.expected.optionId,
        help: resolved.help,
        hint: resolved.hint,
      };

    case "multi_choice":
      return {
        kind: "multi_choice",
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        options: resolveOptionsByIds(def.messageBase, def.optionIds),
        answerOptionIds: def.expected.optionIds,
        help: resolved.help,
        hint: resolved.hint,
      };

    case "drag_reorder":
      return {
        kind: "drag_reorder",
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        tokens: resolveTokensByIds(def.messageBase, def.tokenIds),
        answerTokenIds: def.expected.tokenIds,
        help: resolved.help,
        hint: resolved.hint,
      };

    case "fill_blank_choice":
      return {
        kind: "fill_blank_choice",
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        template: resolved.template,
        choices: resolveChoicesByCount(def.messageBase, def.choiceCount),
        correct: def.expected.value,
        help: resolved.help,
        hint: resolved.hint,
      };

    case "code_input":
      return buildCodeInput(def, args, profileId);

    default:
      throw new Error(`Unsupported exercise kind: ${def.kind}`);
  }
}
```

## packages/curriculum-runtime/src/generator/resolveModuleFromTopicSlug.ts

```ts
function parseTopicSlug(topicSlug: string) {
  const parts = topicSlug.split(".");
  if (parts.length > 1) {
    return { prefix: parts[0], base: parts.slice(1).join(".") };
  }
  return { prefix: null, base: topicSlug };
}

export function resolveModuleFromTopicSlug(args: {
  manifest: any;
  topicSlug: string | null | undefined;
}): string | null {
  const { manifest, topicSlug } = args;
  const { base, prefix } = parseTopicSlug(String(topicSlug ?? ""));

  if (prefix) {
    const byPrefix = manifest.modules.find((m: any) => m.prefix === prefix);
    if (byPrefix) return byPrefix.slug;
  }

  for (const module of manifest.modules) {
    for (const section of module.sections) {
      if (section.topics.includes(base)) {
        return module.slug;
      }
    }
  }

  return null;
}
```

## packages/curriculum-runtime/src/generator/buildGeneratorTopicsForModule.ts

```ts
import { withTopicParentContext } from "@zoeskoul/curriculum-core";
import { defineJsonTopicBundle } from "./defineJsonTopicBundle";

export function buildGeneratorTopicsForModule(args: {
  manifest: any;
  topicManifests: Record<string, any>;
  moduleSlug: string;
  profileId: string;
}) {
  const { manifest, topicManifests, moduleSlug, profileId } = args;

  const moduleManifest = manifest.modules.find((m: any) => m.slug === moduleSlug);
  if (!moduleManifest) throw new Error(`Unknown module slug "${moduleSlug}"`);

  return moduleManifest.sections.flatMap((section: any) =>
    section.topics.map((topicId: string) => {
      const topicManifest = topicManifests[topicId];
      if (!topicManifest) throw new Error(`Missing topic manifest "${topicId}"`);

      const fullManifest = withTopicParentContext({
        manifest: topicManifest,
        subjectSlug: manifest.subject.slug,
        moduleSlug: moduleManifest.slug,
        sectionSlug: section.slug,
        prefix: moduleManifest.prefix,
        moduleRuntimeDefaults: moduleManifest.runtimeDefaults ?? null,
      });

      return defineJsonTopicBundle(fullManifest, profileId);
    }),
  );
}
```

## packages/curriculum-runtime/src/generator/defineJsonTopicBundle.ts

```ts
import { buildReviewFromManifest } from "../review/buildReviewFromManifest";
import { buildSketchesFromManifest } from "../sketches/buildSketchesFromManifest";

export function defineJsonTopicBundle(manifest: any, profileId: string) {
  const generatorTopic = {
    id: manifest.topicId,
    pool: manifest.exercises.map((ex: any) => ({
      key: ex.id,
      w: ex.weight ?? 1,
      kind: ex.kind,
      purpose: ex.purpose,
    })),
    manifest,
    profileId,
  };

  const review = buildReviewFromManifest({
    manifest,
    pool: generatorTopic.pool,
  });

  const sketches = buildSketchesFromManifest(manifest);

  return {
    def: review.def,
    review: review.topic,
    sketches,
    generator: generatorTopic,
  };
}
```

## packages/curriculum-runtime/src/generator/makeSubjectGeneratorFromManifest.ts

```ts
import { buildGeneratorTopicsForModule } from "./buildGeneratorTopicsForModule";
import { resolveModuleFromTopicSlug } from "./resolveModuleFromTopicSlug";

export function makeSubjectGeneratorFromManifest(args: {
  manifest: any;
  topicManifests: Record<string, any>;
  ctx: { topicSlug?: string | null };
  profileId: string;
}) {
  const { manifest, topicManifests, ctx, profileId } = args;

  const rawTopicSlug = String(ctx.topicSlug ?? "");
  const moduleSlug = resolveModuleFromTopicSlug({ manifest, topicSlug: rawTopicSlug });

  if (!moduleSlug) {
    return {
      engineName: `${manifest.subject.genKey}_none`,
      topics: [],
    };
  }

  const topics = buildGeneratorTopicsForModule({
    manifest,
    topicManifests,
    moduleSlug,
    profileId,
  });

  return {
    engineName: `${manifest.subject.genKey}_${moduleSlug}`,
    defaultPurpose: "quiz",
    enablePurpose: true,
    topics,
  };
}
```

## packages/curriculum-runtime/src/course/defineCourseFromManifest.ts

```ts
import { tag } from "../i18n/resolveManifestMessages";
import { withTopicParentContext } from "@zoeskoul/curriculum-core";
import { defineJsonTopicBundle } from "../generator/defineJsonTopicBundle";

export function defineCourseFromManifest(args: {
  manifest: any;
  topicManifests: Record<string, any>;
  profileId: string;
}) {
  const { manifest, topicManifests, profileId } = args;

  const modules = manifest.modules.map((moduleManifest: any) => {
    const sections = moduleManifest.sections.map((sectionManifest: any) => {
      const topics = sectionManifest.topics.map((topicId: string) => {
        const topicManifest = topicManifests[topicId];
        if (!topicManifest) {
          throw new Error(`Missing topic manifest "${topicId}"`);
        }

        return defineJsonTopicBundle(
          withTopicParentContext({
            manifest: topicManifest,
            subjectSlug: manifest.subject.slug,
            moduleSlug: moduleManifest.slug,
            sectionSlug: sectionManifest.slug,
            prefix: moduleManifest.prefix,
            moduleRuntimeDefaults: moduleManifest.runtimeDefaults ?? null,
          }),
          profileId,
        );
      });

      return {
        section: {
          slug: sectionManifest.slug,
          order: sectionManifest.order,
          title: tag(sectionManifest.titleKey),
          description: sectionManifest.descriptionKey ? tag(sectionManifest.descriptionKey) : undefined,
          titleKey: sectionManifest.titleKey,
          descriptionKey: sectionManifest.descriptionKey ?? undefined,
          meta: {
            ...(sectionManifest.meta?.module != null ? { module: sectionManifest.meta.module } : {}),
            ...(sectionManifest.meta?.weeksKey ? { weeks: tag(sectionManifest.meta.weeksKey) } : {}),
            ...(sectionManifest.meta?.bulletKeys?.length ? { bullets: sectionManifest.meta.bulletKeys.map((k: string) => tag(k)) } : {}),
            ...(sectionManifest.meta?.weeksKey ? { weeksKey: sectionManifest.meta.weeksKey } : {}),
            ...(sectionManifest.meta?.bulletKeys?.length ? { bulletKeys: [...sectionManifest.meta.bulletKeys] } : {}),
          },
        },
        topics,
      };
    });

    return {
      module: {
        slug: moduleManifest.slug,
        subjectSlug: manifest.subject.slug,
        order: moduleManifest.order,
        title: tag(moduleManifest.titleKey),
        description: moduleManifest.descriptionKey ? tag(moduleManifest.descriptionKey) : undefined,
        titleKey: moduleManifest.titleKey,
        descriptionKey: moduleManifest.descriptionKey ?? undefined,
        ...(moduleManifest.weekStart != null ? { weekStart: moduleManifest.weekStart } : {}),
        ...(moduleManifest.weekEnd != null ? { weekEnd: moduleManifest.weekEnd } : {}),
        runtimeDefaults: moduleManifest.runtimeDefaults ?? null,
        ...(moduleManifest.accessOverride ? { accessOverride: moduleManifest.accessOverride } : {}),
        meta: {
          ...(moduleManifest.meta?.estimatedMinutes != null ? { estimatedMinutes: moduleManifest.meta.estimatedMinutes } : {}),
          ...(moduleManifest.meta?.prereqKeys?.length ? { prereqs: moduleManifest.meta.prereqKeys.map((k: string) => tag(k)) } : {}),
          ...(moduleManifest.meta?.outcomeKeys?.length ? { outcomes: moduleManifest.meta.outcomeKeys.map((k: string) => tag(k)) } : {}),
          ...(moduleManifest.meta?.whyKeys?.length ? { why: moduleManifest.meta.whyKeys.map((k: string) => tag(k)) } : {}),
          ...(moduleManifest.meta?.prereqKeys?.length ? { prereqKeys: [...moduleManifest.meta.prereqKeys] } : {}),
          ...(moduleManifest.meta?.outcomeKeys?.length ? { outcomeKeys: [...moduleManifest.meta.outcomeKeys] } : {}),
          ...(moduleManifest.meta?.whyKeys?.length ? { whyKeys: [...moduleManifest.meta.whyKeys] } : {}),
        },
      },
      prefix: moduleManifest.prefix,
      genKey: manifest.subject.genKey,
      sections,
    };
  });

  return {
    subject: {
      slug: manifest.subject.slug,
      order: manifest.subject.order,
      title: tag(manifest.subject.titleKey),
      description: manifest.subject.descriptionKey ? tag(manifest.subject.descriptionKey) : undefined,
      titleKey: manifest.subject.titleKey,
      descriptionKey: manifest.subject.descriptionKey ?? undefined,
      imagePublicId: manifest.subject.imagePublicId ?? undefined,
      imageAlt: manifest.subject.imageAlt ?? undefined,
      accessPolicy: manifest.subject.accessPolicy ?? "free",
      status: manifest.subject.status ?? "active",
      meta: {
        ...(manifest.subject.meta?.curriculum
          ? {
              curriculum: {
                ...manifest.subject.meta.curriculum,
                ...(manifest.subject.meta.curriculum.moreComingMessageKey
                  ? { moreComingMessage: tag(manifest.subject.meta.curriculum.moreComingMessageKey) }
                  : {}),
              },
            }
          : {}),
        ...(manifest.subject.meta?.completionPolicy
          ? { completionPolicy: { ...manifest.subject.meta.completionPolicy } }
          : {}),
      },
    },
    modules,
  };
}
```

## packages/curriculum-runtime/src/index.ts

```ts
export * from "./course/defineCourseFromManifest";
export * from "./generator/buildExerciseFromManifest";
export * from "./generator/buildGeneratorTopicsForModule";
export * from "./generator/defineJsonTopicBundle";
export * from "./generator/makeSubjectGeneratorFromManifest";
export * from "./generator/resolveModuleFromTopicSlug";
export * from "./review/buildReviewFromManifest";
export * from "./review/reviewBuilders";
export * from "./sketches/buildSketchesFromManifest";
```

---

# 7. registry

## packages/curriculum-registry/src/buildArtifacts.ts

```ts
import { assertNoDot, assertNonEmpty, invariant } from "@zoeskoul/curriculum-core";

export function buildArtifacts(courses: readonly any[]) {
  const subjects: any[] = [];
  const modules: any[] = [];
  const topics: any[] = [];
  const sections: any[] = [];

  const sketches: Record<string, any> = {};
  const reviewTopicsBySlug: Record<string, any> = {};
  const generatorsByTopicSlug: Record<string, any> = {};
  const catalog: Record<string, any> = {};

  const subjectSeen = new Set<string>();
  const moduleSeen = new Set<string>();
  const sectionSeen = new Set<string>();
  const topicSeen = new Set<string>();

  for (const course of courses) {
    const { subject } = course;

    assertNonEmpty(subject.slug, "subject.slug");
    assertNonEmpty(subject.titleKey ?? subject.title, "subject.title/titleKey");
    invariant(!subjectSeen.has(subject.slug), `Duplicate subject.slug "${subject.slug}"`);
    subjectSeen.add(subject.slug);

    subjects.push(subject);

    const TOPIC: Record<string, string> = {};
    const modulesBySlug: Record<string, any> = {};

    for (const mod of course.modules) {
      assertNonEmpty(mod.module.slug, "module.slug");
      assertNonEmpty(mod.module.titleKey ?? mod.module.title, `module.title/titleKey for "${mod.module.slug}"`);
      assertNonEmpty(mod.prefix, `prefix for module "${mod.module.slug}"`);
      assertNonEmpty(mod.genKey, `genKey for module "${mod.module.slug}"`);
      assertNoDot(mod.prefix, `prefix for module "${mod.module.slug}"`);

      invariant(!moduleSeen.has(mod.module.slug), `Duplicate module.slug "${mod.module.slug}"`);
      moduleSeen.add(mod.module.slug);
      modules.push(mod.module);

      invariant(mod.sections.length > 0, `Module "${mod.module.slug}" must have at least one section`);

      const firstSection = mod.sections[0];
      const moduleTopicIds: string[] = [];
      const moduleTopicMap: Record<string, string> = {};

      for (const sectionBundle of mod.sections) {
        const sec = sectionBundle.section;

        assertNonEmpty(sec.slug, "section.slug");
        assertNonEmpty(sec.titleKey ?? sec.title, `section.title/titleKey for "${sec.slug}"`);
        invariant(!sectionSeen.has(sec.slug), `Duplicate section.slug "${sec.slug}"`);
        sectionSeen.add(sec.slug);

        const sectionTopicSlugs: string[] = [];

        for (let idx = 0; idx < sectionBundle.topics.length; idx++) {
          const bundle = sectionBundle.topics[idx];
          const def = bundle.def;

          assertNonEmpty(def.id, "topic.id");
          assertNoDot(def.id, `topic.id "${def.id}"`);

          const slug = `${mod.prefix}.${def.id}`;
          invariant(!topicSeen.has(slug), `Duplicate topic slug "${slug}"`);
          topicSeen.add(slug);

          const variant = def.variant === undefined ? def.id : def.variant;

          topics.push({
            slug,
            subjectSlug: subject.slug,
            moduleSlug: mod.module.slug,
            order: def.order ?? idx,
            title: def.titleKey ?? `topic.${slug}`,
            titleKey: def.titleKey,
            description: def.description,
            descriptionKey: undefined,
            genKey: mod.genKey,
            variant,
            meta: def.meta,
          });

          sectionTopicSlugs.push(slug);
          moduleTopicIds.push(def.id);
          moduleTopicMap[def.id] = slug;

          if (TOPIC[def.id] && TOPIC[def.id] !== slug) {
            throw new Error(`TOPIC collision for "${def.id}": "${TOPIC[def.id]}" vs "${slug}"`);
          }
          TOPIC[def.id] = slug;

          if (bundle.review) reviewTopicsBySlug[slug] = bundle.review;
          if (bundle.generator) generatorsByTopicSlug[slug] = { ...bundle.generator, genKey: mod.genKey };

          if (bundle.sketches) {
            for (const [sketchId, entry] of Object.entries(bundle.sketches)) {
              if (sketches[sketchId]) throw new Error(`Duplicate sketch id "${sketchId}"`);
              sketches[sketchId] = entry;
            }
          }
        }

        sections.push({
          slug: sec.slug,
          subjectSlug: subject.slug,
          moduleSlug: mod.module.slug,
          order: sec.order,
          title: sec.title,
          description: sec.description,
          titleKey: sec.titleKey,
          descriptionKey: sec.descriptionKey,
          meta: sec.meta ?? null,
          topicSlugs: sectionTopicSlugs,
        });
      }

      modulesBySlug[mod.module.slug] = {
        moduleSlug: mod.module.slug,
        sectionSlug: firstSection.section.slug,
        sectionTitle: firstSection.section.title,
        sectionTitleKey: firstSection.section.titleKey,
        sectionOrder: firstSection.section.order,
        genKey: mod.genKey,
        prefix: mod.prefix,
        topicIds: [...new Set(moduleTopicIds)],
        topics: moduleTopicMap,
        runtimeDefaults: mod.module.runtimeDefaults ?? null,
      };
    }

    catalog[subject.slug] = {
      subjectSlug: subject.slug,
      TOPIC,
      modulesBySlug,
    };
  }

  return {
    subjects,
    modules,
    topics,
    sections,
    catalog,
    sketches,
    reviewTopicsBySlug,
    generatorsByTopicSlug,
  };
}
```

## packages/curriculum-registry/src/index.ts

```ts
export * from "./buildArtifacts";
```

---

# 8. ai

## packages/curriculum-ai/src/types.ts

```ts
import type { CoursePlan, TopicBundleManifest } from "@zoeskoul/curriculum-contracts";

export type TopicPackDraft = {
  topicBundle: TopicBundleManifest;
  messagesByLocale: Record<string, Record<string, unknown>>;
};

export type AiProvider = {
  generateJson<T>(args: {
    system: string;
    user: string;
    schemaName: string;
  }): Promise<T>;
};
```

## packages/curriculum-ai/src/providers/openai.ts

```ts
import type { AiProvider } from "../types";

export const openAiProvider: AiProvider = {
  async generateJson<T>() {
    throw new Error("Hook up provider here");
  },
};
```

## packages/curriculum-ai/src/prompts/buildPlanPrompt.ts

```ts
import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";

export function buildPlanPrompt(blueprint: CourseBlueprint) {
  return {
    system: "You generate curriculum structure only. Return valid JSON only.",
    user: JSON.stringify({
      task: "Generate a course plan",
      blueprint,
      rules: [
        "Do not generate learner copy beyond short planning fields.",
        "Keep output structural and deterministic.",
        "Do not invent unsupported course mechanics.",
      ],
    }),
  };
}
```

## packages/curriculum-ai/src/prompts/buildTopicPrompt.ts

```ts
export function buildTopicPrompt(args: {
  subjectSlug: string;
  profileId: string;
  moduleSlug: string;
  sectionSlug: string;
  topic: any;
  locale: string;
}) {
  return {
    system: "You generate a topic bundle manifest and message JSON for one topic. Return valid JSON only.",
    user: JSON.stringify(args),
  };
}
```

## packages/curriculum-ai/src/prompts/buildTranslationPrompt.ts

```ts
export function buildTranslationPrompt(args: {
  sourceLocale: "en";
  targetLocale: string;
  messages: Record<string, unknown>;
}) {
  return {
    system: "Translate values only. Preserve JSON shape, placeholders, keys, code blocks, and protected tokens.",
    user: JSON.stringify(args),
  };
}
```

## packages/curriculum-ai/src/generators/generateCoursePlan.ts

```ts
import type { CourseBlueprint, CoursePlan } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "../types";
import { buildPlanPrompt } from "../prompts/buildPlanPrompt";

export async function generateCoursePlan(provider: AiProvider, blueprint: CourseBlueprint): Promise<CoursePlan> {
  const prompt = buildPlanPrompt(blueprint);
  return provider.generateJson<CoursePlan>({
    system: prompt.system,
    user: prompt.user,
    schemaName: "CoursePlan",
  });
}
```

## packages/curriculum-ai/src/generators/generateTopicPack.ts

```ts
import type { AiProvider, TopicPackDraft } from "../types";
import { buildTopicPrompt } from "../prompts/buildTopicPrompt";

export async function generateTopicPack(provider: AiProvider, args: {
  subjectSlug: string;
  profileId: string;
  moduleSlug: string;
  sectionSlug: string;
  topic: any;
  locale: string;
}): Promise<TopicPackDraft> {
  const prompt = buildTopicPrompt(args);
  return provider.generateJson<TopicPackDraft>({
    system: prompt.system,
    user: prompt.user,
    schemaName: "TopicPackDraft",
  });
}
```

## packages/curriculum-ai/src/generators/translateMessages.ts

```ts
import type { AiProvider } from "../types";
import { buildTranslationPrompt } from "../prompts/buildTranslationPrompt";

export async function translateMessages(provider: AiProvider, args: {
  sourceLocale: "en";
  targetLocale: string;
  messages: Record<string, unknown>;
}) {
  const prompt = buildTranslationPrompt(args);
  return provider.generateJson<Record<string, unknown>>({
    system: prompt.system,
    user: prompt.user,
    schemaName: "TranslatedMessages",
  });
}
```

## packages/curriculum-ai/src/index.ts

```ts
export * from "./types";
export * from "./providers/openai";
export * from "./generators/generateCoursePlan";
export * from "./generators/generateTopicPack";
export * from "./generators/translateMessages";
```

---

# 9. compiler

## packages/curriculum-compiler/src/blueprint/loadBlueprint.ts

```ts
import fs from "node:fs/promises";
import type { CourseBlueprint } from "@zoeskoul/curriculum-contracts";

export async function loadBlueprint(path: string): Promise<CourseBlueprint> {
  const raw = await fs.readFile(path, "utf8");
  return JSON.parse(raw) as CourseBlueprint;
}
```

## packages/curriculum-compiler/src/validate/validateBlueprint.ts

```ts
export function validateBlueprint(blueprint: any) {
  if (!blueprint.subjectSlug) throw new Error("Blueprint missing subjectSlug");
  if (!blueprint.profileId) throw new Error("Blueprint missing profileId");
  if (!blueprint.sourceLocale) throw new Error("Blueprint missing sourceLocale");
}
```

## packages/curriculum-compiler/src/validate/validatePlan.ts

```ts
export function validatePlan(plan: any) {
  if (!Array.isArray(plan.modules) || plan.modules.length === 0) {
    throw new Error("Plan must contain at least one module");
  }
}
```

## packages/curriculum-compiler/src/validate/validateManifestTree.ts

```ts
export function validateManifestTree(args: {
  subjectManifest: any;
  topicPacks: Array<{ topicBundle: any }>;
}) {
  const { subjectManifest, topicPacks } = args;
  const topicIds = new Set(topicPacks.map((p) => p.topicBundle.topicId));

  for (const mod of subjectManifest.modules) {
    for (const sec of mod.sections) {
      for (const topicId of sec.topics) {
        if (!topicIds.has(topicId)) {
          throw new Error(`Topic ${topicId} is referenced in subject manifest but missing topic bundle`);
        }
      }
    }
  }
}
```

## packages/curriculum-compiler/src/validate/validateMessages.ts

```ts
function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenKeys(value as Record<string, unknown>, next));
    } else {
      out.push(next);
    }
  }
  return out;
}

export function validateLocaleParity(source: Record<string, unknown>, translated: Record<string, unknown>, locale: string) {
  const sourceKeys = flattenKeys(source).sort();
  const translatedKeys = flattenKeys(translated).sort();

  const missing = sourceKeys.filter((k) => !translatedKeys.includes(k));
  if (missing.length) {
    throw new Error(`Locale ${locale} is missing keys: ${missing.join(", ")}`);
  }
}
```

## packages/curriculum-compiler/src/write/writeDraft.ts

```ts
import fs from "node:fs/promises";
import path from "node:path";
import {
  getDraftSubjectManifestPath,
  getDraftTopicBundlePath,
  getDraftTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJson(filePath: string, data: unknown) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function writeDraft(args: {
  subjectSlug: string;
  subjectManifest: unknown;
  topicPacks: Array<{
    topicBundle: any;
    messagesByLocale: Record<string, Record<string, unknown>>;
  }>;
}) {
  await writeJson(getDraftSubjectManifestPath(args.subjectSlug), args.subjectManifest);

  for (const pack of args.topicPacks) {
    await writeJson(
      getDraftTopicBundlePath(args.subjectSlug, pack.topicBundle.moduleSlug, pack.topicBundle.topicId),
      pack.topicBundle,
    );

    for (const [locale, messages] of Object.entries(pack.messagesByLocale)) {
      await writeJson(
        getDraftTopicMessagesPath(locale, args.subjectSlug, pack.topicBundle.moduleSlug, pack.topicBundle.topicId),
        messages,
      );
    }
  }
}
```

## packages/curriculum-compiler/src/write/publishDraft.ts

```ts
import fs from "node:fs/promises";
import path from "node:path";
import {
  getDraftSubjectManifestPath,
  getDraftTopicBundlePath,
  getDraftTopicMessagesPath,
  getSubjectManifestPath,
  getTopicBundlePath,
  getTopicMessagesPath,
} from "@zoeskoul/curriculum-core";

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function copyFile(src: string, dest: string) {
  await ensureDir(dest);
  await fs.copyFile(src, dest);
}

export async function publishDraft(args: {
  subjectSlug: string;
  topicPacks: Array<{
    topicBundle: any;
    messagesByLocale: Record<string, Record<string, unknown>>;
  }>;
}) {
  await copyFile(getDraftSubjectManifestPath(args.subjectSlug), getSubjectManifestPath(args.subjectSlug));

  for (const pack of args.topicPacks) {
    await copyFile(
      getDraftTopicBundlePath(args.subjectSlug, pack.topicBundle.moduleSlug, pack.topicBundle.topicId),
      getTopicBundlePath(args.subjectSlug, pack.topicBundle.moduleSlug, pack.topicBundle.topicId),
    );

    for (const locale of Object.keys(pack.messagesByLocale)) {
      await copyFile(
        getDraftTopicMessagesPath(locale, args.subjectSlug, pack.topicBundle.moduleSlug, pack.topicBundle.topicId),
        getTopicMessagesPath(locale, args.subjectSlug, pack.topicBundle.moduleSlug, pack.topicBundle.topicId),
      );
    }
  }
}
```

## packages/curriculum-compiler/src/rebuild/rebuildRegistries.ts

```ts
import { execSync } from "node:child_process";

export function rebuildRegistries(subjectSlug?: string) {
  execSync("pnpm i18n:generate", { stdio: "inherit" });
  execSync("pnpm gen:subject-manifests", { stdio: "inherit" });
  execSync(
    subjectSlug
      ? `pnpm gen:topic-manifests --subject ${subjectSlug}`
      : "pnpm gen:topic-manifests",
    { stdio: "inherit" },
  );
}
```

## packages/curriculum-compiler/src/compile/compileSubject.ts

```ts
import type { CourseBlueprint, CoursePlan, SubjectManifest } from "@zoeskoul/curriculum-contracts";
import {
  buildModuleDescriptionKey,
  buildModulePrefix,
  buildModuleSlug,
  buildModuleTitleKey,
  buildSectionDescriptionKey,
  buildSectionSlug,
  buildSectionTitleKey,
  buildSubjectDescriptionKey,
  buildSubjectTitleKey,
} from "@zoeskoul/curriculum-core";
import { getProfile } from "@zoeskoul/curriculum-profiles";
import { generateCoursePlan, generateTopicPack, translateMessages, type AiProvider } from "@zoeskoul/curriculum-ai";
import { validateBlueprint } from "../validate/validateBlueprint";
import { validatePlan } from "../validate/validatePlan";
import { validateManifestTree } from "../validate/validateManifestTree";
import { validateLocaleParity } from "../validate/validateMessages";
import { writeDraft } from "../write/writeDraft";

function buildSubjectManifestFromPlan(blueprint: CourseBlueprint, plan: CoursePlan): SubjectManifest {
  const profile = getProfile(blueprint.profileId);

  return {
    subject: {
      slug: blueprint.subjectSlug,
      genKey: blueprint.subjectSlug,
      order: 10,
      accessPolicy: "free",
      status: "active",
      titleKey: buildSubjectTitleKey(blueprint.subjectSlug),
      descriptionKey: buildSubjectDescriptionKey(blueprint.subjectSlug),
      meta: {
        curriculum: {
          plannedModuleCount: plan.modules.length,
          isTerminalRelease: false,
          moreComingMessageKey: `subjects.${blueprint.subjectSlug}.moreComingSoon`,
        },
        completionPolicy: {
          requireAllPublishedModules: true,
          rewardEnabledByDefault: true,
          certificateEnabledByDefault: true,
        },
      },
    },
    modules: plan.modules.map((m, moduleIndex) => ({
      slug: m.moduleSlug || buildModuleSlug(blueprint.subjectSlug, moduleIndex),
      prefix: m.prefix || buildModulePrefix(blueprint.subjectSlug, moduleIndex),
      order: m.order,
      titleKey: buildModuleTitleKey(blueprint.subjectSlug, m.moduleSlug),
      descriptionKey: buildModuleDescriptionKey(blueprint.subjectSlug, m.moduleSlug),
      weekStart: m.weekStart ?? null,
      weekEnd: m.weekEnd ?? null,
      accessOverride: "free",
      runtimeDefaults: profile.buildModuleRuntimeDefaults(m),
      meta: {
        estimatedMinutes: m.sections.flatMap((s) => s.topics).reduce((sum, t) => sum + (t.minutes ?? 0), 0),
        prereqKeys: moduleIndex > 0 ? [buildModuleTitleKey(blueprint.subjectSlug, plan.modules[moduleIndex - 1].moduleSlug)] : [],
        outcomeKeys: [],
        whyKeys: [],
      },
      sections: m.sections.map((s, sectionIndex) => ({
        slug: s.sectionSlug || buildSectionSlug(moduleIndex, sectionIndex + 1),
        order: s.order,
        titleKey: buildSectionTitleKey(blueprint.subjectSlug, m.moduleSlug, s.sectionSlug),
        descriptionKey: buildSectionDescriptionKey(blueprint.subjectSlug, m.moduleSlug, s.sectionSlug),
        meta: {
          module: moduleIndex,
          weeksKey: `sections.${blueprint.subjectSlug}.${m.moduleSlug}.${s.sectionSlug}.weeks`,
          bulletKeys: [],
        },
        topics: s.topics.map((t) => t.topicId),
      })),
    })),
  };
}

export async function compileSubject(args: {
  blueprint: CourseBlueprint;
  provider: AiProvider;
}) {
  const { blueprint, provider } = args;

  validateBlueprint(blueprint);

  const plan = await generateCoursePlan(provider, blueprint);
  validatePlan(plan);

  const subjectManifest = buildSubjectManifestFromPlan(blueprint, plan);
  const topicPacks: Array<{ topicBundle: any; messagesByLocale: Record<string, Record<string, unknown>> }> = [];

  for (const mod of plan.modules) {
    for (const sec of mod.sections) {
      for (const topic of sec.topics) {
        const sourcePack = await generateTopicPack(provider, {
          subjectSlug: blueprint.subjectSlug,
          profileId: blueprint.profileId,
          moduleSlug: mod.moduleSlug,
          sectionSlug: sec.sectionSlug,
          topic,
          locale: blueprint.sourceLocale,
        });

        const messagesByLocale: Record<string, Record<string, unknown>> = {
          [blueprint.sourceLocale]: sourcePack.messagesByLocale[blueprint.sourceLocale] ?? sourcePack.messagesByLocale.en ?? {},
        };

        for (const locale of blueprint.targetLocales) {
          if (locale === blueprint.sourceLocale) continue;
          const translated = await translateMessages(provider, {
            sourceLocale: blueprint.sourceLocale,
            targetLocale: locale,
            messages: messagesByLocale[blueprint.sourceLocale],
          });
          validateLocaleParity(messagesByLocale[blueprint.sourceLocale], translated, locale);
          messagesByLocale[locale] = translated;
        }

        topicPacks.push({
          topicBundle: sourcePack.topicBundle,
          messagesByLocale,
        });
      }
    }
  }

  validateManifestTree({ subjectManifest, topicPacks });

  await writeDraft({
    subjectSlug: blueprint.subjectSlug,
    subjectManifest,
    topicPacks,
  });

  return {
    plan,
    subjectManifest,
    topicPacks,
  };
}
```

## packages/curriculum-compiler/src/index.ts

```ts
export * from "./blueprint/loadBlueprint";
export * from "./compile/compileSubject";
export * from "./rebuild/rebuildRegistries";
export * from "./write/publishDraft";
```

---

# 10. cli

## packages/curriculum-cli/src/commands/plan.ts

```ts
import { loadBlueprint } from "@zoeskoul/curriculum-compiler";
import { generateCoursePlan, openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runPlan(blueprintPath: string) {
  const blueprint = await loadBlueprint(blueprintPath);
  const plan = await generateCoursePlan(openAiProvider, blueprint);
  console.log(JSON.stringify(plan, null, 2));
}
```

## packages/curriculum-cli/src/commands/compile-subject.ts

```ts
import { loadBlueprint, compileSubject } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runCompileSubject(blueprintPath: string) {
  const blueprint = await loadBlueprint(blueprintPath);
  const out = await compileSubject({ blueprint, provider: openAiProvider });
  console.log(`Compiled draft for subject ${out.subjectManifest.subject.slug}`);
}
```

## packages/curriculum-cli/src/commands/publish.ts

```ts
import { loadBlueprint, compileSubject, publishDraft, rebuildRegistries } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runPublish(blueprintPath: string) {
  const blueprint = await loadBlueprint(blueprintPath);
  const out = await compileSubject({ blueprint, provider: openAiProvider });
  await publishDraft({
    subjectSlug: blueprint.subjectSlug,
    topicPacks: out.topicPacks,
  });
  rebuildRegistries(blueprint.subjectSlug);
  console.log(`Published subject ${blueprint.subjectSlug}`);
}
```

## packages/curriculum-cli/src/index.ts

```ts
#!/usr/bin/env node
import { runPlan } from "./commands/plan";
import { runCompileSubject } from "./commands/compile-subject";
import { runPublish } from "./commands/publish";

async function main() {
  const [, , command, arg] = process.argv;

  switch (command) {
    case "plan":
      await runPlan(arg);
      break;
    case "compile-subject":
      await runCompileSubject(arg);
      break;
    case "publish":
      await runPublish(arg);
      break;
    default:
      console.error("Usage: curriculum-cli <plan|compile-subject|publish> <blueprintPath>");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

---

# 11. sample authoring blueprint

## authoring/sql/course.blueprint.json

```json
{
  "subjectSlug": "sql",
  "profileId": "sql",
  "sourceLocale": "en",
  "targetLocales": ["fr", "ht", "es"],
  "title": "SQL for Beginners",
  "description": "Learn SQL from zero with hands-on practice.",
  "level": "beginner",
  "audience": ["absolute beginners", "students", "career switchers"],
  "goals": [
    "understand what SQL is",
    "read from tables",
    "filter results",
    "sort and limit output"
  ],
  "constraints": {
    "moduleCount": 8,
    "topicsPerModuleMin": 4,
    "topicsPerModuleMax": 6
  },
  "teachingStyle": {
    "tone": "clear, practical, beginner-friendly",
    "quizWeight": 0.5,
    "projectWeight": 0.3,
    "codeInputWeight": 0.2
  },
  "seedModules": [
    "What SQL Is",
    "Reading Data",
    "Filtering",
    "Sorting and Output Control",
    "Text Matching and Cleanup"
  ]
}
```

---

# 12. long-term command flow

```bash
pnpm curriculum-cli plan authoring/sql/course.blueprint.json
pnpm curriculum-cli compile-subject authoring/sql/course.blueprint.json
pnpm curriculum-cli publish authoring/sql/course.blueprint.json
```

---

# 13. long-term rollout order

## phase 1
- create `curriculum-contracts`
- create `curriculum-core`
- move runtime compiler logic into `curriculum-runtime`
- move `buildArtifacts` into `curriculum-registry`
- move SQL-specific recipe logic into `curriculum-profiles/sql`

## phase 2
- add `authoring/<subject>/course.blueprint.json`
- add `curriculum-compiler`
- add draft writing and publish flow

## phase 3
- add `curriculum-ai`
- wire plan generation
- wire topic generation
- wire locale translation generation

## phase 4
- add admin UI in `apps/web`
- preview draft subject tree
- preview topic messages per locale
- approve/publish

## phase 5
- if generation jobs get heavy, add `apps/curriculum-worker`

---

# 14. key long-term rules

```text
AI never chooses filesystem paths
compiler always chooses paths
manifest never becomes locale-specific
messages always carry locale-specific copy
profiles own domain-specific runtime rules
registry generation stays build-owned
```

This is the best long-term approach because it keeps your current manifest-first philosophy, opens the system to any course, cleanly supports `en`, `fr`, `ht`, and `es`, and keeps SQL-specific behavior from leaking into the generic curriculum engine.


---

# Continuation: remaining compiler flow, CLI, and rollout

## packages/curriculum-compiler/src/compile/compileSubject.ts (continued)

```ts
          const translated = await translateMessages(provider, {
            sourceLocale: blueprint.sourceLocale,
            targetLocale: locale,
            messages: messagesByLocale[blueprint.sourceLocale],
          });
          validateLocaleParity(messagesByLocale[blueprint.sourceLocale], translated, locale);
          messagesByLocale[locale] = translated;
        }

        topicPacks.push({
          topicBundle: sourcePack.topicBundle,
          messagesByLocale,
        });
      }
    }
  }

  validateManifestTree({ subjectManifest, topicPacks });

  await writeDraft({
    subjectSlug: blueprint.subjectSlug,
    subjectManifest,
    topicPacks,
  });

  return {
    plan,
    subjectManifest,
    topicPacks,
  };
}
```

## packages/curriculum-compiler/src/index.ts

```ts
export * from "./blueprint/loadBlueprint";
export * from "./compile/compileSubject";
export * from "./rebuild/rebuildRegistries";
export * from "./write/publishDraft";
```

---

# 10. cli

## packages/curriculum-cli/src/commands/plan.ts

```ts
import { loadBlueprint } from "@zoeskoul/curriculum-compiler";
import { generateCoursePlan, openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runPlan(blueprintPath: string) {
  const blueprint = await loadBlueprint(blueprintPath);
  const plan = await generateCoursePlan(openAiProvider, blueprint);
  console.log(JSON.stringify(plan, null, 2));
}
```

## packages/curriculum-cli/src/commands/compile-subject.ts

```ts
import { loadBlueprint, compileSubject } from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runCompileSubject(blueprintPath: string) {
  const blueprint = await loadBlueprint(blueprintPath);
  const out = await compileSubject({ blueprint, provider: openAiProvider });
  console.log(`Compiled draft for subject ${out.subjectManifest.subject.slug}`);
}
```

## packages/curriculum-cli/src/commands/publish.ts

```ts
import {
  loadBlueprint,
  compileSubject,
  publishDraft,
  rebuildRegistries,
} from "@zoeskoul/curriculum-compiler";
import { openAiProvider } from "@zoeskoul/curriculum-ai";

export async function runPublish(blueprintPath: string) {
  const blueprint = await loadBlueprint(blueprintPath);
  const out = await compileSubject({ blueprint, provider: openAiProvider });

  await publishDraft({
    subjectSlug: blueprint.subjectSlug,
    topicPacks: out.topicPacks,
  });

  rebuildRegistries(blueprint.subjectSlug);
  console.log(`Published subject ${blueprint.subjectSlug}`);
}
```

## packages/curriculum-cli/src/commands/validate.ts

```ts
import fs from "node:fs/promises";
import path from "node:path";

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runValidateDraft(subjectSlug: string) {
  const subjectManifestPath = path.join(
    ".curriculum-drafts",
    "subjects",
    subjectSlug,
    "subject.manifest.json",
  );

  const ok = await exists(subjectManifestPath);
  if (!ok) {
    throw new Error(`Draft manifest not found for subject ${subjectSlug}`);
  }

  console.log(`Draft exists for ${subjectSlug}: ${subjectManifestPath}`);
}
```

## packages/curriculum-cli/src/index.ts

```ts
#!/usr/bin/env node
import { runPlan } from "./commands/plan";
import { runCompileSubject } from "./commands/compile-subject";
import { runPublish } from "./commands/publish";
import { runValidateDraft } from "./commands/validate";

async function main() {
  const [, , command, arg] = process.argv;

  switch (command) {
    case "plan":
      await runPlan(arg);
      break;
    case "compile-subject":
      await runCompileSubject(arg);
      break;
    case "publish":
      await runPublish(arg);
      break;
    case "validate":
      await runValidateDraft(arg);
      break;
    default:
      console.error(
        "Usage: curriculum-cli <plan|compile-subject|publish|validate> <blueprintPath|subjectSlug>",
      );
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

---

# 11. Sample authoring blueprint

## authoring/sql/course.blueprint.json

```json
{
  "subjectSlug": "sql",
  "profileId": "sql",
  "sourceLocale": "en",
  "targetLocales": ["fr", "ht", "es"],
  "title": "SQL for Beginners",
  "description": "Learn SQL from zero with hands-on practice.",
  "level": "beginner",
  "audience": ["absolute beginners", "students", "career switchers"],
  "goals": [
    "understand what SQL is",
    "read from tables",
    "filter results",
    "sort and limit output"
  ],
  "constraints": {
    "moduleCount": 8,
    "topicsPerModuleMin": 4,
    "topicsPerModuleMax": 6
  },
  "teachingStyle": {
    "tone": "clear, practical, beginner-friendly",
    "quizWeight": 0.5,
    "projectWeight": 0.3,
    "codeInputWeight": 0.2
  },
  "seedModules": [
    "What SQL Is",
    "Reading Data",
    "Filtering",
    "Sorting and Output Control",
    "Text Matching and Cleanup"
  ]
}
```

## authoring/python/course.blueprint.json

```json
{
  "subjectSlug": "python",
  "profileId": "python",
  "sourceLocale": "en",
  "targetLocales": ["fr", "ht", "es"],
  "title": "Python for Beginners",
  "description": "Learn Python step by step with hands-on practice.",
  "level": "beginner",
  "audience": ["absolute beginners", "students", "career switchers"],
  "goals": [
    "understand variables and expressions",
    "use conditionals and loops",
    "write functions",
    "read and write simple programs"
  ],
  "constraints": {
    "moduleCount": 8,
    "topicsPerModuleMin": 4,
    "topicsPerModuleMax": 6
  },
  "teachingStyle": {
    "tone": "clear, supportive, beginner-friendly",
    "quizWeight": 0.4,
    "projectWeight": 0.25,
    "codeInputWeight": 0.35
  },
  "seedModules": [
    "Getting Started",
    "Variables and Data Types",
    "Conditionals",
    "Loops",
    "Functions",
    "Collections"
  ]
}
```

---

# 12. Suggested package.json scripts

```json
{
  "scripts": {
    "curriculum:plan:sql": "curriculum-cli plan authoring/sql/course.blueprint.json",
    "curriculum:compile:sql": "curriculum-cli compile-subject authoring/sql/course.blueprint.json",
    "curriculum:publish:sql": "curriculum-cli publish authoring/sql/course.blueprint.json",
    "curriculum:validate:sql": "curriculum-cli validate sql",

    "curriculum:plan:python": "curriculum-cli plan authoring/python/course.blueprint.json",
    "curriculum:compile:python": "curriculum-cli compile-subject authoring/python/course.blueprint.json",
    "curriculum:publish:python": "curriculum-cli publish authoring/python/course.blueprint.json",
    "curriculum:validate:python": "curriculum-cli validate python"
  }
}
```

---

# 13. Long-term command flow

```bash
pnpm curriculum:plan:sql
pnpm curriculum:compile:sql
pnpm curriculum:validate:sql
pnpm curriculum:publish:sql
```

Or directly:

```bash
pnpm curriculum-cli plan authoring/sql/course.blueprint.json
pnpm curriculum-cli compile-subject authoring/sql/course.blueprint.json
pnpm curriculum-cli validate sql
pnpm curriculum-cli publish authoring/sql/course.blueprint.json
```

---

# 14. Suggested admin UI later

```text
apps/web/app/(admin)/curriculum/
  page.tsx
  [subjectSlug]/
    page.tsx
    draft/page.tsx
    locales/page.tsx
    publish/page.tsx
```

Suggested admin screens:
- subject list
- create from blueprint
- preview generated plan
- preview generated topic bundles
- preview locale parity for `en`, `fr`, `ht`, `es`
- publish draft

Suggested state approach:
- server state in DB or filesystem draft
- local component state for form editing
- Zustand only if multi-step UI becomes large
- no Redux needed

---

# 15. Optional worker later

When generation gets heavy, add:

```text
apps/
  curriculum-worker/
    src/
      jobs/
        compileSubjectJob.ts
        translateLocaleJob.ts
        publishSubjectJob.ts
```

Then move long-running AI calls out of the request path.

---

# 16. Recommended migration order from your current code

## Step 1
Create packages:
- `curriculum-contracts`
- `curriculum-core`
- `curriculum-profiles`
- `curriculum-runtime`
- `curriculum-registry`

## Step 2
Move current files into those packages:
- move manifest types into `contracts`
- move path/slug/context helpers into `core`
- move SQL recipe logic into `profiles/sql`
- move manifest-to-runtime builders into `runtime`
- move `buildArtifacts` into `registry`

## Step 3
Add:
- `curriculum-ai`
- `curriculum-compiler`
- `curriculum-cli`

## Step 4
Generate drafts first, not live files.

## Step 5
Only after draft validation passes, publish to:
- `src/lib/subjects/...`
- `src/i18n/messages/...`

---

# 17. Key long-term rules

```text
AI never chooses filesystem paths
compiler always chooses paths
manifest never becomes locale-specific
messages always carry locale-specific copy
profiles own domain-specific runtime rules
registry generation stays build-owned
en is the canonical authoring locale
fr/ht/es are translations of en, not independent curricula
```

---

# 18. Final recommendation

This architecture is the best long-term approach for ZoeSkoul because it gives you:
- one manifest-first system
- one compiler pipeline
- one locale model
- multiple course profiles
- clean separation between curriculum truth and runtime truth
- future support for SQL, Python, math, language learning, web dev, and more

The next best move after this scaffold is to do a real migration pass that maps your current files one by one into these packages.

