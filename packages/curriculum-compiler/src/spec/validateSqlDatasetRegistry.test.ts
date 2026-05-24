import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAuthoringRoot } from "@zoeskoul/curriculum-core";
import {
    getSqlDatasetById,
    listSqlDatasetIds,
} from "../../../curriculum-profiles/src/sql/datasets/index.js";
import { deriveSqlRelationshipsFromSchemaSql } from "./validateSubjectAuthoring.js";

function normalizeSqlIdentifier(value: string) {
    return value.replace(/["'`]/g, "").trim();
}

function parseSchemaTables(schemaSql: string) {
    const tables = new Map<string, Set<string>>();
    const createTablePattern = /CREATE TABLE\s+([A-Za-z_][\w]*)\s*\(([\s\S]*?)\);/gi;

    for (const match of schemaSql.matchAll(createTablePattern)) {
        const tableName = normalizeSqlIdentifier(match[1] ?? "");
        const columns = new Set<string>();

        for (const rawLine of (match[2] ?? "").split("\n")) {
            const line = rawLine.trim().replace(/,$/, "");
            if (!line || /^FOREIGN KEY/i.test(line) || /^PRIMARY KEY\s*\(/i.test(line)) {
                continue;
            }

            const columnMatch = line.match(/^([A-Za-z_][\w]*)\s+/);
            if (columnMatch) {
                columns.add(normalizeSqlIdentifier(columnMatch[1] ?? ""));
            }
        }

        tables.set(tableName, columns);
    }

    return tables;
}

async function collectSqlDatasetUsage() {
    const coursesRoot = path.join(getAuthoringRoot(), "subjects", "sql", "courses");
    const courseDirs = await fs.readdir(coursesRoot, { withFileTypes: true });
    const usage = new Map<string, string[]>();
    const relationshipHeavyDatasetIds = new Set<string>();

    for (const entry of courseDirs) {
        if (!entry.isDirectory()) continue;

        for (const fileName of [
            "course.spec.json",
            "course.plan.json",
            "validation.policy.json",
            "generation.policy.json",
        ]) {
            const filePath = path.join(coursesRoot, entry.name, fileName);
            try {
                const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
                const datasetIds = new Set<string>();

                const visit = (value: unknown) => {
                    if (Array.isArray(value)) {
                        value.forEach(visit);
                        return;
                    }
                    if (!value || typeof value !== "object") {
                        return;
                    }

                    for (const [key, child] of Object.entries(value)) {
                        if (key === "datasetId" && typeof child === "string") {
                            datasetIds.add(child);
                        } else if (
                            key === "datasets" &&
                            Array.isArray(child) &&
                            child.every((item) => typeof item === "string")
                        ) {
                            child.forEach((item) => datasetIds.add(item));
                        } else {
                            visit(child);
                        }
                    }
                };

                visit(raw);

                const relationshipFlags = [
                    raw.validationPolicy,
                    raw.validationRequirements,
                ].filter(Boolean) as Record<string, unknown>[];
                const relationshipHeavy = relationshipFlags.some(
                    (value) =>
                        value.requireJoinRelationshipMetadata === true ||
                        value.requireErdOrTableRelationshipVisuals === true ||
                        value.requireErdVisuals === true ||
                        value.requireCrowFootOrRelationshipDiagrams === true,
                );

                for (const datasetId of datasetIds) {
                    usage.set(datasetId, [...(usage.get(datasetId) ?? []), filePath]);
                    if (relationshipHeavy) {
                        relationshipHeavyDatasetIds.add(datasetId);
                    }
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
            }
        }
    }

    return { usage, relationshipHeavyDatasetIds };
}

describe("canonical SQL dataset registry", () => {
    it("contains every datasetId referenced by active SQL authoring", async () => {
        const { usage } = await collectSqlDatasetUsage();
        const canonicalDatasetIds = new Set(listSqlDatasetIds());
        const missing = [...usage.keys()].filter((datasetId) => !canonicalDatasetIds.has(datasetId));

        expect(missing).toEqual([]);
    });

    it("loads every canonical dataset and keeps table snapshots aligned with schemaSql", () => {
        for (const datasetId of listSqlDatasetIds()) {
            const dataset = getSqlDatasetById(datasetId);

            expect(dataset, datasetId).toBeTruthy();
            expect(dataset?.id, datasetId).toBe(datasetId);
            expect(dataset?.dialect, datasetId).toBe("sqlite");
            expect(typeof dataset?.schemaSql, datasetId).toBe("string");
            expect(typeof dataset?.seedSql, datasetId).toBe("string");
            expect(dataset?.tableSnapshots, datasetId).toBeTruthy();

            const schemaTables = parseSchemaTables(dataset?.schemaSql ?? "");
            for (const [tableName, snapshot] of Object.entries(dataset?.tableSnapshots ?? {})) {
                expect(schemaTables.has(tableName), `${datasetId}.${tableName}`).toBe(true);

                const schemaColumns = schemaTables.get(tableName) ?? new Set<string>();
                for (const column of snapshot.columns) {
                    expect(
                        schemaColumns.has(column.name),
                        `${datasetId}.${tableName}.${column.name}`,
                    ).toBe(true);
                }
            }
        }
    });

    it("gives join and design datasets detectable foreign-key relationships from schemaSql", async () => {
        const { relationshipHeavyDatasetIds } = await collectSqlDatasetUsage();

        for (const datasetId of relationshipHeavyDatasetIds) {
            const dataset = getSqlDatasetById(datasetId);
            expect(dataset, datasetId).toBeTruthy();
            expect(
                deriveSqlRelationshipsFromSchemaSql(dataset?.schemaSql ?? "").length,
                datasetId,
            ).toBeGreaterThan(0);
        }
    });
});
