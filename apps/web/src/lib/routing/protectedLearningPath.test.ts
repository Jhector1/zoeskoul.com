import { describe, expect, it } from "vitest";

import { isCatalogLearningPath } from "./protectedLearningPath";

describe("isCatalogLearningPath", () => {
    it.each([
        "/catalog/git/subjects/git-foundations/modules/start-tracking/learn",
        "/catalog/git/subjects/git-foundations/modules/start-tracking/learn/section/topic/text/card",
        "/catalog/sql/subjects/sql-v2/modules/sql-basics/practice",
    ])("protects interactive catalog module routes: %s", (pathname) => {
        expect(isCatalogLearningPath(pathname)).toBe(true);
    });

    it.each([
        "/catalog",
        "/catalog/git",
        "/catalog/git/subjects/git-foundations",
        "/catalog/git/subjects/git-foundations/modules/start-tracking",
        "/catalog/git/subjects/git-foundations/modules/start-tracking/overview",
        "/subjects/git-foundations/modules/start-tracking/learn",
    ])("does not broaden protection to public catalog browsing: %s", (pathname) => {
        expect(isCatalogLearningPath(pathname)).toBe(false);
    });
});
