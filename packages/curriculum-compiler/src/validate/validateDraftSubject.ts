import fs from "node:fs/promises";
import path from "node:path";
import {
    getDraftMessagesRoot,
    getDraftSubjectManifestPath,
    getDraftSubjectRoot,
} from "@zoeskoul/curriculum-core";

type JsonObject = Record<string, unknown>;

async function pathExists(filePath: string) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJson(filePath: string): Promise<JsonObject> {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as JsonObject;
}

function asObject(value: unknown): JsonObject | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as JsonObject)
        : null;
}

function asString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function collectTopicExerciseIds(topicBundle: JsonObject): Set<string> {
    const exercises = Array.isArray(topicBundle.exercises)
        ? topicBundle.exercises
        : [];
    const ids = new Set<string>();

    for (const ex of exercises) {
        const obj = asObject(ex);
        const id = obj ? asString(obj.id) : null;
        if (id) ids.add(id);
    }

    return ids;
}

function validateTopicBundleShape(topicBundle: JsonObject, filePath: string): string[] {
    const issues: string[] = [];

    const requiredTopLevel = [
        "topicId",
        "subjectSlug",
        "moduleSlug",
        "sectionSlug",
        "prefix",
        "minutes",
        "topic",
        "cards",
        "sketches",
        "exercises",
    ];

    for (const key of requiredTopLevel) {
        if (!(key in topicBundle)) {
            issues.push(`${filePath}: missing topic bundle field "${key}"`);
        }
    }

    if (!Array.isArray(topicBundle.cards)) {
        issues.push(`${filePath}: topic bundle cards must be an array`);
    }

    if (!Array.isArray(topicBundle.sketches)) {
        issues.push(`${filePath}: topic bundle sketches must be an array`);
    }

    if (!Array.isArray(topicBundle.exercises)) {
        issues.push(`${filePath}: topic bundle exercises must be an array`);
    }

    const topic = asObject(topicBundle.topic);
    if (!topic) {
        issues.push(`${filePath}: topic bundle topic must be an object`);
    } else {
        if (!asString(topic.labelKey)) {
            issues.push(`${filePath}: topic.labelKey is required`);
        }
        if (!asString(topic.summaryKey)) {
            issues.push(`${filePath}: topic.summaryKey is required`);
        }
    }

    return issues;
}

function validateProjectStepRefs(topicBundle: JsonObject, filePath: string): string[] {
    const issues: string[] = [];
    const exerciseIds = collectTopicExerciseIds(topicBundle);
    const cards = Array.isArray(topicBundle.cards) ? topicBundle.cards : [];

    for (const card of cards) {
        const cardObj = asObject(card);
        if (!cardObj) continue;
        if (cardObj.kind !== "project") continue;

        const project = asObject(cardObj.project);
        const steps = project && Array.isArray(project.steps) ? project.steps : [];

        for (const step of steps) {
            const stepObj = asObject(step);
            const exerciseKey = stepObj ? asString(stepObj.exerciseKey) : null;
            if (!exerciseKey) {
                issues.push(`${filePath}: project step missing exerciseKey`);
                continue;
            }
            if (!exerciseIds.has(exerciseKey)) {
                issues.push(
                    `${filePath}: project step references missing exercise "${exerciseKey}"`,
                );
            }
        }
    }

    return issues;
}

function validateQuizEntry(
    id: string,
    entry: JsonObject,
    filePath: string,
): string[] {
    const issues: string[] = [];

    const title = asString(entry.title);
    const prompt = asString(entry.prompt);
    const hint = asString(entry.hint);
    const help = asObject(entry.help);

    if (!title) issues.push(`${filePath}: quiz.${id}.title is required`);
    if (!prompt) issues.push(`${filePath}: quiz.${id}.prompt is required`);
    if (!hint) issues.push(`${filePath}: quiz.${id}.hint is required`);

    if (!help) {
        issues.push(`${filePath}: quiz.${id}.help is required`);
    } else {
        if (!asString(help.concept)) {
            issues.push(`${filePath}: quiz.${id}.help.concept is required`);
        }
        if (!asString(help.hint_1)) {
            issues.push(`${filePath}: quiz.${id}.help.hint_1 is required`);
        }
        if (!asString(help.hint_2)) {
            issues.push(`${filePath}: quiz.${id}.help.hint_2 is required`);
        }
    }

    return issues;
}

function validateNestedMessageFile(messages: JsonObject, filePath: string): string[] {
    const issues: string[] = [];

    const quiz = asObject(messages.quiz);
    if (!quiz) {
        issues.push(`${filePath}: top-level "quiz" object is required`);
        return issues;
    }

    for (const [id, value] of Object.entries(quiz)) {
        const entry = asObject(value);
        if (!entry) {
            issues.push(`${filePath}: quiz.${id} must be an object`);
            continue;
        }
        issues.push(...validateQuizEntry(id, entry, filePath));
    }

    return issues;
}

