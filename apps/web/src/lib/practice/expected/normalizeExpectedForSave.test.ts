import { describe, expect, it } from "vitest";
import { PracticeKind } from "@zoeskoul/db";

import { normalizeExpectedForSave } from "./normalizeExpectedForSave";

describe("normalizeExpectedForSave", () => {
    it("preserves code_input solutionFiles in the secret expected payload", () => {
        const solutionFiles = [
            {
                path: "main.py",
                content: "from tools.badges import make_badge\nprint(make_badge('A', 'b'))\n",
                isEntry: true,
                entry: true,
            },
            {
                path: "tools/badges.py",
                content: "def make_badge(name, role):\n    return f'{role}: {name}'\n",
            },
        ];

        const normalized = normalizeExpectedForSave(PracticeKind.code_input, {
            kind: "code_input",
            language: "python",
            stdout: "ok\n",
            solutionCode:
                "from tools.badges import make_badge\nprint(make_badge('A', 'b'))\n",
            solutionFiles,
        });

        expect((normalized as any).solutionFiles).toEqual(solutionFiles);
    });
});
