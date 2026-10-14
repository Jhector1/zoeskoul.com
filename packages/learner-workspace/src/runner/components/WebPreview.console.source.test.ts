import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const preview = fs.readFileSync(
    path.resolve(root, "packages/learner-workspace/src/runner/components/WebPreview.tsx"),
    "utf8",
);
const consoleSource = fs.readFileSync(
    path.resolve(root, "packages/learner-workspace/src/runner/components/WebConsole.tsx"),
    "utf8",
);
const outputSurface = fs.readFileSync(
    path.resolve(root, "packages/learner-workspace/src/runner/components/OutputSurface.tsx"),
    "utf8",
);
const codeRunner = fs.readFileSync(
    path.resolve(root, "packages/learner-workspace/src/runner/CodeRunner.tsx"),
    "utf8",
);
const webAdapter = fs.readFileSync(
    path.resolve(root, "apps/web/src/components/code/runner/components/WebPreview.tsx"),
    "utf8",
);
const studentAdapterPath = path.resolve(
    root,
    "apps/student/src/legacy-web/components/code/runner/components/WebPreview.tsx",
);
const studentOwnerEvidence = fs.readFileSync(
    fs.existsSync(studentAdapterPath)
        ? studentAdapterPath
        : path.resolve(
              root,
              "apps/student/src/legacy-web/components/code/runner/components/WebPreview.test.tsx",
          ),
    "utf8",
);

describe("shared WebPreview console ownership and presentation", () => {
    it("keeps the implementation in learner-workspace and app surfaces as adapters", () => {
        expect(preview).toContain('import WebConsole from "./WebConsole"');
        expect(webAdapter).toContain(
            '@zoeskoul/learner-workspace/runner/components/WebPreview',
        );
        expect(studentOwnerEvidence).toContain(
            '@zoeskoul/learner-workspace/runner/components/WebPreview',
        );
        expect(webAdapter).not.toContain("postMessage");
        expect(studentOwnerEvidence).not.toContain("postMessage");
    });

    it("provides accessible collapse and clear controls with bounded output", () => {
        expect(consoleSource).toContain('aria-label="Browser console"');
        expect(consoleSource).toContain("aria-expanded={props.open}");
        expect(consoleSource).toContain('role="log"');
        expect(consoleSource).toContain("Clear");
        expect(preview).toContain("consoleInitiallyOpen?: boolean");
        expect(preview).toContain("sessionKey?: string");
        expect(preview).toContain('type: "clear"');
    });

    it("replaces DOM error markup with bridge-owned diagnostics", () => {
        expect(preview).not.toContain("document.createElement");
        expect(preview).not.toContain("document.body.appendChild");
        expect(preview).not.toContain("Preview error:");
        expect(preview).toContain('sandbox="allow-scripts allow-forms allow-modals"');
    });

    it("threads generic exercise identity through the shared output surface", () => {
        expect(codeRunner).toContain("sessionKey: effectiveExerciseStateKey");
        expect(outputSurface).toContain("sessionKey={model.sessionKey}");
        expect(preview).toContain('`${props.sessionKey ?? ""}\\0${virtualPath}`');
        expect(preview).not.toContain('subject === "javascript"');
    });
});
