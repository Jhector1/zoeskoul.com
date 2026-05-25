import { describe, expect, it } from "vitest";

import { isSeedableSubjectSlug } from "../prisma/seed/data/index";

describe("db seed subject filtering", () => {
    it("ignores generated draft subject folders", () => {
        expect(isSeedableSubjectSlug("python--python-data-functions--draft")).toBe(
            false,
        );
    });

    it("keeps live subjects seedable", () => {
        expect(isSeedableSubjectSlug("python-v2")).toBe(true);
        expect(isSeedableSubjectSlug("python")).toBe(true);
    });
});
