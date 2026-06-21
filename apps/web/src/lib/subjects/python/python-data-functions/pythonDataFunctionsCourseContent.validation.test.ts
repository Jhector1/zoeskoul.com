import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;

const WEB_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../..",
);

const I18N_ROOT = path.join(
    WEB_ROOT,
    "src/i18n/messages/en/subjects/python/python-data-functions",
);

const BANNED_TRY_PHRASES = [
    "lesson idea",
    "small runnable program",
    "small job",
    "scenario needs",
    "fits the scenario",
    "This Try it yourself checkpoint",
    "mirrors the helper",
    "the way a multi-file project will",
];

function readJson(filePath: string): JsonObject {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function collectTryTexts(messages: JsonObject): Array<{ id: string; text: string }> {
    const subjectKey = Object.keys(messages.topics ?? {})[0];
    const moduleKey = Object.keys(messages.topics?.[subjectKey] ?? {})[0];
    const topicKey = Object.keys(messages.topics?.[subjectKey]?.[moduleKey] ?? {})[0];
    const quiz = messages.topics?.[subjectKey]?.[moduleKey]?.[topicKey]?.quiz ?? {};
    const tryIt = messages.topics?.[subjectKey]?.[moduleKey]?.[topicKey]?.tryIt ?? {};
    const rows: Array<{ id: string; text: string }> = [];

    for (const [id, entry] of Object.entries(quiz)) {
        if (!id.startsWith("try-")) continue;
        rows.push({ id, text: JSON.stringify(entry) });
    }

    for (const [id, entry] of Object.entries(tryIt)) {
        if (id === "allowReveal") continue;
        rows.push({ id, text: JSON.stringify(entry) });
    }

    return rows;
}

describe("python-data-functions generated content", () => {
    it("keeps file/module/path try-it-yourself copy specific and browser-safe", () => {
        const files = [
            path.join(I18N_ROOT, "module6/using-imports-and-helper-files.json"),
            path.join(I18N_ROOT, "module6/module-6-name-badge-package.json"),
            path.join(I18N_ROOT, "module7/reading-text-files.json"),
            path.join(I18N_ROOT, "module7/writing-text-files.json"),
            path.join(I18N_ROOT, "module7/working-with-paths.json"),
            path.join(I18N_ROOT, "module7/simple-csv-processing.json"),
            path.join(I18N_ROOT, "module7/module-7-clean-student-records.json"),
            path.join(I18N_ROOT, "module8/class-roster-cleaner.json"),
        ];
        const issues: string[] = [];

        for (const filePath of files) {
            const messages = readJson(filePath);

            for (const row of collectTryTexts(messages)) {
                for (const phrase of BANNED_TRY_PHRASES) {
                    if (row.text.includes(phrase)) {
                        issues.push(
                            `${path.basename(filePath)}:${row.id} contains banned phrase ${phrase}`,
                        );
                    }
                }
            }
        }

        expect(issues).toEqual([]);
    });
});
