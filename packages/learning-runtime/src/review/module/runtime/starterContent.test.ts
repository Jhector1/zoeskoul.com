import { describe, expect, it } from "vitest";

import {
    normalizeStarterFilesValue,
    starterFileContentForPath,
} from "./starterContent";

describe("starter file collection normalization", () => {
    it("accepts generic collection wrappers", () => {
        expect(
            starterFileContentForPath(
                { files: [{ path: "main.py", content: "print('ok')" }] },
                "main.py",
            ),
        ).toBe("print('ok')");
    });

    it("does not unwrap a full exercise through its retired top-level alias", () => {
        const exercise = {
            id: "legacy-exercise",
            kind: "code_input",
            starterFiles: [{ path: "main.py", content: "# legacy" }],
            workspace: {},
        };

        expect(starterFileContentForPath(exercise, "main.py")).toBe("");
        expect(normalizeStarterFilesValue(exercise, "main.py")).toEqual([]);
    });
});
