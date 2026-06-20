import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    getDraftReportsRoot,
    getDraftSubjectMessagesPath,
    getDraftSubjectRoot,
} from "@zoeskoul/curriculum-core";
import type {
    AiProvider,
    GenerateJsonArgs,
    GeneratedJsonResult,
} from "@zoeskoul/curriculum-ai";
import { buildPlanFromSpec } from "../spec/buildPlanFromSpec.js";
import { compileSubjectPipeline } from "./compileSubjectPipeline.js";
import { resolveAuthoringCompileTarget } from "./resolveAuthoringCompileTarget.js";

const SQL_V2_DRAFT_ROOT = getDraftSubjectRoot("sql-v2");
const SQL_V2_REPORT_ROOT = getDraftReportsRoot("sql-v2");
const SQL_V2_MESSAGE_ROOT = path.dirname(
    getDraftSubjectMessagesPath("en", "sql-v2"),
);

const provider: AiProvider = {
    async generateJsonDetailed<T>(_args: GenerateJsonArgs) {
        const value = await this.generateJson<T>(_args);
        return {
            provider: "test",
            model: "test-model",
            temperature: 0,
            seed: 0,
            schemaName: "TopicAuthoringDraft",
            strictSchema: true,
            rawText: JSON.stringify(value),
            parsedJson: value,
            value,
        } as GeneratedJsonResult<T>;
    },
    async generateJson<T>() {
        return {
            title: "What SQL Means",
            summary: "Learners practice reading a simple SQL query.",
            minutes: 10,
            sketchBlocks: [
                {
                    id: "sketch-1",
                    title: "Start with a query",
                    bodyMarkdown:
                        "Write a query in the SQL editor, click Run query, and inspect the results table.\n\n```sql\nSELECT name FROM students;\n```",
                },
            ],
            quizDraft: [
                {
                    id: "single-1",
                    kind: "single_choice",
                    title: "SQL meaning",
                    prompt: "Which description best matches SQL in this lesson?",
                    hint: "Look for the choice about asking a database for information.",
                    help: {
                        concept: "SQL is the language used to ask a database for data.",
                        hint_1: "Choose the option about querying stored information.",
                        hint_2: "Do not pick the option about editing videos or designing slides.",
                    },
                    options: [
                        "A language for asking a database for information",
                        "A tool for drawing charts by hand",
                        "A format for saving browser bookmarks",
                    ],
                    correctOptionIds: ["a"],
                },
                {
                    id: "single-2",
                    kind: "single_choice",
                    title: "Rows and columns",
                    prompt: "In the students table, what does one row represent?",
                    hint: "Think about one complete record in the table.",
                    help: {
                        concept: "A row stores one record, such as one student.",
                        hint_1: "Columns describe fields like name or city.",
                        hint_2: "A row groups all of those fields for one person.",
                    },
                    options: [
                        "One student record",
                        "One column heading",
                        "One database file",
                    ],
                    correctOptionIds: ["a"],
                },
                {
                    id: "multi-1",
                    kind: "multi_choice",
                    title: "Database examples",
                    prompt: "Which situations from the lesson are good examples of database use?",
                    hint: "Pick the choices that store many records people search or update.",
                    help: {
                        concept: "Databases are useful when many records must be stored and retrieved.",
                        hint_1: "Think about school rosters and store inventory.",
                        hint_2: "Skip the choice that is just a single sticky note.",
                    },
                    options: [
                        "A school storing student records",
                        "A store tracking products",
                        "A single sticky note on a monitor",
                    ],
                    correctOptionIds: ["a", "b"],
                },
                {
                    id: "drag-1",
                    kind: "drag_reorder",
                    title: "Question to query flow",
                    prompt: "Put these steps in the lesson order for answering a data question.",
                    hint: "Start with the question before the query and the results.",
                    help: {
                        concept: "A data question becomes a query, and the query returns results.",
                        hint_1: "First decide what you want to know.",
                        hint_2: "Then write the query and read the results table.",
                    },
                    tokens: ["Ask a question", "Write a query", "Read the results table"],
                    correctOrder: ["Ask a question", "Write a query", "Read the results table"],
                },
                {
                    id: "fill-1",
                    kind: "fill_blank_choice",
                    title: "Column label",
                    prompt: "Complete the lesson sentence about table structure.",
                    hint: "The blank names the vertical field labels in a table.",
                    help: {
                        concept: "Columns describe the type of value stored in each field.",
                        hint_1: "Rows hold records, while columns hold field labels.",
                        hint_2: "Choose the word used for name, city, and grade headings.",
                    },
                    template: "In a table, a [blank1] names a field like name or city.",
                    choices: ["column", "row", "database"],
                    correctValue: "column",
                },
            ],
        } as T;
    },
};

