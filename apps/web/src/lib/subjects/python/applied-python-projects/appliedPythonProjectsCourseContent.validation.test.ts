import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
    findDuplicateModelClassIssues,
    isJsonRecord,
    semanticChecksPutBehaviorBeforeOutput,
    starterFileHasSpecificGuidance,
    type AuthoredFile,
    type JsonRecord,
} from "./courseAuthoringValidation";

const WEB_ROOT = fs.existsSync(path.resolve(process.cwd(), "src"))
    ? process.cwd()
    : path.resolve(process.cwd(), "apps/web");

const SUBJECT_ROOT = path.join(
    WEB_ROOT,
    "src/lib/subjects/python/applied-python-projects",
);
const MESSAGE_ROOT = path.join(
    WEB_ROOT,
    "src/i18n/messages/en/subjects/python/applied-python-projects",
);

const ROBOTIC_PHRASES = [
    "Which statements match the beginner-friendly object idea from this topic",
    "The beginner idea",
    "the beginner idea",
    "A beginner object workflow",
    "a beginner object workflow",
];

function readJson(filePath: string): JsonRecord {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonRecord;
}

function listJsonFiles(root: string, filename?: string): string[] {
    return fs.readdirSync(root, { recursive: true })
        .map(String)
        .filter((relativePath) =>
            filename
                ? relativePath.endsWith(filename)
                : relativePath.endsWith(".json"),
        )
        .map((relativePath) => path.join(root, relativePath));
}

function visit(
    value: unknown,
    callback: (value: unknown, location: string) => void,
    location = "root",
): void {
    callback(value, location);

    if (Array.isArray(value)) {
        value.forEach((entry, index) =>
            visit(entry, callback, `${location}[${index}]`),
        );
        return;
    }

    if (!isJsonRecord(value)) return;

    for (const [key, entry] of Object.entries(value)) {
        visit(entry, callback, `${location}.${key}`);
    }
}

function getAtPath(root: JsonRecord, dottedPath: string): unknown {
    return dottedPath.split(".").reduce<unknown>((value, segment) => {
        if (!isJsonRecord(value)) return undefined;
        return value[segment];
    }, root);
}

function authoredPathFromKey(key: string): string {
    if (key === "main_py") return "main.py";
    if (key === "models___init___py") return "models/__init__.py";
    if (!key.endsWith("_py")) return key;

    const stem = key.slice(0, -3);
    const [folder, ...rest] = stem.split("_");
    const folders = new Set([
        "app",
        "core",
        "data",
        "domain",
        "models",
        "reports",
        "repositories",
        "services",
        "storage",
        "tests",
        "utils",
        "validators",
        "views",
    ]);

    return folders.has(folder ?? "") && rest.length > 0
        ? `${folder}/${rest.join("_")}.py`
        : `${stem}.py`;
}

function messageNode(
    messageFiles: Array<{ filePath: string; json: JsonRecord }>,
    messageBase: unknown,
): JsonRecord | null {
    if (typeof messageBase !== "string") return null;

    for (const file of messageFiles) {
        const candidate = getAtPath(file.json, messageBase);
        if (isJsonRecord(candidate)) return candidate;
    }

    return null;
}

