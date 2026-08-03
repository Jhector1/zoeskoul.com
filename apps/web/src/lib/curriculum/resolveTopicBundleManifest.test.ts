import { describe, expect, it } from "vitest";
import { resolveTopicBundleManifest } from "./resolveTopicBundleManifest";

describe("resolveTopicBundleManifest", () => {
    it("resolves applied-python-projects bundles from manifest topic refs", () => {
        const bundle = resolveTopicBundleManifest({
            subjectSlug: "applied-python-projects",
            topicSlugOrId: "py8.thinking-in-objects",
        });

        expect(bundle).not.toBeNull();
        expect(bundle?.topicId).toBe("thinking-in-objects");
    });

    it("resolves applied-python-projects bundles from bare topic ids", () => {
        const bundle = resolveTopicBundleManifest({
            subjectSlug: "applied-python-projects",
            topicSlugOrId: "class-files-and-instances",
        });

        expect(bundle).not.toBeNull();
        expect(bundle?.topicId).toBe("class-files-and-instances");
    });
});