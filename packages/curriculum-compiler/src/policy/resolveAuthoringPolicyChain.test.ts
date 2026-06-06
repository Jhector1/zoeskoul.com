import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAuthoringPolicyChain } from "./resolveAuthoringPolicyChain.js";

async function writeJson(filePath: string, value: unknown) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("resolveAuthoringPolicyChain", () => {
    it("resolves subject shared profile/workspace/validation and SQL course validation policy in order", async () => {
        const policy = await resolveAuthoringPolicyChain({
            subjectSlug: "sql",
            courseSlug: "sql-foundations",
            includeProjectPolicy: true,
        });

        expect(policy.sources).toEqual(
            expect.arrayContaining([
                expect.stringContaining("authoring/subjects/sql/shared/profile.json"),
                expect.stringContaining("authoring/subjects/sql/shared/workspace.policy.json"),
                expect.stringContaining("authoring/subjects/sql/shared/validation.policy.json"),
                expect.stringContaining("authoring/subjects/sql/courses/sql-foundations/validation.policy.json"),
            ]),
        );
        expect(policy.workspaceProfileId).toBe("browser-sql-runner");
        expect(policy.uiTerms?.editor).toBe("SQL editor");
        expect(policy.uiTerms?.runButton).toBe("Run query");
        expect(policy.uiTerms?.output).toBe("results table");
        expect(policy.forbiddenActions).toEqual(
            expect.arrayContaining(["sqlite3", "psql", "mysql", ".sql"]),
        );
        expect(policy.datasets).toEqual(
            expect.arrayContaining(["students_intro", "products_catalog", "customers_cleanup"]),
        );
    });

    it("resolves subject shared profile/workspace/validation and Python course validation policy in order", async () => {
        const policy = await resolveAuthoringPolicyChain({
            subjectSlug: "python",
            courseSlug: "python-v2",
            includeProjectPolicy: true,
        });

        expect(policy.sources).toEqual(
            expect.arrayContaining([
                expect.stringContaining("authoring/subjects/python/shared/profile.json"),
                expect.stringContaining("authoring/subjects/python/shared/workspace.policy.json"),
                expect.stringContaining("authoring/subjects/python/shared/validation.policy.json"),
                expect.stringContaining("authoring/subjects/python/courses/python-v2/validation.policy.json"),
            ]),
        );
        expect(policy.workspaceProfileId).toBe("browser-code-runner");
        expect(policy.uiTerms?.editor).toBe("code editor");
        expect(policy.uiTerms?.runButton).toBe("Run");
        expect(policy.uiTerms?.output).toBe("output panel");
        expect(policy.forbiddenActions).toEqual(
            expect.arrayContaining(["pip install", ".py", "VS Code"]),
        );
    });

    it("warns when a course policy repeats workspace terms without an override reason", async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), "policy-chain-"));
        const authoringRoot = path.join(root, "authoring");

        await writeJson(
            path.join(authoringRoot, "shared", "generation", "platform.policy.json"),
            { forbiddenActions: ["terminal"] },
        );
        await writeJson(
            path.join(authoringRoot, "shared", "generation", "browser-workspace.policy.json"),
            {},
        );
        await writeJson(
            path.join(authoringRoot, "shared", "generation", "code-input.policy.json"),
            {},
        );
        await writeJson(
            path.join(authoringRoot, "shared", "validation", "course-structure.validation.json"),
            {},
        );
        await writeJson(
            path.join(authoringRoot, "shared", "validation", "versioning.validation.json"),
            {},
        );
        await writeJson(
            path.join(authoringRoot, "shared", "validation", "workspace-language.validation.json"),
            {},
        );
        await writeJson(
            path.join(authoringRoot, "subjects", "sql", "shared", "profile.json"),
            {
                profileId: "sql",
                workspaceProfileId: "browser-sql-runner",
                workspacePolicyId: "sql-browser-workspace",
            },
        );
        await writeJson(
            path.join(authoringRoot, "subjects", "sql", "shared", "workspace.policy.json"),
            {
                workspaceProfileId: "browser-sql-runner",
                forbiddenActions: ["sqlite3"],
            },
        );
        await writeJson(
            path.join(authoringRoot, "subjects", "sql", "shared", "validation.policy.json"),
            {},
        );
        await writeJson(
            path.join(
                authoringRoot,
                "subjects",
                "sql",
                "courses",
                "sql-foundations",
                "validation.policy.json",
            ),
            {
                forbiddenActions: ["sqlite3"],
            },
        );

        const policy = await resolveAuthoringPolicyChain({
            authoringRoot,
            subjectSlug: "sql",
            courseSlug: "sql-foundations",
        });

        expect(policy.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining("course validation: duplicates existing forbiddenActions"),
            ]),
        );
    });
});
