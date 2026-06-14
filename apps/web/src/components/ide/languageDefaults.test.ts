import { describe, expect, it } from "vitest";

import {
    defaultMainCode,
    defaultMainFile,
} from "./languageDefaults";

describe("languageDefaults bash", () => {
    it("uses main.sh as the default bash entry file", () => {
        expect(defaultMainFile("bash")).toBe("main.sh");
    });

    it('uses a safe bash starter program', () => {
        expect(defaultMainCode("bash")).toBe('echo "Hello from Bash!"\n');
    });
});
