import { describe, expect, it } from "vitest";

import { getSingleFileLanguageId } from "./langIds";

describe("getSingleFileLanguageId", () => {
    it("keeps existing Judge0 fallback language ids unchanged", () => {
        expect(getSingleFileLanguageId("python")).toBe(71);
        expect(getSingleFileLanguageId("java")).toBe(62);
        expect(getSingleFileLanguageId("javascript")).toBe(63);
        expect(getSingleFileLanguageId("c")).toBe(50);
        expect(getSingleFileLanguageId("cpp")).toBe(54);
    });
});


describe("R Judge0 language id", () => {
    it("uses the verified JUDGE0_LANG_R override", () => {
        const previous = process.env.JUDGE0_LANG_R;
        process.env.JUDGE0_LANG_R = "99";
        try {
            expect(getSingleFileLanguageId("r")).toBe(99);
        } finally {
            if (previous == null) delete process.env.JUDGE0_LANG_R;
            else process.env.JUDGE0_LANG_R = previous;
        }
    });

    it("fails explicitly instead of guessing an R language id", () => {
        const previous = process.env.JUDGE0_LANG_R;
        delete process.env.JUDGE0_LANG_R;
        try {
            expect(() => getSingleFileLanguageId("r")).toThrow(/JUDGE0_LANG_R/);
        } finally {
            if (previous != null) process.env.JUDGE0_LANG_R = previous;
        }
    });
});
