import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;

function findRepoRoot(): string {
    const candidates = [
        process.cwd(),
        path.resolve(process.cwd(), "../.."),
    ];

    const root = candidates.find((candidate) =>
        fs.existsSync(path.join(candidate, ".curriculum-drafts")),
    );

    if (!root) {
        throw new Error("Could not locate the repository curriculum drafts.");
    }

    return root;
}

function normalizeSqlShape(sql: string): string {
    return sql
        .replace(/--.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .toLowerCase()
        // A teaching example and Try It are still the same task when the only
        // learner addition is ORDER BY.
        .replace(/\border\s+by\b[\s\S]*$/i, "")
        // Renaming the same selected expressions does not create a new task.
        .replace(/\bas\s+[a-z_][a-z0-9_]*/gi, "as _alias")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/;+$/, "");
}

function extractSqlBlocks(markdown: string): string[] {
    return Array.from(
        markdown.matchAll(/```sql\s*([\s\S]*?)```/gi),
        (match) => match[1] ?? "",
    );
}

function listMessageFiles(root: string): string[] {
    const courseRoot = path.join(
        root,
        ".curriculum-drafts/sql/messages/en/subjects/sql--sql-analysis-reporting--draft",
    );
    const files: string[] = [];

    const visit = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                visit(fullPath);
            } else if (entry.name.endsWith(".json") && entry.name !== "subject.json") {
                files.push(fullPath);
            }
        }
    };

    visit(courseRoot);
    return files;
}

describe("SQL Analysis & Reporting example/practice separation", () => {
    it("does not make a Try It repeat a teaching example with only aliases or sorting changed", () => {
        const issues: string[] = [];

        for (const filePath of listMessageFiles(findRepoRoot())) {
            const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;

            for (const [subjectSlug, modules] of Object.entries(data.topics ?? {})) {
                for (const [moduleSlug, topics] of Object.entries(modules as JsonObject)) {
                    for (const [topicSlug, topic] of Object.entries(topics as JsonObject)) {
                        const sketches =
                            data.sketches?.[subjectSlug]?.[moduleSlug]?.[topicSlug] ?? {};
                        const exampleShapes = Object.values(sketches as JsonObject)
                            .flatMap((sketch: any) =>
                                extractSqlBlocks(String(sketch?.bodyMarkdown ?? "")),
                            )
                            .map(normalizeSqlShape)
                            .filter(Boolean);

                        for (const [tryItId, tryIt] of Object.entries(
                            (topic as JsonObject).tryIt ?? {},
                        )) {
                            if (!tryIt || typeof tryIt !== "object") continue;
                            const solutionCode = String(
                                (tryIt as JsonObject).solutionCode ?? "",
                            );
                            if (!solutionCode.trim()) continue;

                            const practiceShape = normalizeSqlShape(solutionCode);
                            if (exampleShapes.includes(practiceShape)) {
                                issues.push(
                                    `${topicSlug}/${tryItId} repeats a teaching SQL example`,
                                );
                            }
                        }
                    }
                }
            }
        }

        expect(issues).toEqual([]);
    });
});
