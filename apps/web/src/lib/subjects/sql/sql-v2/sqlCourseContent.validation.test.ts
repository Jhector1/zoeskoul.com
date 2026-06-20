import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;

const WEB_ROOT = fs.existsSync(path.resolve(process.cwd(), "src"))
    ? process.cwd()
    : path.resolve(process.cwd(), "apps/web");

const SUBJECT_ROOT = path.join(WEB_ROOT, "src/lib/subjects/sql/sql-v2");
const I18N_ROOT = path.join(WEB_ROOT, "src/i18n/messages/en/subjects/sql/sql-v2");
const SUBJECT_MANIFEST_PATH = path.join(SUBJECT_ROOT, "subject.manifest.json");
const SUBJECT_MESSAGES_PATH = path.join(I18N_ROOT, "subject.json");

const CONCEPTUAL_MODULE0_TOPICS = [
    "what_sql_means",
    "what_a_database_is",
    "why_sql_is_useful",
    "real_world_examples_of_databases",
    "rows_and_columns",
    "records_and_fields",
    "table_names_and_column_names",
    "reading_data_like_a_spreadsheet",
    "how_data_is_organized",
    "one_table_vs_multiple_tables",
    "intro_to_keys",
    "thinking_in_questions_and_answers",
] as const;

const WORKSPACE_MODULE0_TOPICS = [
    "where_sql_runs",
    "sql_editor_basics",
    "running_your_first_query",
    "reading_query_results",
] as const;

const MODULE0_FUTURE_CONCEPT_PATTERN =
    /\bWHERE\b|\bORDER\s+BY\b|\bLIMIT\b|\bNOT\s+IN\b|\bIS\s+NOT\s+NULL\b|\bIS\s+NULL\b|\bJOIN\b|\bGROUP\s+BY\b|\bHAVING\b|\bCREATE\s+TABLE\b/;

const MODULE0_CODE_INPUT_FORBIDDEN_PATTERN =
    /\bWHERE\b|\bORDER\s+BY\b|\bLIMIT\b|\bLIKE\b|\bNOT\s+IN\b|\bIN\b|\bBETWEEN\b|\bIS\s+NOT\s+NULL\b|\bIS\s+NULL\b|\bJOIN\b|\bGROUP\s+BY\b|\bHAVING\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\s+TABLE\b/i;

function readJson(filePath: string): JsonObject {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function topicBundlePath(topicId: string) {
    const manifest = readJson(SUBJECT_MANIFEST_PATH);

    for (const module of manifest.modules ?? []) {
        const moduleDir = `module${module.order}`;

        for (const section of module.sections ?? []) {
            if ((section.topics ?? []).includes(topicId)) {
                return path.join(SUBJECT_ROOT, "modules", moduleDir, "topics", topicId, "topic.bundle.json");
            }
        }
    }

    throw new Error(`Could not locate topic bundle for ${topicId}`);
}

function topicMessagePath(topicId: string) {
    const manifest = readJson(SUBJECT_MANIFEST_PATH);

    for (const module of manifest.modules ?? []) {
        const moduleDir = `module${module.order}`;

        for (const section of module.sections ?? []) {
            if ((section.topics ?? []).includes(topicId)) {
                return path.join(I18N_ROOT, moduleDir, `${topicId}.json`);
            }
        }
    }

    throw new Error(`Could not locate topic messages for ${topicId}`);
}

function getCodeInputs(topicId: string) {
    const topic = readJson(topicBundlePath(topicId));
    return (topic.exercises ?? []).filter((exercise: JsonObject) => exercise.kind === "code_input");
}

describe("sql-v2 course content", () => {
    it("keeps the expected 88 topic bundles wired through the manifest", () => {
        const manifest = readJson(SUBJECT_MANIFEST_PATH);
        const topicIds = (manifest.modules ?? []).flatMap((module: JsonObject) =>
            (module.sections ?? []).flatMap((section: JsonObject) => section.topics ?? []),
        );

        expect(topicIds).toHaveLength(88);

        for (const topicId of topicIds) {
            expect(fs.existsSync(topicBundlePath(topicId)), `Missing bundle for ${topicId}`).toBe(true);
        }
    });

    it("emits 3 to 5 non-empty module outcomes with no phantom outcome keys", () => {
        const manifest = readJson(SUBJECT_MANIFEST_PATH);
        const messages = readJson(SUBJECT_MESSAGES_PATH);

        for (const module of manifest.modules ?? []) {
            const outcomeKeys = module.meta?.outcomeKeys ?? [];
            const outcomeMessages =
                messages.modules?.["sql-v2"]?.[module.slug]?.outcomes ?? [];

            expect(outcomeKeys.length, `${module.slug} outcome count`).toBeGreaterThanOrEqual(3);
            expect(outcomeKeys.length, `${module.slug} outcome count`).toBeLessThanOrEqual(5);
            expect(outcomeMessages.length, `${module.slug} outcome message count`).toBe(
                outcomeKeys.length,
            );

            outcomeKeys.forEach((key: string, index: number) => {
                expect(key).toBe(`modules.sql-v2.${module.slug}.outcomes.${index}`);
                expect(String(outcomeMessages[index] ?? "").trim()).not.toBe("");
            });
        }
    });

    it("keeps conceptual Module 0 topics lighter and free of future SQL concepts", () => {
        for (const topicId of CONCEPTUAL_MODULE0_TOPICS) {
            const topic = readJson(topicBundlePath(topicId));
            const codeInputs = getCodeInputs(topicId);
            const messageText = JSON.stringify(readJson(topicMessagePath(topicId)));

            expect((topic.exercises ?? []).length, `${topicId} total exercises`).toBeGreaterThanOrEqual(4);
            expect((topic.exercises ?? []).length, `${topicId} total exercises`).toBeLessThanOrEqual(7);
            expect(codeInputs.length, `${topicId} code_input count`).toBeLessThanOrEqual(1);
            expect(messageText, `${topicId} future-concept wording`).not.toMatch(
                MODULE0_FUTURE_CONCEPT_PATTERN,
            );
        }
    });

    it("keeps Module 0 workspace topics beginner-safe with 1 to 2 SELECT/FROM code inputs", () => {
        for (const topicId of WORKSPACE_MODULE0_TOPICS) {
            const topic = readJson(topicBundlePath(topicId));
            const codeInputs = getCodeInputs(topicId);

            expect((topic.exercises ?? []).length, `${topicId} total exercises`).toBeGreaterThanOrEqual(6);
            expect((topic.exercises ?? []).length, `${topicId} total exercises`).toBeLessThanOrEqual(9);
            expect(codeInputs.length, `${topicId} code_input count`).toBeGreaterThanOrEqual(1);
            expect(codeInputs.length, `${topicId} code_input count`).toBeLessThanOrEqual(2);

            for (const exercise of codeInputs) {
                const solutionCode = String(exercise.recipe?.solutionCode ?? "");

                expect(solutionCode, `${topicId}/${exercise.id} solution`).toMatch(/\bSELECT\b/i);
                expect(solutionCode, `${topicId}/${exercise.id} solution`).toMatch(/\bFROM\b/i);
                expect(solutionCode, `${topicId}/${exercise.id} forbidden concept`).not.toMatch(
                    MODULE0_CODE_INPUT_FORBIDDEN_PATTERN,
                );
            }
        }
    });
});
