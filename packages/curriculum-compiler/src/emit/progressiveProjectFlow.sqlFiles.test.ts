import { describe, expect, it } from "vitest";
import { applyProgressiveProjectFlow } from "./progressiveProjectFlow.js";

function sqlStep(args: {
    id: string;
    title: string;
    prompt: string;
    starterSchema: string;
    solutionSchema: string;
    starterQuery: string;
    solutionQuery: string;
}) {
    return {
        id: args.id,
        kind: "code_input" as const,
        title: args.title,
        prompt: args.prompt,
        hint: "Keep the ordered workspace cumulative.",
        help: {
            concept: "Each step carries a complete SQL workspace forward.",
            hint_1: "Keep schema.sql before query.sql.",
            hint_2: "Preserve the previous working files before adding this step.",
        },
        recipeType: "sql_query" as const,
        datasetId: "ddl_blank",
        entryFilePath: "query.sql",
        sqlFileOrder: ["schema.sql", "query.sql"],
        starterCode: args.starterQuery,
        solutionCode: args.solutionQuery,
        starterFiles: [
            { path: "schema.sql", content: args.starterSchema },
            { path: "query.sql", content: args.starterQuery, isEntry: true },
        ],
        solutionFiles: [
            { path: "schema.sql", content: args.solutionSchema },
            { path: "query.sql", content: args.solutionQuery, isEntry: true },
        ],
        checkSql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
    };
}

describe("progressiveProjectFlow ordered SQL files", () => {
    it("carries the previous complete workspace into the next starter", () => {
        const step1 = sqlStep({
            id: "step-1",
            title: "Create warehouses",
            prompt: "Create the warehouses table.",
            starterSchema: "-- Create warehouses.",
            solutionSchema: "CREATE TABLE warehouses (id INTEGER PRIMARY KEY);",
            starterQuery: "SELECT name FROM sqlite_master WHERE type = 'table';",
            solutionQuery:
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'warehouses';",
        });
        const step2 = sqlStep({
            id: "step-2",
            title: "Create stock movements",
            prompt: "Add the related stock_movements table.",
            starterSchema: "CREATE TABLE warehouses (id INTEGER PRIMARY KEY);",
            solutionSchema: [
                "CREATE TABLE warehouses (id INTEGER PRIMARY KEY);",
                "CREATE TABLE stock_movements (",
                "    id INTEGER PRIMARY KEY,",
                "    warehouse_id INTEGER NOT NULL,",
                "    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)",
                ");",
            ].join("\n"),
            starterQuery:
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'warehouses';",
            solutionQuery:
                "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
        });

        const result = applyProgressiveProjectFlow({
            exercises: [step1, step2],
            projectStepIds: ["step-1", "step-2"],
            projectConfig: {
                preferredProjectExerciseKind: "code_input",
                minStepCount: 2,
                targetStepCount: 2,
                allowReveal: true,
                tryItDefault: { enabled: true, sketchIndex: 0, allowReveal: true },
                projectFlowDefault: "progressive",
                projectTitle: "Module Project",
                projectStepLabel: "Project step",
                startPromptPrefix: "Start the module project.",
                continuePromptPrefix: "Continue the same module project.",
                helpConcept: "Carry the complete SQL workspace forward.",
            },
            seed: {
                profileId: "sql",
                courseSlug: "sql-data-management",
                topicId: "warehouse-schema-project",
                practice: { projectFlow: "progressive" },
            } as any,
        });

        const next = result[1];
        expect(next.kind).toBe("code_input");
        if (next.kind !== "code_input") return;

        expect(next.entryFilePath).toBe("query.sql");
        expect(next.sqlFileOrder).toEqual(["schema.sql", "query.sql"]);
        expect(next.starterFiles?.map((file) => file.path)).toEqual([
            "schema.sql",
            "query.sql",
        ]);
        expect(next.starterFiles?.find((file) => file.path === "schema.sql")?.content).toBe(
            step1.solutionFiles[0]?.content,
        );
        expect(next.starterFiles?.find((file) => file.path === "query.sql")?.content).toContain(
            step1.solutionCode,
        );
        expect(next.solutionFiles?.find((file) => file.path === "schema.sql")?.content).toBe(
            step2.solutionFiles[0]?.content,
        );
    });
});
