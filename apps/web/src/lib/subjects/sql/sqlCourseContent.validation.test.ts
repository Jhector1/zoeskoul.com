import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;
type TranslationRef = { field: string; key: string; location: string };

const WEB_ROOT = fs.existsSync(path.resolve(process.cwd(), "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "apps/web");

const SUBJECT_ROOT = path.join(WEB_ROOT, "src/lib/subjects/sql");
const I18N_ROOT = path.join(WEB_ROOT, "src/i18n/messages/en/subjects/sql");
const SUBJECT_MANIFEST_PATH = path.join(SUBJECT_ROOT, "subject.manifest.json");

const EXPECTED_TOPIC_ORDER = [
  ["what_sql_is", "understanding_tables", "database_thinking", "first_sql_environment"],
  ["intro_to_select", "reading_data_from_a_table", "sql_syntax_basics", "practice_with_basic_queries"],
  ["intro_to_filtering", "comparison_operators", "filtering_with_multiple_conditions", "beginner_filtering_practice"],
  ["sorting_data", "sorting_by_multiple_columns", "limiting_output", "practice_with_output_control"],
  ["text_matching", "lists_and_ranges", "missing_data", "search_and_cleanup_practice"],
];

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function getValueAtPath(source: JsonObject, dottedPath: string) {
  return dottedPath.split(".").reduce<unknown>((value, segment) => {
    if (value == null || typeof value !== "object") return undefined;
    return (value as JsonObject)[segment];
  }, source);
}

function collectTranslationRefs(value: unknown, trail: string[] = []): TranslationRef[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectTranslationRefs(entry, [...trail, String(index)]));
  }

  if (!value || typeof value !== "object") return [];

  const refs: TranslationRef[] = [];
  for (const [field, entry] of Object.entries(value)) {
    const nextTrail = [...trail, field];
    if (field.endsWith("Key") && field !== "exerciseKey" && typeof entry === "string") {
      refs.push({
        field,
        key: entry,
        location: nextTrail.join("."),
      });
    }

    refs.push(...collectTranslationRefs(entry, nextTrail));
  }

  return refs;
}

function topicPath(moduleSlug: string, topicSlug: string) {
  const moduleNumber = moduleSlug.split("_").at(-1);
  return path.join(
    SUBJECT_ROOT,
    `modules/module${moduleNumber}/topics/${topicSlug}/topic.bundle.json`,
  );
}

function datasetPath(datasetId: string) {
  const files = fs
    .readdirSync(path.join(SUBJECT_ROOT, "datasets"))
    .filter((file) => file.endsWith(".ts") && file !== "index.ts");

  for (const file of files) {
    const fullPath = path.join(SUBJECT_ROOT, "datasets", file);
    if (fs.readFileSync(fullPath, "utf8").includes(`id: "${datasetId}"`)) {
      return fullPath;
    }
  }

  return null;
}

