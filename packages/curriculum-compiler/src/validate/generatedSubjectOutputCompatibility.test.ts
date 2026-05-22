import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "@zoeskoul/curriculum-core";
import { loadSubjectPlan } from "../spec/loadCourseSpec.js";

type JsonObject = Record<string, any>;
type TopicRef = {
    module: JsonObject;
    topicId: string;
    bundlePath: string;
    messagePath: string;
};

const repoRoot = getRepoRoot();
const webRoot = path.join(repoRoot, "apps/web");
const subjectsRoot = path.join(webRoot, "src/lib/subjects");
const messagesRoot = path.join(webRoot, "src/i18n/messages/en/subjects");
const catalogsGeneratedPath = path.join(subjectsRoot, "catalogs.generated.ts");
const subjectsGeneratedPath = path.join(subjectsRoot, "subjects.generated.ts");

function readJson(filePath: string): JsonObject {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function getValueAtPath(source: JsonObject, dottedPath: string) {
    return dottedPath.split(".").reduce<unknown>((value, segment) => {
        if (value == null || typeof value !== "object") return undefined;
        return (value as JsonObject)[segment];
    }, source);
}

function collectTranslationKeys(value: unknown, keys = new Set<string>()) {
    if (Array.isArray(value)) {
        value.forEach((entry) => collectTranslationKeys(entry, keys));
        return keys;
    }

    if (!value || typeof value !== "object") return keys;

    for (const [field, entry] of Object.entries(value)) {
        if (field.endsWith("Key") && field !== "exerciseKey" && typeof entry === "string") {
            keys.add(entry);
        }
        collectTranslationKeys(entry, keys);
    }

    return keys;
}

function topicRefs(liveSubjectSlug: string): TopicRef[] {
    const manifestPath = path.join(
        subjectsRoot,
        liveSubjectSlug,
        "subject.manifest.json",
    );
    const manifest = readJson(manifestPath);

    return (manifest.modules ?? []).flatMap((module: JsonObject) => {
        const moduleDir = `module${module.order}`;
        return (module.sections ?? []).flatMap((section: JsonObject) =>
            (section.topics ?? []).map((topicId: string) => ({
                module,
                topicId,
                bundlePath: path.join(
                    subjectsRoot,
                    liveSubjectSlug,
                    "modules",
                    moduleDir,
                    "topics",
                    topicId,
                    "topic.bundle.json",
                ),
                messagePath: path.join(
                    messagesRoot,
                    liveSubjectSlug,
                    moduleDir,
                    `${topicId}.json`,
                ),
            })),
        );
    });
}

function datasetPath(datasetId: string) {
    const datasetRoot = path.join(subjectsRoot, "sql", "datasets");
    const files = fs
        .readdirSync(datasetRoot)
        .filter((file) => file.endsWith(".ts") && file !== "index.ts");

    for (const file of files) {
        const filePath = path.join(datasetRoot, file);
        if (fs.readFileSync(filePath, "utf8").includes(`id: "${datasetId}"`)) {
            return filePath;
        }
    }

    return null;
}

function readDataset(datasetId: string) {
    const filePath = datasetPath(datasetId);
    expect(filePath, `Missing SQL dataset ${datasetId}`).toBeTruthy();

    const source = fs.readFileSync(filePath!, "utf8");
    return {
        schemaSql: source.match(/schemaSql:\s*`([\s\S]*?)`\.trim\(\)/)?.[1] ?? "",
        seedSql: source.match(/seedSql:\s*`([\s\S]*?)`\.trim\(\)/)?.[1] ?? "",
    };
}

function executeSql(args: { schemaSql: string; seedSql: string; sql: string }) {
    const result = spawnSync("sqlite3", [":memory:", "-json"], {
        input: [
            args.schemaSql,
            args.seedSql,
            `${args.sql.trim().replace(/;+$/, "")};`,
        ].join("\n"),
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

describe("generated subject output compatibility", () => {
    it("keeps publishTarget subjects in the existing subject-level web output shape", async () => {
        for (const subjectSlug of ["sql", "python"]) {
            const plan = await loadSubjectPlan(subjectSlug);
            const liveSubjectSlug = plan?.publishTarget.liveSubjectSlug;
            expect(liveSubjectSlug).toBeTruthy();

            const manifestPath = path.join(
                subjectsRoot,
                liveSubjectSlug!,
                "subject.manifest.json",
            );
            const messagesPath = path.join(messagesRoot, liveSubjectSlug!, "subject.json");
            const modulesRoot = path.join(subjectsRoot, liveSubjectSlug!, "modules");

            expect(fs.existsSync(manifestPath), manifestPath).toBe(true);
            expect(fs.existsSync(messagesPath), messagesPath).toBe(true);
            expect(fs.existsSync(modulesRoot), modulesRoot).toBe(true);
            expect(
                fs.existsSync(path.join(subjectsRoot, liveSubjectSlug!, "courses")),
                "course-nested runtime output should not be required yet",
            ).toBe(false);

            const manifest = readJson(manifestPath);
            expect(manifest.subject.slug).toBe(liveSubjectSlug);
            if (plan?.versioning) {
                expect(manifest.subject.meta?.versioning).toEqual(plan.versioning);
            }
        }
    });

    it("resolves generated manifest topics, bundles, targets, and English i18n keys", () => {
        const issues: string[] = [];

        for (const liveSubjectSlug of ["sql", "sql-v2", "python-v2"]) {
            for (const ref of topicRefs(liveSubjectSlug)) {
                if (!fs.existsSync(ref.bundlePath)) {
                    issues.push(`Missing topic bundle ${path.relative(repoRoot, ref.bundlePath)}`);
                    continue;
                }
                if (!fs.existsSync(ref.messagePath)) {
                    issues.push(`Missing message file ${path.relative(repoRoot, ref.messagePath)}`);
                    continue;
                }

                const bundle = readJson(ref.bundlePath);
                const messages = readJson(ref.messagePath);
                const sketchIds = new Set((bundle.sketches ?? []).map((sketch: JsonObject) => sketch.id));
                const exerciseIds = new Set((bundle.exercises ?? []).map((exercise: JsonObject) => exercise.id));
                const quizExerciseIds = new Set(
                    (bundle.exercises ?? [])
                        .filter((exercise: JsonObject) => exercise.purpose === "quiz")
                        .map((exercise: JsonObject) => exercise.id),
                );

                if (bundle.subjectSlug !== liveSubjectSlug) {
                    issues.push(`${ref.topicId}: subjectSlug ${bundle.subjectSlug} != ${liveSubjectSlug}`);
                }
                if (bundle.topicId !== ref.topicId) {
                    issues.push(`${ref.topicId}: bundle topicId ${bundle.topicId}`);
                }

                const projectTitleKeys: string[] = [];
                const quizTitleKeys: string[] = [];

                for (const card of bundle.cards ?? []) {
                    if (card.kind === "sketch" && !sketchIds.has(card.sketchId)) {
                        issues.push(`${ref.topicId}/${card.id}: missing sketch ${card.sketchId}`);
                    }
                    if (card.kind === "quiz" && quizExerciseIds.size === 0) {
                        issues.push(`${ref.topicId}/${card.id}: quiz card has no quiz exercises`);
                    }
                    if (card.kind === "project") {
                        if (String(card.titleKey ?? "").includes(".cards.quiz.title")) {
                            issues.push(`${ref.topicId}/${card.id}: project card uses quiz title key`);
                        }
                        projectTitleKeys.push(String(card.titleKey ?? ""));
                        for (const step of card.project?.steps ?? []) {
                            if (!exerciseIds.has(step.exerciseKey)) {
                                issues.push(`${ref.topicId}/${card.id}: missing project exercise ${step.exerciseKey}`);
                            }
                        }
                    }
                    if (card.kind === "quiz") {
                        quizTitleKeys.push(String(card.titleKey ?? ""));
                    }
                }

                for (const key of collectTranslationKeys(bundle)) {
                    if (getValueAtPath(messages, key) == null) {
                        issues.push(`${ref.topicId}: missing i18n key ${key}`);
                    }
                }

                const sketchMessages =
                    messages.sketches?.[liveSubjectSlug]?.[ref.module.slug]?.[ref.topicId] ?? {};
                for (const sketch of bundle.sketches ?? []) {
                    const bodyMarkdown = String(sketchMessages[sketch.id]?.bodyMarkdown ?? "");
                    const imageIds = new Set((sketch.images ?? []).map((image: JsonObject) => image.id));
                    for (const match of bodyMarkdown.matchAll(/\[\[image:([a-zA-Z0-9_-]+)\]\]/g)) {
                        if (!imageIds.has(match[1])) {
                            issues.push(`${ref.topicId}/${sketch.id}: image marker ${match[1]} is not mapped`);
                        }
                    }
                }

                for (const projectTitleKey of projectTitleKeys) {
                    for (const quizTitleKey of quizTitleKeys) {
                        const projectTitle = getValueAtPath(messages, projectTitleKey);
                        const quizTitle = getValueAtPath(messages, quizTitleKey);
                        if (
                            typeof projectTitle === "string" &&
                            typeof quizTitle === "string" &&
                            projectTitle === quizTitle
                        ) {
                            issues.push(`${ref.topicId}: project and quiz cards share title ${projectTitle}`);
                        }
                    }
                }
            }
        }

        expect(issues).toEqual([]);
    });

    it("keeps SQL v1 legacy output alongside active SQL v2 output", () => {
        const sqlManifestPath = path.join(subjectsRoot, "sql", "subject.manifest.json");
        const sqlV2ManifestPath = path.join(subjectsRoot, "sql-v2", "subject.manifest.json");

        expect(fs.existsSync(sqlManifestPath), sqlManifestPath).toBe(true);
        expect(fs.existsSync(sqlV2ManifestPath), sqlV2ManifestPath).toBe(true);

        const sqlManifest = readJson(sqlManifestPath);
        const sqlV2Manifest = readJson(sqlV2ManifestPath);

        expect(sqlManifest.subject.slug).toBe("sql");
        expect(sqlManifest.subject.meta?.versioning).toMatchObject({
            family: "sql",
            version: 1,
            status: "legacy",
            defaultForNewEnrollments: false,
            supersededBy: "sql-v2",
        });

        expect(sqlV2Manifest.subject.slug).toBe("sql-v2");
        expect(sqlV2Manifest.subject.meta?.versioning).toEqual({
            family: "sql",
            version: 2,
            status: "active",
            defaultForNewEnrollments: true,
            supersedes: "sql",
            supersededBy: null,
        });
    });

    it("keeps generated subject and catalog registries aligned with SQL v1 and SQL v2", () => {
        const catalogsGenerated = fs.readFileSync(catalogsGeneratedPath, "utf8");
        const subjectsGenerated = fs.readFileSync(subjectsGeneratedPath, "utf8");

        expect(catalogsGenerated).toContain('"defaultSubjectSlug": "sql-v2"');
        expect(catalogsGenerated).toContain('"subjectSlugs": [');
        expect(catalogsGenerated).toContain('"sql-v2"');
        expect(catalogsGenerated).toContain('"sql": "sql"');
        expect(catalogsGenerated).toContain('"sql-v2": "sql"');

        expect(subjectsGenerated).toContain('export const SUBJECT_MANIFESTS: Record<string, SubjectManifest> = {');
        expect(subjectsGenerated).toContain('"sql": sql as SubjectManifest');
        expect(subjectsGenerated).toContain('"sql-v2": sqlV2 as SubjectManifest');
    });

    it("runs SQL code-input golden checks against generated production output", () => {
        const issues: string[] = [];
        let codeInputCount = 0;

        for (const ref of topicRefs("sql-v2")) {
            const bundle = readJson(ref.bundlePath);

            for (const exercise of bundle.exercises ?? []) {
                if (exercise.kind !== "code_input") continue;
                codeInputCount += 1;

                const refId = `${ref.topicId}/${exercise.id}`;
                const recipe = exercise.recipe ?? {};
                const datasetId = recipe.datasetId ?? exercise.runtime?.datasetId;
                const tests = recipe.tests ?? [];

                if (exercise.language !== "sql" && recipe.type !== "sql_query") {
                    issues.push(`${refId}: missing canonical SQL runtime marker`);
                }
                if (!datasetId) issues.push(`${refId}: missing datasetId`);
                if (!recipe.solutionCode?.trim()) issues.push(`${refId}: missing solutionCode`);
                if (tests.length < 1) issues.push(`${refId}: missing tests`);
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

        expect(codeInputCount).toBeGreaterThan(0);
        expect(issues).toEqual([]);
    });
});
