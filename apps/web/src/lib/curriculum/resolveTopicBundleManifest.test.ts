import { describe, expect, it } from "vitest";
import { resolveTopicBundleManifest } from "./resolveTopicBundleManifest";

describe("resolveTopicBundleManifest", () => {
    it("resolves applied-python-projects bundles from manifest topic refs", () => {
        const bundle = resolveTopicBundleManifest({
            subjectSlug: "applied-python-projects",
            topicSlugOrId: "py8.classes-and-instances",
        });

        expect(bundle?.topicId).toBe("classes-and-instances");
        expect(bundle?.subjectSlug).toBe("applied-python-projects");
    });

    it("resolves applied-python-projects bundles from bare topic ids", () => {
        const bundle = resolveTopicBundleManifest({
            subjectSlug: "applied-python-projects",
            topicSlugOrId: "writing-test-cases",
        });

        expect(bundle?.topicId).toBe("writing-test-cases");
        expect(bundle?.subjectSlug).toBe("applied-python-projects");
    });
});