function readDataset(datasetId: string) {
  const filePath = datasetPath(datasetId);
  expect(filePath, `Missing SQL dataset ${datasetId}`).toBeTruthy();

  const source = fs.readFileSync(filePath!, "utf8");
  const schemaSql = source.match(/schemaSql:\s*`([\s\S]*?)`\.trim\(\)/)?.[1] ?? "";
  const seedSql = source.match(/seedSql:\s*`([\s\S]*?)`\.trim\(\)/)?.[1] ?? "";
  const columns = Array.from(source.matchAll(/\{\s*name:\s*"([^"]+)"/g)).map((match) => match[1]);

  return { schemaSql, seedSql, columns };
}

function executeSql(args: { schemaSql: string; seedSql: string; sql: string }) {
  const input = [
    args.schemaSql,
    args.seedSql,
    `${args.sql.trim().replace(/;+$/, "")};`,
  ].join("\n");

  const result = spawnSync("sqlite3", [":memory:", "-json"], {
    input,
    encoding: "utf8",
    maxBuffer: 10_000_000,
  });

  expect(result.status, result.stderr).toBe(0);

  const rows = JSON.parse(result.stdout.trim() || "[]") as Array<Record<string, unknown>>;
  const columns = rows[0] ? Object.keys(rows[0]) : [];

  return {
    columns,
    rows: rows.map((row) => columns.map((column) => row[column] ?? null)),
  };
}

function listTopicRefs() {
  const manifest = readJson(SUBJECT_MANIFEST_PATH);
  return (manifest.modules ?? []).flatMap((module: JsonObject) =>
    (module.sections ?? []).flatMap((section: JsonObject) =>
      (section.topics ?? []).map((topicSlug: string) => ({
        module,
        section,
        topicSlug,
        filePath: topicPath(module.slug, topicSlug),
      })),
    ),
  );
}

function topicMessageFile(moduleSlug: string, topicSlug: string) {
  const moduleNumber = moduleSlug.split("_").at(-1);
  return path.join(I18N_ROOT, `module${moduleNumber}`, `${topicSlug}.json`);
}

describe("sql course content", () => {
  it("has deterministic module topic order and existing stable topic bundles", () => {
    const manifest = readJson(SUBJECT_MANIFEST_PATH);

    expect(
      (manifest.modules ?? []).map((module: JsonObject) =>
        (module.sections ?? []).flatMap((section: JsonObject) => section.topics ?? []),
      ),
    ).toEqual(EXPECTED_TOPIC_ORDER);

    const issues: string[] = [];
    const seen = new Set<string>();

    for (const ref of listTopicRefs()) {
      if (seen.has(ref.topicSlug)) issues.push(`Duplicate topic slug ${ref.topicSlug}`);
      seen.add(ref.topicSlug);

      if (!fs.existsSync(ref.filePath)) {
        issues.push(`Missing topic bundle ${path.relative(WEB_ROOT, ref.filePath)}`);
        continue;
      }

      const topic = readJson(ref.filePath);
      if (topic.topicId !== ref.topicSlug) {
        issues.push(`${ref.topicSlug} has topicId ${topic.topicId}`);
      }
    }

    expect(issues).toEqual([]);
  });

  it("keeps English topic message filenames aligned to their internal topic slugs", () => {
    const issues: string[] = [];

    for (const moduleDir of fs.readdirSync(I18N_ROOT).filter((name) => /^module\d+$/.test(name))) {
      const moduleSlug = `sql_module_${moduleDir.replace("module", "")}`;

      for (const file of fs.readdirSync(path.join(I18N_ROOT, moduleDir)).filter((name) => name.endsWith(".json"))) {
        const filePath = path.join(I18N_ROOT, moduleDir, file);
        const topicSlugs = Object.keys(readJson(filePath).topics?.sql?.[moduleSlug] ?? {});
        const basename = file.replace(/\.json$/, "");

        if (topicSlugs.length !== 1 || topicSlugs[0] !== basename) {
          issues.push(`${path.relative(WEB_ROOT, filePath)} declares ${topicSlugs.join(", ")}`);
        }
      }
    }

    expect(issues).toEqual([]);
  });

  it("resolves every card, sketch, quiz, and explicit answer key", () => {
    const issues: string[] = [];

    for (const ref of listTopicRefs()) {
      const topic = readJson(ref.filePath);
      const sketchIds = new Set((topic.sketches ?? []).map((sketch: JsonObject) => sketch.id));
      const exerciseIds = new Set((topic.exercises ?? []).map((exercise: JsonObject) => exercise.id));
      const quizExerciseIds = new Set(
        (topic.exercises ?? [])
          .filter((exercise: JsonObject) => exercise.purpose === "quiz")
          .map((exercise: JsonObject) => exercise.id),
      );

      for (const card of topic.cards ?? []) {
        if (card.kind === "sketch") {
          if (!sketchIds.has(card.sketchId)) issues.push(`${topic.topicId}/${card.id} points at missing sketch ${card.sketchId}`);
          if (card.id !== card.sketchId) issues.push(`${topic.topicId}/${card.id} should use semantic sketch card id ${card.sketchId}`);
        }

        if (card.kind === "quiz" && quizExerciseIds.size === 0) {
          issues.push(`${topic.topicId}/${card.id} has no quiz exercises`);
        }

        for (const step of card.project?.steps ?? []) {
          if (!exerciseIds.has(step.exerciseKey)) issues.push(`${topic.topicId}/${card.id} project step ${step.id} points at missing exercise ${step.exerciseKey}`);
        }
      }

      for (const exercise of topic.exercises ?? []) {
        const refId = `${topic.topicId}/${exercise.id}`;

        if (exercise.kind === "single_choice") {
          if (!exercise.expected?.optionId) issues.push(`${refId} missing expected.optionId`);
          if (!exercise.optionIds?.includes(exercise.expected?.optionId)) issues.push(`${refId} expected.optionId is not listed`);
        }

        if (exercise.kind === "multi_choice") {
          const optionIds = exercise.expected?.optionIds ?? [];
          if (!Array.isArray(optionIds) || optionIds.length < 1) issues.push(`${refId} missing expected.optionIds`);
          if (new Set(optionIds).size !== optionIds.length) issues.push(`${refId} expected.optionIds contains duplicates`);
          for (const optionId of optionIds) {
            if (!exercise.optionIds?.includes(optionId)) issues.push(`${refId} expected option ${optionId} is not listed`);
          }
        }

        if (exercise.kind === "drag_reorder") {
          const expected = exercise.expected?.tokenIds ?? exercise.expected?.order ?? [];
          if (expected.length !== exercise.tokenIds?.length) issues.push(`${refId} reorder expected length mismatch`);
          if (new Set(expected).size !== expected.length) issues.push(`${refId} reorder expected contains duplicates`);
          expect(new Set(expected), `${refId} reorder expected ids`).toEqual(new Set(exercise.tokenIds ?? []));
        }
      }
    }

    expect(issues).toEqual([]);
  });

  it("resolves every SQL topic translation key referenced by the bundles", () => {
    const issues: string[] = [];
    const projectStepTitleKeys: string[] = [];
    const cardTitleKeys: string[] = [];

    for (const ref of listTopicRefs()) {
      const topic = readJson(ref.filePath);
      const moduleSlug = ref.module.slug;
      const messageFile = topicMessageFile(moduleSlug, ref.topicSlug);

      if (!fs.existsSync(messageFile)) {
        issues.push(`Missing message file ${path.relative(WEB_ROOT, messageFile)}`);
        continue;
      }

      const messages = readJson(messageFile);
      const translationRefs = collectTranslationRefs(topic);

      for (const translationRef of translationRefs) {
        if (translationRef.location.includes("project.steps") && translationRef.field === "titleKey") {
          projectStepTitleKeys.push(translationRef.key);
        }

        if (translationRef.location.includes("cards") && translationRef.field === "titleKey") {
          cardTitleKeys.push(translationRef.key);
        }

        if (getValueAtPath(messages, translationRef.key) == null) {
          issues.push(
            `${topic.topicId} ${translationRef.location} is missing ${translationRef.key}`,
          );
        }
      }
    }

    expect(projectStepTitleKeys).toContain(
      "topics.sql.sql_module_4.search_and_cleanup_practice.projectSteps.search_names_contains_li.title",
    );
    expect(projectStepTitleKeys).toContain(
      "topics.sql.sql_module_3.sorting_data.projectSteps.sort_names_asc.title",
    );
    expect(projectStepTitleKeys).toContain(
      "topics.sql.sql_module_1.intro_to_select.projectSteps.show_all_products.title",
    );
    expect(cardTitleKeys).toContain("topics.sql.sql_module_4.text_matching.cards.project.title");
    expect(cardTitleKeys).toContain("topics.sql.sql_module_3.limiting_output.cards.project.title");
    expect(issues).toEqual([]);
  });

  it("keeps project and quiz card titles distinct and correctly keyed", () => {
    const issues: string[] = [];

    for (const ref of listTopicRefs()) {
      const topic = readJson(ref.filePath);
      const moduleSlug = ref.module.slug;
      const messageFile = topicMessageFile(ref.module.slug, ref.topicSlug);
      if (!fs.existsSync(messageFile)) {
        issues.push(`Missing message file ${path.relative(WEB_ROOT, messageFile)}`);
        continue;
      }

      const messages = readJson(messageFile);
      const projectCards = (topic.cards ?? []).filter((card: JsonObject) => card.kind === "project");
      const quizCards = (topic.cards ?? []).filter((card: JsonObject) => card.kind === "quiz");

      for (const card of projectCards) {
        if (!card.titleKey) issues.push(`${topic.topicId}/${card.id} project card missing titleKey`);
        if (!String(card.titleKey ?? "").includes(".cards.project.title")) {
          issues.push(`${topic.topicId}/${card.id} project card uses non-project key ${card.titleKey}`);
        }
        if (String(card.titleKey ?? "").includes(".cards.quiz.title")) {
          issues.push(`${topic.topicId}/${card.id} project card reuses quiz key ${card.titleKey}`);
        }
        if (typeof getValueAtPath(messages, String(card.titleKey ?? "")) !== "string") {
          issues.push(`${topic.topicId}/${card.id} project card title does not resolve`);
        }
      }

      for (const card of quizCards) {
        if (!card.titleKey) issues.push(`${topic.topicId}/${card.id} quiz card missing titleKey`);
        if (!String(card.titleKey ?? "").includes(".cards.quiz.title")) {
          issues.push(`${topic.topicId}/${card.id} quiz card uses non-quiz key ${card.titleKey}`);
        }
        if (typeof getValueAtPath(messages, String(card.titleKey ?? "")) !== "string") {
          issues.push(`${topic.topicId}/${card.id} quiz card title does not resolve`);
        }
      }

      for (const projectCard of projectCards) {
        for (const quizCard of quizCards) {
          const projectTitle = getValueAtPath(messages, String(projectCard.titleKey ?? ""));
          const quizTitle = getValueAtPath(messages, String(quizCard.titleKey ?? ""));
          if (typeof projectTitle === "string" && typeof quizTitle === "string" && projectTitle === quizTitle) {
            issues.push(`${topic.topicId} project and quiz cards share title ${projectTitle}`);
          }
        }
      }
    }

    expect(issues).toEqual([]);
  });

  it("makes every SQL code exercise checkable against a real runnable dataset", () => {
    const issues: string[] = [];

    for (const ref of listTopicRefs()) {
      const topic = readJson(ref.filePath);

      for (const exercise of topic.exercises ?? []) {
        if (exercise.kind !== "code_input" || exercise.language !== "sql") continue;

        const refId = `${topic.topicId}/${exercise.id}`;
        const recipe = exercise.recipe ?? {};
        const datasetId = recipe.datasetId ?? exercise.runtime?.datasetId;
        const tests = recipe.tests ?? [];

        if (exercise.fixedSqlDialect !== "sqlite") issues.push(`${refId} is not fixed to sqlite`);
        if (recipe.type !== "sql_query") issues.push(`${refId} does not use sql_query recipe`);
        if (!datasetId) issues.push(`${refId} missing datasetId`);
        if (!recipe.solutionCode?.trim()) issues.push(`${refId} missing solutionCode`);
        if (recipe.resultShape !== "table") issues.push(`${refId} missing table resultShape`);
        if (tests.length < 1) issues.push(`${refId} missing SQL tests`);

        if (!datasetId || !recipe.solutionCode?.trim() || tests.length < 1) continue;

        const dataset = readDataset(datasetId);
        const executed = executeSql({
          schemaSql: dataset.schemaSql,
          seedSql: dataset.seedSql,
          sql: recipe.solutionCode,
        });
        const expectedTable = tests[0]?.expectedTable;

        expect(tests[0]?.compareTo, `${refId} compare mode`).toBe("expected_table");
        expect(expectedTable?.columns, `${refId} expected columns`).toEqual(executed.columns);
        expect(expectedTable?.rows, `${refId} expected rows`).toEqual(executed.rows);
      }
    }

    expect(issues).toEqual([]);
  });

  it("keeps SQL dataset message metadata aligned with runnable seed columns", () => {
    const messages = readJson(path.join(I18N_ROOT, "datasets/sqlite.json"));
    const issues: string[] = [];

    for (const [datasetId, datasetMessage] of Object.entries<JsonObject>(messages.datasets ?? {})) {
      const filePath = datasetPath(datasetId);
      if (!filePath) continue;

      const dataset = readDataset(datasetId);
      for (const [tableName, tableMessage] of Object.entries<JsonObject>(datasetMessage.tables ?? {})) {
        const messageColumns = Object.keys(tableMessage.columns ?? {});
        for (const column of messageColumns) {
          if (!dataset.columns.includes(column)) issues.push(`${datasetId}.${tableName}.${column} is in messages but not seed metadata`);
        }
      }
    }

    expect(issues).toEqual([]);
  });

  it("resolves every rich image marker and remains in generated manifests", () => {
    const issues: string[] = [];
    const markerPattern = /\[\[image:([a-zA-Z0-9_-]+)\]\]/g;

    for (const ref of listTopicRefs()) {
      const topic = readJson(ref.filePath);
      const moduleSlug = ref.module.slug;
      const messageFile = topicMessageFile(ref.module.slug, ref.topicSlug);

      if (!fs.existsSync(messageFile)) continue;

      const messages = readJson(messageFile);
      const sketchMessages = messages.sketches?.sql?.[moduleSlug]?.[ref.topicSlug] ?? {};

      for (const sketch of topic.sketches ?? []) {
        const bodyMarkdown = String(sketchMessages[sketch.id]?.bodyMarkdown ?? "");
        const imageIds = new Set((sketch.images ?? []).map((image: JsonObject) => image.id));
        const markers = Array.from(bodyMarkdown.matchAll(markerPattern)).map((match) => match[1]);

        for (const marker of markers) {
          if (!imageIds.has(marker)) {
            issues.push(`${topic.topicId}/${sketch.id} image marker ${marker} is not mapped`);
          }
        }
      }
    }

    const generatedSubjects = fs.readFileSync(path.join(WEB_ROOT, "src/lib/subjects/subjects.generated.ts"), "utf8");
    const generatedTopics = fs.readFileSync(path.join(SUBJECT_ROOT, "topics.generated.ts"), "utf8");
    const manifest = readJson(SUBJECT_MANIFEST_PATH);

    expect(generatedSubjects).toContain('"sql"');
    expect(generatedTopics).toContain('"search_and_cleanup_practice"');
    expect(manifest.subject.status).toBe("active");
    expect(manifest.subject.meta?.versioning?.family).toBe("sql");
    expect(issues).toEqual([]);
  });
});
