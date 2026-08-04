import { describe, expect, it } from "vitest";

import {
    defaultExt,
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


describe("languageDefaults typescript", () => {
    it("uses main.ts and a TypeScript starter", () => {
        expect(defaultMainFile("typescript")).toBe("main.ts");
        expect(defaultMainCode("typescript")).toContain("const message: string");
    });
});


describe("languageDefaults R", () => {
    it("uses main.R, the .R extension, and a valid base R starter", () => {
        expect(defaultExt("r")).toBe(".R");
        expect(defaultMainFile("r")).toBe("main.R");
        expect(defaultMainCode("r")).toBe(
            "values <- c(2, 4, 6)\nprint(mean(values))\n",
        );
    });
});
