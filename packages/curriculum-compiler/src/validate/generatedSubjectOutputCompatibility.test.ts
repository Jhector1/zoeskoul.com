import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    getCatalogSlugForSubjectSlug,
    getRepoRoot,
    getSubjectManifestPath,
    getSubjectMessagesPath,
    getTopicBundlePath,
    getTopicMessagesPath,
} from "@zoeskoul/curriculum-core";
import { validateGoldenTopicBundle } from "@zoeskoul/curriculum-profiles";
import { resolveEffectiveExerciseRuntime } from "@zoeskoul/curriculum-runtime/runtime";
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
    const manifestPath = getSubjectManifestPath(liveSubjectSlug);
    const manifest = readJson(manifestPath);

    return (manifest.modules ?? []).flatMap((module: JsonObject) => {
        const moduleDir = `module${module.order}`;
        return (module.sections ?? []).flatMap((section: JsonObject) =>
            (section.topics ?? []).map((topicId: string) => ({
                module,
                topicId,
                bundlePath: path.join(
                    getTopicBundlePath(liveSubjectSlug, moduleDir, topicId),
                ),
                messagePath: getTopicMessagesPath("en", liveSubjectSlug, moduleDir, topicId),
            })),
        );
    });
}

function isSqlCodeInput(exercise: JsonObject): boolean {
    if (exercise.kind !== "code_input") return false;

    return (
        exercise.language === "sql" ||
        exercise.runtime?.kind === "sql" ||
        exercise.recipe?.type === "sql_query"
    );
}

async function collectCodeInputCompatibilityIssues(args: {
    topicId: string;
    bundle: JsonObject;
    moduleRuntimeDefaults?: JsonObject | null;
    courseSlug?: string | null;
}): Promise<{ issues: string[]; codeInputCount: number }> {
    const issues: string[] = [];
    let count = 0;
    let hasEligibleSqlCodeInput = false;

    for (const exercise of args.bundle.exercises ?? []) {
        if (exercise.kind !== "code_input") continue;
        count += 1;

        const refId = `${args.topicId}/${exercise.id}`;
        const recipe = exercise.recipe ?? {};

        if (isSqlCodeInput(exercise)) {
            const effectiveRuntime = resolveEffectiveExerciseRuntime({
                language: exercise.language ?? "sql",
                recipe,
                exerciseRuntime: exercise.runtime ?? null,
                exerciseSqlDatasetId: exercise.sqlDatasetId ?? null,
                topicRuntimeDefaults: args.bundle.runtimeDefaults ?? null,
                moduleRuntimeDefaults: args.moduleRuntimeDefaults ?? null,
            });
            const datasetId =
                effectiveRuntime.datasetId ??
                exercise.runtime?.datasetId ??
                recipe.datasetId;
            const solutionCode =
                typeof recipe.solutionCode === "string" ? recipe.solutionCode.trim() : "";
            const resultShape =
                recipe.resultShape ??
                exercise.runtime?.resultShape ??
                effectiveRuntime.resultShape ??
                "table";

            if (recipe.type !== "sql_query") {
                issues.push(`${refId}: missing sql_query recipe`);
                continue;
            }
            if (!datasetId) {
                issues.push(`${refId}: missing SQL datasetId`);
                continue;
            }
            if (!solutionCode) {
                issues.push(`${refId}: missing SQL solutionCode`);
                continue;
            }
            if (resultShape !== "table") {
                issues.push(`${refId}: SQL resultShape must be table`);
                continue;
            }
            hasEligibleSqlCodeInput = true;
            continue;
        }

        const tests = recipe.tests ?? [];
        if (tests.length < 1) {
            issues.push(`${refId}: missing tests`);
        }
    }

    if (hasEligibleSqlCodeInput) {
        const report = await validateGoldenTopicBundle({
            seed: {
                topicId: args.bundle.topicId,
                subjectSlug: args.bundle.subjectSlug,
                courseSlug: args.courseSlug ?? undefined,
                moduleRuntimeDefaults: args.moduleRuntimeDefaults ?? null,
            } as any,
            draft: {} as any,
            topicBundle: args.bundle as any,
        });

        for (const issue of report.issues) {
            if (!issue.exerciseId) {
                issues.push(`${args.topicId}: SQL golden validation failed: ${issue.message}`);
                continue;
            }
            issues.push(
                `${args.topicId}/${issue.exerciseId}: SQL golden validation failed: ${issue.message}`,
            );
        }
    }

    return { issues, codeInputCount: count };
}

