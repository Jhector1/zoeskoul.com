import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;

const WEB_ROOT = fs.existsSync(path.resolve(process.cwd(), "src"))
    ? process.cwd()
    : path.resolve(process.cwd(), "apps/web");

const SUBJECT_MANIFEST_PATH = path.join(
    WEB_ROOT,
    "src/lib/subjects/python-data-functions/subject.manifest.json",
);

function readJson(filePath: string): JsonObject {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

describe("python-data-functions manifest", () => {
    it("stays separate from the python version family", () => {
        const manifest = readJson(SUBJECT_MANIFEST_PATH);

        expect(manifest.subject?.meta?.versioning ?? null).toBeNull();
    });
});