async function rmIfExists(targetPath: string) {
    await fs.rm(targetPath, { recursive: true, force: true });
}

describe("compileSubjectPipeline SQL Foundations regression", () => {
    afterEach(async () => {
        await Promise.all([
            rmIfExists(SQL_V2_DRAFT_ROOT),
            rmIfExists(SQL_V2_REPORT_ROOT),
            rmIfExists(SQL_V2_MESSAGE_ROOT),
        ]);
    });

    it("compiles what_sql_means into sql-v2 topic bundles without Python help leakage", async () => {
        await Promise.all([
            rmIfExists(SQL_V2_DRAFT_ROOT),
            rmIfExists(SQL_V2_REPORT_ROOT),
            rmIfExists(SQL_V2_MESSAGE_ROOT),
        ]);

        const target = await resolveAuthoringCompileTarget({
            subjectSlug: "sql",
            courseSlug: "sql-foundations",
        });

        const plan = buildPlanFromSpec({
            blueprint: target.blueprint,
            spec: target.spec,
        }) as any;

        plan.modules = [plan.modules[0]];
        plan.modules[0].sections = [plan.modules[0].sections[0]];
        plan.modules[0].sections[0].topics = [plan.modules[0].sections[0].topics[0]];

        await compileSubjectPipeline({
            blueprint: target.blueprint,
            plan,
            spec: target.spec,
            provider,
        });

        const bundlePath = path.join(
            SQL_V2_DRAFT_ROOT,
            "modules",
            "module0",
            "topics",
            "what_sql_means",
            "topic.bundle.json",
        );

        const retrySummaryPath = path.join(SQL_V2_REPORT_ROOT, "retry-summary.json");
        const messagePath = path.join(
            SQL_V2_MESSAGE_ROOT,
            "module0",
            "what_sql_means.json",
        );

        const bundle = JSON.parse(await fs.readFile(bundlePath, "utf8"));
        const retrySummary = await fs
            .readFile(retrySummaryPath, "utf8")
            .then((text) => JSON.parse(text))
            .catch(() => null);
        const messages = JSON.parse(await fs.readFile(messagePath, "utf8"));

        expect(bundle.subjectSlug).toBe("sql-v2");
        expect(bundle.exercises.length).toBeGreaterThan(0);
        expect(JSON.stringify(bundle)).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
        expect(JSON.stringify(messages)).not.toMatch(
            /\bPython\b|program output|\bterminal\b|\.py\b|Python statement|Python file/i,
        );
        expect(JSON.stringify(messages)).toMatch(/SQL editor|results table|Run query/i);
        if (retrySummary) {
            expect(retrySummary.topics).toEqual([
                expect.objectContaining({
                    topicId: "what_sql_means",
                    status: "success",
                }),
            ]);
        }

        const attemptDir = path.join(
            SQL_V2_REPORT_ROOT,
            "module0",
            "what_sql_means",
            "attempt-0",
        );
        const prompt = JSON.parse(
            await fs.readFile(path.join(attemptDir, "prompt.json"), "utf8"),
        );
        const hashes = JSON.parse(
            await fs.readFile(path.join(attemptDir, "hashes.json"), "utf8"),
        );

        await expect(fs.readFile(path.join(attemptDir, "raw-model-output.txt"), "utf8")).resolves
            .toContain('"title":"What SQL Means"');
        await expect(fs.readFile(path.join(attemptDir, "parsed-output.json"), "utf8")).resolves
            .toContain('"quizDraft"');
        await expect(fs.readFile(path.join(attemptDir, "raw-draft.json"), "utf8")).resolves
            .toContain('"What SQL Means"');
        await expect(fs.readFile(path.join(attemptDir, "normalized-draft.json"), "utf8")).resolves
            .toContain('"quizDraft"');
        await expect(fs.readFile(path.join(attemptDir, "attempt-metadata.json"), "utf8")).resolves
            .toContain('"strictSchema": true');
        await expect(fs.readFile(path.join(attemptDir, "emitted-topic-bundle.json"), "utf8")).resolves
            .toContain('"subjectSlug": "sql-v2"');
        expect(prompt.system).toContain("TopicAuthoringDraft");
        expect(prompt.user).toContain('"profileId": "sql"');
        expect(hashes.promptHash).toBeTypeOf("string");
        expect(hashes.compiledTopicBundleHash).toBeTypeOf("string");
    });
});
