import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDraftSubjectRoot, getRepoRoot } from "@zoeskoul/curriculum-core";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { buildPlanFromSpec } from "../spec/buildPlanFromSpec.js";
import { compileSubjectPipeline } from "./compileSubjectPipeline.js";
import { resolveAuthoringCompileTarget } from "./resolveAuthoringCompileTarget.js";

const SQL_V2_DRAFT_ROOT = getDraftSubjectRoot("sql-v2");
const SQL_V2_REPORT_ROOT = path.join(
    getRepoRoot(),
    ".curriculum-drafts",
    "reports",
    "sql-v2",
);
const SQL_V2_MESSAGE_ROOT = path.join(
    getRepoRoot(),
    ".curriculum-drafts",
    "messages",
    "en",
    "subjects",
    "sql-v2",
);

const provider: AiProvider = {
    async generateJson() {
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
                    id: "multi-2",
                    kind: "multi_choice",
                    title: "Table parts",
                    prompt: "Which items are column names in the students table example?",
                    hint: "Look for field labels, not full records.",
                    help: {
                        concept: "Column names label the type of data stored in each field.",
                        hint_1: "Name and city are fields on every student record.",
                        hint_2: "Noor is a row value, not a column name.",
                    },
                    options: ["name", "city", "Noor"],
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
                    id: "drag-2",
                    kind: "drag_reorder",
                    title: "SELECT starter order",
                    prompt: "Arrange the starter query pieces in the order shown in the lesson.",
                    hint: "SELECT comes before the column name and table name.",
                    help: {
                        concept: "A basic query starts with SELECT, then the column, then FROM and the table.",
                        hint_1: "The table name comes after FROM.",
                        hint_2: "The column name is chosen right after SELECT.",
                    },
                    tokens: ["SELECT", "name", "FROM students"],
                    correctOrder: ["SELECT", "name", "FROM students"],
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
                {
                    id: "fill-2",
                    kind: "fill_blank_choice",
                    title: "Run button",
                    prompt: "Complete the lesson sentence about trying a query.",
                    hint: "Use the label shown on the SQL workspace button.",
                    help: {
                        concept: "The learner runs a query from the SQL editor using the Run query button.",
                        hint_1: "The button does not say Save file or Refresh page.",
                        hint_2: "Pick the workspace action that executes the query.",
                    },
                    template: "After writing the query, click [blank1] to see the results table.",
                    choices: ["Run query", "Save file", "Refresh page"],
                    correctValue: "Run query",
                },
                {
                    id: "sql-check-1",
                    kind: "code_input",
                    title: "List student names",
                    prompt: "Write a query that lists the name column from students.",
                    hint: "Use the query pattern from the lesson.",
                    help: {
                        concept:
                            "This SQL exercise checks whether your query returns the requested result.",
                        hint_1: "Check the table name and selected columns in the SQL editor.",
                        hint_2: "Click Run query and compare the results table.",
                    },
                    starterCode: "SELECT * FROM students;",
                    solutionCode: "SELECT name FROM students;",
                    recipeType: "sql_query",
                    datasetId: "students_intro",
                },
                {
                    id: "sql-check-2",
                    kind: "code_input",
                    title: "List student cities",
                    prompt: "Write a query that lists the city column from students.",
                    hint: "Select the city field from the students table.",
                    help: {
                        concept: "This SQL exercise checks whether your query selects one requested column.",
                        hint_1: "Use SELECT with the city column name.",
                        hint_2: "Run the query and compare the results table.",
                    },
                    starterCode: "SELECT * FROM students;",
                    solutionCode: "SELECT city FROM students;",
                    recipeType: "sql_query",
                    datasetId: "students_intro",
                },
                {
                    id: "sql-check-3",
                    kind: "code_input",
                    title: "List names and grades",
                    prompt: "Write a query that lists the name and grade columns from students.",
                    hint: "Select the two requested columns from the students table.",
                    help: {
                        concept: "This SQL exercise checks whether your query selects multiple requested columns.",
                        hint_1: "Put both column names after SELECT.",
                        hint_2: "Run the query and compare the results table.",
                    },
                    starterCode: "SELECT * FROM students;",
                    solutionCode: "SELECT name, grade FROM students;",
                    recipeType: "sql_query",
                    datasetId: "students_intro",
                },
            ],
        } as any;
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
    });
});