describe("applied-python-projects authored content", () => {
    const messageFiles = listJsonFiles(MESSAGE_ROOT).map((filePath) => ({
        filePath,
        json: readJson(filePath),
    }));
    const topicBundles = listJsonFiles(
        path.join(SUBJECT_ROOT, "modules"),
        "topic.bundle.json",
    ).map((filePath) => ({ filePath, json: readJson(filePath) }));

    it("keeps learner-facing prompts natural and targeted", () => {
        const issues: string[] = [];

        for (const file of messageFiles) {
            const serialized = JSON.stringify(file.json);
            for (const phrase of ROBOTIC_PHRASES) {
                if (serialized.includes(phrase)) {
                    issues.push(
                        `${path.relative(WEB_ROOT, file.filePath)} contains ${JSON.stringify(phrase)}`,
                    );
                }
            }
        }

        const thinkingMessages = messageFiles.find((file) =>
            file.filePath.endsWith("module8/thinking-in-objects.json"),
        )?.json;
        const methodChoice = thinkingMessages
            ? getAtPath(
                  thinkingMessages,
                  "topics.applied-python-projects.python-8-object-oriented-foundations.thinking-in-objects.practice.fb-thinking-in-objects-method-call",
              )
            : null;

        expect(methodChoice).toMatchObject({
            title: "Choose the method call",
            prompt: "Which line adds 50 miles to the existing `car` object?",
            options: { a: "`car.drive(50)`" },
        });
        expect(issues).toEqual([]);
    });

    it("keeps quiz answers aligned with their authored choices", () => {
        const issues: string[] = [];

        for (const bundle of topicBundles) {
            const exercises = Array.isArray(bundle.json.exercises)
                ? bundle.json.exercises
                : [];

            for (const rawExercise of exercises) {
                if (!isJsonRecord(rawExercise)) continue;
                const id = String(rawExercise.id ?? "unknown");
                const expected = isJsonRecord(rawExercise.expected)
                    ? rawExercise.expected
                    : {};
                const options = Array.isArray(rawExercise.optionIds)
                    ? rawExercise.optionIds.map(String)
                    : [];

                if (rawExercise.kind === "single_choice") {
                    if (!options.includes(String(expected.optionId ?? ""))) {
                        issues.push(`${id} has a single-choice answer outside optionIds.`);
                    }
                }

                if (rawExercise.kind === "multi_choice") {
                    for (const answer of Array.isArray(expected.optionIds)
                        ? expected.optionIds.map(String)
                        : []) {
                        if (!options.includes(answer)) {
                            issues.push(`${id} has multi-choice answer ${answer} outside optionIds.`);
                        }
                    }
                }

                if (rawExercise.kind === "fill_blank_choice") {
                    const node = messageNode(messageFiles, rawExercise.messageBase);
                    const choices = Array.isArray(node?.choices)
                        ? node.choices.map(String)
                        : [];
                    const answer = String(expected.value ?? "");
                    if (!answer || !choices.includes(answer)) {
                        issues.push(`${id} expected ${answer || "<empty>"}, which is not in its choices.`);
                    }
                }
            }
        }

        expect(issues).toEqual([]);
    });

    it("gives every Python starter file specific in-file guidance", () => {
        const issues: string[] = [];
        let starterFileCount = 0;

        for (const file of messageFiles) {
            visit(file.json, (value, location) => {
                if (!isJsonRecord(value) || !isJsonRecord(value.starterFiles)) return;

                for (const [key, rawFile] of Object.entries(value.starterFiles)) {
                    if (!isJsonRecord(rawFile) || typeof rawFile.content !== "string") continue;
                    if (!key.endsWith("_py")) continue;
                    starterFileCount += 1;

                    if (!starterFileHasSpecificGuidance(rawFile.content)) {
                        issues.push(
                            `${path.relative(WEB_ROOT, file.filePath)}:${location}.starterFiles.${key}`,
                        );
                    }
                }
            });
        }

        expect(starterFileCount).toBeGreaterThan(400);
        expect(issues).toEqual([]);
    });

    it("validates behavior before output and requires exact output for print exercises", () => {
        const issues: string[] = [];
        let semanticFirstCount = 0;

        for (const bundle of topicBundles) {
            const exercises = Array.isArray(bundle.json.exercises)
                ? bundle.json.exercises
                : [];

            for (const rawExercise of exercises) {
                if (!isJsonRecord(rawExercise) || rawExercise.kind !== "code_input") continue;
                const recipe = isJsonRecord(rawExercise.recipe)
                    ? rawExercise.recipe
                    : {};
                const id = String(rawExercise.id ?? "unknown");

                if (!semanticChecksPutBehaviorBeforeOutput(recipe.semanticChecks)) {
                    issues.push(`${id} places an output check before a behavior check.`);
                }

                if (recipe.semanticFirst !== true) continue;
                semanticFirstCount += 1;
                const tests = Array.isArray(recipe.tests) ? recipe.tests : [];
                const first = isJsonRecord(tests[0]) ? tests[0] : {};

                if (
                    typeof first.stdout !== "string" ||
                    first.stdout.length === 0 ||
                    first.match !== "exact"
                ) {
                    issues.push(`${id} must define one exact expected stdout test.`);
                }

                const node = messageNode(messageFiles, rawExercise.messageBase);
                if (typeof node?.expectedOutput !== "string" || node.expectedOutput.length === 0) {
                    issues.push(`${id} is missing learner-facing expectedOutput copy.`);
                }
            }
        }

        expect(semanticFirstCount).toBeGreaterThan(50);
        expect(issues).toEqual([]);
    });

    it("keeps model filenames and top-level classes unambiguous", () => {
        const issues: string[] = [];

        for (const file of messageFiles) {
            visit(file.json, (value, location) => {
                if (!isJsonRecord(value) || !isJsonRecord(value.solutionFiles)) return;

                const authoredFiles: AuthoredFile[] = Object.entries(value.solutionFiles)
                    .filter(([, rawFile]) => isJsonRecord(rawFile))
                    .map(([key, rawFile]) => ({
                        path: authoredPathFromKey(key),
                        content:
                            isJsonRecord(rawFile) && typeof rawFile.content === "string"
                                ? rawFile.content
                                : "",
                    }));

                for (const issue of findDuplicateModelClassIssues(authoredFiles)) {
                    issues.push(
                        `${path.relative(WEB_ROOT, file.filePath)}:${location}: ${issue}`,
                    );
                }
            });
        }

        expect(issues).toEqual([]);
    });
});