describe("generated subject output compatibility", () => {
    it("keeps publishTarget subjects in the existing subject-level web output shape", async () => {
        for (const subjectSlug of ["sql", "python"]) {
            const plan = await loadSubjectPlan(subjectSlug);
            const liveSubjectSlug = plan?.publishTarget.liveSubjectSlug;
            expect(liveSubjectSlug).toBeTruthy();

            const manifestPath = path.join(
                getSubjectManifestPath(liveSubjectSlug!),
            );
            const messagesPath = getSubjectMessagesPath("en", liveSubjectSlug!);
            const modulesRoot = path.join(
                subjectsRoot,
                getCatalogSlugForSubjectSlug(liveSubjectSlug!),
                liveSubjectSlug!,
                "modules",
            );

            expect(fs.existsSync(manifestPath), manifestPath).toBe(true);
            expect(fs.existsSync(messagesPath), messagesPath).toBe(true);
            expect(fs.existsSync(modulesRoot), modulesRoot).toBe(true);
            expect(
                fs.existsSync(
                    path.join(
                        subjectsRoot,
                        getCatalogSlugForSubjectSlug(liveSubjectSlug!),
                        liveSubjectSlug!,
                        "courses",
                    ),
                ),
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
        const sqlManifestPath = getSubjectManifestPath("sql");
        const sqlV2ManifestPath = getSubjectManifestPath("sql-v2");

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
        const planPromise = loadSubjectPlan("sql");
        return planPromise.then(async (plan) => {
            const issues: string[] = [];
            let codeInputCount = 0;

            for (const ref of topicRefs("sql-v2")) {
                const bundle = readJson(ref.bundlePath);
                const result = await collectCodeInputCompatibilityIssues({
                    topicId: ref.topicId,
                    bundle,
                    moduleRuntimeDefaults: ref.module.runtimeDefaults ?? null,
                    courseSlug: plan?.publishTarget.courseSlug ?? null,
                });

                codeInputCount += result.codeInputCount;
                issues.push(...result.issues);
            }

            expect(codeInputCount).toBeGreaterThan(0);
            expect(issues).toEqual([]);
        });
    }, 60_000);

    it("accepts SQL code_input metadata without generic tests[] while keeping Python strict", async () => {
        const sqlBundle = {
            topicId: "sql-topic",
            subjectSlug: "sql-v2",
            moduleSlug: "sql-v2-0",
            sectionSlug: "sql-v2-0-1",
            prefix: "topics.sql.sql-v2-0.sql-topic",
            minutes: 10,
            runtimeDefaults: {
                kind: "sql",
                datasetId: "students_intro",
                fixedSqlDialect: "sqlite",
                resultShape: "table",
            },
            topic: {
                labelKey: "label",
                summaryKey: "summary",
            },
            cards: [],
            sketches: [],
            exercises: [
                {
                    id: "sql-ok",
                    kind: "code_input",
                    language: "sql",
                    runtime: {
                        kind: "sql",
                        datasetId: "students_intro",
                        resultShape: "table",
                    },
                    recipe: {
                        type: "sql_query",
                        datasetId: "students_intro",
                        solutionCode: "SELECT id, name FROM students;",
                    },
                },
            ],
        };
        const sqlResult = await collectCodeInputCompatibilityIssues({
            topicId: "sql-topic",
            bundle: sqlBundle,
            moduleRuntimeDefaults: sqlBundle.runtimeDefaults,
            courseSlug: "sql-foundations",
        });
        expect(sqlResult.issues).toEqual([]);

        const missingRecipe = await collectCodeInputCompatibilityIssues({
            topicId: "sql-topic",
            bundle: {
                ...sqlBundle,
                exercises: [
                    {
                        id: "sql-missing-recipe",
                        kind: "code_input",
                        language: "sql",
                        runtime: {
                            kind: "sql",
                            datasetId: "students_intro",
                        },
                        recipe: {},
                    },
                ],
            },
            moduleRuntimeDefaults: sqlBundle.runtimeDefaults,
            courseSlug: "sql-foundations",
        });
        expect(missingRecipe.issues).toEqual([
            "sql-topic/sql-missing-recipe: missing sql_query recipe",
        ]);

        const missingDataset = await collectCodeInputCompatibilityIssues({
            topicId: "sql-topic",
            bundle: {
                ...sqlBundle,
                runtimeDefaults: null,
                exercises: [
                    {
                        id: "sql-missing-dataset",
                        kind: "code_input",
                        language: "sql",
                        runtime: {
                            kind: "sql",
                        },
                        recipe: {
                            type: "sql_query",
                            solutionCode: "SELECT 1;",
                        },
                    },
                ],
            },
            moduleRuntimeDefaults: null,
            courseSlug: "sql-foundations",
        });
        expect(missingDataset.issues).toEqual([
            "sql-topic/sql-missing-dataset: missing SQL datasetId",
        ]);

        const missingSolution = await collectCodeInputCompatibilityIssues({
            topicId: "sql-topic",
            bundle: {
                ...sqlBundle,
                exercises: [
                    {
                        id: "sql-missing-solution",
                        kind: "code_input",
                        language: "sql",
                        runtime: {
                            kind: "sql",
                            datasetId: "students_intro",
                        },
                        recipe: {
                            type: "sql_query",
                            datasetId: "students_intro",
                        },
                    },
                ],
            },
            moduleRuntimeDefaults: sqlBundle.runtimeDefaults,
            courseSlug: "sql-foundations",
        });
        expect(missingSolution.issues).toEqual([
            "sql-topic/sql-missing-solution: missing SQL solutionCode",
        ]);

        const pythonMissingTests = await collectCodeInputCompatibilityIssues({
            topicId: "python-topic",
            bundle: {
                topicId: "python-topic",
                subjectSlug: "python-v2",
                moduleSlug: "python-v2-0",
                sectionSlug: "python-v2-0-1",
                prefix: "topics.python.python-v2-0.python-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "python-missing-tests",
                        kind: "code_input",
                        language: "python",
                        recipe: {
                            type: "fixed_tests",
                            solutionCode: "print(1)",
                        },
                    },
                ],
            },
        });
        expect(pythonMissingTests.issues).toEqual([
            "python-topic/python-missing-tests: missing tests",
        ]);

        const pythonWithTests = await collectCodeInputCompatibilityIssues({
            topicId: "python-topic",
            bundle: {
                topicId: "python-topic",
                subjectSlug: "python-v2",
                moduleSlug: "python-v2-0",
                sectionSlug: "python-v2-0-1",
                prefix: "topics.python.python-v2-0.python-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "python-with-tests",
                        kind: "code_input",
                        language: "python",
                        recipe: {
                            type: "fixed_tests",
                            solutionCode: "print(1)",
                            tests: [{ stdout: "1", match: "exact" }],
                        },
                    },
                ],
            },
        });
        expect(pythonWithTests.issues).toEqual([]);
    });
});
