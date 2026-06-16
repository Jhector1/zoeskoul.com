import { describe, expect, it } from "vitest";
import { resolveTopicBundleManifest } from "./resolveTopicBundleManifest";

describe("resolveTopicBundleManifest", () => {
    it("resolves applied-python-projects bundles from manifest topic refs", () => {
        const bundle = resolveTopicBundleManifest({
            subjectSlug: "applied-python-projects",
            topicSlugOrId: "py8.classes-and-instances",
        });

        expect(bundle).not.toBeNull();
        expect(bundle?.topicId).toBe("classes-and-instances");
    });

    it("resolves applied-python-projects bundles from bare topic ids", () => {
        const bundle = resolveTopicBundleManifest({
            subjectSlug: "applied-python-projects",
            topicSlugOrId: "writing-test-cases",
        });

        expect(bundle).not.toBeNull();
        expect(bundle?.topicId).toBe("writing-test-cases");
    });
});