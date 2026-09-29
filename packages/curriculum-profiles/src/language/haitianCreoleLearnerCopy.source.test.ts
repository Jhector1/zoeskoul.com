import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(
    process.cwd(),
    "authoring/subjects/haitian-creole/courses/" +
        "haitian-creole-foundations/content",
);

function jsonFiles(dir: string): string[] {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const absolute = path.join(dir, entry.name);

            return entry.isDirectory()
                ? jsonFiles(absolute)
                : entry.name.endsWith(".json")
                    ? [absolute]
                    : [];
        });
}

function visit(
    value: unknown,
    key: string | null,
    at: string,
    file: string,
    violations: string[],
) {
    const learnerKeys = new Set([
        "title",
        "prompt",
        "hint",
        "concept",
        "hint_1",
        "hint_2",
        "instruction",
        "instructions",
    ]);

    if (
        typeof value === "string" &&
        key &&
        learnerKeys.has(key)
    ) {
        const banned = [
            /\bsketch\b/i,
            /\bshown in the lesson\b/i,
            /\bexactly as shown\b/i,
            /\bexact response\b/i,
            /\bexact phrase\b/i,
            /\bsame phrase\b.*\bshown\b/i,
            /\blook back at\b.*\bexample\b/i,
        ];

        if (banned.some((pattern) => pattern.test(value))) {
            violations.push(
                `${path.relative(process.cwd(), file)} ${at}: ${value}`,
            );
        }
    }

    if (Array.isArray(value)) {
        value.forEach((child, index) =>
            visit(
                child,
                key,
                `${at}[${index}]`,
                file,
                violations,
            ),
        );
        return;
    }

    if (
        value &&
        typeof value === "object"
    ) {
        for (const [childKey, child] of Object.entries(value)) {
            visit(
                child,
                childKey,
                `${at}.${childKey}`,
                file,
                violations,
            );
        }
    }
}

describe("Haitian Creole learner-facing copy", () => {
    it("does not expose internal or rote-copy wording", () => {
        const violations: string[] = [];

        for (const file of jsonFiles(root)) {
            const json = JSON.parse(
                fs.readFileSync(file, "utf8"),
            );

            visit(
                json,
                null,
                "$",
                file,
                violations,
            );
        }

        expect(
            violations,
            violations.join("\n"),
        ).toEqual([]);
    });
});
