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
