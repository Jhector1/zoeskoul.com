import { describe, expect, it } from "vitest";
import { resolveLogicalSectionSlug } from "./resolveLogicalSectionSlug.js";

describe("resolveLogicalSectionSlug", () => {
    it("prefixes raw section slugs with the subject slug", () => {
        expect(
            resolveLogicalSectionSlug({
                subjectSlug: "python-for-beginners",
                rawSectionSlug: "python-3-core-building-blocks-2",
            }),
        ).toBe("python-for-beginners-python-3-core-building-blocks-2");
    });

    it("does not double-prefix already namespaced section slugs", () => {
        expect(
            resolveLogicalSectionSlug({
                subjectSlug: "python-for-beginners",
                rawSectionSlug: "python-for-beginners-python-3-core-building-blocks-2",
            }),
        ).toBe("python-for-beginners-python-3-core-building-blocks-2");
    });
});
