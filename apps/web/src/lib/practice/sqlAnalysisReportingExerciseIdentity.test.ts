import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";
import { resolveCurrentAuthoredSqlExpected } from "@/lib/practice/api/validate/services/currentAuthoredSqlExpected.service";

function topicBundleFiles(root: string): string[] {
    const found: string[] = [];

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) {
            found.push(...topicBundleFiles(absolute));
        } else if (entry.name === "topic.bundle.json") {
            found.push(absolute);
        }
    }

    return found.sort();
}

describe("SQL Analysis & Reporting exact exercise contracts", () => {
    it("keeps every SQL code_input resolvable by its exact visible exercise key", () => {
        const root = path.join(
            process.cwd(),
            "src/lib/subjects/sql/sql-analysis-reporting/modules",
        );
        const files = topicBundleFiles(root);
        const seen = new Set<string>();
        let sqlExerciseCount = 0;

        for (const file of files) {
            const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
            const exercises = Array.isArray(bundle.exercises) ? bundle.exercises : [];

            for (const exercise of exercises) {
                if (exercise?.kind !== "code_input" || exercise?.language !== "sql") {
                    continue;
                }

                sqlExerciseCount += 1;
                const id = String(exercise.id ?? "").trim();
                expect(id, file).not.toBe("");
                const scopedId = `${String(bundle.topicId ?? file)}:${id}`;
                expect(seen.has(scopedId), `duplicate scoped SQL exercise id ${scopedId}`).toBe(false);
                seen.add(scopedId);

                expect(resolveManifestExercise({ topicBundle: bundle, exerciseKey: id })).toBe(
                    exercise,
                );
                expect(exercise.runtime?.datasetId, id).toBe("sales_reporting");
                expect(exercise.recipe?.datasetId, id).toBe("sales_reporting");
                expect(String(exercise.recipe?.solutionCode ?? "").trim(), id).not.toBe("");

                const currentExpected = resolveCurrentAuthoredSqlExpected({
                    kind: "code_input",
                    exerciseKey: id,
                    publicPayload: {
                        language: "sql",
                        topic: bundle.topicId,
                        runtime: { kind: "sql" },
                    },
                    topic: {
                        slug: bundle.topicId,
                        subject: { slug: "sql-analysis-reporting" },
                        module: {
                            subject: { slug: "sql-analysis-reporting" },
                        },
                    },
                } as any);

                expect(currentExpected, `${scopedId} current contract`).not.toBeNull();
                expect(
                    String((currentExpected as any)?.solutionCode ?? "").trim(),
                    `${scopedId} current solution`,
                ).toBe(String(exercise.recipe.solutionCode).trim());
            }
        }

        expect(sqlExerciseCount).toBe(82);
    });
});

describe("authored SQL expected refresh", () => {
    it("replaces a stale same-key SQL snapshot with the current manifest contract", () => {
        const staleExpected = {
            kind: "code_input",
            strategy: "sql",
            solutionCode:
                "SELECT order_id, quantity * unit_price AS old_total FROM sales_reporting;",
            tests: [],
        };

        const currentExpected = resolveCurrentAuthoredSqlExpected({
            kind: "code_input",
            exerciseKey: "try-how-null-affects-calculations-sketch0",
            publicPayload: {
                language: "sql",
                topic: "how-null-affects-calculations",
                runtime: { kind: "sql" },
            },
            topic: {
                slug: "how-null-affects-calculations",
                subject: { slug: "sql-analysis-reporting" },
                module: {
                    subject: { slug: "sql-analysis-reporting" },
                },
            },
            secretPayload: { expected: staleExpected },
        } as any);

        expect(currentExpected).not.toBeNull();
        expect((currentExpected as any).solutionCode).toContain(
            "unit_price * discount_pct / 100 AS unit_discount",
        );
        expect((currentExpected as any).solutionCode).not.toContain("old_total");
    });
});