function includesWholeAnswer(text: string, answers: string[]) {
    const lower = text.toLowerCase();
    return answers.some((a) => a && lower.includes(a.toLowerCase()));
}

function validateHintsAgainstMessageFile(messages: JsonObject, filePath: string): string[] {
    const issues: string[] = [];
    const quiz = asObject(messages.quiz);
    if (!quiz) return issues;

    for (const [id, value] of Object.entries(quiz)) {
        const entry = asObject(value);
        if (!entry) continue;

        const hint = asString(entry.hint) ?? "";
        const help = asObject(entry.help) ?? {};
        const supportTexts = [
            hint,
            asString(help.concept) ?? "",
            asString(help.hint_1) ?? "",
            asString(help.hint_2) ?? "",
        ];

        const options = asObject(entry.options);
        if (options) {
            const answerTexts = Object.values(options)
                .map((v) => asString(v) ?? "")
                .filter(Boolean);

            for (const text of supportTexts) {
                if (includesWholeAnswer(text, answerTexts)) {
                    issues.push(`${filePath}: hint may reveal option text in quiz.${id}`);
                    break;
                }
            }
        }

        const correct = asString(entry.correct);
        if (correct) {
            for (const text of supportTexts) {
                if (text.toLowerCase().includes(correct.toLowerCase())) {
                    issues.push(`${filePath}: hint reveals fill-blank answer in quiz.${id}`);
                    break;
                }
            }
        }
    }

    return issues;
}

export async function validateDraftSubject(subjectSlug: string) {
    const issues: string[] = [];

    const subjectManifestPath = getDraftSubjectManifestPath(subjectSlug);
    if (!(await pathExists(subjectManifestPath))) {
        throw new Error(`Draft manifest not found for subject ${subjectSlug}`);
    }

    const subjectManifest = await readJson(subjectManifestPath);
    const modules = Array.isArray(subjectManifest.modules)
        ? subjectManifest.modules
        : [];

    if (modules.length === 0) {
        issues.push(`${subjectManifestPath}: subject manifest has no modules`);
    }

    for (const mod of modules) {
        const moduleObj = asObject(mod);
        if (!moduleObj) continue;

        const moduleOrder =
            typeof moduleObj.order === "number" ? moduleObj.order : null;
        if (moduleOrder == null) {
            issues.push(`${subjectManifestPath}: module missing numeric order`);
            continue;
        }

        const moduleDir = `module${moduleOrder}`;
        const sections = Array.isArray(moduleObj.sections) ? moduleObj.sections : [];

        for (const sec of sections) {
            const sectionObj = asObject(sec);
            const topics = sectionObj && Array.isArray(sectionObj.topics)
                ? sectionObj.topics
                : [];

            for (const topicIdValue of topics) {
                const topicId = asString(topicIdValue);
                if (!topicId) continue;

                const topicBundlePath = path.join(
                    getDraftSubjectRoot(subjectSlug),
                    "modules",
                    moduleDir,
                    "topics",
                    topicId,
                    "topic.bundle.json",
                );

                if (!(await pathExists(topicBundlePath))) {
                    issues.push(`${topicBundlePath}: topic bundle missing`);
                    continue;
                }

                const topicBundle = await readJson(topicBundlePath);
                issues.push(...validateTopicBundleShape(topicBundle, topicBundlePath));
                issues.push(...validateProjectStepRefs(topicBundle, topicBundlePath));
            }
        }
    }

    const messagesRoot = getDraftMessagesRoot();
    if (await pathExists(messagesRoot)) {
        const localeDirs = await fs.readdir(messagesRoot, { withFileTypes: true });

        for (const localeDir of localeDirs) {
            if (!localeDir.isDirectory()) continue;

            const subjectMessagesDir = path.join(
                messagesRoot,
                localeDir.name,
                "subjects",
                subjectSlug,
            );

            if (!(await pathExists(subjectMessagesDir))) continue;

            const moduleDirs = await fs.readdir(subjectMessagesDir, { withFileTypes: true });

            for (const moduleDir of moduleDirs) {
                if (!moduleDir.isDirectory()) continue;

                const modulePath = path.join(subjectMessagesDir, moduleDir.name);
                const files = await fs.readdir(modulePath, { withFileTypes: true });

                for (const file of files) {
                    if (!file.isFile() || !file.name.endsWith(".json")) continue;

                    const filePath = path.join(modulePath, file.name);
                    const messages = await readJson(filePath);

                    issues.push(...validateNestedMessageFile(messages, filePath));
                    issues.push(...validateHintsAgainstMessageFile(messages, filePath));
                }
            }
        }
    }

    return {
        ok: issues.length === 0,
        issues,
    };
}